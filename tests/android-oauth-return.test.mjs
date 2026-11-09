import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import worker from '../worker.js';
import { createAndroidOAuthHandoff, consumeAndroidOAuthHandoff, androidOAuthReturn } from '../android-oauth.mjs';
globalThis.crypto ??= webcrypto;

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sqlite.exec("ALTER TABLE accounts ADD COLUMN google_sub TEXT; INSERT INTO folders(id,user_id,name) VALUES(1,'uid-1','One')");
  const db = { prepare(sql) { let values = []; return {
    bind(...args) { values = args; return this; },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async run() { return sqlite.prepare(sql).run(...values); }
  }; }, async batch(items) { return Promise.all(items.map(item => item.run())); } };
  const env = { DB: db, BASE_URL: 'https://multipostapp.co.uk', FRONTEND_URL: 'https://multipostapp.co.uk',
    GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'google-secret', FB_CLIENT_ID: 'fb-client', FB_CLIENT_SECRET: 'fb-secret',
    TIKTOK_CLIENT_KEY: 'tt-client', TIKTOK_CLIENT_SECRET: 'tt-secret', WEB_BILLING_ENABLED: 'false' };
  return { sqlite, db, env };
}

test('browser handoffs are expiring and single-use, reject arbitrary destinations, and carry no Firebase credentials', async () => {
  const { db, sqlite } = fixture();
  const destination = await createAndroidOAuthHandoff(db, { authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize/?state=bound', folderId: '1', userId: 'uid-1', browserNonce: 'cookie-only' }, 'https://multipostapp.co.uk');
  const ticket = new URL(destination).searchParams.get('ticket');
  assert.equal(destination.includes('cookie-only'), false);
  assert.equal(sqlite.prepare('SELECT ticket_hash FROM android_oauth_handoffs').get().ticket_hash === ticket, false);
  assert.equal((await consumeAndroidOAuthHandoff(db, ticket)).browser_nonce, 'cookie-only');
  assert.equal(await consumeAndroidOAuthHandoff(db, ticket), null);
  assert.equal(await consumeAndroidOAuthHandoff(db, 'invalid'), null);
  await assert.rejects(createAndroidOAuthHandoff(db, { authorizationUrl: 'https://www.tiktok.com.attacker.test/', folderId: '1', userId: 'uid-1' }, 'https://multipostapp.co.uk'));
  const expired = await createAndroidOAuthHandoff(db, { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', folderId: '1', userId: 'uid-1' }, 'https://multipostapp.co.uk');
  sqlite.exec('UPDATE android_oauth_handoffs SET expires_at=0');
  assert.equal(await consumeAndroidOAuthHandoff(db, new URL(expired).searchParams.get('ticket')), null);
});

test('Android YouTube completion returns to the app while the website retains its existing destination', async () => {
  const { env, sqlite } = fixture();
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('accounts:lookup')) return Response.json({ users: [{ localId: 'uid-1', emailVerified: true }] });
    if (String(url).includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'server-only', refresh_token: 'refresh-only', expires_in: 3600 });
    if (String(url).includes('youtube/v3/channels')) return Response.json({ items: [{ id: 'channel', snippet: { title: 'My channel' } }] });
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    for (const returnToApp of [true, false]) {
      const start = await worker.fetch(new Request('https://multipostapp.co.uk/api/auth/youtube', { method: 'POST', headers: { Authorization: 'Bearer firebase-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: '1', user_id: 'uid-1', return_to_app: returnToApp }) }), env);
      assert.equal(start.status, 200);
      let destination = new URL((await start.json()).url);
      if (returnToApp) {
        assert.equal(destination.pathname, '/api/auth/android/start');
        const browser = await worker.fetch(new Request(destination), env);
        assert.equal(browser.status, 302);
        assert.equal((await worker.fetch(new Request(destination), env)).status, 400);
        destination = new URL(browser.headers.get('Location'));
      }
      assert.equal(destination.hostname, 'accounts.google.com');
      const callback = await worker.fetch(new Request(`https://multipostapp.co.uk/api/auth/callback/youtube?code=once&state=${encodeURIComponent(destination.searchParams.get('state'))}`), env);
      const returned = new URL(callback.headers.get('Location'));
      assert.equal(returned.pathname, returnToApp ? '/android-return.html' : '/create-post.html');
      assert.equal(returned.href.includes('server-only'), false);
      if (returnToApp) assert.equal(returned.searchParams.get('provider'), 'youtube');
    }
    assert.equal(sqlite.prepare("SELECT count(*) n FROM accounts WHERE platform='youtube'").get().n, 1);
  } finally { globalThis.fetch = savedFetch; }
});

test('Android TikTok handoff sets its binding cookie in the external browser before authorizing', async () => {
  const { env } = fixture();
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'uid-1', emailVerified: true }] });
  try {
    const start = await worker.fetch(new Request('https://multipostapp.co.uk/api/auth/tiktok', { method: 'POST', headers: { Authorization: 'Bearer firebase-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: '1', user_id: 'uid-1', return_to_app: true }) }), env);
    const browser = await worker.fetch(new Request((await start.json()).url), env);
    assert.match(browser.headers.get('Set-Cookie'), /mp_tiktok_link_nonce=.+;.*HttpOnly; Secure; SameSite=Lax/);
    const provider = new URL(browser.headers.get('Location'));
    assert.match(provider.searchParams.get('state'), /^ttlink_android_/);
    const callback = await worker.fetch(new Request(`https://multipostapp.co.uk/api/auth/callback/tiktok?error=access_denied&state=${provider.searchParams.get('state')}`, { headers: { Cookie: browser.headers.get('Set-Cookie').split(';')[0] } }), env);
    const returned = new URL(callback.headers.get('Location'));
    assert.equal(returned.pathname, '/android-return.html');
    assert.equal(returned.searchParams.get('result'), 'error');
  } finally { globalThis.fetch = savedFetch; }
});

test('a signed Facebook connection returns to Android despite an unrelated stale website login cookie', async () => {
  const { env } = fixture();
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: 'uid-1', emailVerified: true }] });
  try {
    const start = await worker.fetch(new Request('https://multipostapp.co.uk/api/auth/facebook', { method: 'POST', headers: { Authorization: 'Bearer firebase-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: '1', user_id: 'uid-1', return_to_app: true }) }), env);
    const browser = await worker.fetch(new Request((await start.json()).url), env);
    const state = new URL(browser.headers.get('Location')).searchParams.get('state');
    const callback = await worker.fetch(new Request(`https://multipostapp.co.uk/api/auth/callback/facebook?error=access_denied&state=${encodeURIComponent(state)}`, { headers: { Cookie: 'mp_facebook_login_state=old-login' } }), env);
    const returned = new URL(callback.headers.get('Location'));
    assert.equal(returned.pathname, '/android-return.html');
    assert.equal(returned.searchParams.get('provider'), 'facebook');
    assert.equal(returned.searchParams.get('result'), 'error');
  } finally { globalThis.fetch = savedFetch; }
});

test('the Android page uses the native connection bridge instead of navigating out of its workspace', async () => {
  const page = readFileSync(new URL('../folder.html', import.meta.url), 'utf8');
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  let sent; let requestBody;
  const context = vm.createContext({ navigator: { userAgent: 'MultiPostAndroid/1.9.2' }, URLSearchParams,
    document: { getElementById: () => ({ hidden: true, textContent: '' }) }, localStorage: { getItem: () => null },
    window: { location: { hostname: 'multipostapp.co.uk', search: '?id=1', assign: () => assert.fail('Android must stay on its workspace') }, AndroidConnections: { postMessage: value => sent = JSON.parse(value) } },
    fetch: async (_, options) => { requestBody = JSON.parse(options.body); return { ok: true, json: async () => ({ url: 'https://multipostapp.co.uk/api/auth/android/start?ticket=test' }) }; } });
  vm.runInContext(script, context);
  vm.runInContext('userScope="uid-1"', context);
  await vm.runInContext('addAccount("tiktok")', context);
  assert.equal(requestBody.return_to_app, true);
  assert.equal(sent.action, 'connect');
});

test('return URLs contain navigation hints only and the verified manifest handles only the dedicated return page', () => {
  assert.equal(new URL(androidOAuthReturn('https://multipostapp.co.uk', '1', 'facebook', true)).pathname, '/android-return.html');
  const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.match(manifest, /android:autoVerify="true"/);
  assert.match(manifest, /android:path="\/android-return\.html"/);
  const links = JSON.parse(readFileSync(new URL('../.well-known/assetlinks.json', import.meta.url), 'utf8'));
  assert.equal(links[0].target.package_name, 'uk.co.multipostapp');
});
