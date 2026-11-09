import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const settings = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

function renderWorkspaceStatus(plans, billing, country = null, android = true) {
  const nodes = Object.fromEntries(['workspacePlayControls', 'workspacePlayNote', 'workspaceAddBtn', 'workspaceRemoveBtn']
    .map(id => [id, { hidden: true, disabled: true, textContent: '' }]));
  const source = settings.slice(settings.indexOf('    function renderWorkspacePlans() {'), settings.indexOf('    function renderPlayPlans() {'));
  const context = { document: { getElementById: id => nodes[id] }, isAndroidWrapper: () => android,
    currentBilling: billing, availableWorkspacePlans: plans, playCountryCode: country,
    workspaceAnchorHandled: false, window: { location: { hash: '' } } };
  vm.runInNewContext(`${source}\nrenderWorkspacePlans()`, context);
  return nodes;
}

const pro = { reason: 'play_verified', access: true, status: 'active',
  play: { base_plan_id: 'monthly' }, workspace_product_ids: [], workspace_renewing_ids: [] };
const catalogue = Array.from({ length: 10 }, (_, n) => ({
  base_plan_id: 'monthly', product_id: `multipost_workspace_${String(n + 1).padStart(2, '0')}`, price: '£4.99'
}));

test('a verified Pro user can see an add-on purchase when Play returned the full catalogue even if the country callback arrived early', () => {
  const ui = renderWorkspaceStatus(catalogue, pro);
  assert.equal(ui.workspacePlayControls.hidden, false);
  assert.equal(ui.workspaceAddBtn.disabled, false);
  assert.match(ui.workspaceAddBtn.textContent, /£4\.99\/month/);
});

test('a partial or missing Play add-on catalogue explains why purchase is unavailable without enabling payment', () => {
  for (const plans of [[], catalogue.slice(0, 1)]) {
    const ui = renderWorkspaceStatus(plans, pro);
    assert.equal(ui.workspacePlayControls.hidden, false);
    assert.equal(ui.workspaceAddBtn.disabled, true);
    assert.match(ui.workspacePlayNote.textContent, /not available yet/i);
  }
});

test('a canceled Pro plan cannot start a workspace purchase', () => {
  const ui = renderWorkspaceStatus(catalogue, { ...pro, status: 'canceled' });
  assert.equal(ui.workspaceAddBtn.disabled, true);
  assert.match(ui.workspacePlayNote.textContent, /canceled/i);
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
});
