import test from "node:test";
import assert from "node:assert/strict";

import {
  getTikTokPrivacyLabel,
  normalizeTikTokCreatorInfo,
  normalizeTikTokPublishStatus
} from "./tiktok-publish.mjs";

test("normalizes creator info and supported privacy choices", () => {
  assert.deepEqual(normalizeTikTokCreatorInfo({
    creator_username: "@alex.test",
    creator_nickname: "Alex Test",
    privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE", "UNKNOWN"],
    comment_disabled: true,
    max_video_post_duration_sec: 180
  }), {
    username: "alex.test",
    nickname: "Alex Test",
    profileUrl: "https://www.tiktok.com/@alex.test",
    privacyLevelOptions: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"],
    commentDisabled: true,
    duetDisabled: false,
    stitchDisabled: false,
    maxVideoDurationSec: 180
  });
  assert.equal(getTikTokPrivacyLabel("SELF_ONLY"), "🔒 Private");
});

test("uses a direct video URL for publicly available posts", () => {
  assert.deepEqual(normalizeTikTokPublishStatus({
    status: "PUBLISH_COMPLETE",
    publicaly_available_post_id: [748123456789],
    uploaded_bytes: 1234
  }, "alex.test"), {
    status: "PUBLISH_COMPLETE",
    complete: true,
    failed: false,
    failReason: "",
    uploadedBytes: 1234,
    postIds: ["748123456789"],
    viewUrl: "https://www.tiktok.com/@alex.test/video/748123456789"
  });
});

test("uses the creator profile for completed private posts", () => {
  const result = normalizeTikTokPublishStatus({
    status: "PUBLISH_COMPLETE",
    publicaly_available_post_id: []
  }, "private.creator");

  assert.equal(result.complete, true);
  assert.equal(result.viewUrl, "https://www.tiktok.com/@private.creator");
});

