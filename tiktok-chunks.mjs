const TIKTOK_MIN_CHUNK_BYTES = 5_000_000;
const TIKTOK_MAX_CHUNK_BYTES = 64_000_000;
const TIKTOK_MAX_CHUNKS = 1_000;

export function createTikTokChunkPlan(videoSize) {
  if (!Number.isSafeInteger(videoSize) || videoSize <= 0) {
    throw new TypeError("TikTok video size must be a positive integer");
  }

  if (videoSize <= TIKTOK_MAX_CHUNK_BYTES) {
    return { chunkSize: videoSize, totalChunks: 1 };
  }

  const totalChunks = Math.ceil(videoSize / TIKTOK_MAX_CHUNK_BYTES);
  if (totalChunks > TIKTOK_MAX_CHUNKS) {
    throw new RangeError("TikTok upload requires more than 1,000 chunks");
  }

  const chunkSize = Math.floor(videoSize / totalChunks);
  if (chunkSize < TIKTOK_MIN_CHUNK_BYTES || chunkSize > TIKTOK_MAX_CHUNK_BYTES) {
    throw new RangeError("TikTok chunk size is outside the supported 5–64 MB range");
  }

  // TikTok defines total_chunk_count as floor(video_size / chunk_size).
  const calculatedChunks = Math.floor(videoSize / chunkSize);
  if (calculatedChunks !== totalChunks) {
    throw new RangeError("TikTok chunk plan is internally inconsistent");
  }

  const finalChunkSize = videoSize - chunkSize * (totalChunks - 1);
  if (finalChunkSize < TIKTOK_MIN_CHUNK_BYTES || finalChunkSize > TIKTOK_MAX_CHUNK_BYTES) {
    throw new RangeError("TikTok final chunk is outside the supported 5–64 MB range");
  }

  return { chunkSize, totalChunks };
}

