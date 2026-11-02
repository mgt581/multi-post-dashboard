import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/0009_play_subscriptions.sql',
    'migrations/0010_play_trial_phase.sql', 'migrations/0011_usage_workspace_entitlements.sql']) {
    sqlite.exec(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  }
  const db = { prepare(sql) { let args = []; return {
    bind(...values) { args = values; return this; },
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async run() { return sqlite.prepare(sql).run(...args); },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; }
  }; } };
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
    assert.equal((await add('uid-1')).status, 200);
    assert.equal((await add('uid-1')).status, 200);
    assert.equal((await add('one@example.com')).status, 429, 'the same account cannot gain another place using its email');
    sqlite.prepare("UPDATE billing_play_purchases SET workspace_expiry = 1 WHERE user_id = 'uid-1'").run();
    assert.equal((await add('uid-1')).status, 429);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM folders WHERE user_id='uid-1'").get().count, 3);
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
