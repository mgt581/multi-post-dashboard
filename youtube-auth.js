// =============================
// YouTube OAuth Config
// =============================
// YOUTUBE_CLIENT_ID is fetched at runtime from /api/config so that the
// credential is never committed to version control.

const YOUTUBE_REDIRECT_URI =
  "https://multipostapp.co.uk/api/auth/callback/youtube";

const YOUTUBE_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload";

// =============================
// Start OAuth Flow
// =============================
async function connectYouTube() {
  let youtubeClientId;
  try {
    const res = await fetch("/api/config");
    if (!res.ok) {
      console.error(`Failed to fetch YouTube configuration: HTTP ${res.status}`);
      return;
    }
    const cfg = await res.json();
    youtubeClientId = cfg.youtubeClientId;
  } catch (e) {
    console.error("Failed to load YouTube client config:", e);
    return;
  }
  if (!youtubeClientId) {
    console.error("YouTube client ID is not configured on the server.");
    return;
  }

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    "?client_id=" + encodeURIComponent(youtubeClientId) +
    "&redirect_uri=" + encodeURIComponent(YOUTUBE_REDIRECT_URI) +
    "&response_type=code" +
    "&scope=" + encodeURIComponent(YOUTUBE_SCOPE) +
    "&access_type=offline" +
    "&include_granted_scopes=true" +
    "&prompt=" + encodeURIComponent("consent select_account") +
    "&state=" + encodeURIComponent("youtube");

  window.location.href = authUrl;
}
