import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';

const googleUid = 'GoogleOwnerUid';
const passwordUid = 'PasswordOwnerUid';
const ownerEmail = 'owner@example.com';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sqlite.prepare('INSERT INTO folders (id,user_id,name) VALUES (?,?,?)').run(66, googleUid, 'Existing workspace');
  sqlite.prepare("INSERT INTO accounts (folder_id,user_id,platform,nickname) VALUES (?,?,\'youtube\',?)").run(66, googleUid, 'Existing channel');
  sqlite.prepare('INSERT INTO folders (id,user_id,name) VALUES (?,?,?)').run(99, 'OtherUid', 'Private workspace');
  return {
    sqlite,
    env: {
      BILLING_OWNER_USER_IDS: googleUid,
      BILLING_OWNER_EMAILS: ownerEmail,
      DB: {
        prepare(sql) {
          let values = [];
          return {
            bind(...args) { values = args; return this; },
            async first() { return sqlite.prepare(sql).get(...values) || null; },
            async all() { return { results: sqlite.prepare(sql).all(...values) }; },
            async run() { throw new Error('Authentication reads must not modify saved data'); }
          };
        }
      }
    }
  };
}

test('verified email/password UID loads the Google-owned workspace and connected accounts', async () => {
  const { sqlite, env } = fixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{
    localId: passwordUid,
    email: ownerEmail,
    emailVerified: true
  }] });
  try {
    const headers = { Authorization: 'Bearer preview-token' };
    const foldersResponse = await worker.fetch(new Request(
      `https://preview.test/api/get-folders?user_id=${passwordUid}`,
      { headers }
    ), env);
    assert.equal(foldersResponse.status, 200);
    assert.deepEqual((await foldersResponse.json()).map(folder => folder.id), [66]);

    const accountsResponse = await worker.fetch(new Request(
      `https://preview.test/api/get-accounts?folder_id=66&user_id=${passwordUid}`,
      { headers }
    ), env);
    assert.equal(accountsResponse.status, 200);
    assert.equal(accountsResponse.headers.get('X-Workspace-Owner'), googleUid);
    assert.equal((await accountsResponse.json())[0].nickname, 'Existing channel');

    const denied = await worker.fetch(new Request(
      `https://preview.test/api/get-accounts?folder_id=99&user_id=${passwordUid}`,
      { headers }
    ), env);
    assert.equal(denied.status, 403);
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM accounts').get().count, 1);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test('unverified duplicate UID cannot inherit the configured owner workspace', async () => {
  const { sqlite, env } = fixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{
    localId: passwordUid,
    email: ownerEmail,
    emailVerified: false
  }] });
  try {
    const response = await worker.fetch(new Request(
      `https://preview.test/api/get-accounts?folder_id=66&user_id=${passwordUid}`,
      { headers: { Authorization: 'Bearer preview-token' } }
    ), env);
    assert.equal(response.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
