import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { interpretPlaySubscription, obfuscatedAccountId, sha256Hex, encryptPurchaseToken, decryptPurchaseToken, verifyPlayPurchase } from '../play-subscriptions.mjs';
import worker from '../worker.js';

globalThis.crypto ??= webcrypto;
const now = Date.parse('2026-11-01T12:00:00Z');
const account = await obfuscatedAccountId('uid-123');
const purchase = (state, expiry, basePlanId = 'monthly', accountId = account) => ({
  subscriptionState: state,
  externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId },
  lineItems: [{ productId: 'multipost_pro', expiryTime: expiry, offerDetails: { basePlanId } }]
});

test('active, trial and grace-period purchases grant access when Google confirms a future expiry', () => {
  for (const plan of ['monthly', 'yearly']) {
    const result = interpretPlaySubscription(purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-08T12:00:00Z', plan), account, now);
    assert.equal(result.access, true);
    assert.equal(result.basePlanId, plan);
  }
  assert.equal(interpretPlaySubscription(purchase('SUBSCRIPTION_STATE_IN_GRACE_PERIOD', '2026-11-08T12:00:00Z'), account, now).access, true);
});

test('only a current matching Play free-trial phase is labelled a trial', () => {
  const activeTrial = purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-08T12:00:00Z', 'yearly');
  activeTrial.lineItems[0].offerDetails.offerId = 'trial-7d-yearly';
  activeTrial.lineItems[0].offerPhase = { freeTrial: {} };
  assert.equal(interpretPlaySubscription(activeTrial, account, now).trialEnd, Math.floor(Date.parse('2026-11-08T12:00:00Z') / 1000));
  activeTrial.lineItems[0].offerPhase = { basePrice: {} };
  assert.equal(interpretPlaySubscription(activeTrial, account, now).trialEnd, null);
});

test('ten unique paid workspace products grant only current, matching entitlements through deferred removal', () => {
  const bundle = purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-30T12:00:00Z');
  for (let n = 1; n <= 10; n++) bundle.lineItems.push({ productId: `multipost_workspace_${String(n).padStart(2, '0')}`,
    expiryTime: '2026-11-30T12:00:00Z', latestSuccessfulOrderId: `GPA.${n}`,
    autoRenewingPlan: { autoRenewEnabled: n < 10 }, offerDetails: { basePlanId: 'monthly' } });
  assert.equal(interpretPlaySubscription(bundle, account, now).workspaceQuantity, 10);
  assert.equal(interpretPlaySubscription(bundle, account, now).workspaceItems.filter(i => i.renewing).length, 9);
  bundle.lineItems[1].offerDetails.basePlanId = 'yearly';
  assert.equal(interpretPlaySubscription(bundle, account, now).workspaceQuantity, 9);
  bundle.lineItems[1].offerDetails.basePlanId = 'monthly';
  bundle.lineItems[2].latestSuccessfulOrderId = '';
  assert.equal(interpretPlaySubscription(bundle, account, now).workspaceQuantity, 9);
  bundle.lineItems[2].latestSuccessfulOrderId = 'GPA.2';
  bundle.lineItems[3].expiryTime = '2026-10-30T12:00:00Z';
  assert.equal(interpretPlaySubscription(bundle, account, now).workspaceQuantity, 9);
  bundle.lineItems[3].expiryTime = '2026-11-30T12:00:00Z';
  bundle.lineItems.push({ ...bundle.lineItems[1] });
  assert.throws(() => interpretPlaySubscription(bundle, account, now), /duplicate/);
  bundle.lineItems.pop();
  bundle.lineItems[1].productId = 'multipost_workspace';
  assert.throws(() => interpretPlaySubscription(bundle, account, now), /unknown/);
  bundle.lineItems[1].productId = 'multipost_workspace_01';
  bundle.subscriptionState = 'SUBSCRIPTION_STATE_ON_HOLD';
  assert.equal(interpretPlaySubscription(bundle, account, now).workspaceQuantity, 0);
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

test('Google API and acknowledgement failures expose only safe status codes', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccountJson = JSON.stringify({ type: 'service_account', client_email: 'test@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const token = 'secret-purchase-token';
  for (const stage of ['GET', 'ACK']) {
    const fetcher = async url => {
      if (url.endsWith('/token')) return Response.json({ access_token: 'google-access-token' });
      if ((stage === 'GET' && url.includes('/subscriptionsv2/')) || (stage === 'ACK' && url.endsWith(':acknowledge'))) {
        return Response.json({ error: { status: 'PERMISSION_DENIED', message: `sensitive ${token}` } }, { status: 403 });
      }
      return Response.json({ ...purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-08T12:00:00Z'), acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' });
    };
    await assert.rejects(verifyPlayPurchase({ token, firebaseUid: 'uid-123', serviceAccountJson, fetcher, now }), error => {
      assert.equal(error.code, `PLAY_${stage}_HTTP_403`);
      assert.equal(error.httpStatus, 403);
      assert.equal(error.googleStatus, 'PERMISSION_DENIED');
      assert.doesNotMatch(String(error), /secret-purchase-token|sensitive/);
      return true;
    });
  }
});

test('Google free-form error fields cannot appear in diagnostic status', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccountJson = JSON.stringify({ type: 'service_account', client_email: 'test@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const fetcher = async url => url.endsWith('/token')
    ? Response.json({ access_token: 'google-access-token' })
    : Response.json({ error: { status: 'SECRET_PURCHASE_TOKEN', message: 'private account data' } }, { status: 403 });
  await assert.rejects(verifyPlayPurchase({ token: 'secret', firebaseUid: 'uid-123', serviceAccountJson, fetcher, now }), error => {
    assert.equal(error.code, 'PLAY_GET_HTTP_403');
    assert.equal(error.googleStatus, null);
    assert.doesNotMatch(JSON.stringify({ code: error.code, status: error.googleStatus }), /SECRET_PURCHASE_TOKEN|private account data/);
    return true;
  });
});

test('an expired Play response remains inactive without attempting acknowledgement', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccountJson = JSON.stringify({ type: 'service_account', client_email: 'test@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  let ackCount = 0;
  const fetcher = async url => {
    if (url.endsWith('/token')) return Response.json({ access_token: 'google-access-token' });
    if (url.endsWith(':acknowledge')) { ackCount++; return new Response('', { status: 200 }); }
    return Response.json({ ...purchase('SUBSCRIPTION_STATE_EXPIRED', '2026-10-31T12:00:00Z'), acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' });
  };
  const verified = await verifyPlayPurchase({ token: 'expired-token', firebaseUid: 'uid-123', serviceAccountJson, fetcher, now });
  assert.equal(verified.access, false);
  assert.equal(verified.state, 'SUBSCRIPTION_STATE_EXPIRED');
  assert.equal(ackCount, 0);
});

test('purchase endpoint logs a correlated safe code without recording credentials or tokens', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  try {
    console.warn = (...args) => warnings.push(args);
    globalThis.fetch = async url => {
      if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', email: 'private@example.com', emailVerified: true }] });
      if (String(url).endsWith('/token')) return Response.json({ access_token: 'secret-access-token' });
      if (String(url).includes('/subscriptionsv2/')) {
        return Response.json({ error: { status: 'PERMISSION_DENIED', message: 'secret-purchase-token' } }, { status: 403 });
      }
      throw new Error('Unexpected request');
    };
    const response = await worker.fetch(new Request('https://example.test/api/billing/play-purchase', {
      method: 'POST', headers: { Authorization: 'Bearer firebase-id-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchase_token: 'secret-purchase-token' })
    }), { PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', client_email: 'test@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
      PLAY_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64') });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, 'PLAY_GET_HTTP_403');
    assert.match(body.diagnostic_id, /^[0-9a-f-]{36}$/);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][1].diagnostic_id, body.diagnostic_id);
    assert.equal(warnings[0][1].stage, 'verify');
    assert.equal(warnings[0][1].google_http_status, 403);
    assert.equal(warnings[0][1].google_status, 'PERMISSION_DENIED');
    assert.doesNotMatch(JSON.stringify({ body, warnings }), /secret-purchase-token|secret-access-token|firebase-id-token|private@example.com|PRIVATE_KEY/);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('authenticated Play purchase grants cross-platform access; a spoofed Android header grants none', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0009_play_subscriptions.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0010_play_trial_phase.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0011_usage_workspace_entitlements.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0012_publication_reservations.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0013_workspace_item_entitlements.sql', import.meta.url), 'utf8'));
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
    const replacing = String(url).endsWith('/new-token');
    const trial = purchase('SUBSCRIPTION_STATE_ACTIVE', new Date(Date.now() + (replacing ? 43200000 : 86400000)).toISOString());
    if (replacing) trial.linkedPurchaseToken = 'valid-play-token';
    trial.lineItems[0].offerDetails.offerId = 'trial-7d-monthly';
    trial.lineItems[0].offerPhase = { freeTrial: {} };
    return Response.json(trial);
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
    assert.equal(status.status, 'trialing');
    assert.equal(status.play.trial_end > Math.floor(Date.now() / 1000), true);
    assert.equal(db.prepare('SELECT encrypted_token FROM billing_play_purchases').get().encrypted_token.includes('valid-play-token'), false);
    const replacement = await worker.fetch(new Request('https://example.test/api/billing/play-purchase', {
      method:'POST', headers:{ ...headers, 'Content-Type':'application/json' }, body:JSON.stringify({ purchase_token:'new-token' })
    }), env);
    assert.equal(replacement.status, 200, 'a linked prorated change may have a shorter immediate expiry');
    const oldReplay = await worker.fetch(new Request('https://example.test/api/billing/play-purchase', {
      method:'POST', headers:{ ...headers, 'Content-Type':'application/json' }, body:JSON.stringify({ purchase_token:'valid-play-token' })
    }), env);
    assert.equal(oldReplay.status, 409, 'the previous token must not replace the newer purchase');
    // The same token cannot be reassigned even if a later Google response is
    // tampered with or a concurrent registration tries another account.
    db.prepare(`INSERT INTO billing_play_purchases
      (user_id, token_hash, encrypted_token, product_id, base_plan_id, subscription_state, expiry_time, last_verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`)
      .run('someone-else', await sha256Hex('duplicate-token'), 'encrypted', 'multipost_pro', 'monthly', 'SUBSCRIPTION_STATE_ACTIVE', Math.floor(Date.now() / 1000) + 3600);
    const duplicate = await worker.fetch(new Request('https://example.test/api/billing/play-purchase', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ purchase_token: 'duplicate-token' })
    }), env);
    assert.equal(duplicate.status, 409);

    // The cached entitlement cannot outlive its recorded expiry or an
    // expired/revoked state, even before the next Google refresh.
    db.prepare('UPDATE billing_play_purchases SET expiry_time = ?, subscription_state = ? WHERE user_id = ?')
      .run(Math.floor(Date.now() / 1000) - 10, 'SUBSCRIPTION_STATE_ACTIVE', 'uid-123');
    const expired = await worker.fetch(new Request('https://example.test/api/billing/status?user_id=uid-123', { headers }), env);
    assert.equal((await expired.json()).billing.access, false);
    assert.equal((await worker.fetch(new Request('https://example.test/api/billing/status?user_id=uid-123', { headers }), env).then(response => response.json())).billing.status, 'expired');
    db.prepare('UPDATE billing_play_purchases SET expiry_time = ?, subscription_state = ? WHERE user_id = ?')
      .run(Math.floor(Date.now() / 1000) + 3600, 'SUBSCRIPTION_STATE_EXPIRED', 'uid-123');
    const revoked = await worker.fetch(new Request('https://example.test/api/billing/status?user_id=uid-123', { headers }), env);
    assert.equal((await revoked.json()).billing.access, false);

    const noEntitlement = await worker.fetch(new Request('https://example.test/api/youtube/upload-chunk', {
      method: 'POST', headers: { ...headers, folder_id: '1', user_id: 'uid-123' }, body: 'not-a-chunk'
    }), env);
    assert.equal(noEntitlement.status, 402);
    const createWorkspace = await worker.fetch(new Request('https://example.test/api/add-folder', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'New workspace', user_id: 'uid-123' })
    }), env);
    assert.equal(createWorkspace.status, 402);
    assert.equal((await worker.fetch(new Request('https://example.test/api/auth/youtube?folder_id=1&user_id=uid-123', { headers }), env)).status, 405);
    assert.equal((await worker.fetch(new Request('https://example.test/api/auth/facebook?folder_id=1&user_id=uid-123', { headers }), env)).status, 405);
    const connectYouTube = await worker.fetch(new Request('https://example.test/api/auth/youtube', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: '1', user_id: 'uid-123' })
    }), env);
    assert.equal(connectYouTube.status, 402);
    const connectFacebook = await worker.fetch(new Request('https://example.test/api/auth/facebook', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: '1', user_id: 'uid-123' })
    }), env);
    assert.equal(connectFacebook.status, 402);
    const legacySeo = await worker.fetch(new Request('https://example.test/api/generate-seo', {
      method: 'POST', headers: { 'Content-Type': 'application/json', client_platform: 'android' }, body: JSON.stringify({ prompt: 'test', user_id: 'uid-123' })
    }), env);
    assert.equal(legacySeo.status, 401);

    // Existing Stripe subscriptions remain independent of the Play table.
    db.prepare('INSERT INTO billing_subscriptions (user_id, subscription_status, current_period_end) VALUES (?, ?, ?)')
      .run('uid-123', 'active', Math.floor(Date.now() / 1000) + 3600);
    const stripe = await worker.fetch(new Request('https://example.test/api/billing/status?user_id=uid-123', { headers }), env);
    assert.equal((await stripe.json()).billing.access, true);
  } finally {
    globalThis.fetch = original;
    db.close();
  }
});
