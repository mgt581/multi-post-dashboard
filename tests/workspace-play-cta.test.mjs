import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const settings = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

function renderWorkspaceStatus(plans, billing, country = null, android = true, appVersion = '1.9.5') {
  const nodes = Object.fromEntries(['workspacePlayControls', 'workspacePlayNote', 'workspaceAddBtn', 'workspaceRemoveBtn']
    .map(id => [id, { hidden: true, disabled: true, textContent: '' }]));
  const source = settings.slice(settings.indexOf('    function supportsStandaloneWorkspaces() {'), settings.indexOf('    function renderPlayPlans() {'));
  const context = { navigator: { userAgent: `Mozilla/5.0 MultiPostAndroid/${appVersion}` }, document: { getElementById: id => nodes[id] }, isAndroidWrapper: () => android,
    currentBilling: billing, availableWorkspacePlans: plans, playCountryCode: country,
    workspaceAnchorHandled: false, window: { location: { hash: '' } } };
  vm.runInNewContext(`${source}\nrenderWorkspacePlans()`, context);
  return nodes;
}

const pro = { reason: 'play_verified', access: true, status: 'active',
  play: { base_plan_id: 'monthly', state: 'SUBSCRIPTION_STATE_ACTIVE', paid_pro: true }, workspace_product_ids: [], workspace_renewing_ids: [] };
const catalogue = Array.from({ length: 10 }, (_, n) => ({
  base_plan_id: 'monthly', product_id: `multipost_workspace_${String(n + 1).padStart(2, '0')}`, price: '£4.99'
}));

test('a verified Pro user can see an add-on purchase when Play returned the full catalogue even if the country callback arrived early', () => {
  const ui = renderWorkspaceStatus(catalogue, pro);
  assert.equal(ui.workspacePlayControls.hidden, false);
  assert.equal(ui.workspaceAddBtn.disabled, false);
  assert.match(ui.workspaceAddBtn.textContent, /£4\.99\/month/);
});

test('the first workspace can be bought when Play returns only its matching plan', () => {
  const ui = renderWorkspaceStatus(catalogue.slice(0, 1), pro);
  assert.equal(ui.workspaceAddBtn.disabled, false);
  assert.match(ui.workspaceAddBtn.textContent, /£4\.99\/month/);
});

test('unrelated prices do not block the next workspace or change its displayed price', () => {
  const plans = catalogue.map((plan, n) => ({ ...plan, price: n === 0 ? '£4.99' : '£6.99' }));
  const ui = renderWorkspaceStatus(plans, pro);
  assert.equal(ui.workspaceAddBtn.disabled, false);
  assert.match(ui.workspaceAddBtn.textContent, /£4\.99\/month/);
});

test('a missing next plan or wrong billing period cannot enable payment', () => {
  for (const plans of [[], catalogue.slice(1), [{ ...catalogue[0], base_plan_id: 'yearly' }]]) {
    const ui = renderWorkspaceStatus(plans, pro);
    assert.equal(ui.workspacePlayControls.hidden, false);
    assert.equal(ui.workspaceAddBtn.disabled, true);
    assert.match(ui.workspacePlayNote.textContent, /has not returned.*next workspace/i);
  }
});

test('scheduled removals stay occupied and renewing plans must be available', () => {
  const billing = { ...pro, workspace_product_ids: ['multipost_workspace_01', 'multipost_workspace_02'],
    workspace_renewing_ids: ['multipost_workspace_02'] };
  assert.equal(renderWorkspaceStatus([catalogue[1], catalogue[2]], billing).workspaceAddBtn.disabled, false);
  assert.equal(renderWorkspaceStatus([catalogue[2]], billing).workspaceAddBtn.disabled, true);
  assert.equal(renderWorkspaceStatus([catalogue[0], catalogue[1]], billing).workspaceAddBtn.disabled, true);
});

test('a canceled Pro plan cannot start a workspace purchase', () => {
  const ui = renderWorkspaceStatus(catalogue, { ...pro, status: 'canceled', play: { ...pro.play, state: 'SUBSCRIPTION_STATE_CANCELED' } });
  assert.equal(ui.workspaceAddBtn.disabled, true);
  assert.match(ui.workspacePlayNote.textContent, /active, renewing/i);
});

test('a trial and an unverified first payment never offer a chargeable workspace', () => {
  for (const billing of [
    { ...pro, status: 'trialing', play: { ...pro.play, paid_pro: false, trial_end: 1790000000 } },
    { ...pro, play: { ...pro.play, paid_pro: false } }
  ]) {
    const ui = renderWorkspaceStatus(catalogue, billing);
    assert.equal(ui.workspaceAddBtn.disabled, true);
    assert.equal(ui.workspacePlayNote.textContent, 'Additional workspaces become available after your first successful Pro subscription payment.');
  }
});

test('nine purchased extras fill the ten total workspace limit', () => {
  const ids = catalogue.slice(0, 9).map(plan => plan.product_id);
  const ui = renderWorkspaceStatus(catalogue, { ...pro, workspace_product_ids: ids, workspace_renewing_ids: ids });
  assert.equal(ui.workspaceAddBtn.disabled, true);
  assert.match(ui.workspacePlayNote.textContent, /ten total workspace places/);
});

