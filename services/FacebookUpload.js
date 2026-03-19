import fs from "fs";
import fetch from "node-fetch";

// Path to your video file
const videoPath = "./my_video.mp4";

// Facebook Graph API upload endpoint (replace VIDEO_ID if you’re doing a direct upload)
const FACEBOOK_UPLOAD_INIT_URL = "https://graph.facebook.com/v17.0/VIDEO_ID?upload_phase=start";

// Your page/user access token
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

// Step 1: Get video size
const stats = fs.statSync(videoPath);
const videoSize = stats.size;
console.log("video_size:", videoSize);

// Step 2: Choose chunk size (1–8 MB recommended)
const chunkSize = 5 * 1024 * 1024; // 5MB

// Step 3: Calculate total chunks
const totalChunks = Math.ceil(videoSize / chunkSize);
console.log("total_chunks:", totalChunks);

// Step 4: Prepare chunk offsets
const chunks = [];
for (let i = 0; i < totalChunks; i++) {
  const start_offset = i * chunkSize;
  const end_offset = Math.min(start_offset + chunkSize, videoSize);

  chunks.push({
    start_offset,
    end_offset
  });
}

console.log("chunk offsets:", chunks);

// Step 5: Initialize upload with Facebook
(async () => {
  try {
    const initResponse = await fetch(FACEBOOK_UPLOAD_INIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_phase: "start",
        file_size: videoSize,
        access_token: ACCESS_TOKEN
      })
    });

    const initData = await initResponse.json();
    console.log("Facebook init response:", initData);

    // initData contains 'upload_session_id', which you'll use for chunk uploads
  } catch (err) {
    console.error("Facebook init request failed:", err);
  }
})();
