import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getWorkspacePurchaseState } from '../billing-ui.mjs';

const settings = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
const pricing = readFileSync(new URL('../pricing.html', import.meta.url), 'utf8');
const paidStripe = { access: true, reason: 'ok', status: 'active', plan: { key: 'pro' },
  workspace_allowance: 1, stripe_workspace_paid_pro: true, stripe_workspace_checkout_enabled: true,
  stripe_workspace_addons: [] };

function profileCard(billing, android = false) {
  const ids = ['workspaceWebControls', 'workspaceWebPrice', 'workspaceWebDescription', 'workspaceWebAddBtn',
    'workspaceWebPlayLink', 'workspaceWebRemoveBtn', 'workspaceWebResumeBtn', 'workspaceWebNote',
    'workspaceWebSubscribeLink', 'workspaceWebCount', 'earlyUpgradeCard', 'earlyUpgradeDescription', 'earlyUpgradeBtn', 'earlyUpgradeNote'];
  const nodes = Object.fromEntries(ids.map(id => [id, { hidden: true, disabled: true, textContent: '' }]));
  const source = settings.slice(settings.indexOf('    function renderEarlyUpgrade() {'), settings.indexOf('    function renderWorkspacePlans() {'));
  const context = { document: { getElementById: id => nodes[id] }, currentBilling: billing,
    getWorkspacePurchaseState, isAndroidWrapper: () => android, workspaceWebBusy: false, earlyUpgradeBusy: false,
    workspaceWebAnchorHandled: false, window: { location: { hash: '' } } };
  vm.runInNewContext(`${source}\nrenderWebWorkspacePlans()`, context);
  return nodes;
}

function pricingCard(billing, android = false) {
  const ids = ['workspacePricingPrice', 'workspacePricingDescription', 'workspacePricingAdd',
    'workspacePricingPlayLink', 'workspacePricingManage', 'workspacePricingInfo', 'workspacePricingStatus'];
  const nodes = Object.fromEntries(ids.map(id => [id, { hidden: true, disabled: false, textContent: '', href: '' }]));
  const source = pricing.slice(pricing.indexOf('    function renderWorkspaceCard(billing = null) {'), pricing.indexOf('    const render = () => {'));
  const context = { document: { getElementById: id => nodes[id] }, getWorkspacePurchaseState,
    isAndroid: android, auth: { currentUser: { uid: 'uid-123' } }, workspaceBusy: false,
    workspaceBilling: null, workspaceState: null };
  vm.runInNewContext(`${source}\nrenderWorkspaceCard(billing)`, { ...context, billing });
  return nodes;
}

test('paid Stripe Pro sees a prominent website purchase CTA on both pages', () => {
  const profile = profileCard(paidStripe);
  const plans = pricingCard(paidStripe);
  assert.equal(profile.workspaceWebControls.hidden, false);
  assert.equal(profile.workspaceWebAddBtn.hidden, false);
  assert.equal(profile.workspaceWebPlayLink.hidden, true);
  assert.match(profile.workspaceWebPrice.textContent, /£4\.99\/month/);
  assert.equal(plans.workspacePricingAdd.hidden, false);
  assert.equal(plans.workspacePricingPlayLink.hidden, true);
  assert.match(pricing, /billing\/workspaces\/checkout/);
  assert.match(settings, /billing\/workspaces\/checkout/);
});

test('Google Play Pro sees Android management on the website and never a Stripe CTA', () => {
  const play = { ...paidStripe, reason: 'play_verified', play: { paid_pro: true }, workspace_allowance: 2 };
  const profile = profileCard(play);
  const plans = pricingCard(play);
  assert.equal(profile.workspaceWebControls.hidden, false);
  assert.equal(profile.workspaceWebAddBtn.hidden, true);
  assert.equal(profile.workspaceWebPlayLink.hidden, false);
  assert.match(profile.workspaceWebNote.textContent, /2 total workspaces/);
  assert.equal(plans.workspacePricingAdd.hidden, true);
  assert.equal(plans.workspacePricingPlayLink.hidden, false);
  assert.equal(plans.workspacePricingPrice.textContent, 'Price shown in Google Play');
});

