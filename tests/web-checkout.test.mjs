import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';

function createDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0009_play_subscriptions.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0010_play_trial_phase.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0011_usage_workspace_entitlements.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0013_workspace_item_entitlements.sql', import.meta.url), 'utf8'));
  return { sqlite, DB: { prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async run() { return sqlite.prepare(sql).run(...args); }
    };
  } } };
}

function checkoutRequest(extra = {}) {
  return new Request('https://multipostapp.co.uk/api/billing/create-checkout-session', {
    method: 'POST', headers: { Authorization: 'Bearer firebase-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'uid-123', plan_key: 'pro', billing_interval: 'monthly', ...extra })
  });
}

function testEnv(DB, extra = {}) {
  return {
    DB, WEB_BILLING_ENABLED: 'true', STRIPE_CHECKOUT_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example',
    STRIPE_PRICE_PRO_MONTHLY: 'price_test_month', STRIPE_PRICE_PRO_YEARLY: 'price_test_year',
    ...extra
  };
}

test('a configured paywall never starts checkout until the new Stripe connection is ready', async () => {
  const { sqlite, DB } = createDb();
  const originalFetch = globalThis.fetch;
  let stripeCalls = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', email: 'user@example.com', emailVerified: true }] });
    stripeCalls++;
    throw new Error('Stripe must not be called');
  };
  try {
    const env = testEnv(DB, { STRIPE_CHECKOUT_ENABLED: 'false' });
    const plans = await worker.fetch(new Request('https://multipostapp.co.uk/api/billing/plans'), env);
    assert.equal((await plans.json()).checkout_enabled, false);
    const result = await worker.fetch(checkoutRequest(), env);
    assert.equal(result.status, 503);
    assert.equal(stripeCalls, 0);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('a verified Play subscriber cannot start a second Stripe subscription', async () => {
  const { sqlite, DB } = createDb();
  sqlite.prepare(`INSERT INTO billing_play_purchases
    (user_id, token_hash, encrypted_token, product_id, base_plan_id, subscription_state, expiry_time, last_verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('uid-123', 'hash', 'encrypted', 'multipost_pro', 'monthly',
      'SUBSCRIPTION_STATE_ACTIVE', Math.floor(Date.now() / 1000) + 3600, Math.floor(Date.now() / 1000));
  const originalFetch = globalThis.fetch;
  let stripeCalls = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', email: 'user@example.com', emailVerified: true }] });
    stripeCalls++;
    throw new Error('Stripe must not be called');
  };
  try {
    const result = await worker.fetch(checkoutRequest(), testEnv(DB));
    assert.equal(result.status, 409);
    assert.equal(stripeCalls, 0);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('a previous Play purchase cannot receive another seven-day trial on web', async () => {
  const { sqlite, DB } = createDb();
  sqlite.prepare(`INSERT INTO billing_play_purchases
    (user_id, token_hash, encrypted_token, product_id, base_plan_id, subscription_state, expiry_time, last_verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('uid-123', 'hash', 'encrypted', 'multipost_pro', 'monthly',
      'SUBSCRIPTION_STATE_EXPIRED', 1, Math.floor(Date.now() / 1000));
  const originalFetch = globalThis.fetch;
  let checkoutBody = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', email: 'user@example.com', emailVerified: true }] });
    if (String(url).endsWith('/v1/customers')) return Response.json({ id: 'cus_test' });
    if (String(url).endsWith('/v1/checkout/sessions')) {
      checkoutBody = new URLSearchParams(init.body);
      return Response.json({ id: 'cs_test', url: 'https://checkout.stripe.com/test-session' });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const result = await worker.fetch(checkoutRequest({ success_url: 'https://evil.example/redirect' }), testEnv(DB));
    assert.equal(result.status, 200);
    assert.equal(checkoutBody.get('subscription_data[trial_period_days]'), null);
    assert.equal(checkoutBody.get('success_url'), 'https://multipostapp.co.uk/settings.html?billing=success');
    assert.equal(checkoutBody.get('line_items[0][price]'), 'price_test_month');
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});
