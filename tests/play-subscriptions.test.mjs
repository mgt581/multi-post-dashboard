import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { interpretPlaySubscription, obfuscatedAccountId, encryptPurchaseToken, decryptPurchaseToken, verifyPlayPurchase } from '../play-subscriptions.mjs';
import worker from '../worker.js';

globalThis.crypto ??= webcrypto;
const now = Date.parse('2026-11-01T12:00:00Z');
const account = await obfuscatedAccountId('uid-123');
const purchase = (state, expiry, basePlanId = 'monthly', accountId = account) => ({
  subscriptionState: state,
  externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId },
  lineItems: [{ productId: 'multipost_pro', expiryTime: expiry, offerDetails: { basePlanId } }]
});

test('active and trial purchases grant access when Google confirms a future expiry', () => {
  for (const plan of ['monthly', 'yearly']) {
    const result = interpretPlaySubscription(purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-08T12:00:00Z', plan), account, now);
    assert.equal(result.access, true);
    assert.equal(result.basePlanId, plan);
  }
});

test('expired and refunded or revoked subscriptions do not grant access', () => {
  assert.equal(interpretPlaySubscription(purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-10-31T12:00:00Z'), account, now).access, false);
  for (const state of ['SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_PENDING']) {
    assert.equal(interpretPlaySubscription(purchase(state, '2026-11-08T12:00:00Z'), account, now).access, false);
  }
});

test('cancellation retains access only until Google reports expiry', () => {
  assert.equal(interpretPlaySubscription(purchase('SUBSCRIPTION_STATE_CANCELED', '2026-11-02T12:00:00Z'), account, now).access, true);
  assert.equal(interpretPlaySubscription(purchase('SUBSCRIPTION_STATE_CANCELED', '2026-10-31T12:00:00Z'), account, now).access, false);
});

test('invalid account, product, and base plan are rejected', () => {
  assert.throws(() => interpretPlaySubscription(purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-08T12:00:00Z', 'monthly', 'other-user'), account, now));
  assert.throws(() => interpretPlaySubscription(purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-08T12:00:00Z', 'wrong-plan'), account, now));
  assert.throws(() => interpretPlaySubscription({ ...purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-08T12:00:00Z'), lineItems: [] }, account, now));
});

test('stored tokens are encrypted and can be refreshed with the configured key', async () => {
  const key = Buffer.alloc(32, 17).toString('base64');
  const encrypted = await encryptPurchaseToken('sensitive-play-token', key);
  assert.doesNotMatch(encrypted, /sensitive-play-token/);
  assert.equal(await decryptPurchaseToken(encrypted, key), 'sensitive-play-token');
  await assert.rejects(decryptPurchaseToken(encrypted, Buffer.alloc(32, 18).toString('base64')));
});

test('backend checks Google with a service account and acknowledges only a verified account purchase', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccountJson = JSON.stringify({ type: 'service_account', client_email: 'test@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/token')) return Response.json({ access_token: 'google-access-token' });
    if (url.endsWith(':acknowledge')) return new Response('', { status: 200 });
    return Response.json({ ...purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-08T12:00:00Z'), acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' });
  };
  const verified = await verifyPlayPurchase({ token: 'play-token', firebaseUid: 'uid-123', serviceAccountJson, fetcher, now });
  assert.equal(verified.access, true);
  assert.match(calls[1].url, /applications\/uk\.co\.multipostapp\/purchases\/subscriptionsv2\/tokens\/play-token$/);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer google-access-token');
  assert.equal(calls[2].init.method, 'POST');
  assert.match(calls[2].url, /multipost_pro\/tokens\/play-token:acknowledge$/);
  await assert.rejects(verifyPlayPurchase({ token: 'other-token', firebaseUid: 'another-uid', serviceAccountJson, fetcher, now }), /does not match/);
  assert.equal(calls.filter(call => call.url.endsWith(':acknowledge')).length, 1);
});

test('authenticated Play purchase grants cross-platform access; a spoofed Android header grants none', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0009_play_subscriptions.sql', import.meta.url), 'utf8'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = {
    WEB_BILLING_ENABLED: 'true',
    PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', client_email: 'test@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
    PLAY_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64'),
    DB: { prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { return db.prepare(sql).run(...args); }
      };
    } }
  };
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', email: 'user@example.com', emailVerified: true }] });
    if (String(url).endsWith('/token')) return Response.json({ access_token: 'google-token' });
    return Response.json(purchase('SUBSCRIPTION_STATE_ACTIVE', new Date(Date.now() + 86400000).toISOString()));
  };
  const headers = { Authorization: 'Bearer firebase-id-token', client_platform: 'android' };
  try {
    const before = await worker.fetch(new Request('https://example.test/api/billing/status?user_id=uid-123', { headers }), env);
    assert.equal((await before.json()).billing.access, false);
    const register = await worker.fetch(new Request('https://example.test/api/billing/play-purchase', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ purchase_token: 'valid-play-token', subscription_status: 'active' })
    }), env);
    assert.equal(register.status, 200);
    const after = await worker.fetch(new Request('https://example.test/api/billing/status?user_id=uid-123&client_platform=web', { headers }), env);
    const status = (await after.json()).billing;
    assert.equal(status.access, true);
    assert.equal(status.reason, 'play_verified');
    assert.equal(db.prepare('SELECT encrypted_token FROM billing_play_purchases').get().encrypted_token.includes('valid-play-token'), false);
  } finally {
    globalThis.fetch = original;
    db.close();
  }
});
