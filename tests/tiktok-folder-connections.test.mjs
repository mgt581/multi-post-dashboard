import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';
import { beginTikTokLink, consumeTikTokLink, saveTikTokConnection, tikTokPublishingAccount, disconnectTikTok } from '../tiktok-connections.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0004_create_upload_sessions.sql', import.meta.url), 'utf8'));
  sqlite.exec('ALTER TABLE upload_sessions ADD COLUMN folder_id TEXT; ALTER TABLE upload_sessions ADD COLUMN user_id TEXT;');
  sqlite.exec("INSERT INTO folders (id,user_id,name) VALUES (1,'uid-1','A'),(2,'uid-1','B'),(3,'uid-2','Other');");
  const db = {
    prepare(sql) {
      let args = [];
      return { bind(...values) { args = values; return this; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { return sqlite.prepare(sql).run(...args); } };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  return { sqlite, db };
}
const identity = { userId: 'uid-1', email: 'one@example.com', emailVerified: true };
const options = { userId: 'uid-1', identity, authBase: 'https://www.tiktok.com', clientKey: 'test', redirectUri: 'https://example.test/api/auth/callback/tiktok' };
const connection = (folderId, openId) => ({ folderId: String(folderId), userId: 'uid-1', openId, nickname: openId, accessToken: `token-${openId}`, refreshToken: `refresh-${openId}`, expiresAt: Date.now()+3600000, scope: 'video.upload', avatar: null });

test('two distinct TikTok identities persist independently; reconnect and disconnect cannot revive old tokens', async () => {
  const { db, sqlite } = database();
  await saveTikTokConnection(db, connection(1,'alice'));
  await saveTikTokConnection(db, connection(2,'bob'));
  assert.equal((await tikTokPublishingAccount(db,'1','uid-1')).access_token,'token-alice');
  assert.equal((await tikTokPublishingAccount(db,'2','uid-1')).access_token,'token-bob');
  assert.equal(await tikTokPublishingAccount(db,'2','uid-2'),null);
  await saveTikTokConnection(db, connection(1,'carol'));
  assert.deepEqual(sqlite.prepare("SELECT account_id FROM tokens WHERE platform='tiktok' ORDER BY folder_id").all().map(r=>r.account_id),['carol','bob']);
  assert.equal((await tikTokPublishingAccount(db,'2','uid-1')).access_token,'token-bob');
  const id = (await tikTokPublishingAccount(db,'1','uid-1')).id;
  assert.equal(await disconnectTikTok(db,id,'uid-2'),false);
  assert.equal(await disconnectTikTok(db,id,'uid-1'),true);
  assert.equal(await disconnectTikTok(db,id,'uid-1'),false);
  assert.equal(await tikTokPublishingAccount(db,'1','uid-1'),null);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM tokens WHERE folder_id=1').get().n,0);
  assert.equal((await tikTokPublishingAccount(db,'2','uid-1')).tiktok_open_id,'bob');
  sqlite.close();
});

test('OAuth state is browser-bound, expiring, single-use and never accepts arbitrary folder/user data', async () => {
  const { db, sqlite } = database();
  const link = await beginTikTokLink(db,{ ...options,folderId:'1' });
  assert.equal(new URL(link.url).searchParams.get('disable_auto_auth'),'1');
  await assert.rejects(consumeTikTokLink(db,link.state,'wrong'));
  await assert.rejects(consumeTikTokLink(db,btoa(JSON.stringify({folderId:'3',userId:'uid-2'})),link.browserNonce));
  assert.equal((await consumeTikTokLink(db,link.state,link.browserNonce)).folder_id,'1');
  await assert.rejects(consumeTikTokLink(db,link.state,link.browserNonce));
  const expired = await beginTikTokLink(db,{ ...options,folderId:'2' });
  sqlite.prepare('UPDATE tiktok_oauth_states SET expires_at=0').run();
  await assert.rejects(consumeTikTokLink(db,expired.state,expired.browserNonce));
  await assert.rejects(beginTikTokLink(db,{...options,folderId:'3'}));
  await assert.rejects(beginTikTokLink(db,{...options,folderId:'1',identity:null}));
  await assert.rejects(beginTikTokLink(db,{...options,folderId:'1',userId:'one@example.com',identity:{...identity,emailVerified:false}}));
  sqlite.close();
});

test('invalid provider credentials or deleted folders preserve prior links', async () => {
  const { db, sqlite } = database();
  await saveTikTokConnection(db,connection(1,'alice'));
  await assert.rejects(saveTikTokConnection(db,{...connection(1,'bob'),accessToken:''}));
  await assert.rejects(saveTikTokConnection(db,{...connection(1,'bob'),openId:''}));
  assert.equal((await tikTokPublishingAccount(db,'1','uid-1')).tiktok_open_id,'alice');
  const link=await beginTikTokLink(db,{...options,folderId:'2'});
  sqlite.exec('DELETE FROM folders WHERE id=2');
  await assert.rejects(consumeTikTokLink(db,link.state,link.browserNonce));
  sqlite.close();
});

function fixtureFetch(calls) {
  return async (url,init={}) => {
    url=String(url);
    if(url.includes('identitytoolkit')) return Response.json({users:[{localId:'uid-1',email:'one@example.com',emailVerified:true}]});
    if(url.includes('/oauth/token/')) {
      const code=new URLSearchParams(init.body).get('code');
      if(code==='fail') return Response.json({error:'invalid_grant'},{status:400});
      return Response.json({access_token:`token-${code}`,refresh_token:`refresh-${code}`,open_id:code,expires_in:3600});
    }
    if(url.includes('/user/info/')) return Response.json({data:{user:{display_name:'Fixture TikTok'}}});
    if(url.includes('/video/init/')) {
      calls.push(init.headers.Authorization);
      return Response.json({data:{publish_id:'publish-'+calls.length,upload_url:'https://upload.example.test/file'},error:{code:'ok'}});
    }
    throw new Error('Unexpected network request '+url);
  };
}
async function start(env,folderId) {
  const response=await worker.fetch(new Request('https://example.test/api/auth/tiktok',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({folder_id:folderId,user_id:'uid-1'})}),env);
  assert.equal(response.status,200,await response.clone().text());
  const result=await response.json();
  return {state:new URL(result.url).searchParams.get('state'),cookie:response.headers.get('Set-Cookie').split(';')[0]};
}
async function callback(env,link,code) {
  return worker.fetch(new Request(`https://example.test/api/auth/callback/tiktok?state=${encodeURIComponent(link.state)}&code=${code}`,{headers:{Cookie:link.cookie+'; mp_tiktok_login_state=stale-login'}}),env);
}

test('real Worker callbacks distinguish session reuse from folder mapping; publishing uses each folder token', async () => {
  const {db,sqlite}=database();
  const env={DB:db,BASE_URL:'https://example.test',TIKTOK_CLIENT_KEY:'test',TIKTOK_CLIENT_SECRET:'test',WEB_BILLING_ENABLED:'false'};
  const original=globalThis.fetch, calls=[]; globalThis.fetch=fixtureFetch(calls);
  try {
    assert.equal((await worker.fetch(new Request('https://example.test/api/auth/tiktok?folder_id=1&user_id=uid-1'),env)).status,405);
    const alice=await start(env,'1'); assert.equal((await callback(env,alice,'alice')).status,302);
    // Provider cookie reuse returns Alice for B: do not silently replace B or A.
    const repeated=await start(env,'2');
    const duplicate=await callback(env,repeated,'alice');
    assert.match(duplicate.headers.get('Location'),/already%20linked/);
    assert.equal(await tikTokPublishingAccount(db,'2','uid-1'),null);
    const bob=await start(env,'2'); assert.equal((await callback(env,bob,'bob')).status,302);
    assert.equal((await callback(env,bob,'bob')).status,400);
    for(const folderId of ['1','2']) {
      const result=await worker.fetch(new Request('https://example.test/api/tiktok/init-upload',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json',folder_id:folderId,user_id:'uid-1'},body:JSON.stringify({videoSize:1024,caption:'hello',privacyStatus:'SELF_ONLY'})}),env);
      assert.equal(result.status,200,await result.clone().text());
    }
    assert.deepEqual(calls,['Bearer token-alice','Bearer token-bob']);
    const failed=await start(env,'1'); await callback(env,failed,'fail');
    assert.equal((await tikTokPublishingAccount(db,'1','uid-1')).tiktok_open_id,'alice');
    const cancelled=await start(env,'1');
    const cancel=await worker.fetch(new Request(`https://example.test/api/auth/callback/tiktok?state=${cancelled.state}&error=access_denied`,{headers:{Cookie:cancelled.cookie}}),env);
    assert.match(cancel.headers.get('Location'),/cancelled/);
    const list=await worker.fetch(new Request('https://example.test/api/get-accounts?folder_id=1&user_id=uid-1',{headers:{Authorization:'Bearer test'}}),env);
    assert.equal((await list.json())[0].access_token,undefined);
    const deny=await worker.fetch(new Request('https://example.test/api/get-accounts?folder_id=1&user_id=uid-1'),env);
    assert.equal(deny.status,403);
    const session=sqlite.prepare("SELECT id,video_id FROM upload_sessions WHERE folder_id='1'").get();
    const status=await worker.fetch(new Request(`https://example.test/api/tiktok/publish-status?sessionId=${session.id}&publishId=${session.video_id}`,{headers:{Authorization:'Bearer test',folder_id:'2',user_id:'uid-1'}}),env);
    assert.equal(status.status,404);
    const target=(await tikTokPublishingAccount(db,'1','uid-1')).id;
    const wrongTarget=await worker.fetch(new Request('https://example.test/api/post-video',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({platform:'tiktok',account_id:target,folder_id:'2',user_id:'uid-1'})}),env);
    assert.equal(wrongTarget.status,403);
  } finally {globalThis.fetch=original;sqlite.close();}
});

test('connection replacement rolls back atomically if database insertion fails; unrelated providers survive', async () => {
  const {db,sqlite}=database();
  await saveTikTokConnection(db,connection(1,'alice'));
  sqlite.exec("INSERT INTO accounts(folder_id,user_id,platform,nickname,access_token) VALUES(1,'uid-1','youtube','Channel','yt'),(2,'uid-1','facebook_page','Page','fb');");
  sqlite.exec("CREATE TRIGGER reject_fixture BEFORE INSERT ON accounts WHEN NEW.tiktok_open_id='fail' BEGIN SELECT RAISE(ABORT,'fixture database failure'); END;");
  await assert.rejects(saveTikTokConnection(db,connection(1,'fail')));
  assert.equal((await tikTokPublishingAccount(db,'1','uid-1')).tiktok_open_id,'alice');
  assert.equal(sqlite.prepare('SELECT account_id FROM tokens WHERE folder_id=1').get().account_id,'alice');
  await disconnectTikTok(db,(await tikTokPublishingAccount(db,'1','uid-1')).id,'uid-1');
  assert.deepEqual(sqlite.prepare('SELECT platform FROM accounts ORDER BY folder_id').all().map(r=>r.platform),['youtube','facebook_page']);
  sqlite.close();
});

test('additive production migration preserves existing credentials and old upload records', () => {
  const sqlite=new DatabaseSync(':memory:');
  const legacy=readFileSync(new URL('../schema.sql',import.meta.url),'utf8').replace(',\n  tiktok_open_id TEXT','');
  sqlite.exec(legacy.slice(0,legacy.indexOf('CREATE TABLE IF NOT EXISTS tiktok_oauth_states')));
  sqlite.exec(readFileSync(new URL('../migrations/0004_create_upload_sessions.sql',import.meta.url),'utf8'));
  sqlite.exec("INSERT INTO accounts(user_id,folder_id,platform,access_token,refresh_token) VALUES('uid-1',1,'tiktok','legacy-access','legacy-refresh'); INSERT INTO upload_sessions(id,platform,access_token) VALUES('old','tiktok','legacy-access');");
  sqlite.exec(readFileSync(new URL('../migrations/0008_tiktok_folder_oauth.sql',import.meta.url),'utf8'));
  assert.equal(sqlite.prepare('SELECT access_token FROM accounts').get().access_token,'legacy-access');
  assert.equal(sqlite.prepare('SELECT refresh_token FROM accounts').get().refresh_token,'legacy-refresh');
  assert.equal(sqlite.prepare('SELECT access_token FROM upload_sessions').get().access_token,'legacy-access');
  sqlite.close();
});

test('network errors in OAuth leave the existing connection intact and return actionable UI', async () => {
  const {db,sqlite}=database(),original=globalThis.fetch;
  const env={DB:db,BASE_URL:'https://example.test',TIKTOK_CLIENT_KEY:'test',TIKTOK_CLIENT_SECRET:'test'};
  globalThis.fetch=fixtureFetch([]);
  try {
    await saveTikTokConnection(db,connection(1,'alice'));
    const link=await start(env,'1');
    globalThis.fetch=async()=>{throw new Error('fixture network failure')};
    const response=await callback(env,link,'bob');
    assert.equal(response.status,302);
    assert.match(response.headers.get('Location'),/tiktok_error=/);
    assert.equal((await tikTokPublishingAccount(db,'1','uid-1')).tiktok_open_id,'alice');
  }finally{globalThis.fetch=original;sqlite.close();}
});

test('disconnect and folder deletion endpoints clear TikTok tokens, sessions and pending state without touching other folders', async () => {
  const {db,sqlite}=database(),original=globalThis.fetch;
  const env={DB:db,BASE_URL:'https://example.test'};globalThis.fetch=fixtureFetch([]);
  try{
    await saveTikTokConnection(db,connection(1,'alice'));await saveTikTokConnection(db,connection(2,'bob'));
    await beginTikTokLink(db,{...options,folderId:'1'});
    sqlite.exec("INSERT INTO upload_sessions(id,platform,folder_id,user_id,access_token) VALUES('s','tiktok','1','uid-1','token-alice');");
    const id=(await tikTokPublishingAccount(db,'1','uid-1')).id;
    const response=await worker.fetch(new Request('https://example.test/api/delete-folder',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({id,user_id:'uid-1',type:'account_only'})}),env);
    assert.equal(response.status,200);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM upload_sessions').get().n,0);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM tiktok_oauth_states').get().n,0);
    assert.equal((await tikTokPublishingAccount(db,'2','uid-1')).tiktok_open_id,'bob');
    const deletion=await worker.fetch(new Request('https://example.test/api/delete-folder',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({id:2,user_id:'uid-1'})}),env);
    assert.equal(deletion.status,200);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM tokens').get().n,0);
  }finally{globalThis.fetch=original;sqlite.close();}
});

