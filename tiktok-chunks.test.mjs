import test from "node:test";
import assert from "node:assert/strict";

import { createTikTokChunkPlan } from "./tiktok-chunks.mjs";

test("uploads videos up to 64 MB as one complete chunk", () => {
  assert.deepEqual(createTikTokChunkPlan(4_194_304), {
    chunkSize: 4_194_304,
    totalChunks: 1
  });
  assert.deepEqual(createTikTokChunkPlan(64_000_000), {
    chunkSize: 64_000_000,
    totalChunks: 1
  });
});

test("splits videos over 64 MB into balanced valid chunks", () => {
  const videoSize = 269_903_076;
  const plan = createTikTokChunkPlan(videoSize);

  assert.deepEqual(plan, {
    chunkSize: 53_980_615,
    totalChunks: 5
  });
  assert.equal(Math.floor(videoSize / plan.chunkSize), plan.totalChunks);

  const finalChunkSize = videoSize - plan.chunkSize * (plan.totalChunks - 1);
  assert.ok(finalChunkSize >= 5_000_000);
  assert.ok(finalChunkSize <= 64_000_000);
});

test("rejects invalid video sizes", () => {
  assert.throws(() => createTikTokChunkPlan(0), /positive integer/);
  assert.throws(() => createTikTokChunkPlan(Number.NaN), /positive integer/);
  assert.throws(() => createTikTokChunkPlan(1.5), /positive integer/);
});

