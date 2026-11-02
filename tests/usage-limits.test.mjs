import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';
import { reconcilePendingPublications } from '../publication-reconciliation.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/0009_play_subscriptions.sql',
    'migrations/0010_play_trial_phase.sql', 'migrations/0011_usage_workspace_entitlements.sql',
    'migrations/0012_publication_reservations.sql', 'migrations/0013_workspace_item_entitlements.sql',
    'migrations/0014_workspace_choices.sql',
    'migrations/0015_publication_reconciliation.sql']) {
    sqlite.exec(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  }
  sqlite.exec(readFileSync(new URL('../migrations/0004_create_upload_sessions.sql', import.meta.url), 'utf8'));
  sqlite.exec('ALTER TABLE upload_sessions ADD COLUMN folder_id TEXT; ALTER TABLE upload_sessions ADD COLUMN user_id TEXT;');
  const db = { prepare(sql) { let args = []; return {
    bind(...values) { args = values; return this; },
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async run() { return sqlite.prepare(sql).run(...args); },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; }
  }; }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const output = []; for (const statement of statements) output.push(await statement.run()); sqlite.exec('COMMIT'); return output; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  sqlite.prepare(`INSERT INTO billing_subscriptions (user_id,user_email,subscription_status,current_period_end)
    VALUES ('uid-1','one@example.com','active',?)`).run(Math.floor(Date.now() / 1000) + 86400);
  return { sqlite, env: { DB: db, WEB_BILLING_ENABLED: 'true' } };
}

const headers = { Authorization: 'Bearer token', 'Content-Type': 'application/json' };
const monthStart = () => { const d = new Date(); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000); };
const seo = {
  youtube: { title: 'FIFA Street 2 PS2 Skills and Match Gameplay',
    description: 'Watch FIFA Street 2 gameplay on PS2, featuring street football matches and skill moves. See how the classic game plays on original hardware.',
    keywords: 'FIFA Street 2, FIFA Street 2 PS2, PS2 gameplay, street football game, FIFA gameplay, retro football games, PlayStation 2 games, EA Sports Big' },
  tiktok: { allInOne: 'FIFA Street 2 skills on PS2 ⚽ #FIFAStreet2 #PS2Gaming #RetroGaming' },
  facebook: { title: 'FIFA Street 2 Gameplay on PS2',
    descriptionAndTags: 'Street football matches and skill moves from FIFA Street 2 on PlayStation 2.\n\n#FIFAStreet2 #PS2Gaming #RetroFootball' }
};

