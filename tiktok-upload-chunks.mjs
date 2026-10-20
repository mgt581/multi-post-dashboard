export const TIKTOK_MIN_CHUNK_SIZE = 5 * 1024 * 1024;
export const TIKTOK_DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;
export const TIKTOK_MAX_CHUNK_SIZE = 64 * 1024 * 1024;

function clampTikTokChunkSize(size) {
  return Math.min(
    TIKTOK_MAX_CHUNK_SIZE,
    Math.max(TIKTOK_MIN_CHUNK_SIZE, Number(size) || TIKTOK_MIN_CHUNK_SIZE)
  );
}

export function buildTikTokChunkProfiles(videoSize) {
  const size = Number(videoSize) || 0;
  if (size <= 0) return [];

  if (size < TIKTOK_MIN_CHUNK_SIZE) {
    return [{ chunkSize: size, totalChunks: 1 }];
  }

  const candidates = [
    clampTikTokChunkSize(size),
    clampTikTokChunkSize(TIKTOK_DEFAULT_CHUNK_SIZE),
    TIKTOK_MIN_CHUNK_SIZE
  ];

  return [...new Set(candidates)].filter((chunkSize) => chunkSize <= size).map((chunkSize) => ({
    chunkSize,
    // TikTok requires floor(video_size / chunk_size). The final request
    // includes the remainder and may be larger than chunk_size (up to 128MB).
    totalChunks: Math.max(1, Math.floor(size / chunkSize))
  }));
}