test('refresh retains the folder identity and cannot resurrect a concurrently disconnected account', async () => {
  const {db,sqlite}=database(),original=globalThis.fetch,calls=[];
  const env={DB:db,BASE_URL:'https://example.test',TIKTOK_CLIENT_KEY:'test',TIKTOK_CLIENT_SECRET:'test'};
  const base=fixtureFetch(calls);
  const publish=()=>worker.fetch(new Request('https://example.test/api/tiktok/init-upload',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json',folder_id:'1',user_id:'uid-1'},body:JSON.stringify({videoSize:1024,caption:'test'})}),env);
  try {
    await saveTikTokConnection(db,{...connection(1,'alice'),expiresAt:1});
    globalThis.fetch=async(url,init)=>String(url).includes('/oauth/token/')?Response.json({access_token:'wrong-bob-token',open_id:'bob',expires_in:3600}):base(url,init);
    assert.equal((await publish()).status,500);
    assert.equal((await tikTokPublishingAccount(db,'1','uid-1')).access_token,'token-alice');
    assert.equal(calls.length,0);
    globalThis.fetch=async(url,init)=>String(url).includes('/oauth/token/')?Response.json({access_token:'rotated-alice-token',refresh_token:'rotated-refresh',open_id:'alice',expires_in:3600}):base(url,init);
    assert.equal((await publish()).status,200);
    assert.equal((await tikTokPublishingAccount(db,'1','uid-1')).access_token,'rotated-alice-token');
    assert.deepEqual(calls,['Bearer rotated-alice-token']);
    sqlite.exec('UPDATE accounts SET expires_at=1');
    globalThis.fetch=async(url,init)=>{
      if(String(url).includes('/oauth/token/')){
        await disconnectTikTok(db,(await tikTokPublishingAccount(db,'1','uid-1')).id,'uid-1');
        return Response.json({access_token:'late-refresh',open_id:'alice',expires_in:3600});
      }
      return base(url,init);
    };
    assert.equal((await publish()).status,500);
    assert.equal(await tikTokPublishingAccount(db,'1','uid-1'),null);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM tokens').get().n,0);
  }finally{globalThis.fetch=original;sqlite.close();}
});
