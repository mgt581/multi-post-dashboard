export function normalizeFacebookPermalink(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw, "https://www.facebook.com");
    const hostname = parsed.hostname.toLowerCase();
    const isFacebookHost = hostname === "facebook.com" || hostname.endsWith(".facebook.com");
    if (parsed.protocol !== "https:" || !isFacebookHost || parsed.pathname === "/") return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function evaluateFacebookVideoReadiness(videoId, video) {
  const requestedVideoId = String(videoId || "");
  const status = video?.status || {};
  const videoStatus = String(status.video_status || "").toLowerCase();
  const publishingStatus = String(status.publishing_phase?.status || "").toLowerCase();
  const videoMatches = Boolean(requestedVideoId) && String(video?.id || "") === requestedVideoId;
  const processingReady = ["ready", "published"].includes(videoStatus)
    || ["complete", "completed", "published"].includes(publishingStatus);
  const permalinkUrl = normalizeFacebookPermalink(video?.permalink_url);
  const permalinkReady = Boolean(permalinkUrl);

  return {
    ready: videoMatches && processingReady && permalinkReady,
    processingReady,
    permalinkReady,
    permalinkUrl
  };
}
