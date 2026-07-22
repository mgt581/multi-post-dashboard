import assert from "node:assert/strict";
import test from "node:test";

import {
  FACEBOOK_PAGE_LINK_SCOPE,
  FACEBOOK_PAGE_LINK_SCOPES
} from "../facebook-oauth.mjs";

test("Facebook linking requests only supported page-link permissions", () => {
  assert.deepEqual(FACEBOOK_PAGE_LINK_SCOPES, [
    "public_profile",
    "pages_show_list",
    "pages_manage_posts"
  ]);
  assert.equal(FACEBOOK_PAGE_LINK_SCOPE, "public_profile,pages_show_list,pages_manage_posts");
  assert.equal(FACEBOOK_PAGE_LINK_SCOPES.includes("pages_read_engagement"), false);
});
