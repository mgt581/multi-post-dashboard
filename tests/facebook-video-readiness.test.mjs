import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateFacebookVideoReadiness,
  normalizeFacebookPermalink
} from "../facebook-video-readiness.mjs";

test("does not expose a URL when processing completes before a permalink exists", () => {
  const result = evaluateFacebookVideoReadiness("video-123", {
    id: "video-123",
    status: { video_status: "ready" }
  });

  assert.equal(result.processingReady, true);
  assert.equal(result.permalinkReady, false);
  assert.equal(result.ready, false);
  assert.equal(result.permalinkUrl, "");
});

test("requires the returned Graph object to match the uploaded video", () => {
  const result = evaluateFacebookVideoReadiness("video-123", {
    id: "another-video",
    status: { video_status: "published" },
    permalink_url: "https://www.facebook.com/reel/video-123/"
  });

  assert.equal(result.ready, false);
});

test("rejects generic and non-Facebook destinations", () => {
  assert.equal(normalizeFacebookPermalink("https://www.facebook.com/"), "");
  assert.equal(normalizeFacebookPermalink("https://example.com/reel/video-123"), "");
  assert.equal(normalizeFacebookPermalink("http://www.facebook.com/reel/video-123"), "");
});

test("normalizes a relative Facebook permalink", () => {
  assert.equal(
    normalizeFacebookPermalink("/reel/video-123/#comments"),
    "https://www.facebook.com/reel/video-123/"
  );
});

test("returns the canonical permalink only for the matching published video", () => {
  const result = evaluateFacebookVideoReadiness("video-123", {
    id: "video-123",
    status: { publishing_phase: { status: "complete" } },
    permalink_url: "https://www.facebook.com/reel/video-123/"
  });

  assert.deepEqual(result, {
    ready: true,
    processingReady: true,
    permalinkReady: true,
    permalinkUrl: "https://www.facebook.com/reel/video-123/"
  });
});
