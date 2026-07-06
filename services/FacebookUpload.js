import fs from "fs";
import fetch from "node-fetch";

const FB_GRAPH_API_VERSION = "v25.0";
const FB_GRAPH_BASE_URL = `https://graph.facebook.com/${FB_GRAPH_API_VERSION}`;

export async function publishFacebook(videoPath, accessToken, pageId) {
  const stats = fs.statSync(videoPath);
  const videoSize = stats.size;
  const chunkSize = 5 * 1024 * 1024; // 5MB
  const totalChunks = Math.ceil(videoSize / chunkSize);

  // 1️⃣ Init upload
  const initRes = await fetch(`${FB_GRAPH_BASE_URL}/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      upload_phase: "start",
      file_size: videoSize,
      access_token: accessToken
    })
  });
  const initData = await initRes.json();
  const uploadSessionId = initData.upload_session_id;

  // 2️⃣ Upload chunks
  for (let i = 0; i < totalChunks; i++) {
    const start_offset = i * chunkSize;
    const end_offset = Math.min(start_offset + chunkSize, videoSize);
    const chunk = fs.readFileSync(videoPath, { start: start_offset, end: end_offset });

    await fetch(`${FB_GRAPH_BASE_URL}/${pageId}/videos`, {
      method: "POST",
      body: JSON.stringify({
        upload_phase: "transfer",
        start_offset,
        upload_session_id: uploadSessionId,
        video_file_chunk: chunk.toString("base64"),
        access_token: accessToken
      }),
      headers: { "Content-Type": "application/json" }
    });
  }

  // 3️⃣ Finish upload / publish
  const finishRes = await fetch(`${FB_GRAPH_BASE_URL}/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      upload_phase: "finish",
      upload_session_id: uploadSessionId,
      access_token: accessToken
    })
  });

  return finishRes.json(); // published video info
}
