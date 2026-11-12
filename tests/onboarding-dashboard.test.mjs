import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import worker from '../worker.js';

const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

test('authenticated account progress reflects linked accounts and confirmed publications, not a pending TikTok upload', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { DB: { prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
      async first() { return db.prepare(sql).get(...values) || null; }
    };
  } } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'alice', email: 'alice@example.com', emailVerified: true }] });
  try {
    const request = () => worker.fetch(new Request('https://preview.test/api/get-folders?user_id=alice', { headers: { Authorization: 'Bearer alice-token' } }), env);
    assert.deepEqual(await (await request()).json(), []);
    db.prepare('INSERT INTO folders (id,user_id,name) VALUES (1,?,?)').run('alice', 'First workspace');
    db.prepare('INSERT INTO accounts (folder_id,user_id,platform,nickname) VALUES (1,?,?,?)').run('alice', 'tiktok', 'Connected account');
    db.prepare("INSERT INTO billing_usage_events (user_id,event_type,platform) VALUES ('alice','publish','tiktok')").run();
    const pending = (await (await request()).json())[0];
    assert.equal(pending.connected_account_count, 1);
    assert.equal(pending.has_first_post, 0);
    db.prepare("INSERT INTO billing_usage_events (user_id,event_type,platform) VALUES ('alice','publish_confirmed','facebook')").run();
    assert.equal((await (await request()).json())[0].has_first_post, 1);
    db.prepare("DELETE FROM billing_usage_events WHERE platform = 'facebook'").run();
    db.prepare("INSERT INTO billing_usage_events (user_id,event_type,platform) VALUES ('alice','publish_confirmed','tiktok')").run();
    assert.equal((await (await request()).json())[0].has_first_post, 1);
    db.prepare('INSERT INTO folders (id,user_id,name) VALUES (2,?,?)').run('bob', 'Private workspace');
    assert.deepEqual((await (await request()).json()).map(row => row.id), [1]);
  } finally { globalThis.fetch = originalFetch; db.close(); }
});

test('dashboard shows action steps from server data and escapes stored workspace labels', () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', hidden: false, replaceChildren() {}, append() {}, addEventListener() {}, querySelectorAll() { return []; } });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: get, querySelectorAll: () => [] },
    window: { location: { hostname: 'multipostapp.co.uk' } },
    localStorage: { getItem: () => null, setItem() {} },
    URL, encodeURIComponent
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  vm.runInContext('renderGettingStarted([])', context);
  assert.equal(get('onboardingProgress').textContent, '0 of 3');
  assert.match(get('onboardingSteps').innerHTML, /Create a workspace/);
  vm.runInContext('renderGettingStarted([{id:1, connected_account_count:1, has_first_post:0}])', context);
  assert.equal(get('onboardingProgress').textContent, '2 of 3');
  vm.runInContext('renderGettingStarted([{id:1, connected_account_count:1, has_first_post:1}])', context);
  assert.equal(get('onboardingProgress').textContent, '3 of 3');
  const escaped = vm.runInContext('escapeHtml(`\" onmouseover=\"alert(1)<script>`) ', context);
  assert.doesNotMatch(escaped, /<script>|" onmouseover/);
  assert.equal(vm.runInContext('safeImageUrl(`javascript:alert(1)`)', context), '');
});

test('accounts without a subscription are sent to the free trial before creating a workspace', () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', hidden: false, replaceChildren() {}, append() {}, addEventListener() {}, querySelectorAll() { return []; }, close() {}, showModal() { this.opened = true; } });
    return elements.get(id);
  };
  const location = { hostname: 'multipostapp.co.uk', href: '' };
  const context = vm.createContext({
    document: { getElementById: get, querySelectorAll: () => [] },
    window: { location }, location, navigator: { userAgent: '' },
    localStorage: { getItem: () => null, setItem() {} },
    URL, encodeURIComponent
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);

  vm.runInContext('workspaceBilling = { enabled: true, access: false, status: "none" }; renderGettingStarted([])', context);
  assert.equal(get('onboardingProgress').textContent, '0 of 4');
  assert.match(get('onboardingSteps').innerHTML, /Start your 7-day free trial.*settings\.html#billingCard/);
  assert.match(get('createWorkspaceButton').innerHTML, /Start 7-day free trial/);
  vm.runInContext('createNewFolder()', context);
  assert.equal(location.href, 'settings.html#billingCard');
  assert.notEqual(get('createBrandDialog').opened, true);

  vm.runInContext('workspaceBilling = { enabled: true, access: false, status: "expired" }; renderGettingStarted([])', context);
  assert.match(get('createWorkspaceButton').innerHTML, /Choose a plan/);

  vm.runInContext('workspaceBilling = { enabled: true, access: true, status: "trialing" }; renderGettingStarted([])', context);
  assert.equal(get('onboardingProgress').textContent, '0 of 3');
  assert.match(get('createWorkspaceButton').innerHTML, /Create Workspace/);
  vm.runInContext('renderGettingStarted([{id:1, connected_account_count:1, has_first_post:1}])', context);
  assert.equal(get('gettingStartedCard').hidden, true);
});
