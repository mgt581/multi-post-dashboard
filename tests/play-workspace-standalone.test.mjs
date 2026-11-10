import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { interpretWorkspaceSubscription, obfuscatedAccountId } from '../play-subscriptions.mjs';
import worker from '../worker.js';

globalThis.crypto ??= webcrypto;
const nowMs = Date.now();
const nowS = Math.floor(nowMs / 1000);
const account = await obfuscatedAccountId('uid-123');
const future = new Date(nowMs + 30 * 86400000).toISOString();
const workspaceSub = (productId, { accountId = account, order = `GPA.${productId}`, state = 'SUBSCRIPTION_STATE_ACTIVE', renew = true, basePlanId = 'monthly' } = {}) => ({
  subscriptionState: state, regionCode: 'GB', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId },
  lineItems: [{ productId, expiryTime: future, latestSuccessfulOrderId: order, autoRenewingPlan: { autoRenewEnabled: renew }, offerDetails: { basePlanId } }]
});

test('a standalone workspace subscription is accepted only for the right account and a paid order', () => {
  const ok = interpretWorkspaceSubscription(workspaceSub('multipost_workspace_01'), account, nowMs);
  assert.equal(ok.access, true);
  assert.equal(ok.productId, 'multipost_workspace_01');
  assert.equal(ok.renewing, true);
  assert.equal(ok.needsAcknowledgement, true);
  assert.throws(() => interpretWorkspaceSubscription(workspaceSub('multipost_workspace_01', { accountId: 'someone-else' }), account, nowMs));
  assert.throws(() => interpretWorkspaceSubscription(workspaceSub('multipost_pro'), account, nowMs));
  assert.throws(() => interpretWorkspaceSubscription(workspaceSub('multipost_workspace_99'), account, nowMs));
  assert.equal(interpretWorkspaceSubscription(workspaceSub('multipost_workspace_01', { order: null }), account, nowMs).access, false);
  assert.equal(interpretWorkspaceSubscription(workspaceSub('multipost_workspace_01', { state: 'SUBSCRIPTION_STATE_EXPIRED' }), account, nowMs).access, false);
  const two = workspaceSub('multipost_workspace_01');
  two.lineItems.push({ ...two.lineItems[0], productId: 'multipost_workspace_02' });
  assert.throws(() => interpretWorkspaceSubscription(two, account, nowMs));
});

