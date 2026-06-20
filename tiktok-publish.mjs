const PRIVACY_LABELS = {
  SELF_ONLY: "🔒 Private",
  MUTUAL_FOLLOW_FRIENDS: "👥 Friends",
  FOLLOWER_OF_CREATOR: "👤 Followers",
  PUBLIC_TO_EVERYONE: "🌐 Public"
};

export function normalizeTikTokCreatorInfo(data = {}) {
  const username = String(data.creator_username || "").trim().replace(/^@+/, "");
  const privacyLevelOptions = Array.isArray(data.privacy_level_options)
    ? data.privacy_level_options.filter((value) => PRIVACY_LABELS[value])
    : [];

  return {
    username,
    nickname: String(data.creator_nickname || "").trim(),
    profileUrl: username ? `https://www.tiktok.com/@${encodeURIComponent(username)}` : "https://www.tiktok.com/",
    privacyLevelOptions,
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
    maxVideoDurationSec: Math.max(0, Number(data.max_video_post_duration_sec) || 0)
  };
}

export function getTikTokPrivacyLabel(value) {
  return PRIVACY_LABELS[value] || value;
}

export function normalizeTikTokPublishStatus(data = {}, creatorUsername = "") {
  const status = String(data.status || "").trim().toUpperCase();
  const postIds = Array.isArray(data.publicaly_available_post_id)
    ? data.publicaly_available_post_id.map(String).filter(Boolean)
    : [];
  const username = String(creatorUsername || "").trim().replace(/^@+/, "");
  const profileUrl = username ? `https://www.tiktok.com/@${encodeURIComponent(username)}` : "https://www.tiktok.com/";

  return {
    status,
    complete: status === "PUBLISH_COMPLETE",
    failed: status === "FAILED",
    failReason: String(data.fail_reason || "").trim(),
    uploadedBytes: Math.max(0, Number(data.uploaded_bytes) || 0),
    postIds,
    viewUrl: postIds[0] && username
      ? `${profileUrl}/video/${encodeURIComponent(postIds[0])}`
      : profileUrl
  };
}

