import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

import {
  FACEBOOK_PAGE_LINK_SCOPE,
  FACEBOOK_PAGE_LINK_SCOPES
} from "../facebook-oauth.mjs";
import worker from "../worker.js";

test("Facebook linking requests only supported page-link permissions", () => {
  assert.deepEqual(FACEBOOK_PAGE_LINK_SCOPES, [
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "business_management"
  ]);
  assert.equal(
    FACEBOOK_PAGE_LINK_SCOPE,
    "public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,business_management"
  );
});

test("Facebook reconnect asks the provider to re-check page permissions", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: "uid-1", emailVerified: true }] });
  let response;
  try {
    response = await worker.fetch(
      new Request("https://example.test/api/auth/facebook", {
        method: "POST", headers: { Authorization: "Bearer firebase-token", "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: "1", user_id: "uid-1", refresh: true })
      }),
      { FB_CLIENT_ID: "app-id", FB_CLIENT_SECRET: "secret", FRONTEND_URL: "https://example.test",
        DB: { prepare: sql => ({ bind() { return this; }, async first() { return sql.includes("FROM folders") ? { id: 1, user_id: "uid-1" } : null; } }) } }
    );
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(response.status, 200);
  const destination = new URL((await response.json()).url);
  assert.equal(destination.searchParams.get("auth_type"), "rerequest");
  assert.equal(destination.searchParams.get("scope"), FACEBOOK_PAGE_LINK_SCOPE);
  const state = destination.searchParams.get("state");
  const goodCallback = await worker.fetch(new Request(`https://example.test/api/auth/callback/facebook?state=${encodeURIComponent(state)}`),
    { FB_CLIENT_SECRET: "secret", FRONTEND_URL: "https://example.test" });
  assert.match((await goodCallback.json()).error, /missing_code/);
  const [payload, mac] = state.split('.');
  const altered = `${payload}.${mac[0] === 'A' ? 'B' : 'A'}${mac.slice(1)}`;
  const forgedCallback = await worker.fetch(new Request(`https://example.test/api/auth/callback/facebook?state=${encodeURIComponent(altered)}`),
    { FB_CLIENT_SECRET: "secret", FRONTEND_URL: "https://example.test" });
  assert.match((await forgedCallback.json()).error, /Missing state/);
});

test("YouTube linking returns an account-selection URL only after Firebase authentication", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ users: [{ localId: "uid-1", emailVerified: true }] });
  try {
    const env = { GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: "google-secret", FRONTEND_URL: "https://example.test",
      DB: { prepare: sql => ({ bind() { return this; }, async first() { return sql.includes("FROM folders") ? { id: 1, user_id: "uid-1" } : null; } }) } };
    const response = await worker.fetch(new Request("https://example.test/api/auth/youtube", {
      method: "POST", headers: { Authorization: "Bearer firebase-token", "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: "1", user_id: "uid-1" })
    }), env);
    assert.equal(response.status, 200);
    const destination = new URL((await response.json()).url);
    assert.equal(destination.hostname, "accounts.google.com");
    assert.equal(destination.searchParams.get("prompt"), "consent select_account");
    const state = destination.searchParams.get("state");
    const [payload, mac] = state.split('.');
    const forged = `${payload}.${mac[0] === 'A' ? 'B' : 'A'}${mac.slice(1)}`;
    const rejected = await worker.fetch(new Request(`https://example.test/api/auth/callback/youtube?state=${encodeURIComponent(forged)}`), env);
    assert.match((await rejected.json()).error, /Missing state/);
    const stalePayload = btoa(JSON.stringify({ folderId: '1', userId: 'uid-1', platform: 'youtube', nonce: 'old', expiresAt: Math.floor(Date.now() / 1000) - 1 }));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('google-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const staleMac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stalePayload));
    const oldState = `${stalePayload}.${btoa(String.fromCharCode(...new Uint8Array(staleMac))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
    const expired = await worker.fetch(new Request(`https://example.test/api/auth/callback/youtube?state=${encodeURIComponent(oldState)}`), env);
    assert.match((await expired.json()).error, /Missing state/);
    const unsigned = await worker.fetch(new Request("https://example.test/api/auth/youtube", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: "1", user_id: "uid-1" })
    }), env);
    assert.equal(unsigned.status, 401);
  } finally { globalThis.fetch = originalFetch; }
});
