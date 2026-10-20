export function evaluateTikTokPublishStatus(data = {}) {
  const status = String(data.status || data.publish_status || "").toUpperCase();
  const rawPostIds = data.publicaly_available_post_id
    ?? data.publicly_available_post_id
    ?? data.post_id
    ?? data.video_id
    ?? [];
  const postIds = (Array.isArray(rawPostIds) ? rawPostIds : [rawPostIds])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const failed = ["FAILED", "PUBLISH_FAILED"].includes(status);
  const requiresUserAction = status === "SEND_TO_USER_INBOX";
  const complete = status === "PUBLISH_COMPLETE";
  const publiclyAvailable = complete && postIds.length > 0;

  return {
    status,
    failed,
    requiresUserAction,
    complete,
    publiclyAvailable,
    postIds,
    postId: postIds[0] || ""
  };
}