test('trial and full accounts cannot see a chargeable Stripe workspace CTA', () => {
  const trial = { ...paidStripe, status: 'trialing', stripe_workspace_paid_pro: false };
  assert.equal(profileCard(trial).workspaceWebAddBtn.hidden, false);
  assert.equal(profileCard(trial).workspaceWebAddBtn.disabled, true);
  assert.match(profileCard(trial).workspaceWebNote.textContent, /first successful Pro subscription payment/);
  const full = { ...paidStripe, stripe_workspace_addons: Array(9).fill({ cancel_at_period_end: false }), workspace_allowance: 10 };
  assert.equal(profileCard(full).workspaceWebAddBtn.disabled, true);
  assert.equal(pricingCard(full).workspacePricingAdd.disabled, true);
});

test('unverified web Pro retains a visible locked CTA and a direct Stripe payment route', () => {
  const unpaid = { ...paidStripe, stripe_workspace_paid_pro: false, stripe_workspace_checkout_enabled: false };
  const profile = profileCard(unpaid);
  const plans = pricingCard(unpaid);
  assert.equal(profile.workspaceWebAddBtn.hidden, false);
  assert.equal(profile.workspaceWebAddBtn.disabled, true);
  assert.equal(plans.workspacePricingAdd.hidden, false);
  assert.equal(plans.workspacePricingAdd.disabled, true);
  assert.equal(plans.workspacePricingManage.hidden, false);
  assert.equal(plans.workspacePricingInfo.hidden, true);
  assert.match(plans.workspacePricingStatus.textContent, /No Pro payment has been verified/);
  assert.ok(pricing.indexOf('class="extras"') < pricing.indexOf('class="allowance"'));
});

test('legacy canceled yearly Pro cannot buy an add-on without payment verification', () => {
  const legacy = { ...paidStripe, status: 'canceled', plan: { key: 'pro', interval: 'yearly' },
    stripe_workspace_paid_pro: false, stripe_workspace_checkout_enabled: false };
  const profile = profileCard(legacy);
  const plans = pricingCard(legacy);
  assert.equal(profile.workspaceWebAddBtn.hidden, false);
  assert.equal(profile.workspaceWebAddBtn.disabled, true);
  assert.match(profile.workspaceWebNote.textContent, /No Pro payment has been verified/);
  assert.equal(plans.workspacePricingAdd.disabled, true);
  assert.equal(plans.workspacePricingManage.hidden, false);
});

test('Android wrapper keeps the native Play controls and no website Stripe card', () => {
  assert.equal(profileCard(paidStripe, true).workspaceWebControls.hidden, true);
  const plans = pricingCard(paidStripe, true);
  assert.equal(plans.workspacePricingAdd.hidden, true);
  assert.equal(plans.workspacePricingPlayLink.hidden, false);
  assert.equal(plans.workspacePricingPlayLink.href, 'settings.html#workspace-play');
  assert.match(pricing, /\.android-billing \.plans \{ display:none; \}/);
});

