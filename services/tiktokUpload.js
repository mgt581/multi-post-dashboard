import fs from "fs";
import fetch from "node-fetch"; // or your preferred HTTP client

// Path to your video file
const videoPath = "./my_video.mp4";

// TikTok API endpoint for initializing the upload
const TIKTOK_UPLOAD_INIT_URL = "https://open.tiktokapis.com/v1/video/upload/init";

// Step 1: Get video size
const stats = fs.statSync(videoPath);
const videoSize = stats.size; // in bytes

// Step 2: Choose chunk size (min 5MB, max ~10MB recommended)
const chunkSize = 10 * 1024 * 1024; // 10MB

// Step 3: Calculate total chunks
const totalChunkCount = Math.ceil(videoSize / chunkSize);

console.log("video_size:", videoSize);
console.log("chunk_size:", chunkSize);
console.log("total_chunk_count:", totalChunkCount);

// Step 4: Prepare your init payload
const initPayload = {
  video_size: videoSize,
  chunk_size: chunkSize,
  total_chunk_count: totalChunkCount,
  // include any other required TikTok fields here, like access_token
};

// Step 5: Send the init request to TikTok
(async () => {
  try {
    const response = await fetch(TIKTOK_UPLOAD_INIT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`
      },
      body: JSON.stringify(initPayload)
    });

    const data = await response.json();
    console.log("TikTok init response:", data);
  } catch (err) {
    console.error("TikTok init request failed:", err);
  }
})();
