import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTikTokPublishStatus } from "../tiktok-publish-status.mjs";

test("inbox delivery requires the user to finish the TikTok draft", () => {
  const result = evaluateTikTokPublishStatus({ status: "SEND_TO_USER_INBOX" });
  assert.equal(result.complete, false);
  assert.equal(result.requiresUserAction, true);
  assert.equal(result.publiclyAvailable, false);
});

test("private direct post is complete without claiming public availability", () => {
  const result = evaluateTikTokPublishStatus({ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [] });
  assert.equal(result.complete, true);
  assert.equal(result.publiclyAvailable, false);
  assert.equal(result.postId, "");
});

test("public direct post exposes the first publicly available post id", () => {
  const result = evaluateTikTokPublishStatus({
    status: "PUBLISH_COMPLETE",
    publicaly_available_post_id: ["123456789"]
  });
  assert.equal(result.complete, true);
  assert.equal(result.publiclyAvailable, true);
  assert.equal(result.postId, "123456789");
});

test("failed status is terminal", () => {
  const result = evaluateTikTokPublishStatus({ status: "FAILED" });
  assert.equal(result.failed, true);
  assert.equal(result.complete, false);
});
