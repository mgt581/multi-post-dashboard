import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';

const now = () => Math.floor(Date.now() / 1000);
const product = 'price_workspace_test';
const base = 'https://multipostapp.co.uk/api';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  for (const m of ['0009_play_subscriptions', '0010_play_trial_phase', '0011_usage_workspace_entitlements', '0012_publication_reservations', '0013_workspace_item_entitlements', '0014_workspace_choices', '0015_publication_reconciliation'])
    for (const stmt of readFileSync(new URL(`../migrations/${m}.sql`, import.meta.url), 'utf8').split(';').map(x => x.trim()).filter(Boolean))
      try { sqlite.exec(stmt); } catch (_) { /* already in schema.sql */ }
  const DB = { prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { return sqlite.prepare(sql).run(...args); }
    };
  } };
  const env = { DB, WEB_BILLING_ENABLED: 'true', STRIPE_CHECKOUT_ENABLED: 'true',
    STRIPE_CHECKOUT_ACCOUNT_ID: 'acct_test_multipost', STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_fake', STRIPE_PRICE_WORKSPACE_MONTHLY: product };
  sqlite.prepare(`INSERT INTO billing_subscriptions (user_id, stripe_customer_id, stripe_subscription_id,
    stripe_price_id, plan_key, billing_interval, subscription_status, current_period_end, trial_end, stripe_pro_paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`).run('uid-123', 'cus_test', 'sub_pro', 'price_pro', 'pro', 'monthly', 'trialing', now() + 5 * 86400, now() + 5 * 86400);
  return { sqlite, env };
}
const post = (path, body, headers = {}) => new Request(`${base}${path}`, { method: 'POST', headers: { Authorization: 'Bearer firebase-token',
  'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

// A fake Stripe that models the Pro trial, the early-payment update and the bonus subscription.
function fakeStripe({ cardWorks = true } = {}) {
  const state = { proStatus: 'trialing', proMeta: { user_id: 'uid-123', plan_key: 'pro' }, calls: [], bonusCreates: 0, voided: [], bonus: null };
  const pro = () => ({ id: 'sub_pro', customer: 'cus_test', status: state.proStatus, cancel_at_period_end: false,
    trial_end: state.proStatus === 'trialing' ? now() + 5 * 86400 : null, default_payment_method: 'pm_card',
    metadata: { ...state.proMeta }, items: { data: [{ price: { id: 'price_pro', recurring: { interval: 'month' } }, current_period_end: now() + 30 * 86400 }] } });
  const invoice = (paid) => ({ id: 'in_pro', customer: 'cus_test', status: paid ? 'paid' : 'open', collection_method: 'charge_automatically',
    currency: 'gbp', amount_paid: paid ? 999 : 0, amount_remaining: paid ? 0 : 999, status_transitions: { paid_at: paid ? now() : 0 } });
  const fetch = async (url, init = {}) => {
    const path = String(url);
    const method = init.method || 'GET';
    const body = init.body ? new URLSearchParams(init.body) : null;
    state.calls.push({ path, method, body, headers: init.headers || {} });
    if (path.includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', email: 'paid@example.com', emailVerified: true }] });
    if (path.endsWith('/v1/account')) return Response.json({ id: 'acct_test_multipost' });
    if (path.endsWith('/v1/subscriptions/sub_pro') && method === 'GET') return Response.json(pro());
    if (path.endsWith('/v1/subscriptions/sub_pro') && method === 'POST') {
      if (body.get('trial_end') === 'now') {
        if (!cardWorks) return Response.json({ ...pro(), pending_update: { trial_end: now() }, latest_invoice: invoice(false) });
        state.proStatus = 'active';
        return Response.json({ ...pro(), latest_invoice: invoice(true) });
      }
      if (body.get('metadata[early_upgrade]')) state.proMeta.early_upgrade = body.get('metadata[early_upgrade]');
      return Response.json(pro());
    }
    if (path.endsWith('/v1/subscriptions') && method === 'POST') {
      state.bonusCreates++;
      state.bonus = { id: 'sub_bonus', customer: body.get('customer'), status: 'trialing', cancel_at_period_end: false,
        trial_end: Number(body.get('trial_end')), default_payment_method: body.get('default_payment_method'),
        metadata: { user_id: body.get('metadata[user_id]'), kind: body.get('metadata[kind]'), app: 'multipost', promo: body.get('metadata[promo]') },
        items: { data: [{ price: { id: body.get('items[0][price]') }, quantity: Number(body.get('items[0][quantity]')) }] } };
      return Response.json(state.bonus);
    }
    if (path.includes('/v1/invoice_payments?invoice=in_pro')) return Response.json({ data: [{ status: 'paid', amount_paid: 999,
      payment: { type: 'payment_intent', payment_intent: 'pi_pro' } }] });
    if (path.endsWith('/v1/payment_intents/pi_pro')) return Response.json({ status: 'succeeded', customer: 'cus_test', currency: 'gbp', amount_received: 999 });
    if (path.endsWith('/v1/invoices/in_pro/void')) { state.voided.push('in_pro'); return Response.json({ id: 'in_pro', status: 'void' }); }
    throw new Error(`Unexpected Stripe request ${method} ${path}`);
  };
  return { state, fetch };
}

test('ending a web Pro trial early takes the first payment and adds one free workspace for a month', async () => {
  const { sqlite, env } = setup();
  const stripe = fakeStripe();
  const originalFetch = globalThis.fetch; globalThis.fetch = stripe.fetch;
  try {
    const res = await worker.fetch(post('/billing/end-trial-early', { user_id: 'uid-123' }), env);
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out));
    assert.equal(out.charged, true);
    assert.equal(out.bonus.granted, true);
    const update = stripe.state.calls.find(c => c.method === 'POST' && c.body?.get('trial_end') === 'now');
    assert.equal(update.body.get('payment_behavior'), 'pending_if_incomplete');
    assert.equal(update.body.get('proration_behavior'), 'none');
    assert.equal(stripe.state.bonusCreates, 1);
    assert.equal(stripe.state.bonus.metadata.kind, 'workspace_addon');
    assert.equal(stripe.state.bonus.default_payment_method, 'pm_card');
    const freeDays = (stripe.state.bonus.trial_end - now()) / 86400;
    assert.ok(freeDays >= 27 && freeDays <= 32, `free period ${freeDays} days`);
    const addon = sqlite.prepare('SELECT * FROM billing_stripe_workspace_addons').get();
    assert.equal(addon.stripe_subscription_id, 'sub_bonus');
    assert.equal(addon.paid_through, stripe.state.bonus.trial_end);
    assert.ok(sqlite.prepare('SELECT stripe_pro_paid_at FROM billing_subscriptions').get().stripe_pro_paid_at > 0);
    assert.equal(stripe.state.proMeta.early_upgrade, 'sub_bonus');
    // A second press can never charge again or add a second free workspace.
    const again = await worker.fetch(post('/billing/end-trial-early', { user_id: 'uid-123' }), env);
    assert.equal(again.status, 409);
    assert.equal(stripe.state.bonusCreates, 1);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('a declined card leaves the trial unchanged, voids the invoice and grants nothing', async () => {
  const { sqlite, env } = setup();
  const stripe = fakeStripe({ cardWorks: false });
  const originalFetch = globalThis.fetch; globalThis.fetch = stripe.fetch;
  try {
    const res = await worker.fetch(post('/billing/end-trial-early', { user_id: 'uid-123' }), env);
    assert.equal(res.status, 402);
    assert.match((await res.json()).error, /trial carries on unchanged/);
    assert.deepEqual(stripe.state.voided, ['in_pro']);
    assert.equal(stripe.state.bonusCreates, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM billing_stripe_workspace_addons').get().n, 0);
    assert.equal(sqlite.prepare('SELECT stripe_pro_paid_at FROM billing_subscriptions').get().stripe_pro_paid_at, null);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('an interrupted bonus is finished on retry without charging again', async () => {
  const { sqlite, env } = setup();
  const stripe = fakeStripe();
  stripe.state.proStatus = 'active';
  stripe.state.proMeta.early_upgrade = 'pending_bonus';
  sqlite.prepare(`UPDATE billing_subscriptions SET subscription_status = 'active', stripe_pro_paid_at = ?`).run(now() - 60);
  const originalFetch = globalThis.fetch; globalThis.fetch = stripe.fetch;
  try {
    const res = await worker.fetch(post('/billing/end-trial-early', { user_id: 'uid-123' }), env);
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out));
    assert.equal(out.charged, false);
    assert.equal(out.bonus.granted, true);
    assert.ok(!stripe.state.calls.some(c => c.body?.get('trial_end') === 'now'));
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('Android and non-trial accounts cannot use the website early upgrade', async () => {
  const { sqlite, env } = setup();
  const stripe = fakeStripe();
  const originalFetch = globalThis.fetch; globalThis.fetch = stripe.fetch;
  try {
    const android = await worker.fetch(post('/billing/end-trial-early', { user_id: 'uid-123', client_platform: 'android' }), env);
    assert.equal(android.status, 400);
    stripe.state.proStatus = 'active';
    sqlite.prepare(`UPDATE billing_subscriptions SET subscription_status = 'active'`).run();
    const active = await worker.fetch(post('/billing/end-trial-early', { user_id: 'uid-123' }), env);
    assert.equal(active.status, 409);
    assert.equal(stripe.state.bonusCreates, 0);
    assert.ok(!stripe.state.calls.some(c => c.body?.get('trial_end') === 'now'));
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('a Stripe permission error never reaches the customer and leaves the trial unchanged', async () => {
  const { sqlite, env } = setup();
  const stripe = fakeStripe();
  const inner = stripe.fetch;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith('/v1/subscriptions/sub_pro') && init.method === 'POST')
      return Response.json({ error: { message: "Permission denied. The provided key 'rk_live_...PIDW' does not have the required permissions for this endpoint on account 'acct_1UYcD8AIIxddZy1r'." } }, { status: 403 });
    return inner(url, init);
  };
  try {
    const res = await worker.fetch(post('/billing/end-trial-early', { user_id: 'uid-123' }), env);
    const text = await res.text();
    assert.equal(res.status, 503);
    assert.match(text, /trial is unchanged and nothing was charged/);
    assert.doesNotMatch(text, /rk_live|acct_|Permission/);
    assert.equal(stripe.state.bonusCreates, 0);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('dashboard requests keyed by email still find a Stripe subscription saved under the Firebase user ID', async () => {
  const { sqlite, env } = setup();
  const stripe = fakeStripe();
  stripe.state.proStatus = 'active';
  sqlite.prepare(`UPDATE billing_subscriptions SET subscription_status = 'active', stripe_pro_paid_at = ?, trial_end = NULL`).run(now() - 60);
  sqlite.prepare(`INSERT INTO billing_stripe_workspace_addons (stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id, subscription_status, paid_through)
    VALUES ('sub_bonus', 'uid-123', 'cus_test', ?, 'trialing', ?)`).run(product, now() + 20 * 86400);
  const originalFetch = globalThis.fetch; globalThis.fetch = stripe.fetch;
  try {
    const status = await worker.fetch(new Request(`${base}/billing/status?user_id=paid%40example.com`, { headers: { Authorization: 'Bearer firebase-token' } }), env);
    const out = await status.json();
    assert.equal(status.status, 200, JSON.stringify(out));
    assert.equal(out.billing.access, true);
    assert.equal(out.billing.workspace_allowance, 2);
    for (const name of ['Brand one', 'Brand two']) {
      const res = await worker.fetch(post('/add-folder', { name, user_id: 'paid@example.com' }), env);
      assert.equal(res.status, 200, await res.text());
    }
    const list = await worker.fetch(new Request(`${base}/get-folders?user_id=paid%40example.com`, { headers: { Authorization: 'Bearer firebase-token' } }), env);
    const folders = await list.json();
    assert.equal(list.status, 200, JSON.stringify(folders));
    assert.equal(folders.length, 2);
    assert.ok(folders.every(f => f.workspace_locked === false), JSON.stringify(folders));
    const third = await worker.fetch(post('/add-folder', { name: 'Brand three', user_id: 'paid@example.com' }), env);
    assert.equal(third.status, 429);
    // Someone else's email can never be used to reach this subscription.
    const other = await worker.fetch(post('/add-folder', { name: 'Nope', user_id: 'someone@else.com' }), env);
    assert.equal(other.status, 401);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});