function setup({ proPaid = true, proState = 'SUBSCRIPTION_STATE_ACTIVE', user = 'uid-123' } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  for (const m of ['0009_play_subscriptions', '0010_play_trial_phase', '0011_usage_workspace_entitlements', '0012_publication_reservations',
    '0013_workspace_item_entitlements', '0014_workspace_choices', '0015_publication_reconciliation', '0017_play_paid_pro_order', '0019_play_workspace_subscriptions'])
    for (const stmt of readFileSync(new URL(`../migrations/${m}.sql`, import.meta.url), 'utf8').split(';').map(x => x.trim()).filter(Boolean))
      try { db.exec(stmt); } catch (_) { /* already in schema.sql */ }
  db.prepare(`INSERT INTO billing_play_purchases (user_id, token_hash, encrypted_token, product_id, base_plan_id, subscription_state, expiry_time, last_verified_at, pro_paid_order_id)
    VALUES ('uid-123', 'pro-hash', 'x', 'multipost_pro', 'monthly', ?, ?, ?, ?)`).run(proState, nowS + 20 * 86400, nowS, proPaid ? 'GPA.pro' : null);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = { WEB_BILLING_ENABLED: 'true',
    PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', client_email: 't@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
    PLAY_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    DB: { prepare(sql) { let args = []; return { bind(...v) { args = v; return this; },
      async first() { return db.prepare(sql).get(...args) || null; }, async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { return db.prepare(sql).run(...args); } }; } } };
  const google = { cancels: [], acks: 0, subs: {} };
  const fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: user, email: 'p@example.com', emailVerified: true }] });
    if (u.endsWith('/token')) return Response.json({ access_token: 'google-token' });
    if (u.endsWith(':acknowledge')) { google.acks++; return Response.json({}); }
    if (u.endsWith(':cancel')) { google.cancels.push(decodeURIComponent(u.split('/tokens/')[1].replace(':cancel', ''))); return Response.json({}); }
    const m = u.match(/subscriptionsv2\/tokens\/([^?]+)/);
    if (m && google.subs[decodeURIComponent(m[1])]) return Response.json(google.subs[decodeURIComponent(m[1])]);
    return new Response('not found', { status: 404 });
  };
  return { db, env, google, fetch };
}
const buy = (env, token) => worker.fetch(new Request('https://example.test/api/billing/play-workspace-purchase', {
  method: 'POST', headers: { Authorization: 'Bearer firebase-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ purchase_token: token }) }), env);
const status = async (env) => (await (await worker.fetch(new Request('https://example.test/api/billing/status?user_id=uid-123',
  { headers: { Authorization: 'Bearer firebase-token' } }), env)).json()).billing;

test('a paid Play Pro user can buy a standalone workspace and it counts on app and website', async () => {
  const { db, env, google, fetch } = setup();
  google.subs['ws-token-1'] = workspaceSub('multipost_workspace_01');
  const original = globalThis.fetch; globalThis.fetch = fetch;
  try {
    const res = await buy(env, 'ws-token-1');
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out));
    assert.equal(out.counted, true);
    assert.equal(google.acks, 1, 'Google acknowledgement is sent');
    const b = await status(env);
    assert.equal(b.reason, 'play_verified');
    assert.equal(b.workspace_allowance, 2);
    assert.deepEqual(b.workspace_product_ids, ['multipost_workspace_01']);
    assert.deepEqual(b.workspace_standalone_ids, ['multipost_workspace_01']);
    assert.equal(db.prepare('SELECT encrypted_token FROM billing_play_workspace_purchases').get().encrypted_token.includes('ws-token-1'), false, 'token stored encrypted');
    // Replaying the same purchase is idempotent.
    assert.equal((await buy(env, 'ws-token-1')).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billing_play_workspace_purchases').get().n, 1);
  } finally { globalThis.fetch = original; db.close(); }
});

test('another account, unpaid Pro and a Pro token are all refused or not counted', async () => {
  const other = setup();
  other.google.subs['ws-x'] = workspaceSub('multipost_workspace_01');
  let original = globalThis.fetch; globalThis.fetch = other.fetch;
  try {
    other.db.prepare('INSERT INTO billing_play_token_claims (token_hash, user_id) VALUES (?, ?)')
      .run([...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ws-x')))].map(b => b.toString(16).padStart(2, '0')).join(''), 'someone-else');
    assert.equal((await buy(other.env, 'ws-x')).status, 409);
    other.google.subs['pro-token'] = { ...workspaceSub('multipost_pro') };
    assert.equal((await buy(other.env, 'pro-token')).status, 400, 'a Pro token is not a workspace');
  } finally { globalThis.fetch = original; other.db.close(); }

  const unpaid = setup({ proPaid: false });
  unpaid.google.subs['ws-1'] = workspaceSub('multipost_workspace_01');
  original = globalThis.fetch; globalThis.fetch = unpaid.fetch;
  try {
    const out = await (await buy(unpaid.env, 'ws-1')).json();
    assert.equal(out.counted, false);
    assert.match(out.warning, /paid Google Play Pro/);
    assert.equal((await status(unpaid.env)).workspace_allowance, 1);
  } finally { globalThis.fetch = original; unpaid.db.close(); }
});

test('no more than nine extra workspaces ever count', async () => {
  const { db, env, google, fetch } = setup();
  const original = globalThis.fetch; globalThis.fetch = fetch;
  try {
    for (let n = 1; n <= 10; n++) {
      const id = `multipost_workspace_${String(n).padStart(2, '0')}`;
      google.subs[`t${n}`] = workspaceSub(id);
      await buy(env, `t${n}`);
    }
    const b = await status(env);
    assert.equal(b.workspace_product_ids.length, 9);
    assert.equal(b.workspace_allowance, 10);
  } finally { globalThis.fetch = original; db.close(); }
});

test('when Play Pro stops renewing, standalone workspace renewals are cancelled with Google', async () => {
  const { db, env, google, fetch } = setup();
  google.subs['ws-1'] = workspaceSub('multipost_workspace_01');
  const original = globalThis.fetch; globalThis.fetch = fetch;
  try {
    await buy(env, 'ws-1');
    assert.equal(google.cancels.length, 0, 'nothing is cancelled while Pro renews');
    db.prepare(`UPDATE billing_play_purchases SET subscription_state = 'SUBSCRIPTION_STATE_CANCELED'`).run();
    const b = await status(env);
    assert.deepEqual(google.cancels, ['ws-1']);
    assert.equal(db.prepare('SELECT renewing FROM billing_play_workspace_purchases').get().renewing, 0);
    assert.equal(b.workspace_allowance, 2, 'paid workspace access lasts until its expiry');
    await status(env);
    assert.equal(google.cancels.length, 1, 'cancellation is sent only once');
  } finally { globalThis.fetch = original; db.close(); }
});