test('pricing CTA opens authenticated Stripe Checkout only for a paid Stripe account', async () => {
  const start = pricing.indexOf("    document.getElementById('workspacePricingAdd').addEventListener('click', async () => {");
  const end = pricing.indexOf("    document.getElementById('workspacePricingManage').addEventListener", start);
  let handler;
  const requests = [];
  const redirects = [];
  const context = {
    document: { getElementById: () => ({ addEventListener: (_event, fn) => { handler = fn; } }) },
    workspaceBusy: false, isAndroid: false, workspaceState: getWorkspacePurchaseState(paidStripe),
    workspaceBilling: paidStripe, auth: { currentUser: { uid: 'uid-123' } },
    renderWorkspaceCard: () => {}, setNotice: () => {},
    authenticatedFetch: async (path, options) => {
      requests.push({ path, options });
      return { ok: true, json: async () => ({ success: true, url: 'https://checkout.stripe.com/c/pay/test-session' }) };
    },
    window: { location: { assign: url => redirects.push(url) } }
  };
  vm.runInNewContext(pricing.slice(start, end), context);
  await handler();
  assert.equal(requests[0].path, '/billing/workspaces/checkout');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(JSON.parse(requests[0].options.body).user_id, 'uid-123');
  assert.deepEqual(redirects, ['https://checkout.stripe.com/c/pay/test-session']);

  requests.length = 0;
  redirects.length = 0;
  context.workspaceState = getWorkspacePurchaseState({ ...paidStripe, reason: 'play_verified' });
  await handler();
  assert.equal(requests.length, 0);
  assert.equal(redirects.length, 0);
});

test('website accounts without Pro still see the workspace offer with a subscribe route', () => {
  for (const billing of [{ access: false, reason: 'no_subscription', status: 'inactive', plan: { key: 'free' } },
    { access: true, reason: 'ok', status: 'active', plan: { key: 'pro_plus' } }]) {
    const profile = profileCard(billing);
    assert.equal(profile.workspaceWebControls.hidden, false);
    assert.equal(profile.workspaceWebSubscribeLink.hidden, false);
    assert.equal(profile.workspaceWebAddBtn.hidden, true);
    assert.equal(profile.workspaceWebPlayLink.hidden, true);
    assert.match(profile.workspaceWebDescription.textContent, /up to 10 workspaces in total on your monthly or yearly Pro plan/);
  }
});

test('paid Pro sees a clear workspace count and no subscribe link', () => {
  const profile = profileCard({ ...paidStripe, workspace_allowance: 3,
    stripe_workspace_addons: [{ cancel_at_period_end: false }, { cancel_at_period_end: false }] });
  assert.equal(profile.workspaceWebSubscribeLink.hidden, true);
  assert.equal(profile.workspaceWebCount.hidden, false);
  assert.equal(profile.workspaceWebCount.textContent, '3 of 10 workspaces');
  assert.equal(profile.workspaceWebAddBtn.disabled, false);
});

test('owner mode and the Android wrapper never show the website workspace card', () => {
  assert.equal(profileCard({ ...paidStripe, owner_mode: true }).workspaceWebControls.hidden, true);
  assert.equal(profileCard({ access: false, status: 'inactive' }, true).workspaceWebControls.hidden, true);
});

test('workspace card sits directly under the subscription status', () => {
  const status = settings.indexOf('id="allowanceNote"');
  const card = settings.indexOf('id="workspaceWebControls"');
  const actions = settings.indexOf('id="openPricingBtn"');
  assert.ok(status < card && card < actions);
});

test('website Pro trial sees the subscribe-early offer; Android and paid accounts do not', () => {
  const trial = { ...paidStripe, status: 'trialing', stripe_workspace_paid_pro: false, stripe_early_upgrade_available: true,
    plan: { key: 'pro', interval: 'monthly' } };
  const profile = profileCard(trial);
  assert.equal(profile.earlyUpgradeCard.hidden, false);
  assert.match(profile.earlyUpgradeDescription.textContent, /1 extra workspace free for 1 month/);
  assert.match(profile.earlyUpgradeDescription.textContent, /£4\.99\/month/);
  assert.match(profile.workspaceWebNote.textContent, /Subscribe now above/);
  assert.equal(profileCard(trial, true).earlyUpgradeCard.hidden, true);
  assert.equal(profileCard(paidStripe).earlyUpgradeCard.hidden, true);
  assert.match(settings, /billing\/end-trial-early/);
  assert.ok(settings.indexOf('id="earlyUpgradeCard"') < settings.indexOf('id="workspaceWebControls"'));
});
