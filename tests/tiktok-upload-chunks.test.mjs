import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTikTokChunkProfiles,
  TIKTOK_MAX_CHUNK_SIZE,
  TIKTOK_MIN_CHUNK_SIZE
} from "../tiktok-upload-chunks.mjs";

test("uses TikTok's floor rule for the reported 143.1MB upload", () => {
  const videoSize = 150_051_225;
  assert.deepEqual(buildTikTokChunkProfiles(videoSize), [
    { chunkSize: 67_108_864, totalChunks: 2 },
    { chunkSize: 10_485_760, totalChunks: 14 },
    { chunkSize: 5_242_880, totalChunks: 28 }
  ]);
});

test("uploads videos under 5MB as one whole chunk", () => {
  const videoSize = 4_194_304;
  assert.deepEqual(buildTikTokChunkProfiles(videoSize), [
    { chunkSize: videoSize, totalChunks: 1 }
  ]);
});

test("keeps normal files within TikTok chunk limits", () => {
  const videoSize = 50_000_123;
  const profiles = buildTikTokChunkProfiles(videoSize);
  assert.equal(profiles[0].chunkSize, videoSize);
  assert.equal(profiles[0].totalChunks, 1);
  for (const profile of profiles) {
    assert.ok(profile.chunkSize >= TIKTOK_MIN_CHUNK_SIZE);
    assert.ok(profile.chunkSize <= TIKTOK_MAX_CHUNK_SIZE);
    assert.equal(profile.totalChunks, Math.max(1, Math.floor(videoSize / profile.chunkSize)));
  }
});
