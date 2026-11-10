import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import worker from '../worker.js';

const now = () => Math.floor(Date.now() / 1000);
const product = 'price_workspace_test';
const base = 'https://multipostapp.co.uk/api';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0009_play_subscriptions.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0010_play_trial_phase.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0011_usage_workspace_entitlements.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0013_workspace_item_entitlements.sql', import.meta.url), 'utf8'));
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
    stripe_price_id, plan_key, billing_interval, subscription_status, current_period_end, stripe_pro_paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('uid-123', 'cus_test', 'sub_pro', 'price_pro', 'pro', 'monthly', 'active', now() + 86400, now() - 86400);
  return { sqlite, env };
}
function post(path, body) {
  return new Request(`${base}${path}`, { method: 'POST', headers: { Authorization: 'Bearer firebase-token',
    'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
function subscription(status = 'active', cancel = false) {
  return { id: 'sub_addon', customer: 'cus_test', status, cancel_at_period_end: cancel,
    metadata: { user_id: 'uid-123', kind: 'workspace_addon', app: 'multipost' },
    items: { data: [{ price: { id: product }, quantity: 1 }] } };
}
function webhook(type, object) {
  const raw = JSON.stringify(type.startsWith('v1.')
    ? { type, data: { object: null }, related_object: { id: object.id } }
    : { type, data: { object } });
  const timestamp = now();
  const signature = createHmac('sha256', 'whsec_fake').update(`${timestamp}.${raw}`).digest('hex');
  return new Request(`${base}/billing/webhook`, { method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` }, body: raw });
}

test('portal refuses an inaccessible legacy Pro subscription without replacing its customer', async () => {
  const { sqlite, env } = setup();
  const originalFetch = globalThis.fetch;
  let subscriptionFound = false;
  let customerCreates = 0;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.includes('identitytoolkit.googleapis.com'))
      return Response.json({ users: [{ localId: 'uid-123', email: 'paid@example.com', emailVerified: true }] });
    if (path.endsWith('/v1/subscriptions/sub_pro')) return subscriptionFound
      ? Response.json({ id: 'sub_pro', customer: 'cus_test', status: 'active' })
      : Response.json({ error: { message: "No such subscription: 'sub_pro'" } }, { status: 404 });
    if (path.endsWith('/v1/customers/cus_test')) return Response.json({ id: 'cus_test' });
    if (path.endsWith('/v1/customers')) { customerCreates++; return Response.json({ id: 'cus_new' }); }
    if (path.endsWith('/v1/billing_portal/sessions')) return Response.json({ url: 'https://billing.stripe.com/p/session/test' });
    throw new Error(`Unexpected Stripe request ${path}`);
  };
  try {
    const request = () => post('/billing/create-portal-session', { user_id: 'uid-123', return_url: 'https://multipostapp.co.uk/settings.html' });
    const legacy = await worker.fetch(request(), env);
    assert.equal(legacy.status, 409);
    assert.match((await legacy.json()).error, /not available in the current Stripe account/);
    assert.equal(sqlite.prepare('SELECT stripe_customer_id FROM billing_subscriptions WHERE user_id = ?').get('uid-123').stripe_customer_id, 'cus_test');
    assert.equal(customerCreates, 0);
    subscriptionFound = true;
    const current = await worker.fetch(request(), env);
    assert.equal(current.status, 200);
    assert.match((await current.json()).url, /^https:\/\/billing\.stripe\.com\//);
    assert.equal(customerCreates, 0);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('trial is blocked; checkout and subscription events never grant a workspace; a paid invoice does', async () => {
  const { sqlite, env } = setup();
  const originalFetch = globalThis.fetch;
  let checkoutCalls = 0;
  let checkoutBody;
  let proStatus = 'trialing';
  let invoiceResponse;
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', email: 'paid@example.com', emailVerified: true }] });
    if (path.endsWith('/v1/subscriptions/sub_pro')) return Response.json({ id: 'sub_pro', customer: 'cus_test', status: proStatus,
      trial_end: proStatus === 'trialing' ? now() + 86400 : null,
      metadata: { user_id: 'uid-123', plan_key: 'pro' }, items: { data: [{ price: { id: 'price_pro', recurring: { interval: 'month' } }, current_period_end: now() + 86400 }] } });
    if (path.endsWith('/v1/subscriptions/sub_addon')) return Response.json(subscription());
    if (path.endsWith('/v1/invoices/in_addon')) return Response.json(invoiceResponse);
    if (path.includes('/v1/invoice_payments?invoice=in_addon')) return Response.json({ data: [{ status: 'paid', amount_paid: 499,
      payment: { type: 'payment_intent', payment_intent: 'pi_addon' } }] });
    if (path.endsWith('/v1/payment_intents/pi_addon')) return Response.json({ status: 'succeeded', customer: 'cus_test',
      currency: 'gbp', amount_received: 499 });
    if (path.endsWith('/v1/account')) return Response.json({ id: 'acct_test_multipost' });
    if (path.endsWith(`/v1/prices/${product}`)) return Response.json({ active: true, currency: 'gbp', unit_amount: 499, recurring: { interval: 'month' } });
    if (path.endsWith('/v1/checkout/sessions')) { checkoutCalls++; checkoutBody = new URLSearchParams(init.body);
      return Response.json({ id: 'cs_test', url: 'https://checkout.stripe.com/c/pay/cs_test' }); }
    throw new Error(`Unexpected Stripe request ${path}`);
  };
  try {
    sqlite.prepare(`UPDATE billing_subscriptions SET subscription_status = 'trialing', trial_end = ?, stripe_pro_paid_at = NULL WHERE user_id = ?`).run(now() + 86400, 'uid-123');
    const trial = await worker.fetch(post('/billing/workspaces/checkout', { user_id: 'uid-123' }), env);
    assert.equal(trial.status, 403, await trial.text());
    assert.equal(checkoutCalls, 0);
    proStatus = 'active';
    sqlite.prepare(`UPDATE billing_subscriptions SET subscription_status = 'active', stripe_pro_paid_at = ? WHERE user_id = ?`).run(now() - 86400, 'uid-123');
    const checkout = await worker.fetch(post('/billing/workspaces/checkout', { user_id: 'uid-123' }), env);
    assert.equal(checkout.status, 200);
    assert.equal(checkoutBody.get('line_items[0][price]'), product);
    assert.equal(checkoutBody.get('subscription_data[trial_period_days]'), null);
    assert.equal(checkoutBody.get('payment_method_types[0]'), null);
    const repeated = await worker.fetch(post('/billing/workspaces/checkout', { user_id: 'uid-123' }), env);
    assert.equal(repeated.status, 409);
    await worker.fetch(webhook('checkout.session.completed', { id: 'cs_test', subscription: 'sub_addon', customer: 'cus_test', client_reference_id: 'uid-123' }), env);
    assert.equal(sqlite.prepare('SELECT paid_through FROM billing_stripe_workspace_addons').get().paid_through, 0);
    assert.equal(sqlite.prepare('SELECT stripe_subscription_id FROM billing_subscriptions WHERE user_id = ?').get('uid-123').stripe_subscription_id, 'sub_pro');
    invoiceResponse = { id: 'in_addon', customer: 'cus_test', status: 'paid',
      collection_method: 'charge_automatically', currency: 'gbp', amount_paid: 0, amount_remaining: 499,
      status_transitions: { paid_at: now() },
      lines: { data: [{ pricing: { price_details: { price: product } }, quantity: 1,
        parent: { subscription_item_details: { subscription: 'sub_addon' } }, period: { end: now() + 86400 } }] } };
    const unpaid = await worker.fetch(webhook('invoice.paid', { id: 'in_addon' }), env);
    assert.equal(unpaid.status, 200);
    assert.equal(sqlite.prepare('SELECT paid_through FROM billing_stripe_workspace_addons').get().paid_through, 0);
    invoiceResponse = { ...invoiceResponse, amount_paid: 499, amount_remaining: 0 };
    const paid = await worker.fetch(webhook('v1.invoice.paid', { id: 'in_addon' }), env);
    assert.equal(paid.status, 200);
    assert.ok(sqlite.prepare('SELECT paid_through FROM billing_stripe_workspace_addons').get().paid_through > now());
    const folder = await worker.fetch(post('/add-folder', { user_id: 'uid-123', name: 'Second' }), env);
    assert.equal(folder.status, 200);
    assert.equal(checkoutCalls, 1);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('workspace renewal changes only its own paid add-on and leaves Pro intact', async () => {
  const { sqlite, env } = setup();
  sqlite.prepare(`INSERT INTO billing_stripe_workspace_addons
    (stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id, subscription_status, paid_through)
    VALUES (?, ?, ?, ?, ?, ?)`).run('sub_addon', 'uid-123', 'cus_test', product, 'active', now() + 86400);
  const originalFetch = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', emailVerified: true }] });
    if (path.endsWith('/v1/account')) return Response.json({ id: 'acct_test_multipost' });
    if (path.endsWith('/v1/subscriptions/sub_pro')) return Response.json({ id: 'sub_pro', customer: 'cus_test', status: 'active',
      cancel_at_period_end: false, metadata: { user_id: 'uid-123', plan_key: 'pro' } });
    if (path.endsWith('/v1/subscriptions/sub_addon')) {
      if (init.method === 'POST') { cancelled = new URLSearchParams(init.body).get('cancel_at_period_end') === 'true'; }
      return Response.json(subscription('active', cancelled));
    }
    throw new Error(`Unexpected Stripe request ${path}`);
  };
  try {
    const payload = { user_id: 'uid-123', subscription_id: 'sub_addon', action: 'cancel' };
    const stopped = await worker.fetch(post('/billing/workspaces/renewal', payload), env);
    assert.equal(stopped.status, 200);
    assert.equal(sqlite.prepare('SELECT cancel_at_period_end FROM billing_stripe_workspace_addons').get().cancel_at_period_end, 1);
    const duplicate = await worker.fetch(post('/billing/workspaces/renewal', payload), env);
    assert.equal(duplicate.status, 409);
    const resumed = await worker.fetch(post('/billing/workspaces/renewal', { ...payload, action: 'resume' }), env);
    assert.equal(resumed.status, 200);
    assert.equal(sqlite.prepare('SELECT cancel_at_period_end FROM billing_stripe_workspace_addons').get().cancel_at_period_end, 0);
    assert.equal(sqlite.prepare('SELECT stripe_subscription_id FROM billing_subscriptions').get().stripe_subscription_id, 'sub_pro');
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('nine paid extras cap the account at ten total workspaces', async () => {
  const { sqlite, env } = setup();
  for (let n = 1; n <= 9; n++) sqlite.prepare(`INSERT INTO billing_stripe_workspace_addons
    (stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id, subscription_status, paid_through)
    VALUES (?, ?, ?, ?, ?, ?)`).run(`sub_extra${n}`, 'uid-123', 'cus_test', product, 'active', now() + 86400);
  const originalFetch = globalThis.fetch;
  let checkoutCalls = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', emailVerified: true }] });
    if (String(url).endsWith('/v1/subscriptions/sub_pro')) return Response.json({ id: 'sub_pro', customer: 'cus_test', status: 'active',
      metadata: { user_id: 'uid-123', plan_key: 'pro' }, items: { data: [{ price: { id: 'price_pro', recurring: { interval: 'month' } }, current_period_end: now() + 86400 }] } });
    checkoutCalls++;
    throw new Error('No new Stripe checkout should be created');
  };
  try {
    const result = await worker.fetch(post('/billing/workspaces/checkout', { user_id: 'uid-123' }), env);
    assert.equal(result.status, 409);
    assert.equal(checkoutCalls, 0);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('failed renewal never changes Pro and expired extra allowance locks the second workspace', async () => {
  const { sqlite, env } = setup();
  sqlite.prepare(`INSERT INTO billing_stripe_workspace_addons
    (stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id, subscription_status, paid_through)
    VALUES (?, ?, ?, ?, ?, ?)`).run('sub_addon', 'uid-123', 'cus_test', product, 'active', now() + 3600);
  const originalFetch = globalThis.fetch;
  let addonQuantity = 1;
  globalThis.fetch = async url => {
    const path = String(url);
    if (path.includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', emailVerified: true }] });
    if (path.endsWith('/v1/invoices/in_failed')) return Response.json({ id: 'in_failed', customer: 'cus_test',
      lines: { data: [{ parent: { subscription_item_details: { subscription: 'sub_addon' } } }] } });
    if (path.endsWith('/v1/subscriptions/sub_addon')) {
      const addon = subscription('past_due');
      addon.items.data[0].quantity = addonQuantity;
      return Response.json(addon);
    }
    throw new Error(`Unexpected request ${path}`);
  };
  try {
    const failed = await worker.fetch(webhook('invoice.payment_failed', { id: 'in_failed' }), env);
    assert.equal(failed.status, 200);
    assert.equal(sqlite.prepare('SELECT subscription_status FROM billing_subscriptions').get().subscription_status, 'active');
    assert.equal(sqlite.prepare('SELECT subscription_status FROM billing_stripe_workspace_addons').get().subscription_status, 'past_due');
    addonQuantity = 2;
    const malformed = await worker.fetch(webhook('invoice.payment_failed', { id: 'in_failed' }), env);
    assert.equal(malformed.status, 200);
    assert.equal(sqlite.prepare('SELECT subscription_status FROM billing_subscriptions').get().subscription_status, 'active');
    sqlite.prepare('UPDATE billing_stripe_workspace_addons SET paid_through = ?').run(now() - 1);
    const first = await worker.fetch(post('/add-folder', { user_id: 'uid-123', name: 'Included' }), env);
    const second = await worker.fetch(post('/add-folder', { user_id: 'uid-123', name: 'Locked' }), env);
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('an existing paid Pro invoice unlocks checkout without a new Pro charge', async () => {
  const { sqlite, env } = setup();
  sqlite.prepare('UPDATE billing_subscriptions SET stripe_pro_paid_at = NULL WHERE user_id = ?').run('uid-123');
  const originalFetch = globalThis.fetch;
  let checkoutCalls = 0;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', emailVerified: true }] });
    if (path.endsWith('/v1/subscriptions/sub_pro')) return Response.json({ id: 'sub_pro', customer: 'cus_test', status: 'active',
      metadata: { user_id: 'uid-123', plan_key: 'pro' }, items: { data: [{ price: { id: 'price_pro', recurring: { interval: 'month' } }, current_period_end: now() + 86400 }] } });
    if (path.includes('/v1/invoices?subscription=sub_pro')) return Response.json({ data: [{ id: 'in_pro', customer: 'cus_test',
      status: 'paid', collection_method: 'charge_automatically', amount_paid: 999, amount_remaining: 0, currency: 'gbp',
      lines: { data: [{ parent: { subscription_item_details: { subscription: 'sub_pro' } } }] },
      status_transitions: { paid_at: now() - 86400 } }] });
    if (path.includes('/v1/invoice_payments?invoice=in_pro')) return Response.json({ data: [{ status: 'paid', amount_paid: 999,
      payment: { type: 'payment_intent', payment_intent: 'pi_pro' } }] });
    if (path.endsWith('/v1/payment_intents/pi_pro')) return Response.json({ status: 'succeeded', customer: 'cus_test',
      currency: 'gbp', amount_received: 999 });
    if (path.endsWith('/v1/account')) return Response.json({ id: 'acct_test_multipost' });
    if (path.endsWith(`/v1/prices/${product}`)) return Response.json({ active: true, currency: 'gbp', unit_amount: 499, recurring: { interval: 'month' } });
    if (path.endsWith('/v1/checkout/sessions')) { checkoutCalls++; return Response.json({ id: 'cs_test_existing', url: 'https://checkout.stripe.com/c/pay/cs_test_existing' }); }
    throw new Error(`Unexpected request ${path}`);
  };
  try {
    const result = await worker.fetch(post('/billing/workspaces/checkout', { user_id: 'uid-123' }), env);
    assert.equal(result.status, 200, await result.text());
    assert.equal(checkoutCalls, 1);
    assert.ok(sqlite.prepare('SELECT stripe_pro_paid_at FROM billing_subscriptions').get().stripe_pro_paid_at > 0);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('scheduling Pro cancellation also stops extra workspace renewals', async () => {
  const { sqlite, env } = setup();
  sqlite.prepare(`INSERT INTO billing_stripe_workspace_addons
    (stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id, subscription_status, paid_through)
    VALUES (?, ?, ?, ?, ?, ?)`).run('sub_addon', 'uid-123', 'cus_test', product, 'active', now() + 86400);
  const originalFetch = globalThis.fetch;
  let stopCalls = 0;
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.endsWith('/v1/subscriptions/sub_addon') && init.method === 'POST') {
      assert.equal(new URLSearchParams(init.body).get('cancel_at_period_end'), 'true');
      stopCalls++;
      return Response.json(subscription('active', true));
    }
    throw new Error(`Unexpected request ${path}`);
  };
  try {
    const pro = { id: 'sub_pro', customer: 'cus_test', status: 'active', cancel_at_period_end: true,
      metadata: { user_id: 'uid-123', plan_key: 'pro' },
      items: { data: [{ price: { id: 'price_pro', recurring: { interval: 'month' } }, current_period_end: now() + 86400 }] } };
    const result = await worker.fetch(webhook('customer.subscription.updated', pro), env);
    assert.equal(result.status, 200, await result.text());
    assert.equal(stopCalls, 1);
    assert.equal(sqlite.prepare('SELECT cancel_at_period_end FROM billing_stripe_workspace_addons').get().cancel_at_period_end, 1);
    assert.equal(sqlite.prepare('SELECT stripe_subscription_id FROM billing_subscriptions').get().stripe_subscription_id, 'sub_pro');
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('a Pro plan scheduled to end cannot start or resume an extra workspace', async () => {
  const { sqlite, env } = setup();
  sqlite.prepare(`INSERT INTO billing_stripe_workspace_addons
    (stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id, subscription_status, paid_through, cancel_at_period_end)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('sub_addon', 'uid-123', 'cus_test', product, 'active', now() + 86400, 1);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.includes('identitytoolkit.googleapis.com')) return Response.json({ users: [{ localId: 'uid-123', emailVerified: true }] });
    if (path.endsWith('/v1/subscriptions/sub_pro')) return Response.json({ id: 'sub_pro', customer: 'cus_test', status: 'active',
      cancel_at_period_end: true, metadata: { user_id: 'uid-123', plan_key: 'pro' },
      items: { data: [{ price: { id: 'price_pro', recurring: { interval: 'month' } }, current_period_end: now() + 86400 }] } });
    throw new Error(`Unexpected request ${path}`);
  };
  try {
    const purchase = await worker.fetch(post('/billing/workspaces/checkout', { user_id: 'uid-123' }), env);
    assert.equal(purchase.status, 403);
    const resume = await worker.fetch(post('/billing/workspaces/renewal', {
      user_id: 'uid-123', subscription_id: 'sub_addon', action: 'resume' }), env);
    assert.equal(resume.status, 403);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});
