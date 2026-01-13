<!DOCTYPE html> 
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Create Post</title>

  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #eef7fb;
      margin: 0;
      padding: 0;
    }

    .app {
      padding: 20px;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      background: #e8f5fb;
      border-bottom: 2px solid #9fd3ea;
      position: sticky;
      top: 0;
    }

    .header a {
      text-decoration: none;
      font-size: 20px;
      color: #333;
    }

    .header .title {
      font-weight: 700;
      font-size: 18px;
    }

    /* Cards */
    .card {
      background: #e8f5fb;
      border: 2px solid #9fd3ea;
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .section-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    textarea, input {
      width: 100%;
      padding: 12px;
      border-radius: 10px;
      border: 2px solid #9fd3ea;
      font-size: 16px;
      box-sizing: border-box;
      margin-bottom: 8px;
    }

    textarea {
      min-height: 90px;
    }

    .btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
    <div id="fileInfo" class="file-info"></div>
  </div>

  <!-- PROMPT -->
  <div class="card">
    <div class="section-title">Describe your content</div>
    <textarea
      id="videoPrompt"
      placeholder="Describe what happens in the video, the vibe, the audience, and the goal…"></textarea>
  </div>

  <!-- GENERATE SEO -->
  <div class="card">
    <button class="btn" id="generateBtn">
      ✨ Generate SEO
      <span>›</span>
    </button>
  </div>

  <!-- YOUTUBE -->
  <div class="card">
    <div class="section-title">YouTube</div>
    <input id="ytTitle" placeholder="YouTube title" />
    <textarea id="ytDescription" placeholder="YouTube description"></textarea>
    <input id="ytHashtags" placeholder="#hashtags" />
    <button class="btn secondary" onclick="openYouTubeStudio()">🚀 Upload to YouTube</button>
  </div>

  <!-- TIKTOK -->
  <div class="card">
    <div class="section-title">TikTok</div>
    <textarea id="ttCaption" placeholder="TikTok caption"></textarea>
    <input id="ttHashtags" placeholder="#hashtags" />
  </div>

  <!-- INSTAGRAM -->
  <div class="card">
    <div class="section-title">Instagram</div>
    <textarea id="igCaption" placeholder="Instagram caption"></textarea>
    <input id="igHashtags" placeholder="#hashtags" />
  </div>

</div>

<script>
/* File info */
document.getElementById("videoFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("fileInfo").innerText =
    `Selected: ${file.name} (${Math.round(file.size / 1024 / 1024)} MB)`;
});

/* SEO generator */
async function generateSEO() {
  const prompt = document.getElementById("videoPrompt").value.trim();
  if (!prompt) {
    alert("Please describe your video first.");
    return;
  }

  const btn = document.getElementById("generateBtn");
  btn.classList.add("loading");
  btn.innerText = "Generating…";

  try {
    const res = await fetch(
      "https://multipostapp.co.uk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      }
    );

    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Worker failed");

    const d = json.data;

    ytTitle.value = d.youtube.title;
    ytDescription.value = d.youtube.description;
    ytHashtags.value = d.youtube.hashtags;

    ttCaption.value = d.tiktok.caption;
    ttHashtags.value = d.tiktok.hashtags;

    igCaption.value = d.instagram.caption;
    igHashtags.value = d.instagram.hashtags;

  } catch (err) {
    console.error(err);
    alert("Generation failed — check console.");
  }

  btn.classList.remove("loading");
  btn.innerHTML = "✨ Generate SEO <span>›</span>";
}

/* YouTube handoff */
function openYouTubeStudio() {
  const title = ytTitle.value;
  const desc = ytDescription.value;

  if (!title || !desc) {
    alert("Generate SEO first.");
    return;
  }

  navigator.clipboard.writeText(
    `TITLE:\n${title}\n\nDESCRIPTION:\n${desc}\n\nTAGS:\n${ytHashtags.value}`
  );

  window.open("https://studio.youtube.com/channel/UPLOAD", "_blank");
}

generateBtn.addEventListener("click", generateSEO);
</script>

</body>
</html>
