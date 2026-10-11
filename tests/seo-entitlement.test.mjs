import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

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
  try {
    const env = {
      WEB_BILLING_ENABLED: "true",
      DB: makeDb({
        user_id: "customer@example.com",
        user_email: "customer@example.com",
        subscription_status: "active",
        current_period_end: Math.floor(Date.now() / 1000) + 3600
      })
    };
    const response = await worker.fetch(seoRequest("customer@example.com", "Bearer valid-token"), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.youtube.title);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the configured owner keeps a verified server-side SEO bypass", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ users: [{ localId: "owner-uid", email: "alexbryant3234@gmail.com" }] }), { status: 200 });
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
