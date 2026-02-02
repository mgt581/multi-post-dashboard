// =============================
// YouTube OAuth Config
// =============================
const YOUTUBE_CLIENT_ID = "PASTE_YOUR_CLIENT_ID_HERE";
const YOUTUBE_REDIRECT_URI = "PASTE_YOUR_REDIRECT_URI_HERE";

const YOUTUBE_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload";

// =============================
// Start OAuth Flow
// =============================
function connectYouTube() {
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    "?client_id=" + encodeURIComponent(YOUTUBE_CLIENT_ID) +
    "&redirect_uri=" + encodeURIComponent(YOUTUBE_REDIRECT_URI) +
    "&response_type=token" +
    "&scope=" + encodeURIComponent(YOUTUBE_SCOPE) +
    "&include_granted_scopes=true" +
    "&state=youtube";

  window.location.href = authUrl;
}