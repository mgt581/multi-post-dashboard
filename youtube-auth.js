// =============================
// YouTube OAuth Config
// =============================
const YOUTUBE_CLIENT_ID =
  "72559136598-p0tbkiiit42vuronhcigtdru23vcktvj.apps.googleusercontent.com";

const YOUTUBE_REDIRECT_URI =
  "https://multipostapp.co.uk/api/auth/callback/youtube";

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
    "&response_type=code" +
    "&scope=" + encodeURIComponent(YOUTUBE_SCOPE) +
    "&access_type=offline" +
    "&include_granted_scopes=true" +
    "&prompt=" + encodeURIComponent("consent select_account") +
    "&state=" + encodeURIComponent("youtube");

  window.location.href = authUrl;
}
