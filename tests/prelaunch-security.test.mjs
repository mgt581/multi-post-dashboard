import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';
import { beginPlatformLink, consumePlatformLink } from '../platform-link.mjs';
import preview from '../prelaunch-preview-worker.mjs';
function fixture() {
 const sqlite=new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 sqlite.exec("INSERT INTO folders(id,user_id,name) VALUES (1,'owner','A'),(2,'other','B')");
 const db={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return sqlite.prepare(sql).run(...args)}}}};
 return {sqlite,db};
}
for(const platform of ['facebook','youtube']) {
 test(`${platform} OAuth refuses wrong owner, browser, expired and replayed state`,async()=>{
  const {sqlite,db}=fixture(); const options={platform,folderId:'1',userId:'owner',identity:{userId:'owner'}};
  await assert.rejects(beginPlatformLink(db,{...options,folderId:'2'}));
  await assert.rejects(beginPlatformLink(db,{...options,identity:{userId:'other'}}));
  const link=await beginPlatformLink(db,options);
  await assert.rejects(consumePlatformLink(db,platform,link.state,'wrong-browser'));
  await assert.rejects(consumePlatformLink(db,platform,btoa(JSON.stringify({folderId:'1',userId:'owner'})),link.browserNonce));
  assert.equal((await consumePlatformLink(db,platform,link.state,link.browserNonce)).user_id,'owner');
  await assert.rejects(consumePlatformLink(db,platform,link.state,link.browserNonce));
  const expired=await beginPlatformLink(db,options);sqlite.exec('UPDATE tiktok_oauth_states SET expires_at=0');
  await assert.rejects(consumePlatformLink(db,platform,expired.state,expired.browserNonce));sqlite.close();
 });
 test(`${platform} linking requires a verified matching identity before writing or contacting provider`,async()=>{
  let calls=0;const original=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw new Error('No network allowed')};
  try {
   const response=await worker.fetch(new Request(`https://preview.test/api/auth/${platform}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder_id:'1',user_id:'owner'})}),{});
   assert.equal(response.status,403);assert.equal(calls,0);
  }finally{globalThis.fetch=original}
 });
}
for(const route of ['facebook/upload','facebook/upload-image','youtube/upload','youtube/init-upload','youtube/upload-chunk']) test(`${route} rejects forged ownership before provider or DB writes`,async()=>{
 const response=await worker.fetch(new Request(`https://preview.test/api/${route}`,{method:'POST',headers:{folder_id:'1',user_id:'owner'}}),{});assert.equal(response.status,403);
});
test('brand creation rejects a forged identity before writing',async()=>{
 const response=await worker.fetch(new Request('https://preview.test/api/add-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'spam',user_id:'owner'})}),{});assert.equal(response.status,401);
});
test('preview refuses every unlisted API including posts and payments, without network calls',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Network forbidden')};
 try {for(const path of ['facebook/upload','youtube/init-upload','tiktok/init-upload','billing/create-checkout-session','generate-premium-seo']){
  const response=await preview.fetch(new Request('https://preview.test/api/'+path,{method:'POST',headers:{Cookie:'mp_preview_session=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}}),{DB:{},PRELAUNCH_ISOLATED:'true'});
  assert.equal(response.status,403,path);
 }}finally{globalThis.fetch=original}
});
test('Facebook reconnect issues authenticated provider URL and binds callback to the browser',async()=>{
 const {db,sqlite}=fixture();const original=globalThis.fetch;
 globalThis.fetch=async input=>{
  const url=String(input);
  if(url.includes('identitytoolkit')) return Response.json({users:[{localId:'owner',emailVerified:true}]});
  throw new Error('Unexpected provider call '+url);
 };
 try {
  const response=await worker.fetch(new Request('https://preview.test/api/auth/facebook',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({folder_id:'1',user_id:'owner',refresh:true})}),{DB:db,FB_CLIENT_ID:'fixture',FB_CLIENT_SECRET:'fixture',WEB_BILLING_ENABLED:'false',BASE_URL:'https://preview.test'});
  assert.equal(response.status,200,await response.clone().text());
  const location=new URL((await response.json()).url);
  assert.equal(location.searchParams.get('auth_type'),'rerequest');
  assert.match(location.searchParams.get('state'),/^facebooklink_/);
  const badCallback=await worker.fetch(new Request('https://preview.test/api/auth/callback/facebook?state='+location.searchParams.get('state')+'&code=test'),{DB:db});
  assert.equal(badCallback.status,400);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM accounts').get().n,0);
 }finally{sqlite.close();globalThis.fetch=original}
});