test('AI credits reserve atomically, replay the same request, and block the 151st credit across account aliases', async () => {
  const { sqlite, env } = fixture();
  let modelCalls = 0;
  env.AI = { run: async () => { modelCalls++; return { response: JSON.stringify(seo) }; } };
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
  const request = (id, body = {}) => worker.fetch(new Request('https://test.invalid/api/generate-premium-seo', {
    method: 'POST', headers, body: JSON.stringify({ user_id: 'one@example.com', topic: 'Short description', request_id: id, ...body })
  }), env);
  for (let i = 0; i < 149; i++) sqlite.prepare("INSERT INTO billing_ai_requests (user_id,request_id,input_hash,month_start,credits,status) VALUES (?,?,?,?,1,'completed')")
    .run('uid-1', `prior-${i}`, 'hash', monthStart());
  sqlite.prepare(`INSERT INTO billing_play_purchases
    (user_id,token_hash,encrypted_token,product_id,base_plan_id,subscription_state,expiry_time,last_verified_at)
    VALUES ('uid-1','hash','encrypted','multipost_pro','monthly','SUBSCRIPTION_STATE_ACTIVE',?,?)`)
    .run(Math.floor(Date.now()/1000)+3600, Math.floor(Date.now()/1000));
  try {
    const image = await request('image-unique-key-001', { image_base64: '/9j/AA==', image_filename: 'photo.jpg' });
    assert.equal(image.status, 429, await image.clone().text());
    const first = await request('text-unique-key-001');
    assert.equal(first.status, 200, await first.clone().text());
    assert.equal(sqlite.prepare("SELECT status FROM billing_ai_requests WHERE request_id = 'text-unique-key-001'").get().status, 'completed');
    const repeat = await request('text-unique-key-001');
    assert.equal(repeat.status, 200);
    assert.equal(modelCalls, 1, 'a replay must not call the model again');
    assert.equal((await request('text-unique-key-002')).status, 429);
    const status = await worker.fetch(new Request('https://test.invalid/api/billing/status?user_id=uid-1', { headers }), env);
    assert.equal((await status.json()).billing.ai_credits.used, 150);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('workspace creation enforces one included place across UID and verified email, with a verified cached Play tier', async () => {
  const { sqlite, env } = fixture();
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
  const add = user_id => worker.fetch(new Request('https://test.invalid/api/add-folder', {
    method: 'POST', headers, body: JSON.stringify({ name: 'Workspace', user_id })
  }), env);
  try {
    assert.equal((await add('one@example.com')).status, 402, 'unpaid aliases never inherit a second billing row');
    assert.equal((await add('uid-1')).status, 200);
    assert.equal((await add('uid-1')).status, 429);
    sqlite.prepare(`INSERT INTO billing_play_purchases
      (user_id,token_hash,encrypted_token,product_id,base_plan_id,subscription_state,expiry_time,last_verified_at,workspace_quantity,workspace_expiry)
      VALUES ('uid-1','hash','encrypted','multipost_pro','monthly','SUBSCRIPTION_STATE_ACTIVE',?,?,2,?)`)
      .run(Math.floor(Date.now()/1000)+3600, Math.floor(Date.now()/1000), Math.floor(Date.now()/1000)+3600);
    sqlite.prepare("UPDATE billing_play_purchases SET workspace_items_json = ? WHERE user_id = 'uid-1'")
      .run(JSON.stringify([1, 2].map(n => ({ productId: `multipost_workspace_0${n}`, expiry: Math.floor(Date.now()/1000)+3600, renewing: true }))));
    assert.equal((await add('uid-1')).status, 200);
    assert.equal((await add('uid-1')).status, 200);
    assert.equal((await add('one@example.com')).status, 429, 'the same account cannot gain another place using its email');
    sqlite.prepare("UPDATE billing_play_purchases SET workspace_items_json = '[]' WHERE user_id = 'uid-1'").run();
    assert.equal((await add('uid-1')).status, 429);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM folders WHERE user_id='uid-1'").get().count, 3);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('downsized workspace entitlements lock excess folders without deleting them and allow a verified choice', async () => {
  const { sqlite, env } = fixture();
  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare(`INSERT INTO billing_play_purchases
    (user_id,token_hash,encrypted_token,product_id,base_plan_id,subscription_state,expiry_time,last_verified_at,workspace_items_json)
    VALUES ('uid-1','hash','encrypted','multipost_pro','monthly','SUBSCRIPTION_STATE_ACTIVE',?,?,?)`)
    .run(now + 3600, now, JSON.stringify([1,2].map(n => ({ productId: `multipost_workspace_0${n}`, expiry: now + 3600, renewing: true }))));
  for (const id of [1,2,3]) sqlite.prepare('INSERT INTO folders (id,user_id,name) VALUES (?, ?, ?)').run(id, 'uid-1', `Workspace ${id}`);
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
  const list = () => worker.fetch(new Request('https://test.invalid/api/get-folders?user_id=uid-1', { headers }), env);
  try {
    assert.deepEqual((await (await list()).json()).map(item => item.workspace_locked), [false,false,false]);
    sqlite.prepare("UPDATE billing_play_purchases SET workspace_items_json = ? WHERE user_id='uid-1'")
      .run(JSON.stringify([{ productId:'multipost_workspace_01', expiry: now + 3600, renewing:false }]));
    const downgraded = await (await list()).json();
    assert.deepEqual(Object.fromEntries(downgraded.map(item => [item.id, item.workspace_locked])), { 1:false, 2:false, 3:true });
    const blocked = await worker.fetch(new Request('https://test.invalid/api/youtube/init-upload', {
      method:'POST', headers:{...headers, folder_id:'3', user_id:'uid-1'}, body:JSON.stringify({title:'Blocked',fileSize:100})
    }), env);
    assert.equal(blocked.status, 423);
    const select = await worker.fetch(new Request('https://test.invalid/api/workspaces/select-active', {
      method:'POST', headers, body:JSON.stringify({folder_ids:[3]})
    }), env);
    assert.equal(select.status, 200, await select.clone().text());
    assert.deepEqual(Object.fromEntries((await (await list()).json()).map(item => [item.id, item.workspace_locked])), { 1:false, 2:true, 3:false });
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM folders').get().count, 3);
    const denied = await worker.fetch(new Request('https://test.invalid/api/workspaces/select-active', {
      method:'POST', headers, body:JSON.stringify({folder_ids:[1,2,3]})
    }), env);
    assert.equal(denied.status, 403);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('one verified additional Play workspace grants its own social account place', async () => {
  const { sqlite, env } = fixture();
  const now = Math.floor(Date.now() / 1000);
  env.GOOGLE_CLIENT_ID = 'test-client';
  env.GOOGLE_CLIENT_SECRET = 'test-secret';
  sqlite.prepare(`INSERT INTO billing_play_purchases
    (user_id,token_hash,encrypted_token,product_id,base_plan_id,subscription_state,expiry_time,last_verified_at,workspace_items_json)
    VALUES ('uid-1','hash','encrypted','multipost_pro','monthly','SUBSCRIPTION_STATE_ACTIVE',?,?,?)`)
    .run(now + 3600, now, JSON.stringify([{ productId:'multipost_workspace_01', expiry:now + 3600, renewing:true }]));
  for (const id of [1,2]) sqlite.prepare('INSERT INTO folders (id,user_id,name) VALUES (?, ?, ?)').run(id, 'uid-1', `Workspace ${id}`);
  sqlite.prepare("INSERT INTO accounts (user_id,folder_id,platform,access_token) VALUES ('uid-1',1,'youtube','existing')").run();
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users:[{ localId:'uid-1', email:'one@example.com', emailVerified:true }] });
  try {
    const connect = folder_id => worker.fetch(new Request('https://test.invalid/api/auth/youtube', {
      method:'POST', headers, body:JSON.stringify({ folder_id, user_id:'uid-1' })
    }), env);
    const second = await connect(2);
    assert.equal(second.status, 200, await second.clone().text());
    assert.match((await second.json()).url, /accounts\.google\.com/);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('an unavailable model returns the local draft without consuming paid AI credits', async () => {
  const { sqlite, env } = fixture();
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
  try {
    const request = () => worker.fetch(new Request('https://test.invalid/api/generate-premium-seo', {
      method: 'POST', headers, body: JSON.stringify({ user_id: 'uid-1', topic: 'A short post about street football', request_id: 'local-fallback-unique-001' })
    }), env);
    const result = await request();
    assert.equal(result.status, 200);
    assert.equal((await result.json()).provider, 'local');
    const row = sqlite.prepare("SELECT credits,status FROM billing_ai_requests WHERE user_id = 'uid-1'").get();
    assert.equal(row.credits, 0);
    assert.equal(row.status, 'completed');
    assert.equal((await request()).status, 200);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('parallel AI requests cannot both reserve the final credit', async () => {
  const { sqlite, env } = fixture();
  for (let i = 0; i < 149; i++) sqlite.prepare("INSERT INTO billing_ai_requests (user_id,request_id,input_hash,month_start,credits,status) VALUES (?,?,?,?,1,'completed')")
    .run('uid-1', `earlier-${i}`, 'hash', monthStart());
  let modelCalls = 0;
  env.AI = { run: async () => { modelCalls++; return { response: JSON.stringify(seo) }; } };
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
  try {
    const make = id => worker.fetch(new Request('https://test.invalid/api/generate-premium-seo', {
      method: 'POST', headers, body: JSON.stringify({ user_id: 'uid-1', topic: 'FIFA Street 2 PS2 gameplay', request_id: id })
    }), env);
    const results = await Promise.all([make('parallel-request-0001'), make('parallel-request-0002')]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 429]);
    assert.equal(modelCalls, 1);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('publication preflight counts only this month’s confirmed events across account aliases', async () => {
  const { sqlite, env } = fixture();
  sqlite.prepare("INSERT INTO folders (user_id,name) VALUES ('uid-1','Main')").run();
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
  const publish = () => worker.fetch(new Request('https://test.invalid/api/youtube/init-upload', {
    method: 'POST', headers: { ...headers, folder_id: '1', user_id: 'uid-1' },
    body: JSON.stringify({ title: 'Test', fileSize: 100 })
  }), env);
  try {
    const insert = sqlite.prepare('INSERT INTO billing_usage_events (user_id,event_type,platform,created_at) VALUES (?,?,?,?)');
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 149; i++) insert.run('one@example.com', 'publish_confirmed', 'facebook', now);
    insert.run('uid-1', 'publish', 'tiktok', now); // old initiated upload, not a success
    insert.run('uid-1', 'publish_confirmed', 'youtube', monthStart() - 1);
    const before = await worker.fetch(new Request('https://test.invalid/api/billing/status?user_id=uid-1', { headers }), env);
    assert.equal((await before.json()).billing.publications.used, 149, 'pending and previous-month events do not consume the allowance');
    insert.run('uid-1', 'publish_confirmed', 'tiktok', now);
    const blocked = await publish();
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /150 successful platform publications/);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('a publication completed after midnight at the month boundary belongs to its completion month', async () => {
  const { sqlite, env } = fixture();
  const month = monthStart();
  sqlite.prepare(`INSERT INTO billing_publish_slots (id,user_id,platform,month_start,status,completed_at)
    VALUES ('late','uid-1','facebook',?,'completed',?)`).run(month - 86400, month + 1);
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users:[{ localId:'uid-1', email:'one@example.com', emailVerified:true }] });
  try {
    const status = await worker.fetch(new Request('https://test.invalid/api/billing/status?user_id=uid-1', { headers }), env);
    assert.equal((await status.json()).billing.publications.used, 1);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('parallel publishing attempts reserve the last place and release failed preflight requests', async () => {
  const { sqlite, env } = fixture();
  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare("INSERT INTO folders (user_id,name) VALUES ('uid-1','Main')").run();
  sqlite.prepare("INSERT INTO accounts (user_id,folder_id,platform,access_token) VALUES ('uid-1',1,'youtube','yt-token')").run();
  const insert = sqlite.prepare('INSERT INTO billing_usage_events (user_id,event_type,platform,created_at) VALUES (?,?,?,?)');
  for (let i = 0; i < 149; i++) insert.run('one@example.com', 'publish_confirmed', 'tiktok', monthStart());
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
    if (String(url).includes('upload/youtube')) {
      await new Promise(resolve => setTimeout(resolve, 5));
      return new Response('', { status: 200, headers: { Location: 'https://www.googleapis.com/upload/unique-session' } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const init = (body = { title: 'First', fileSize: 100 }) => worker.fetch(new Request('https://test.invalid/api/youtube/init-upload', {
    method: 'POST', headers: { ...headers, folder_id: '1', user_id: 'uid-1' }, body: JSON.stringify(body)
  }), env);
  try {
    const invalid = await init({ title: '', fileSize: 100 });
    assert.equal(invalid.status, 400);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_publish_slots WHERE status='pending'").get().count, 0);
    const results = await Promise.all([init(), init()]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 429]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_publish_slots WHERE status='pending'").get().count, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM billing_publish_sessions').get().count, 1);
    const status = await worker.fetch(new Request('https://test.invalid/api/billing/status?user_id=uid-1', { headers }), env);
    assert.equal((await status.json()).billing.publications.used, 149, 'in-flight uploads reserve a place but are not successful publications');
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('YouTube upload completion counts exactly once after a reserved initiation', async () => {
  const { sqlite, env } = fixture();
  sqlite.prepare("INSERT INTO folders (user_id,name) VALUES ('uid-1','Main')").run();
  sqlite.prepare("INSERT INTO accounts (user_id,folder_id,platform,access_token) VALUES ('uid-1',1,'youtube','yt-token')").run();
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
    if (String(url).includes('uploadType=resumable')) return new Response('', { status: 200, headers: { Location: 'https://www.googleapis.com/upload/mock-session' } });
    if (String(url).endsWith('/upload/mock-session')) return Response.json({ id: 'video-1' });
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const common = { ...headers, folder_id: '1', user_id: 'uid-1' };
    const init = await worker.fetch(new Request('https://test.invalid/api/youtube/init-upload', {
      method: 'POST', headers: common, body: JSON.stringify({ title: 'Video', fileSize: 4 })
    }), env);
    assert.equal(init.status, 200, await init.clone().text());
    const { sessionId } = await init.json();
    const form = new FormData();
    form.set('sessionId', sessionId);
    form.set('chunk', new File([new Uint8Array([1, 2, 3, 4])], 'clip.mp4', { type: 'video/mp4' }));
    const chunk = await worker.fetch(new Request('https://test.invalid/api/youtube/upload-chunk', {
      method: 'POST', headers: { Authorization: headers.Authorization, folder_id: '1', user_id: 'uid-1' }, body: form
    }), env);
    assert.equal(chunk.status, 200, await chunk.clone().text());
    assert.equal((await chunk.json()).complete, true);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_publish_slots WHERE status='completed'").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_usage_events WHERE event_type='publish_metered'").get().count, 1);
    const status = await worker.fetch(new Request('https://test.invalid/api/billing/status?user_id=uid-1', { headers }), env);
    assert.equal((await status.json()).billing.publications.used, 1);
    const replay = await worker.fetch(new Request('https://test.invalid/api/youtube/upload-chunk', {
      method: 'POST', headers: { Authorization: headers.Authorization, folder_id: '1', user_id: 'uid-1' }, body: form
    }), env);
    assert.equal(replay.status, 404);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_publish_slots WHERE status='completed'").get().count, 1);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('a signed-in subscriber cannot publish using another workspace token', async () => {
  const { sqlite, env } = fixture();
  sqlite.prepare("INSERT INTO folders (id,user_id,name) VALUES (2,'other-uid','Other')").run();
  sqlite.prepare("INSERT INTO tokens (folder_id,platform,account_id,access_token) VALUES (2,'youtube','channel','secret-token')").run();
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
    throw new Error('Provider request must not be made');
  };
  try {
    const init = await worker.fetch(new Request('https://test.invalid/api/youtube/init-upload', {
      method: 'POST', headers: { ...headers, folder_id: '2', user_id: 'uid-1' },
      body: JSON.stringify({ title: 'Stolen', fileSize: 100 })
    }), env);
    assert.equal(init.status, 403);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM billing_publish_slots').get().count, 0);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('workspace account listing never returns provider credentials', async () => {
  const { sqlite, env } = fixture();
  sqlite.prepare("INSERT INTO folders (user_id,name) VALUES ('uid-1','Main')").run();
  sqlite.prepare(`INSERT INTO accounts (user_id,folder_id,platform,nickname,access_token,refresh_token,facebook_page_access_token,facebook_user_access_token)
    VALUES ('uid-1',1,'facebook_page','Page','access-secret','refresh-secret','page-secret','user-secret')`).run();
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
  try {
    const result = await worker.fetch(new Request('https://test.invalid/api/get-accounts?folder_id=1&user_id=uid-1', { headers }), env);
    assert.equal(result.status, 200);
    const [account] = await result.json();
    assert.equal(account.nickname, 'Page');
    for (const key of ['access_token', 'refresh_token', 'facebook_page_access_token', 'facebook_user_access_token']) assert.equal(account[key], undefined);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('account removal requires the owner and clears its server-side tokens', async () => {
  const { sqlite, env } = fixture();
  sqlite.prepare("INSERT INTO folders (user_id,name) VALUES ('uid-1','Main')").run();
  sqlite.prepare("INSERT INTO accounts (user_id,folder_id,platform,access_token) VALUES ('uid-1',1,'youtube','yt-secret')").run();
  sqlite.prepare("INSERT INTO tokens (folder_id,platform,account_id,access_token) VALUES (1,'youtube','channel','yt-secret')").run();
  const accountId = sqlite.prepare("SELECT id FROM accounts WHERE platform='youtube'").get().id;
  const body = JSON.stringify({ id: accountId, user_id: 'uid-1', type: 'account_only' });
  const request = authenticated => worker.fetch(new Request('https://test.invalid/api/delete-folder', {
    method: 'POST', headers: authenticated ? headers : { 'Content-Type': 'application/json' }, body
  }), env);
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
  try {
    assert.equal((await request(false)).status, 403);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM tokens WHERE platform='youtube'").get().count, 1);
    assert.equal((await request(true)).status, 200);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM tokens WHERE platform='youtube'").get().count, 0);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('TikTok provider failure releases a place; confirmed completion consumes one', async () => {
  const { sqlite, env } = fixture();
  sqlite.prepare("INSERT INTO folders (user_id,name) VALUES ('uid-1','Main')").run();
  for (const id of ['failed', 'posted']) {
    sqlite.prepare(`INSERT INTO billing_publish_slots (id,user_id,platform,month_start,status)
      VALUES (?,'uid-1','tiktok',?,'pending')`).run(id, monthStart());
    sqlite.prepare(`INSERT INTO upload_sessions (id,platform,access_token,video_id,title,folder_id,user_id,expires_at)
      VALUES (?,'tiktok','tiktok-token',?,'SELF_ONLY','1','uid-1',?)`).run(id, id, Math.floor(Date.now() / 1000) + 3600);
    sqlite.prepare('INSERT INTO billing_publish_sessions (session_id,slot_id) VALUES (?,?)').run(id, id);
  }
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-1', email: 'one@example.com', emailVerified: true }] });
    if (String(url).includes('status/fetch')) return Response.json({ error: { code: 'ok' }, data: {
      status: JSON.parse(init.body).publish_id === 'failed' ? 'FAILED' : 'PUBLISH_COMPLETE'
    } });
    if (String(url).includes('creator_info/query')) return Response.json({ data: {} });
    throw new Error(`Unexpected request: ${url}`);
  };
  const check = id => worker.fetch(new Request(`https://test.invalid/api/tiktok/publish-status?publishId=${id}&sessionId=${id}`, {
    headers: { Authorization: headers.Authorization, folder_id: '1', user_id: 'uid-1' }
  }), env);
  try {
    assert.equal((await (await check('failed')).json()).failed, true);
    assert.equal(sqlite.prepare("SELECT status FROM billing_publish_slots WHERE id='failed'").get().status, 'failed');
    assert.equal((await (await check('posted')).json()).ready, true);
    assert.equal(sqlite.prepare("SELECT status FROM billing_publish_slots WHERE id='posted'").get().status, 'completed');
    const status = await worker.fetch(new Request('https://test.invalid/api/billing/status?user_id=uid-1', { headers }), env);
    assert.equal((await status.json()).billing.publications.used, 1);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('Facebook Reel submission reserves a place and only confirmed status consumes it once', async () => {
  const { sqlite, env } = fixture();
  sqlite.prepare("INSERT INTO folders (id,user_id,name) VALUES (1,'uid-1','Main')").run();
  sqlite.prepare(`INSERT INTO accounts (user_id,folder_id,platform,facebook_page_id,facebook_page_access_token)
    VALUES ('uid-1',1,'facebook_page','page-1','page-token')`).run();
  const original = globalThis.fetch;
  let published = false;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId:'uid-1', email:'one@example.com', emailVerified:true }] });
    if (String(url).includes('/video_reels')) {
      if (new URLSearchParams(init.body).get('upload_phase') === 'start') return Response.json({ video_id:'reel-1', upload_url:'https://upload.invalid/reel' });
      return Response.json({ post_id:'post-1' });
    }
    if (String(url).includes('upload.invalid')) return new Response('', { status:200 });
    if (String(url).includes('/reel-1?')) return Response.json({ id:'reel-1', published, status: { video_status: published ? 'ready' : 'processing' },
      permalink_url: published ? 'https://www.facebook.com/reel/reel-1' : '' });
    throw new Error(`Unexpected request: ${url}`);
  };
  const post = new FormData();
  post.set('title','New Reel');
  post.set('video',new File([new Uint8Array([1,2,3])], 'clip.mp4', { type:'video/mp4' }));
  const requestHeaders = { Authorization:headers.Authorization, folder_id:'1', user_id:'uid-1' };
  try {
    const start = await worker.fetch(new Request('https://test.invalid/api/facebook/upload', { method:'POST', headers:requestHeaders, body:post }), env);
    assert.equal(start.status, 200, await start.clone().text());
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_publish_slots WHERE status='pending'").get().count, 1);
    const status = () => worker.fetch(new Request('https://test.invalid/api/facebook/video-status?videoId=reel-1', { headers:requestHeaders }), env);
    assert.equal((await (await status()).json()).ready, false);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_publish_slots WHERE status='completed'").get().count, 0);
    published = true;
    assert.equal((await (await status()).json()).ready, true);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_publish_slots WHERE status='completed'").get().count, 1);
    assert.equal((await (await status()).status), 404, 'status replay must not count again');
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_usage_events WHERE event_type='publish_metered'").get().count, 1);
    assert.equal((await (await worker.fetch(new Request('https://test.invalid/api/billing/status?user_id=uid-1', { headers }), env)).json()).billing.publications.used, 1);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('an explicit Facebook Reel processing failure releases its publication place', async () => {
  const { sqlite, env } = fixture();
  sqlite.prepare("INSERT INTO folders (id,user_id,name) VALUES (1,'uid-1','Main')").run();
  sqlite.prepare(`INSERT INTO accounts (user_id,folder_id,platform,facebook_page_id,facebook_page_access_token)
    VALUES ('uid-1',1,'facebook_page','page-1','page-token')`).run();
  sqlite.prepare(`INSERT INTO billing_publish_slots (id,user_id,platform,month_start,status)
    VALUES ('failed-reel','uid-1','facebook',?,'pending')`).run(monthStart());
  sqlite.prepare(`INSERT INTO upload_sessions (id,platform,video_id,page_id,folder_id,user_id,expires_at)
    VALUES ('failed-reel','facebook','video-failed','page-1','1','uid-1',?)`).run(Math.floor(Date.now()/1000)+3600);
  sqlite.prepare("INSERT INTO billing_publish_sessions (session_id,slot_id) VALUES ('failed-reel','failed-reel')").run();
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users:[{ localId:'uid-1', email:'one@example.com', emailVerified:true }] });
    return Response.json({ id:'video-failed', status:{ publishing_phase:{ status:'failed' } }, published:false });
  };
  try {
    const result = await worker.fetch(new Request('https://test.invalid/api/facebook/video-status?videoId=video-failed', {
      headers:{ Authorization:headers.Authorization, folder_id:'1', user_id:'uid-1' }
    }), env);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).failed, true);
    assert.equal(sqlite.prepare("SELECT status FROM billing_publish_slots WHERE id='failed-reel'").get().status, 'failed');
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_usage_events WHERE event_type='publish_metered'").get().count, 0);
  } finally { globalThis.fetch = original; sqlite.close(); }
});

test('reconciler confirms provider success once, releases explicit failures, and retains uncertain reservations', async () => {
  const { sqlite, env } = fixture();
  const now = Math.floor(Date.now() / 1000);
  for (const id of ['success', 'failure', 'uncertain']) {
    sqlite.prepare(`INSERT INTO billing_publish_slots (id,user_id,platform,month_start,status) VALUES (?,'uid-1','tiktok',?,'pending')`).run(id, monthStart());
    sqlite.prepare(`INSERT INTO upload_sessions (id,platform,access_token,video_id,title,folder_id,user_id,expires_at)
      VALUES (?,'tiktok','token',?,'SELF_ONLY','1','uid-1',?)`).run(id, id, now + 3600);
    sqlite.prepare('INSERT INTO billing_publish_sessions (session_id,slot_id) VALUES (?,?)').run(id, id);
  }
  const fetcher = async (_url, init) => Response.json({ error:{ code:'ok' }, data:{ status: {
    success:'PUBLISH_COMPLETE', failure:'FAILED', uncertain:'PROCESSING'
  }[JSON.parse(init.body).publish_id] } });
  try {
    assert.deepEqual(await reconcilePendingPublications(env, fetcher, now), { scanned:3, completed:1, failed:1 });
    assert.equal(sqlite.prepare("SELECT status FROM billing_publish_slots WHERE id='success'").get().status, 'completed');
    assert.equal(sqlite.prepare("SELECT status FROM billing_publish_slots WHERE id='failure'").get().status, 'failed');
    assert.equal(sqlite.prepare("SELECT status FROM billing_publish_slots WHERE id='uncertain'").get().status, 'pending');
    assert.deepEqual(await reconcilePendingPublications(env, fetcher, now + 300), { scanned:1, completed:0, failed:0 });
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM billing_usage_events WHERE event_type='publish_metered'").get().count, 1);
  } finally { sqlite.close(); }
});
