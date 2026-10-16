import assert from "node:assert/strict";
import test from "node:test";

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
  const response = await worker.fetch(
    new Request("https://example.test/api/auth/facebook?folder_id=1&user_id=uid-1&refresh=1"),
    { FB_CLIENT_ID: "app-id", FB_CLIENT_SECRET: "secret", FRONTEND_URL: "https://example.test" }
  );
  const destination = new URL(response.headers.get("Location"));
  assert.equal(destination.searchParams.get("auth_type"), "rerequest");
  assert.equal(destination.searchParams.get("scope"), FACEBOOK_PAGE_LINK_SCOPE);
});
