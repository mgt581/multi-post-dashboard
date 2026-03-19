import fs from "fs";
import fetch from "node-fetch";

export async function publishTikTok(videoPath, accessToken) {
  const stats = fs.statSync(videoPath);
  const videoSize = stats.size;
  const chunkSize = 10 * 1024 * 1024; // 10MB
  const totalChunkCount = Math.ceil(videoSize / chunkSize);

  // 1️⃣ Init upload
  const initPayload = {
    video_size: videoSize,
    chunk_size: chunkSize,
    total_chunk_count: totalChunkCount
  };

  const initRes = await fetch("https://open.tiktokapis.com/v1/video/upload/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify(initPayload)
  });
  const initData = await initRes.json();

  const uploadUrl = initData.upload_url; // TikTok will provide this for chunks
  const uploadId = initData.upload_id;

  // 2️⃣ Upload chunks sequentially
  for (let i = 0; i < totalChunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, videoSize);
    const chunk = fs.readFileSync(videoPath, { start, end });

    await fetch(`${uploadUrl}?upload_id=${uploadId}&chunk_index=${i}`, {
      method: "POST",
      body: chunk,
      headers: { "Content-Type": "application/octet-stream" }
    });
  }

  // 3️⃣ Finalize / publish
  const finalizeRes = await fetch(`https://open.tiktokapis.com/v1/video/upload/finish?upload_id=${uploadId}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}` }
  });

  return finalizeRes.json(); // returns published video info
}