test('extra Play workspace checkout remains hidden on web and disabled in an unsupported Play country', () => {
  assert.equal(renderWorkspaceStatus(catalogue, pro, null, false).workspacePlayControls.hidden, true);
  const ui = renderWorkspaceStatus(catalogue, pro, 'KR');
  assert.equal(ui.workspaceAddBtn.disabled, true);
  assert.match(ui.workspacePlayNote.textContent, /does not support/i);
});

test('the dashboard offers Play subscribers a clear route when their workspace allowance is full', () => {
  const source = dashboard.slice(dashboard.indexOf('    function isPlayWorkspaceLimitReached() {'), dashboard.indexOf('    function showWorkspaceLimit() {'));
  const context = { navigator: { userAgent: 'MultiPostAndroid/1.5' }, workspaceBilling: {
    reason: 'play_verified', access: true, workspace_allowance: 1 }, loadedFolders: [{ id: 1 }] };
  assert.equal(vm.runInNewContext(`${source}\nisPlayWorkspaceLimitReached()`, context), true);
  assert.match(dashboard, /href="settings\.html#workspace-play"/);
  context.navigator.userAgent = 'Desktop Chrome';
  assert.equal(vm.runInNewContext('isPlayWorkspaceLimitReached()', context), false);
  const limitSource = dashboard.slice(dashboard.indexOf('    function showWorkspaceLimit() {'), dashboard.indexOf('    function openRenameFolder('));
  const description = { textContent: '' };
  const trialContext = { navigator: { userAgent: 'MultiPostAndroid/1.5' }, workspaceBilling: { ...context.workspaceBilling, status: 'trialing' }, loadedFolders: [{ id: 1 }],
    document: { getElementById: id => id === 'workspaceLimitDescription' ? description : { showModal() {} } } };
  vm.runInNewContext(`${limitSource}\nshowWorkspaceLimit()`, trialContext);
  assert.equal(description.textContent, 'Additional workspaces become available after your first successful Pro subscription payment.');
});

test('the website limit dialog links straight to buying another workspace', () => {
  const limitSource = dashboard.slice(dashboard.indexOf('    function showWorkspaceLimit() {'), dashboard.indexOf('    function openRenameFolder('));
  const nodes = {};
  const el = id => (nodes[id] ||= { textContent: '', hidden: false, style: {}, href: '', showModal() { this.open = true; } });
  const run = (billing, count) => {
    for (const k of Object.keys(nodes)) delete nodes[k];
    vm.runInNewContext(`${limitSource}\nshowWorkspaceLimit()`, { navigator: { userAgent: 'Desktop Chrome' },
      workspaceBilling: billing, loadedFolders: Array(count).fill({}), document: { getElementById: el } });
    return nodes;
  };
  const paid = run({ reason: 'ok', access: true, status: 'active', workspace_allowance: 3 }, 3);
  assert.equal(paid.workspaceLimitLink.href, 'settings.html#workspace-web');
  assert.match(paid.workspaceLimitLink.textContent, /Add a workspace — £4\.99\/month/);
  assert.match(paid.workspaceLimitDescription.textContent, /using 3 of 3 workspaces/);
  assert.equal(paid.workspaceLimitDialog.open, true);
  const full = run({ reason: 'ok', access: true, status: 'active', workspace_allowance: 10 }, 10);
  assert.equal(full.workspaceLimitLink.hidden, true);
  assert.match(full.workspaceLimitDescription.textContent, /maximum on Pro/);
  assert.match(dashboard, /if \(!nameDialogAction && res\.status === 429\) \{/);
});

test('Android 1.9.7+ describes extra workspaces as separate subscriptions; older apps keep the add-on text', () => {
  const paidPro = { ...pro, play: { ...pro.play, paid_pro: true } };
  const oldApp = renderWorkspaceStatus(catalogue, paidPro, 'GB', true, '1.9.5');
  const newApp = renderWorkspaceStatus(catalogue, paidPro, 'GB', true, '1.9.7');
  assert.match(oldApp.workspacePlayNote.textContent, /prorated amount/);
  assert.match(newApp.workspacePlayNote.textContent, /its own .* Google Play subscription, charged from today/);
  assert.equal(newApp.workspaceAddBtn.disabled, false);
  const gate = settings.slice(settings.indexOf('    function supportsStandaloneWorkspaces() {'), settings.indexOf('    function renderWorkspacePlans() {'));
  for (const [ua, expected] of [['MultiPostAndroid/1.9.6', false], ['MultiPostAndroid/1.9.7', true], ['MultiPostAndroid/1.10.0', true], ['MultiPostAndroid/2.0', true], ['Desktop Chrome', false]])
    assert.equal(vm.runInNewContext(`${gate}\nsupportsStandaloneWorkspaces()`, { navigator: { userAgent: ua } }), expected, ua);
  assert.match(settings, /sendPlayAction\('buyWorkspace'/);
  assert.match(settings, /billing\/play-workspace-purchase/);
});
