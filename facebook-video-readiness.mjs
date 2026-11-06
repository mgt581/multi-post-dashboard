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
  const failed = [videoStatus, publishingStatus].some((value) => ["error", "failed", "failure"].includes(value));
  const videoMatches = Boolean(requestedVideoId) && String(video?.id || "") === requestedVideoId;
  const published = video?.published === true;
  const processingReady = ["ready", "published"].includes(videoStatus)
    || ["complete", "completed", "published"].includes(publishingStatus);
  const permalinkUrl = normalizeFacebookPermalink(video?.permalink_url);
  const permalinkReady = Boolean(permalinkUrl);

  return {
    // Graph can mark a Reel published before it supplies permalink_url.
    // The matching video id, published flag and completed processing phase
    // confirm the post without requiring its public link to be ready.
    ready: videoMatches && published && processingReady && !failed,
    failed: videoMatches && failed,
    published,
    processingReady,
    permalinkReady,
    permalinkUrl
  };
}
