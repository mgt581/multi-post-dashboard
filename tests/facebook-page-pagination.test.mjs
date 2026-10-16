import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker from "../worker.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  sqlite.exec("INSERT INTO folders (id,user_id,name) VALUES (1,'uid-1','Workspace'); INSERT INTO accounts (folder_id,user_id,platform,facebook_user_id,facebook_user_access_token) VALUES (1,'uid-1','facebook','fb-user-1','user-token');");
  return {
    sqlite,
    db: {
      prepare(sql) {
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async first() { return sqlite.prepare(sql).get(...args) || null; },
          async all() { return { results: sqlite.prepare(sql).all(...args) }; },
          async run() { return sqlite.prepare(sql).run(...args); }
        };
      },
      async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
    }
  };
}

test("Facebook page picker requests every Graph page and removes duplicates", async () => {
  const { db, sqlite } = database();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes("identitytoolkit")) return Response.json({ users: [{ localId: "uid-1", email: "one@example.com", emailVerified: true }] });
    if (href.includes("/me/accounts") && !href.includes("after=cursor-1")) {
      return Response.json({ data: [
        { id: "1", name: "One", access_token: "page-1" },
        { id: "2", name: "Two", access_token: "page-2" }
      ], paging: { next: "https://graph.facebook.com/v18.0/me/accounts?after=cursor-1" } });
    }
    if (href.includes("after=cursor-1")) {
      return Response.json({ data: [
        { id: "2", name: "Two", access_token: "page-2" },
        { id: "3", name: "Three", access_token: "page-3" }
      ] });
    }
    throw new Error(`Unexpected request ${href}`);
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/facebook/pages?folder_id=1&user_id=uid-1", { headers: { Authorization: "Bearer test" } }), { DB: db, FB_APP_SECRET: "test" });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.pages.map(page => page.name), ["One", "Two", "Three"]);
    assert.match(calls.find(url => url.includes("/me/accounts")), /limit=100/);
    assert.equal(calls.filter(url => url.includes("/me/accounts")).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("Facebook page picker recovers Pages from an earlier owner connection for the same Facebook profile", async () => {
  const { db, sqlite } = database();
  sqlite.exec("INSERT INTO folders (id,user_id,name) VALUES (2,'legacy@example.com','Older workspace'); INSERT INTO accounts (folder_id,user_id,platform,facebook_user_id,facebook_user_access_token) VALUES (2,'legacy@example.com','facebook','fb-user-1','older-token');");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("identitytoolkit")) return Response.json({ users: [{ localId: "uid-1", email: "one@example.com", emailVerified: true }] });
    if (href.includes("access_token=user-token")) return Response.json({ data: [{ id: "1", name: "Current Page", access_token: "page-1" }] });
    if (href.includes("access_token=older-token")) return Response.json({ data: [{ id: "2", name: "Earlier Page", access_token: "page-2" }] });
    throw new Error(`Unexpected request ${href}`);
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/facebook/pages?folder_id=1&user_id=uid-1", { headers: { Authorization: "Bearer test" } }), {
      DB: db, FB_APP_SECRET: "test", BILLING_OWNER_USER_IDS: "uid-1", BILLING_OWNER_EMAILS: "legacy@example.com"
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).pages.map(page => page.name), ["Current Page", "Earlier Page"]);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("Facebook page picker requires the signed-in workspace owner", async () => {
  const { db, sqlite } = database();
  try {
    const response = await worker.fetch(
      new Request("https://example.test/api/facebook/pages?folder_id=1&user_id=uid-1"),
      { DB: db, FB_APP_SECRET: "test" }
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).success, false);
  } finally {
    sqlite.close();
  }
});
