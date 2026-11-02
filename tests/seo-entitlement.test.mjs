import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

function makeDb(row) {
  return {
    prepare() {
      return {
        bind() { return this; },
        async first() { return row; },
        async all() { return { results: [] }; },
        async run() { return { success: true }; }
      };
    }
  };
}

function seoRequest(userId, authorization = "") {
  const headers = { "Content-Type": "application/json", client_platform: "android" };
  if (authorization) headers.Authorization = authorization;
  return new Request("https://example.test/api/generate-premium-seo", {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: userId, topic: "FIFA Street 2 PS2 gameplay" })
  });
}

test("direct SEO requests without Firebase authentication are rejected", async () => {
  const env = { WEB_BILLING_ENABLED: "true", DB: makeDb({ user_id: "customer@example.com", subscription_status: "active" }) };
  const response = await worker.fetch(seoRequest("customer@example.com"), env);
  assert.equal(response.status, 401);
});

test("spoofing the Android platform cannot bypass SEO billing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ users: [{ localId: "uid-1", email: "customer@example.com" }] }), { status: 200 });
  try {
    const env = { WEB_BILLING_ENABLED: "true", DB: makeDb({ user_id: "customer@example.com", user_email: "customer@example.com", subscription_status: "inactive" }) };
    const response = await worker.fetch(seoRequest("customer@example.com", "Bearer valid-token"), env);
    assert.equal(response.status, 402);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an authenticated active subscriber can generate SEO", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ users: [{ localId: "uid-1", email: "customer@example.com" }] }), { status: 200 });
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0009_play_subscriptions.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0010_play_trial_phase.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0011_usage_workspace_entitlements.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0012_publication_reservations.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0013_workspace_item_entitlements.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO billing_subscriptions (user_id,user_email,subscription_status,current_period_end) VALUES (?,?,?,?)')
    .run('customer@example.com','customer@example.com','active',Math.floor(Date.now() / 1000) + 3600);
  try {
    const env = {
      WEB_BILLING_ENABLED: "true",
      DB: { prepare(sql) { let args = []; return {
        bind(...values) { args = values; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { return db.prepare(sql).run(...args); }
      }; } }
    };
    const response = await worker.fetch(seoRequest("customer@example.com", "Bearer valid-token"), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.youtube.title);
  } finally {
    db.close();
    globalThis.fetch = originalFetch;
  }
});

test("the configured owner keeps a verified server-side SEO bypass", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ users: [{ localId: "owner-uid", email: "alexbryant3234@gmail.com", emailVerified: true }] }), { status: 200 });
  try {
    const env = {
      WEB_BILLING_ENABLED: "true",
      BILLING_OWNER_EMAILS: "alexbryant3234@gmail.com",
      DB: makeDb({ user_id: "alexbryant3234@gmail.com", user_email: "alexbryant3234@gmail.com", subscription_status: "inactive" })
    };
    const response = await worker.fetch(seoRequest("alexbryant3234@gmail.com", "Bearer valid-owner-token"), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unverified email cannot claim owner access", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: "unverified-uid", email: "alexbryant3234@gmail.com", emailVerified: false }] });
  try {
    const env = {
      WEB_BILLING_ENABLED: "true",
      BILLING_OWNER_EMAILS: "alexbryant3234@gmail.com",
      DB: makeDb({ user_id: "unverified-uid", subscription_status: "inactive" })
    };
    const response = await worker.fetch(seoRequest("unverified-uid", "Bearer unverified-token"), env);
    assert.equal(response.status, 402);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
