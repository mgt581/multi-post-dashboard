import { beginTikTokLink, consumeTikTokLink, saveTikTokConnection, tikTokPublishingAccount, disconnectTikTok, tikTokLinkCookie, matchesIdentity, ownedFolder } from "./tiktok-connections.mjs";
import { evaluateFacebookVideoReadiness } from "./facebook-video-readiness.mjs";
import { evaluateTikTokPublishStatus } from "./tiktok-publish-status.mjs";
import { buildTikTokChunkProfiles } from "./tiktok-upload-chunks.mjs";
import { FACEBOOK_PAGE_LINK_SCOPE } from "./facebook-oauth.mjs";
import { generateSeo, normalizeSeoInput } from "./services/seoEngine.mjs";
import { verifyPlayPurchase, sha256Hex, encryptPurchaseToken, decryptPurchaseToken } from "./play-subscriptions.mjs";
import { reconcilePendingPublications } from "./publication-reconciliation.mjs";
import { createAndroidOAuthHandoff, consumeAndroidOAuthHandoff, androidOAuthReturn } from "./android-oauth.mjs";

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var hasSeoContent = /* @__PURE__ */ __name((data) => Boolean(
  data?.youtube?.title ||
  data?.youtube?.description ||
  data?.youtube?.keywords ||
  data?.tiktok?.allInOne ||
  data?.facebook?.title ||
  data?.facebook?.descriptionAndTags
), "hasSeoContent");
var makeDeterministicSeoFallback = /* @__PURE__ */ __name((promptText) => {
  const idea = String(promptText || "viral short video").trim() || "viral short video";
  const words = idea.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean).filter((word) => word.length > 2);
  const keywords = [...new Set([...words.slice(0, 10), "viral", "trending", "shorts", "reels", "fyp", "social media", "marketing"])].join(", ");
  const titleBase = idea.length > 56 ? `${idea.slice(0, 56)}...` : idea;
  return {
    youtube: {
      title: `${titleBase} | Must Watch`,
      description: `Discover ${idea} with optimized copy crafted for reach and engagement. Share, comment and follow for more high-performing content ideas.`,
      keywords
    },
    tiktok: { allInOne: `${idea} 🚀 #fyp #foryoupage #viral #trending #socialmedia` },
    facebook: {
      title: `${titleBase} | Growth Tips`,
      descriptionAndTags: `Boost your reach with this ${idea} content strategy.\n\n#marketing #socialmedia #facebook #business #growth`
    }
  };
}, "makeDeterministicSeoFallback");

// worker.js
var WORKER_VERSION = "2026-10-20-tiktok-chunk-count";
var worker_default = {
  async scheduled(_event, env) {
    await reconcilePendingPublications(env);
  },
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, folder_id, user_id, client_platform",
      "Access-Control-Expose-Headers": "X-Workspace-Owner",
      "X-Worker-Version": WORKER_VERSION
    };
    const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    const siteBaseUrl = env.BASE_URL || "https://multipostapp.co.uk";
    const frontendBaseUrl = env.FRONTEND_URL || siteBaseUrl;
    const tiktokAuthBaseUrl = String(env.TIKTOK_AUTH_BASE_URL || "https://www.tiktok.com").replace(/\/+$/, "");
    const tiktokApiBaseUrl = String(env.TIKTOK_API_BASE_URL || "https://open.tiktokapis.com").replace(/\/+$/, "");
    if (url.pathname === "/api" || url.pathname === "/api/" || url.pathname === "/api/health") {
      return new Response(JSON.stringify({
        ok: true,
        service: "multipost-worker",
        version: WORKER_VERSION,
        configured: { facebookAppSecret: Boolean(env.FB_CLIENT_SECRET) }
      }), {
        status: 200,
        headers: jsonHeaders
      });
    }
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(JSON.stringify({ ok: true, service: "multipost-worker", version: WORKER_VERSION }), {
        status: 200,
        headers: jsonHeaders
      });
    }
    const requireUser = /* @__PURE__ */ __name((val) => val && typeof val === "string" && val.trim() ? val.trim() : null, "requireUser");
    const normalizeUserId = /* @__PURE__ */ __name((val) => String(val || "").trim().toLowerCase(), "normalizeUserId");
    const splitEnvList = /* @__PURE__ */ __name((val) => String(val || "").split(",").map((item) => item.trim()).filter(Boolean), "splitEnvList");
    const getOwnerUserAliases = /* @__PURE__ */ __name(() => [...new Set([
      ...splitEnvList(env.BILLING_OWNER_USER_IDS),
      ...splitEnvList(env.BILLING_OWNER_EMAILS),
      ...splitEnvList(env.OWNER_USER_IDS),
      ...splitEnvList(env.OWNER_EMAILS)
    ])], "getOwnerUserAliases");
    const getStaticUserAliases = /* @__PURE__ */ __name((userId) => {
      const requested = requireUser(userId);
      if (!requested) return [];
      const ownerAliases = getOwnerUserAliases();
      const isOwnerAlias = ownerAliases.some((alias) => normalizeUserId(alias) === normalizeUserId(requested));
      return isOwnerAlias ? [...new Set([requested, ...ownerAliases])] : [requested];
    }, "getStaticUserAliases");
    const getUserAliases = /* @__PURE__ */ __name(async (userId, userEmail = "") => {
      const requested = requireUser(userId);
      if (!requested) return [];
      const aliases = getStaticUserAliases(requested);
      const ownerAliases = getOwnerUserAliases();
      const requestedEmail = String(userEmail || "").trim();
      const requestedEmailIsOwner = requestedEmail && ownerAliases.some((alias) => normalizeUserId(alias) === normalizeUserId(requestedEmail));
      let row = null;
      try {
        row = await env.DB.prepare("SELECT user_email FROM billing_subscriptions WHERE user_id = ? LIMIT 1").bind(requested).first();
      } catch (_) {
        row = null;
      }
      const rowEmail = String(row?.user_email || "").trim();
      const rowEmailIsOwner = rowEmail && ownerAliases.some((alias) => normalizeUserId(alias) === normalizeUserId(rowEmail));
      if (requestedEmailIsOwner || rowEmailIsOwner) {
        aliases.push(...ownerAliases);
        const ownerEmailsForLookup = splitEnvList(env.BILLING_OWNER_EMAILS || env.OWNER_EMAILS || "");
        for (const ownerEmail of ownerEmailsForLookup) {
          try {
            const { results } = await env.DB.prepare("SELECT user_id FROM billing_subscriptions WHERE lower(user_email) = lower(?)").bind(ownerEmail).all();
            aliases.push(...(results || []).map((item) => item.user_id).filter(Boolean));
          } catch (_) {
          }
        }
      }
      return [...new Set(aliases.filter(Boolean))];
    }, "getUserAliases");
    const sqlPlaceholders = /* @__PURE__ */ __name((items) => items.map(() => "?").join(","), "sqlPlaceholders");
    const redirectUri = `${siteBaseUrl}/api/auth/callback/youtube`;
    const fbRedirectUri = `${siteBaseUrl}/api/auth/callback/facebook`;
    const tiktokLoginRedirectUri = `${siteBaseUrl}/api/auth/callback/tiktok`;
    const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;
    const MAX_FACEBOOK_VIDEO_SIZE_BYTES = 90 * 1024 * 1024;
    const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;
    const UPLOAD_CHUNK_SIZE_BYTES = 10 * 1024 * 1024;
    const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1e3;
    const DEFAULT_TOKEN_EXPIRY_SECONDS = 3600;
    const SESSION_EXPIRY_SECONDS = 3600;
    const YOUTUBE_OAUTH_SCOPE = [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload"
    ].join(" ");
    const nowMs = /* @__PURE__ */ __name(() => Date.now(), "nowMs");
    const safeJson = /* @__PURE__ */ __name(async (res) => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    }, "safeJson");
    const oauthStateKey = /* @__PURE__ */ __name((secret) => crypto.subtle.importKey(
      "raw", new TextEncoder().encode(requireEnv(secret, "OAuth client secret")),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
    ), "oauthStateKey");
    const encodeState = /* @__PURE__ */ __name(async (obj, secret) => {
      const payload = btoa(JSON.stringify({ ...obj, expiresAt: Math.floor(Date.now() / 1e3) + 600, nonce: crypto.randomUUID() }));
      const signature = await crypto.subtle.sign("HMAC", await oauthStateKey(secret), new TextEncoder().encode(payload));
      const mac = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      return `${payload}.${mac}`;
    }, "encodeState");
    const decodeState = /* @__PURE__ */ __name(async (value, secret, platform) => {
      try {
        const [payload, mac, extra] = String(value || "").split(".");
        if (!payload || !mac || extra) return null;
        const raw = atob(mac.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(mac.length / 4) * 4, "="));
        const signature = Uint8Array.from(raw, (character) => character.charCodeAt(0));
        if (!await crypto.subtle.verify("HMAC", await oauthStateKey(secret), signature, new TextEncoder().encode(payload))) return null;
        const state = JSON.parse(atob(payload));
        if (state.platform !== platform || !state.folderId || !state.userId || !state.nonce ||
          !Number.isInteger(state.expiresAt) || state.expiresAt <= Math.floor(Date.now() / 1e3)) return null;
        return state;
      } catch { return null; }
    }, "decodeState");
    const upsertToken = /* @__PURE__ */ __name(async ({ folderId, platform, accountId, accessToken, refreshToken, expiresAt, scope }) => {
      const safeFolderId = folderId == null ? null : String(folderId);
      const safePlatform = platform == null ? null : String(platform);
      const safeAccountId = accountId == null ? null : String(accountId);
      const safeAccessToken = accessToken == null ? null : String(accessToken);
      const safeRefreshToken = refreshToken == null ? null : String(refreshToken);
      const safeExpiresAt = expiresAt == null ? null : String(expiresAt);
      const safeScope = scope == null ? null : String(scope);
      if (!safeFolderId || !safePlatform || !safeAccountId || !safeAccessToken) {
        return;
      }
      await env.DB.prepare(`
        INSERT INTO tokens (
          folder_id, platform, account_id, access_token, refresh_token, expires_at, scope, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
        ON CONFLICT(folder_id, platform, account_id)
        DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_at = excluded.expires_at,
          scope = excluded.scope,
          updated_at = strftime('%s','now')
      `).bind(
        safeFolderId,
        safePlatform,
        safeAccountId,
        safeAccessToken,
        safeRefreshToken,
        safeExpiresAt,
        safeScope
      ).run();
    }, "upsertToken");
    const requireEnv = /* @__PURE__ */ __name((envVal, name) => {
      const v = envVal && String(envVal).trim() ? String(envVal).trim() : null;
      if (!v) throw new Error(`Missing ${name} env var`);
      return v;
    }, "requireEnv");
    const getTikTokSigninClientKey = /* @__PURE__ */ __name(
      () => requireEnv(env.TIKTOK_SIGNIN_CLIENT_KEY || env.TIKTOK_CLIENT_KEY, "TIKTOK_SIGNIN_CLIENT_KEY (or TIKTOK_CLIENT_KEY)"),
      "getTikTokSigninClientKey"
    );
    const getTikTokSigninClientSecret = /* @__PURE__ */ __name(
      () => requireEnv(env.TIKTOK_SIGNIN_CLIENT_SECRET || env.TIKTOK_CLIENT_SECRET, "TIKTOK_SIGNIN_CLIENT_SECRET (or TIKTOK_CLIENT_SECRET)"),
      "getTikTokSigninClientSecret"
    );
    const getTikTokPublishClientKey = /* @__PURE__ */ __name(
      () => requireEnv(env.TIKTOK_PUBLISH_CLIENT_KEY || env.TIKTOK_CLIENT_KEY, "TIKTOK_PUBLISH_CLIENT_KEY (or TIKTOK_CLIENT_KEY)"),
      "getTikTokPublishClientKey"
    );
    const getTikTokPublishClientSecret = /* @__PURE__ */ __name(
      () => requireEnv(env.TIKTOK_PUBLISH_CLIENT_SECRET || env.TIKTOK_CLIENT_SECRET, "TIKTOK_PUBLISH_CLIENT_SECRET (or TIKTOK_CLIENT_SECRET)"),
      "getTikTokPublishClientSecret"
    );
    const refreshTikTokAccessToken = /* @__PURE__ */ __name(async (refreshToken) => {
      const safeRefreshToken = String(refreshToken || "").trim();
      if (!safeRefreshToken) {
        throw new Error("Missing TikTok refresh token");
      }
      const tokenRes = await fetch(`${tiktokApiBaseUrl}/v2/oauth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: getTikTokPublishClientKey(),
          client_secret: getTikTokPublishClientSecret(),
          grant_type: "refresh_token",
          refresh_token: safeRefreshToken
        })
      });
      const tokenJson = await safeJson(tokenRes);
      const tData = tokenJson?.data || tokenJson || {};
      if (!tokenRes.ok || tokenJson?.error || tData?.error || !tData?.access_token) {
        throw new Error(tokenJson?.error_description || tData?.error_description || tData?.message || tData?.error || "TikTok token refresh failed");
      }
      return {
        accessToken: String(tData.access_token),
        refreshToken: String(tData.refresh_token || safeRefreshToken),
        expiresAt: nowMs() + Number(tData.expires_in || DEFAULT_TOKEN_EXPIRY_SECONDS) * 1e3,
        accountId: String(tData.open_id || tData.openid || "").trim(),
        scope: String(tData.scope || "")
      };
    }, "refreshTikTokAccessToken");
    const fbGraph = "https://graph.facebook.com/v18.0";
    const fbSafe = /* @__PURE__ */ __name(async (res) => {
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(`Facebook API ${res.status}: ${JSON.stringify(data)}`);
      }
      if (data?.error) {
        throw new Error(`Facebook API error: ${JSON.stringify(data.error)}`);
      }
      return data;
    }, "fbSafe");
    const fetchFbJson = /* @__PURE__ */ __name(async (fbUrl, init) => {
      const res = await fetch(fbUrl, init);
      return fbSafe(res);
    }, "fetchFbJson");
    const appsecretProof = /* @__PURE__ */ __name(async (accessToken) => {
      const appSecret = env.FB_CLIENT_SECRET ? String(env.FB_CLIENT_SECRET).trim() : null;
      if (!appSecret) {
        console.warn("FB_CLIENT_SECRET not configured; appsecret_proof will be omitted from Facebook API calls");
        return null;
      }
      if (!accessToken) return null;
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(appSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(accessToken));
      return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }, "appsecretProof");
    const base64Url = /* @__PURE__ */ __name((input) => {
      const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }, "base64Url");
    const randomState = /* @__PURE__ */ __name(() => {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      return base64Url(bytes);
    }, "randomState");
    const parseCookies = /* @__PURE__ */ __name((cookieHeader) => {
      const out = {};
      for (const item of String(cookieHeader || "").split(";")) {
        const idx = item.indexOf("=");
        if (idx === -1) continue;
        const key = item.slice(0, idx).trim();
        const value = item.slice(idx + 1).trim();
        if (key) out[key] = decodeURIComponent(value);
      }
      return out;
    }, "parseCookies");
    const authCookie = /* @__PURE__ */ __name((name, value, maxAgeSeconds) => {
      return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax`;
    }, "authCookie");
    const clearAuthCookie = /* @__PURE__ */ __name((name) => `${name}=; Max-Age=0; Path=/api/auth; HttpOnly; Secure; SameSite=Lax`, "clearAuthCookie");
    const importFirebasePrivateKey = /* @__PURE__ */ __name(async (privateKeyPem) => {
      const pem = String(privateKeyPem || "").replace(/\\n/g, "\n");
      const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return crypto.subtle.importKey(
        "pkcs8",
        bytes,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
      );
    }, "importFirebasePrivateKey");
    const createFirebaseCustomToken = /* @__PURE__ */ __name(async ({ uid, claims = {} }) => {
      const clientEmail = requireEnv(env.FIREBASE_CLIENT_EMAIL, "FIREBASE_CLIENT_EMAIL");
      const privateKey = requireEnv(env.FIREBASE_PRIVATE_KEY, "FIREBASE_PRIVATE_KEY");
      const now = Math.floor(Date.now() / 1e3);
      const header = { alg: "RS256", typ: "JWT" };
      const payload = {
        iss: clientEmail,
        sub: clientEmail,
        aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
        iat: now,
        exp: now + 3600,
        uid: String(uid).slice(0, 128),
        claims
      };
      const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
      const key = await importFirebasePrivateKey(privateKey);
      const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
      return `${unsigned}.${base64Url(signature)}`;
    }, "createFirebaseCustomToken");
    const publishFacebookReelFromUrl = /* @__PURE__ */ __name(async ({ pageId, pageAccessToken, videoUrl, description }) => {
      const proof = await appsecretProof(pageAccessToken);
      const proofParam = proof ? `?appsecret_proof=${encodeURIComponent(proof)}` : "";
      const startRes = await fetchFbJson(`${fbGraph}/${encodeURIComponent(pageId)}/video_reels${proofParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: pageAccessToken,
          upload_phase: "start"
        })
      });
      const videoId = startRes?.video_id;
      const uploadUrl = startRes?.upload_url;
      if (!videoId || !uploadUrl) {
        throw new Error(`Bad reels start response: ${JSON.stringify(startRes)}`);
      }
      const vidRes = await fetch(videoUrl);
      if (!vidRes.ok) {
        throw new Error(`Failed to fetch video_url: ${vidRes.status}`);
      }
      const buf = await vidRes.arrayBuffer();
      const upRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `OAuth ${pageAccessToken}`,
          "Content-Type": "application/octet-stream",
          offset: "0",
          file_size: String(buf.byteLength)
        },
        body: buf
      });
      const upText = await upRes.text();
      if (!upRes.ok) {
        throw new Error(`Reels upload failed ${upRes.status}: ${upText}`);
      }
      const finishRes = await fetchFbJson(`${fbGraph}/${encodeURIComponent(pageId)}/video_reels${proofParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: pageAccessToken,
          upload_phase: "finish",
          video_id: String(videoId),
          video_state: "PUBLISHED",
          description: description || ""
        })
      });
      const pageUrl = `https://www.facebook.com/${encodeURIComponent(pageId)}`;
      const postUrl = finishRes?.post_id ? `https://www.facebook.com/${finishRes.post_id}` : "";
      const directVideoUrl = `https://www.facebook.com/${encodeURIComponent(pageId)}/videos/${encodeURIComponent(videoId)}`;
      return {
        video_id: videoId,
        finish: finishRes,
        pageId,
        pageUrl,
        postUrl,
        videoUrl: directVideoUrl,
        facebookUrl: pageUrl,
        processing: true
      };
    }, "publishFacebookReelFromUrl");
    const publishFacebookPhotoFromUrl = /* @__PURE__ */ __name(async ({ pageId, pageAccessToken, imageUrl, caption }) => {
      const proof = await appsecretProof(pageAccessToken);
      const proofParam = proof ? `?appsecret_proof=${encodeURIComponent(proof)}` : "";
      const out = await fetchFbJson(`${fbGraph}/${encodeURIComponent(pageId)}/photos${proofParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: pageAccessToken,
          url: imageUrl,
          caption: caption || "",
          published: "true"
        })
      });
      const postId = String(out?.post_id || "").trim();
      const photoId = String(out?.id || "").trim();
      const pageUrl = `https://www.facebook.com/${encodeURIComponent(pageId)}`;
      const postUrl = postId ? `https://www.facebook.com/${postId}` : "";
      return {
        ...out,
        postId,
        photoId,
        pageId,
        postUrl,
        pageUrl,
        facebookUrl: postUrl || pageUrl
      };
    }, "publishFacebookPhotoFromUrl");
    const looksLikeImageUrl = /* @__PURE__ */ __name((mediaUrl) => {
      try {
        const u = new URL(String(mediaUrl || ""));
        const pathname = (u.pathname || "").toLowerCase();
        return /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(pathname);
      } catch {
        return false;
      }
    }, "looksLikeImageUrl");
    const cleanText = /* @__PURE__ */ __name((value) => {
      return String(value || "").replace(/\s+/g, " ").trim();
    }, "cleanText");
    const makeKeywords = /* @__PURE__ */ __name((prompt) => {
      const cleaned = cleanText(prompt).toLowerCase().replace(/[^\w\s]/g, " ");
      const words = cleaned.split(/\s+/).filter(Boolean).filter((w) => w.length > 2);
      const unique = [...new Set(words)];
      const base = unique.slice(0, 10);
      const extras = [
        "viral",
        "trending",
        "shorts",
        "reels",
        "fyp",
        "viral content",
        "trending now",
        "must watch"
      ];
      return [.../* @__PURE__ */ new Set([...base, ...extras])].join(", ");
    }, "makeKeywords");
    const fallbackSeo = /* @__PURE__ */ __name((prompt) => {
      const idea = cleanText(prompt) || "viral short video";
      const lower = idea.toLowerCase();
      let youtubeTitle = idea.length <= 60 ? idea : idea.slice(0, 57) + "...";
      if (!/[|:-]/.test(youtubeTitle) && youtubeTitle.length <= 55) {
        youtubeTitle = `${youtubeTitle} | Must Watch`;
      }
      let youtubeDescription = `${idea} - Watch this trending video and don't miss out! Like, comment and subscribe for more viral content. Perfect for fans of trending short-form videos.`;
      let tiktokCaption = `POV: ${lower} \u{1F525} #viral #trending #fyp #foryoupage #foryou #shorts`;
      let facebookTitle = idea.charAt(0).toUpperCase() + idea.slice(1);
      let facebookDescriptionAndTags = `${idea} \u{1F525}
Follow for daily trending content! \u{1F44F}

#viral #trending #reels #foryou #mustwatch #explore`;
      if (/pov[:\s-]/i.test(idea)) {
        tiktokCaption = `${idea} \u{1F525} #viral #trending #fyp #foryoupage #relatable`;
      }
      return {
        youtube: {
          title: youtubeTitle,
          description: youtubeDescription,
          keywords: makeKeywords(idea)
        },
        tiktok: {
          allInOne: tiktokCaption
        },
        facebook: {
          title: facebookTitle,
          descriptionAndTags: facebookDescriptionAndTags
        }
      };
    }, "fallbackSeo");
    const toUnix = /* @__PURE__ */ __name((value) => {
      if (value === null || value === void 0 || value === "") return null;
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      if (n > 1e12) return Math.floor(n / 1e3);
      return Math.floor(n);
    }, "toUnix");
    const nowUnix = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "nowUnix");
    const normalizeBillingInterval = /* @__PURE__ */ __name((value) => {
      const v = String(value || "").trim().toLowerCase();
      if (v === "month" || v === "monthly") return "monthly";
      if (v === "year" || v === "yearly" || v === "annual" || v === "annually") return "yearly";
      return "";
    }, "normalizeBillingInterval");
    const parseCsvSet = /* @__PURE__ */ __name((raw) => {
      return new Set(
        String(raw || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      );
    }, "parseCsvSet");
    const webBillingEnabled = String(env.WEB_BILLING_ENABLED || "false").toLowerCase() === "true";
    // Separate purchase readiness from entitlement enforcement. Existing subscribers
    // keep access while a new Stripe account is configured and verified.
    const stripeCheckoutEnabled = String(env.STRIPE_CHECKOUT_ENABLED || "false").toLowerCase() === "true";
    const stripeCheckoutAccountId = String(env.STRIPE_CHECKOUT_ACCOUNT_ID || "").trim();
    const ownerUserIds = parseCsvSet(env.BILLING_OWNER_USER_IDS || "");
    const ownerEmails = parseCsvSet(env.BILLING_OWNER_EMAILS || "");
    const getFirebaseIdentity = /* @__PURE__ */ __name(async (request2) => {
      const authorization = String(request2.headers.get("Authorization") || "");
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (!match) return null;
      try {
        const firebaseApiKey = String(env.FIREBASE_WEB_API_KEY || "AIzaSyDJBCJrMwyjLiMFG7QhfG09cKZa_2Y4UGM");
        const firebaseAllowedOrigin = new URL(frontendBaseUrl).origin;
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Referer": `${firebaseAllowedOrigin}/`
          },
          body: JSON.stringify({ idToken: match[1] })
        });
        if (!response.ok) return null;
        const payload = await safeJson(response);
        const user = payload?.users?.[0];
        if (!user?.localId) return null;
        const identity = {
          userId: String(user.localId).trim(),
          emailVerified: user.emailVerified === true,
          email: String(user.email || "").trim().toLowerCase()
        };
        // A verified, explicitly configured owner may have separate Firebase
        // UIDs for Google and email/password. Bridge only those configured
        // aliases; never trust a caller-supplied email or browser storage.
        const configuredUids = splitEnvList(env.BILLING_OWNER_USER_IDS || env.OWNER_USER_IDS);
        const configuredEmails = splitEnvList(env.BILLING_OWNER_EMAILS || env.OWNER_EMAILS).map(normalizeUserId);
        if (configuredUids.includes(identity.userId) ||
            (identity.emailVerified && configuredEmails.includes(identity.email))) {
          identity.workspaceOwnerIds = [...configuredUids, ...configuredEmails];
        }
        return identity;
      } catch (_) {
        return null;
      }
    }, "getFirebaseIdentity");
    const ownerAdminToken = env.OWNER_ADMIN_TOKEN ? String(env.OWNER_ADMIN_TOKEN).trim() : "";
    const stripeSecretKey = env.STRIPE_SECRET_KEY ? String(env.STRIPE_SECRET_KEY).trim() : "";
    const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET ? String(env.STRIPE_WEBHOOK_SECRET).trim() : "";
    const stripeWorkspacePriceId = String(env.STRIPE_PRICE_WORKSPACE_MONTHLY || "").trim();
    const stripeTrialDays = Number(env.STRIPE_TRIAL_DAYS || 7) > 0 ? Number(env.STRIPE_TRIAL_DAYS || 7) : 7;
    const PLAN_LIMITS = {
      pro: {
        key: "pro",
        label: "Creator",
        account_caps: { youtube: 1, tiktok: 1, facebook_page: 1 },
        daily_total_posts: 6,
        daily_per_platform_posts: { youtube: 2, tiktok: 2, facebook: 2 }
      },
      pro_plus: {
        key: "pro_plus",
        label: "Pro",
        account_caps: { youtube: 3, tiktok: 3, facebook_page: 3 },
        daily_total_posts: 27,
        daily_per_platform_posts: { youtube: 9, tiktok: 9, facebook: 9 }
      },
      agency: {
        key: "agency",
        label: "Agency",
        account_caps: { youtube: 100, tiktok: 100, facebook_page: 100 },
        daily_total_posts: 300,
        daily_per_platform_posts: { youtube: 300, tiktok: 300, facebook: 300 }
      }
    };
    const getPriceCatalog = /* @__PURE__ */ __name(() => ({
      pro: {
        monthly: env.STRIPE_PRICE_PRO_MONTHLY ? String(env.STRIPE_PRICE_PRO_MONTHLY).trim() : "",
        yearly: env.STRIPE_PRICE_PRO_YEARLY ? String(env.STRIPE_PRICE_PRO_YEARLY).trim() : ""
      },
      pro_plus: {
        monthly: env.STRIPE_PRICE_PRO_PLUS_MONTHLY ? String(env.STRIPE_PRICE_PRO_PLUS_MONTHLY).trim() : "",
        yearly: env.STRIPE_PRICE_PRO_PLUS_YEARLY ? String(env.STRIPE_PRICE_PRO_PLUS_YEARLY).trim() : ""
      },
      agency: {
        monthly: env.STRIPE_PRICE_AGENCY_MONTHLY ? String(env.STRIPE_PRICE_AGENCY_MONTHLY).trim() : "",
        yearly: env.STRIPE_PRICE_AGENCY_YEARLY ? String(env.STRIPE_PRICE_AGENCY_YEARLY).trim() : ""
      }
    }), "getPriceCatalog");
    const lookupPlanByPriceId = /* @__PURE__ */ __name((priceId) => {
      if (!priceId) return { planKey: null, interval: null };
      const catalog = getPriceCatalog();
      for (const [planKey, intervals] of Object.entries(catalog)) {
        for (const [interval, configuredPriceId] of Object.entries(intervals)) {
          if (configuredPriceId && configuredPriceId === String(priceId)) {
            return { planKey, interval };
          }
        }
      }
      const legacyPrices = [
        [env.STRIPE_LEGACY_PRICE_PRO_MONTHLY, "pro", "monthly"],
        [env.STRIPE_LEGACY_PRICE_PRO_YEARLY, "pro", "yearly"],
        [env.STRIPE_LEGACY_PRICE_PRO_PLUS_MONTHLY, "pro_plus", "monthly"],
        [env.STRIPE_LEGACY_PRICE_PRO_PLUS_YEARLY, "pro_plus", "yearly"]
      ];
      for (const [legacyPriceId, planKey, interval] of legacyPrices) {
        if (legacyPriceId && String(legacyPriceId).trim() === String(priceId)) return { planKey, interval };
      }
      return { planKey: null, interval: null };
    }, "lookupPlanByPriceId");
    const getEffectivePlan = /* @__PURE__ */ __name((row) => {
      const rawKey = String(row?.plan_key || "").trim();
      if (rawKey && PLAN_LIMITS[rawKey]) {
        return { planKey: rawKey, limits: PLAN_LIMITS[rawKey], interval: normalizeBillingInterval(row?.billing_interval) || null };
      }
      const mapped = lookupPlanByPriceId(row?.stripe_price_id || null);
      if (mapped.planKey && PLAN_LIMITS[mapped.planKey]) {
        return { planKey: mapped.planKey, limits: PLAN_LIMITS[mapped.planKey], interval: normalizeBillingInterval(mapped.interval) || null };
      }
      return { planKey: "pro", limits: PLAN_LIMITS.pro, interval: normalizeBillingInterval(row?.billing_interval) || "monthly" };
    }, "getEffectivePlan");
    const stripeApi = /* @__PURE__ */ __name(async (path, method, payload) => {
      if (!stripeSecretKey) throw new Error("Stripe secret key is not configured");
      const headers = {
        Authorization: `Bearer ${stripeSecretKey}`
      };
      let body;
      if (payload) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = new URLSearchParams(payload).toString();
      }
      const res = await fetch(`https://api.stripe.com${path}`, { method, headers, body });
      const data = await safeJson(res);
      if (!res.ok) {
        const message = data?.error?.message || `Stripe API error ${res.status}`;
        throw new Error(message);
      }
      return data;
    }, "stripeApi");
    const getClientPlatform = /* @__PURE__ */ __name((request2, payloadPlatform, searchPlatform) => {
      const headerPlatform = request2.headers.get("client_platform");
      const raw = payloadPlatform || searchPlatform || headerPlatform || "web";
      const normalized = String(raw).trim().toLowerCase();
      return normalized === "android" ? "android" : "web";
    }, "getClientPlatform");
    const getBillingRow = /* @__PURE__ */ __name(async (userId) => {
      return env.DB.prepare(`
        SELECT *
        FROM billing_subscriptions
        WHERE user_id = ?
        LIMIT 1
      `).bind(String(userId)).first();
    }, "getBillingRow");
    const identityMatchesBillingUser = /* @__PURE__ */ __name((row, requestedUserId, identity) => {
      if (!identity) return false;
      const requested = String(requestedUserId || "").trim().toLowerCase();
      const identityKeys = [identity.userId, identity.email, ...(identity.workspaceOwnerIds || [])].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
      // A billing row's email must never authorize a different requested user ID.
      return Boolean(requested && identityKeys.includes(requested));
    }, "identityMatchesBillingUser");
    const ensureBillingRow = /* @__PURE__ */ __name(async (userId, userEmail) => {
      await env.DB.prepare(`
        INSERT INTO billing_subscriptions (user_id, user_email, created_at, updated_at)
        VALUES (?, ?, strftime('%s','now'), strftime('%s','now'))
        ON CONFLICT(user_id) DO UPDATE SET
          user_email = COALESCE(excluded.user_email, billing_subscriptions.user_email),
          updated_at = strftime('%s','now')
      `).bind(String(userId), userEmail ? String(userEmail) : null).run();
    }, "ensureBillingRow");
    const isStripeNoSuchCustomerError = /* @__PURE__ */ __name((error) => {
      const message = String(error?.message || "").toLowerCase();
      return message.includes("no such customer");
    }, "isStripeNoSuchCustomerError");
    const createStripeCustomerForUser = /* @__PURE__ */ __name(async (userId, userEmail) => {
      const customerPayload = {
        "metadata[user_id]": String(userId),
        "metadata[app]": "multipost"
      };
      if (userEmail) customerPayload.email = userEmail;
      const customer = await stripeApi("/v1/customers", "POST", customerPayload);
      const stripeCustomerId = String(customer.id);
      await env.DB.prepare(`
        UPDATE billing_subscriptions
        SET stripe_customer_id = ?, user_email = COALESCE(?, user_email), updated_at = strftime('%s','now')
        WHERE user_id = ?
      `).bind(stripeCustomerId, userEmail ? String(userEmail) : null, String(userId)).run();
      return stripeCustomerId;
    }, "createStripeCustomerForUser");
    const ensureStripeCustomerForUser = /* @__PURE__ */ __name(async (userId, userEmail, existingCustomerId) => {
      let stripeCustomerId = existingCustomerId ? String(existingCustomerId) : null;
      if (stripeCustomerId) {
        try {
          const customer = await stripeApi(`/v1/customers/${encodeURIComponent(stripeCustomerId)}`, "GET");
          if (customer?.deleted) {
            stripeCustomerId = null;
          }
        } catch (error) {
          if (isStripeNoSuchCustomerError(error)) {
            stripeCustomerId = null;
          } else {
            throw error;
          }
        }
      }
      if (!stripeCustomerId) {
        stripeCustomerId = await createStripeCustomerForUser(userId, userEmail);
      }
      return stripeCustomerId;
    }, "ensureStripeCustomerForUser");
    const persistBillingFromSubscription = /* @__PURE__ */ __name(async ({ userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, planKey, billingInterval, status, currentPeriodEnd, trialEnd }) => {
      if (!userId && !stripeCustomerId) return;
      if (!userId && stripeCustomerId) {
        const existingByCustomer = await env.DB.prepare("SELECT user_id FROM billing_subscriptions WHERE stripe_customer_id = ? LIMIT 1").bind(String(stripeCustomerId)).first();
        userId = existingByCustomer?.user_id || null;
      }
      if (!userId) return;
      const normalizedTrialEnd = toUnix(trialEnd);
      const derivedTrialUsed = normalizedTrialEnd ? 1 : null;
      await env.DB.prepare(`
        INSERT INTO billing_subscriptions (
          user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_key, billing_interval, subscription_status, current_period_end, trial_end, trial_used, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
        ON CONFLICT(user_id) DO UPDATE SET
          stripe_customer_id = COALESCE(excluded.stripe_customer_id, billing_subscriptions.stripe_customer_id),
          stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, billing_subscriptions.stripe_subscription_id),
          stripe_pro_paid_at = CASE WHEN excluded.stripe_subscription_id IS NOT NULL
            AND excluded.stripe_subscription_id != billing_subscriptions.stripe_subscription_id
            THEN NULL ELSE billing_subscriptions.stripe_pro_paid_at END,
          stripe_price_id = COALESCE(excluded.stripe_price_id, billing_subscriptions.stripe_price_id),
          plan_key = COALESCE(excluded.plan_key, billing_subscriptions.plan_key),
          billing_interval = COALESCE(excluded.billing_interval, billing_subscriptions.billing_interval),
          subscription_status = COALESCE(excluded.subscription_status, billing_subscriptions.subscription_status),
          current_period_end = COALESCE(excluded.current_period_end, billing_subscriptions.current_period_end),
          trial_end = COALESCE(excluded.trial_end, billing_subscriptions.trial_end),
          trial_used = COALESCE(excluded.trial_used, billing_subscriptions.trial_used),
          updated_at = strftime('%s','now')
      `).bind(
        String(userId),
        stripeCustomerId ? String(stripeCustomerId) : null,
        stripeSubscriptionId ? String(stripeSubscriptionId) : null,
        stripePriceId ? String(stripePriceId) : null,
        planKey ? String(planKey) : null,
        normalizeBillingInterval(billingInterval) || null,
        status ? String(status) : null,
        toUnix(currentPeriodEnd),
        normalizedTrialEnd,
        derivedTrialUsed
      ).run();
    }, "persistBillingFromSubscription");
    const persistStripeSubscription = /* @__PURE__ */ __name(async (subscription, fallbackUserId = null) => {
      if (!subscription || subscription.deleted) return;
      const firstItem = subscription?.items?.data?.[0] || null;
      // Add-ons must never replace the customer's primary Pro subscription.
      if (subscription?.metadata?.kind === "workspace_addon" ||
          (stripeWorkspacePriceId && (subscription?.items?.data || []).some((item) => item?.price?.id === stripeWorkspacePriceId))) return;
      await persistBillingFromSubscription({
        userId: subscription?.metadata?.user_id || fallbackUserId,
        stripeCustomerId: subscription?.customer || null,
        stripeSubscriptionId: subscription?.id || null,
        stripePriceId: firstItem?.price?.id || null,
        planKey: subscription?.metadata?.plan_key || null,
        billingInterval: subscription?.metadata?.billing_interval || firstItem?.price?.recurring?.interval || null,
        status: subscription?.status || null,
        currentPeriodEnd: subscription?.current_period_end || firstItem?.current_period_end || null,
        trialEnd: subscription?.trial_end || null
      });
    }, "persistStripeSubscription");
    const isStripeWorkspaceSubscription = /* @__PURE__ */ __name((subscription) => {
      const items = subscription?.items?.data || [];
      return Boolean(stripeWorkspacePriceId && items.length === 1 &&
        items[0]?.price?.id === stripeWorkspacePriceId && Number(items[0]?.quantity || 1) === 1 &&
        subscription?.metadata?.kind === "workspace_addon");
    }, "isStripeWorkspaceSubscription");
    const isStripeWorkspaceBillingSubscription = /* @__PURE__ */ __name((subscription) =>
      subscription?.metadata?.kind === "workspace_addon" ||
      Boolean(stripeWorkspacePriceId && (subscription?.items?.data || []).some((item) =>
        item?.price?.id === stripeWorkspacePriceId)), "isStripeWorkspaceBillingSubscription");
    const persistStripeWorkspaceSubscription = /* @__PURE__ */ __name(async (subscription, fallbackUserId = null) => {
      if (!isStripeWorkspaceSubscription(subscription)) return false;
      const userId = String(subscription.metadata.user_id || fallbackUserId || "");
      const customerId = String(subscription.customer || "");
      const pro = userId ? await getBillingRow(userId) : null;
      if (!pro || pro.stripe_customer_id !== customerId || !subscription.id) return false;
      await env.DB.prepare(`INSERT INTO billing_stripe_workspace_addons
        (stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id, subscription_status, cancel_at_period_end)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(stripe_subscription_id) DO UPDATE SET
          subscription_status = excluded.subscription_status,
          cancel_at_period_end = excluded.cancel_at_period_end,
          updated_at = strftime('%s','now')
        WHERE billing_stripe_workspace_addons.user_id = excluded.user_id
          AND billing_stripe_workspace_addons.stripe_customer_id = excluded.stripe_customer_id`)
        .bind(String(subscription.id), userId, customerId, stripeWorkspacePriceId,
          String(subscription.status || "unknown"), subscription.cancel_at_period_end ? 1 : 0).run();
      return true;
    }, "persistStripeWorkspaceSubscription");
    const getStripeWorkspaceAddons = /* @__PURE__ */ __name(async (userId) => {
      if (!stripeWorkspacePriceId || !userId) return [];
      const result = await env.DB.prepare(`SELECT stripe_subscription_id, subscription_status, paid_through,
        cancel_at_period_end FROM billing_stripe_workspace_addons WHERE user_id = ? AND stripe_price_id = ?
        AND paid_through > ? ORDER BY created_at, stripe_subscription_id`)
        .bind(String(userId), stripeWorkspacePriceId, nowUnix()).all();
      return result.results || [];
    }, "getStripeWorkspaceAddons");
    const stopStripeWorkspaceRenewalsWithPro = /* @__PURE__ */ __name(async (proSubscription) => {
      if (!proSubscription?.cancel_at_period_end && !["canceled", "unpaid", "incomplete_expired", "paused"].includes(proSubscription?.status)) return;
      const row = await env.DB.prepare(`SELECT user_id FROM billing_subscriptions WHERE stripe_subscription_id = ? AND stripe_customer_id = ?`)
        .bind(String(proSubscription.id || ""), String(proSubscription.customer || "")).first();
      if (!row) return;
      const addons = (await env.DB.prepare(`SELECT stripe_subscription_id, subscription_status, cancel_at_period_end
        FROM billing_stripe_workspace_addons WHERE user_id = ? AND stripe_price_id = ?`)
        .bind(row.user_id, stripeWorkspacePriceId).all()).results || [];
      for (const addon of addons.filter((item) => !item.cancel_at_period_end && ["active", "past_due"].includes(item.subscription_status))) {
        const updated = await stripeApi(`/v1/subscriptions/${encodeURIComponent(addon.stripe_subscription_id)}`, "POST",
          { cancel_at_period_end: "true" });
        await persistStripeWorkspaceSubscription(updated);
      }
    }, "stopStripeWorkspaceRenewalsWithPro");
    const isStripeProRenewing = /* @__PURE__ */ __name(async (row) => {
      if (!row?.stripe_subscription_id || !row?.stripe_customer_id) return false;
      const subscription = await stripeApi(`/v1/subscriptions/${encodeURIComponent(row.stripe_subscription_id)}`, "GET");
      return subscription.id === row.stripe_subscription_id && subscription.customer === row.stripe_customer_id &&
        subscription.status === "active" && !subscription.cancel_at_period_end &&
        subscription.metadata?.kind !== "workspace_addon";
    }, "isStripeProRenewing");
    const withStripeWorkspaceAllowance = /* @__PURE__ */ __name(async (evaluated, userId) => {
      if (evaluated.reason !== "ok" || !evaluated.access || evaluated.plan?.planKey !== "pro" || !stripeWorkspacePriceId) return evaluated;
      const addons = await getStripeWorkspaceAddons(userId);
      return { ...evaluated, workspaceAllowance: Math.min(10, Number(evaluated.workspaceAllowance || 1) + addons.length), stripeWorkspaceAddons: addons };
    }, "withStripeWorkspaceAllowance");
    const stripeInvoiceSubscriptionId = /* @__PURE__ */ __name((invoice) => String(
      invoice?.subscription || invoice?.parent?.subscription_details?.subscription ||
      (invoice?.lines?.data || []).find((line) => line?.parent?.subscription_item_details?.subscription)
        ?.parent?.subscription_item_details?.subscription || ""
    ), "stripeInvoiceSubscriptionId");
    const verifiedStripeInvoicePaymentAmount = /* @__PURE__ */ __name(async (invoice) => {
      if (!invoice?.id || invoice.status !== "paid" || invoice.paid_out_of_band === true ||
          invoice.collection_method !== "charge_automatically" ||
          Number(invoice.amount_paid || 0) <= 0 || Number(invoice.amount_remaining) !== 0 ||
          !Number(invoice.status_transitions?.paid_at || 0)) return 0;
      // Newer Stripe invoices omit the old `paid` flag. Verify the actual
      // succeeded PaymentIntent, rather than treating an invoice status alone
      // (which can also be marked paid manually) as collected money.
      const payments = await stripeApi(`/v1/invoice_payments?invoice=${encodeURIComponent(invoice.id)}&limit=100`, "GET");
      let collected = 0;
      for (const payment of payments.data || []) {
        const paymentIntentId = payment.payment?.type === "payment_intent" ? payment.payment.payment_intent : null;
        if (payment.status !== "paid" || !paymentIntentId || Number(payment.amount_paid || 0) <= 0) continue;
        const intent = await stripeApi(`/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, "GET");
        if (intent.status === "succeeded" && intent.customer === invoice.customer &&
            intent.currency === invoice.currency && Number(intent.amount_received || 0) >= Number(payment.amount_paid))
          collected += Number(payment.amount_paid);
      }
      return collected;
    }, "verifiedStripeInvoicePaymentAmount");
    const hasPaidStripeProInvoice = /* @__PURE__ */ __name(async (row) => {
      if (!row?.stripe_subscription_id || !row?.stripe_customer_id) return false;
      if (Number(row.stripe_pro_paid_at || 0) > 0) return true;
      // This also recognizes customers who paid before this migration was deployed.
      const invoices = await stripeApi(`/v1/invoices?subscription=${encodeURIComponent(row.stripe_subscription_id)}&status=paid&limit=100`, "GET");
      let paid = null;
      for (const invoice of invoices.data || []) {
        if (invoice.customer === row.stripe_customer_id &&
            stripeInvoiceSubscriptionId(invoice) === row.stripe_subscription_id &&
            await verifiedStripeInvoicePaymentAmount(invoice) > 0) { paid = invoice; break; }
      }
      if (!paid) return false;
      await env.DB.prepare(`UPDATE billing_subscriptions SET stripe_pro_paid_at = ?, updated_at = strftime('%s','now')
        WHERE user_id = ? AND stripe_subscription_id = ?`)
        .bind(Number(paid.status_transitions?.paid_at || paid.created || nowUnix()), row.user_id, row.stripe_subscription_id).run();
      return true;
    }, "hasPaidStripeProInvoice");
    const refreshBillingFromStripe = /* @__PURE__ */ __name(async (row) => {
      if (!row?.stripe_subscription_id || !stripeSecretKey) return row;
      try {
        const subscription = await stripeApi(`/v1/subscriptions/${encodeURIComponent(row.stripe_subscription_id)}`, "GET");
        await persistStripeSubscription(subscription, row.user_id);
        return await getBillingRow(row.user_id);
      } catch (error) {
        console.warn("Stripe subscription refresh failed", error?.message || error);
        return row;
      }
    }, "refreshBillingFromStripe");
    const getPlayEntitlement = /* @__PURE__ */ __name(async (identity) => {
      if (!identity?.userId) return null;
      let row;
      try {
        row = await env.DB.prepare("SELECT * FROM billing_play_purchases WHERE user_id = ? LIMIT 1").bind(identity.userId).first();
      } catch (_) {
        // Existing Stripe subscriptions remain available while the new migration is pending.
        return null;
      }
      if (!row) return null;
      if (Number(row.last_verified_at || 0) + 300 < nowUnix()) {
        try {
          const token = await decryptPurchaseToken(row.encrypted_token, env.PLAY_TOKEN_ENCRYPTION_KEY);
          const verified = await verifyPlayPurchase({ token, firebaseUid: identity.userId, serviceAccountJson: env.PLAY_SERVICE_ACCOUNT_JSON, previousPaidOrderId: row.pro_paid_order_id });
          await env.DB.prepare(`UPDATE billing_play_purchases SET subscription_state = ?, expiry_time = ?, base_plan_id = ?, trial_end = ?, workspace_quantity = ?, workspace_expiry = ?, workspace_items_json = ?, pro_paid_order_id = ?, last_verified_at = strftime('%s','now') WHERE user_id = ?`)
            .bind(verified.state, verified.expiry, verified.basePlanId, verified.trialEnd, verified.workspaceQuantity,
              verified.workspaceExpiry, JSON.stringify(verified.workspaceItems), verified.paidProOrderId, identity.userId).run();
          return verified;
        } catch (_) {
          // A failed refresh cannot extend a Play entitlement.
          return null;
        }
      }
      const state = String(row.subscription_state || "");
      const workspaceItems = JSON.parse(row.workspace_items_json || '[]').filter((item) =>
        Number(item.expiry || 0) > nowUnix() && /^multipost_workspace_(0[1-9]|10)$/.test(item.productId));
      return {
        state,
        expiry: Number(row.expiry_time || 0),
        basePlanId: row.base_plan_id,
        trialEnd: Number(row.trial_end || 0) > nowUnix() ? Number(row.trial_end) : null,
        paidPro: Boolean(row.pro_paid_order_id),
        workspaceQuantity: row.pro_paid_order_id ? workspaceItems.length : 0,
        workspaceExpiry: Number(row.workspace_expiry || 0),
        workspaceItems: row.pro_paid_order_id ? workspaceItems : [],
        access: ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"].includes(state) && Number(row.expiry_time || 0) > nowUnix()
      };
    }, "getPlayEntitlement");
    const evaluateBillingAccess = /* @__PURE__ */ __name((row, platform, requestedUserId = "", authenticatedIdentity = null, playEntitlement = null) => {
      const userId = String(row?.user_id || "").trim();
      const userEmail = String(row?.user_email || "").trim().toLowerCase();
      const requested = String(requestedUserId || "").trim().toLowerCase();
      const authenticatedUserId = String(authenticatedIdentity?.userId || "").trim().toLowerCase();
      const authenticatedEmail = String(authenticatedIdentity?.email || "").trim().toLowerCase();
      const authenticatedOwnerIds = (authenticatedIdentity?.workspaceOwnerIds || []).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
      const isConfiguredOwner = ownerUserIds.has(authenticatedUserId) || (authenticatedIdentity?.emailVerified === true && ownerEmails.has(authenticatedEmail));
      const requestedMatchesIdentity = requested && [authenticatedUserId, authenticatedEmail, ...authenticatedOwnerIds].includes(requested);
      const rowMatchesIdentity = (userId && [authenticatedUserId, authenticatedEmail, ...authenticatedOwnerIds].includes(userId.toLowerCase())) || (userEmail && [authenticatedEmail, ...authenticatedOwnerIds].includes(userEmail));
      if (isConfiguredOwner && (requestedMatchesIdentity || rowMatchesIdentity)) {
        return {
          enabled: true,
          access: true,
          reason: "owner_bypass",
          status: "owner",
          owner: true
        };
      }
      if (!webBillingEnabled) {
        return {
          enabled: false,
          access: true,
          reason: "billing_disabled",
          status: "not_required"
        };
      }
      if (playEntitlement?.access) {
        return {
          enabled: true,
          access: true,
          reason: "play_verified",
          status: playEntitlement.state === "SUBSCRIPTION_STATE_CANCELED" ? "canceled" : playEntitlement.trialEnd > nowUnix() ? "trialing" : "active",
          owner: false,
          workspaceAllowance: Math.min(10, 1 + Number(playEntitlement.workspaceQuantity || 0)),
          plan: { planKey: "pro", interval: playEntitlement.basePlanId, limits: PLAN_LIMITS.pro }
        };
      }
      const now = nowUnix();
      const status = String(row?.subscription_status || "").toLowerCase();
      const trialEnd = toUnix(row?.trial_end);
      const currentPeriodEnd = toUnix(row?.current_period_end);
      const trialAccess = status === "trialing" && Boolean(trialEnd && trialEnd > now);
      const paidAccess = status === "active" && Boolean(!currentPeriodEnd || currentPeriodEnd > now);
      const canceledAccess = status === "canceled" && Boolean(currentPeriodEnd && currentPeriodEnd > now);
      const hasAccess = trialAccess || paidAccess || canceledAccess;
      return {
        enabled: true,
        access: hasAccess,
        reason: hasAccess ? "ok" : "subscription_required",
        status: hasAccess ? status : playEntitlement ? "expired" : status || "inactive",
        owner: false,
        workspaceAllowance: getEffectivePlan(row).planKey === "agency" ? 100 : getEffectivePlan(row).planKey === "pro_plus" ? 3 : 1,
        plan: getEffectivePlan(row)
      };
    }, "evaluateBillingAccess");
    const workspaceSelection = /* @__PURE__ */ __name(async (identity, evaluated) => {
      const aliases = [...new Set([identity.userId,
        ...(identity.emailVerified && identity.email ? [identity.email] : []),
        ...(identity.workspaceOwnerIds || [])])];
      const { results } = await env.DB.prepare(`SELECT f.id FROM folders f
        LEFT JOIN billing_workspace_choices c ON c.folder_id = f.id AND c.user_id = ?
        WHERE f.user_id IN (${sqlPlaceholders(aliases)})
        ORDER BY CASE WHEN c.priority IS NULL THEN 1 ELSE 0 END, c.priority ASC, f.id ASC`)
        .bind(identity.userId, ...aliases).all();
      const allowance = !evaluated.enabled || evaluated.owner ? results.length : evaluated.access
        ? Math.max(0, Math.min(100, Number(evaluated.workspaceAllowance || 1))) : 0;
      return { ordered: results.map((item) => String(item.id)), active: new Set(results.slice(0, allowance).map((item) => String(item.id))) };
    }, "workspaceSelection");
    const countDailyPosts = /* @__PURE__ */ __name(async (userIds, platform) => {
      const aliases = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const dayStart = Math.floor(start.getTime() / 1e3);
      const dayEnd = dayStart + 86400;
      try {
        const total = await env.DB.prepare(`
          SELECT COUNT(*) AS count
          FROM billing_usage_events
          WHERE user_id IN (${sqlPlaceholders(aliases)}) AND event_type IN ('publish', 'publish_confirmed', 'publish_metered') AND created_at >= ? AND created_at < ?
        `).bind(...aliases, dayStart, dayEnd).first();
        const byPlatform = await env.DB.prepare(`
          SELECT COUNT(*) AS count
          FROM billing_usage_events
          WHERE user_id IN (${sqlPlaceholders(aliases)}) AND event_type IN ('publish', 'publish_confirmed', 'publish_metered') AND platform = ? AND created_at >= ? AND created_at < ?
        `).bind(...aliases, String(platform), dayStart, dayEnd).first();
        return { total: Number(total?.count || 0), platform: Number(byPlatform?.count || 0), dayStart, dayEnd };
      } catch (_) {
        return { total: 0, platform: 0, dayStart, dayEnd };
      }
    }, "countDailyPosts");
    const countMonthlyPublications = /* @__PURE__ */ __name(async (userIds) => {
      const aliases = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
      if (!aliases.length) return 0;
      const current = new Date();
      const start = Math.floor(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1) / 1000);
      const end = Math.floor(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1) / 1000);
      const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM billing_usage_events
        WHERE user_id IN (${sqlPlaceholders(aliases)}) AND created_at >= ? AND created_at < ?
        AND ((event_type = 'publish' AND platform IN ('youtube','facebook'))
          OR (event_type = 'publish_confirmed' AND platform IN ('youtube','facebook','tiktok')))`)
        .bind(...aliases, start, end).first();
      const metered = await env.DB.prepare(`SELECT COUNT(*) AS count FROM billing_publish_slots
        WHERE user_id IN (${sqlPlaceholders(aliases)}) AND completed_at >= ? AND completed_at < ? AND status = 'completed'`)
        .bind(...aliases, start, end).first();
      return Number(row?.count || 0) + Number(metered?.count || 0);
    }, "countMonthlyPublications");
    let publicationSlotId = null;
    let publicationCanonicalUserId = null;
    let publicationSlotRetained = false;
    const releasePublicationSlot = /* @__PURE__ */ __name(async (slotId) => {
      if (slotId) await env.DB.prepare("UPDATE billing_publish_slots SET status = 'failed' WHERE id = ? AND status = 'pending'").bind(slotId).run();
    }, "releasePublicationSlot");
    const bindPublicationSession = /* @__PURE__ */ __name(async (sessionId) => {
      if (!publicationSlotId) return;
      await env.DB.prepare("INSERT INTO billing_publish_sessions (session_id, slot_id) VALUES (?, ?)")
        .bind(sessionId, publicationSlotId).run();
      publicationSlotRetained = true;
    }, "bindPublicationSession");
    const finishPublicationSlot = /* @__PURE__ */ __name(async (slotId, canonicalUserId, platform, eventUserId = canonicalUserId) => {
      if (!slotId) return false;
      const completed = await env.DB.prepare(`UPDATE billing_publish_slots SET status = 'completed', completed_at = strftime('%s','now')
        WHERE id = ? AND user_id = ? AND platform = ? AND status = 'pending'`).bind(slotId, String(canonicalUserId), String(platform)).run();
      if (!Number(completed?.meta?.changes ?? completed?.changes ?? 0)) {
        const previous = await env.DB.prepare("SELECT status FROM billing_publish_slots WHERE id = ? AND user_id = ? AND platform = ?")
          .bind(slotId, String(canonicalUserId), String(platform)).first();
        if (previous?.status === 'completed') return false; // concurrent status retry
        throw new Error("Publication succeeded but its reservation could not be finalized; contact support before retrying.");
      }
      // New publications are counted by the slot, not by this compatibility
      // event. The event retains the existing daily meter and onboarding flag.
      await env.DB.prepare(`INSERT INTO billing_usage_events (user_id, event_type, platform, created_at)
        VALUES (?, 'publish_metered', ?, strftime('%s','now'))`).bind(String(eventUserId), String(platform)).run();
      return true;
    }, "finishPublicationSlot");
    const finishPublicationSession = /* @__PURE__ */ __name(async (sessionId, userId, platform, success) => {
      const binding = await env.DB.prepare(`SELECT b.slot_id, s.user_id, s.platform FROM billing_publish_sessions b
        JOIN billing_publish_slots s ON s.id = b.slot_id WHERE b.session_id = ?`).bind(sessionId).first();
      if (binding) {
        if (binding.platform !== platform) throw new Error("Publication session platform mismatch");
        if (success) await finishPublicationSlot(binding.slot_id, binding.user_id, platform, userId);
        else await releasePublicationSlot(binding.slot_id);
        await env.DB.prepare("DELETE FROM billing_publish_sessions WHERE session_id = ?").bind(sessionId).run();
        return true;
      }
      return false;
    }, "finishPublicationSession");
    const recordPublishUsage = /* @__PURE__ */ __name(async (userId, platform, eventType = 'publish') => {
      if (publicationSlotId) {
        publicationSlotRetained = true;
        await finishPublicationSlot(publicationSlotId, publicationCanonicalUserId || userId, platform, userId);
        return;
      }
      try {
        await env.DB.prepare(`
          INSERT INTO billing_usage_events (user_id, event_type, platform, created_at)
          VALUES (?, ?, ?, strftime('%s','now'))
        `).bind(String(userId), String(eventType), String(platform)).run();
      } catch (_) {
      }
    }, "recordPublishUsage");
    const ensurePlanQuota = /* @__PURE__ */ __name(async (userId, platform, evaluated) => {
      if (!evaluated?.enabled || evaluated?.reason === "owner_bypass") {
        return { ok: true };
      }
      const limits = evaluated?.plan?.limits || PLAN_LIMITS.pro;
      if (await countMonthlyPublications(evaluated?.identityAliases || [userId]) >= 150) {
        return { ok: false, statusCode: 429, body: { success: false, error: "150 successful platform publications reached this month" } };
      }
      const usage = await countDailyPosts(evaluated?.identityAliases || [userId], platform);
      const platformLimit = Number(limits?.daily_per_platform_posts?.[platform] || 0);
      if (platformLimit > 0 && usage.platform >= platformLimit) {
        return { ok: false, statusCode: 429, body: { success: false, error: `Daily ${platform} posting limit reached for your plan` } };
      }
      const totalLimit = Number(limits?.daily_total_posts || 0);
      if (totalLimit > 0 && usage.total >= totalLimit) {
        return { ok: false, statusCode: 429, body: { success: false, error: "Daily posting limit reached for your plan" } };
      }
      const aliases = [...new Set(evaluated?.identityAliases || [userId])].filter(Boolean);
      const monthStart = aiMonthStart();
      const slotId = crypto.randomUUID();
      // SQLite/D1 serializes this conditional insert. Legacy successes and
      // pending/completed slots occupy one of the 150 monthly places.
      const reserved = await env.DB.prepare(`INSERT INTO billing_publish_slots (id, user_id, platform, month_start, status)
        SELECT ?, ?, ?, ?, 'pending' WHERE
          (SELECT COUNT(*) FROM billing_usage_events WHERE user_id IN (${sqlPlaceholders(aliases)})
            AND created_at >= ? AND created_at < ?
            AND ((event_type = 'publish' AND platform IN ('youtube','facebook'))
              OR (event_type = 'publish_confirmed' AND platform IN ('youtube','facebook','tiktok'))))
          + (SELECT COUNT(*) FROM billing_publish_slots WHERE user_id = ? AND
             ((status = 'pending' AND month_start = ?) OR (status = 'completed' AND completed_at >= ? AND completed_at < ?))) < 150`)
        .bind(slotId, evaluated.canonicalUserId || userId, platform, monthStart, ...aliases,
          monthStart, Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1) / 1000),
          evaluated.canonicalUserId || userId, monthStart, monthStart,
          Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1) / 1000)).run();
      if (!Number(reserved?.meta?.changes ?? reserved?.changes ?? 0)) {
        return { ok: false, statusCode: 429, body: { success: false, error: "150 platform publication places are in use this month. Pending uploads release their place if they fail." } };
      }
      publicationSlotId = slotId;
      publicationCanonicalUserId = evaluated.canonicalUserId || userId;
      return { ok: true, slotId };
    }, "ensurePlanQuota");
    const countLinkedAccountsByPlatform = /* @__PURE__ */ __name(async (userId, platform) => {
      const row = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM accounts
        WHERE user_id = ? AND platform = ?
      `).bind(String(userId), String(platform)).first();
      return Number(row?.count || 0);
    }, "countLinkedAccountsByPlatform");
    const ensureLinkingQuota = /* @__PURE__ */ __name(async ({ userId, platform, folderId, evaluated }) => {
      if (!evaluated?.enabled || evaluated?.reason === "owner_bypass") return { ok: true };
      const limits = evaluated?.plan?.limits || PLAN_LIMITS.pro;
      const baseCap = Number(limits?.account_caps?.[platform] || 0);
      const cap = evaluated.reason === 'play_verified'
        ? baseCap * Math.max(1, Math.min(10, Number(evaluated.workspaceAllowance || 1))) : baseCap;
      if (!cap) return { ok: true };
      const existingInFolder = await env.DB.prepare(`
        SELECT COUNT(*) AS count FROM accounts WHERE user_id = ? AND folder_id = ? AND platform = ?
      `).bind(String(userId), String(folderId || ""), String(platform)).first();
      if (Number(existingInFolder?.count || 0) > 0) return { ok: true };
      const currentTotal = await countLinkedAccountsByPlatform(userId, platform);
      if (currentTotal >= cap) {
        const label = platform === "facebook_page" ? "Facebook pages" : platform === "youtube" ? "YouTube accounts" : "TikTok accounts";
        return { ok: false, statusCode: 429, body: { success: false, error: `${label} limit reached for your plan` } };
      }
      return { ok: true };
    }, "ensureLinkingQuota");
    const ensureBillingAccess = /* @__PURE__ */ __name(async (userId, platform, request2, requireAuthentication = false, requestedFolderId = null) => {
      if (!userId) {
        return { ok: false, statusCode: 400, body: { success: false, error: "Missing user_id" } };
      }
      const row = await getBillingRow(userId);
      const authenticatedIdentity = await getFirebaseIdentity(request2);
      if (!identityMatchesBillingUser(row, userId, authenticatedIdentity)) {
        return { ok: false, statusCode: 401, body: { success: false, error: "Authenticated account does not match this billing account" } };
      }
      const playEntitlement = await getPlayEntitlement(authenticatedIdentity);
      const evaluated = await withStripeWorkspaceAllowance(
        evaluateBillingAccess(row, platform, userId, authenticatedIdentity, playEntitlement), userId);
      if (evaluated.access) {
        const folderId = requestedFolderId || request2.headers.get('folder_id') || new URL(request2.url).searchParams.get('folder_id');
        if (folderId && !(await workspaceSelection(authenticatedIdentity, evaluated)).active.has(String(folderId))) {
          return { ok: false, statusCode: 423, body: { success: false, code: 'WORKSPACE_LOCKED',
            error: 'This workspace is saved but outside your current paid allowance. Choose it on the dashboard or restore your workspaces.' } };
        }
        evaluated.canonicalUserId = authenticatedIdentity.userId;
        evaluated.identityAliases = [...new Set([authenticatedIdentity.userId,
          ...(authenticatedIdentity.emailVerified && authenticatedIdentity.email ? [authenticatedIdentity.email] : []),
          ...(authenticatedIdentity.workspaceOwnerIds || [])])];
        return { ok: true, row, evaluated, identity: authenticatedIdentity };
      }
      return {
        ok: false,
        statusCode: 402,
        body: {
          success: false,
          error: "Active subscription required",
          billing: {
            enabled: evaluated.enabled,
            access: false,
            status: evaluated.status,
            reason: evaluated.reason
          }
        }
      };
    }, "ensureBillingAccess");
    const aiMonthStart = /* @__PURE__ */ __name(() => {
      const current = new Date();
      return Math.floor(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1) / 1000);
    }, "aiMonthStart");
    const generateWithCredits = /* @__PURE__ */ __name(async (userId, gate, payload, input, options = {}) => {
      if (!gate.evaluated.enabled || gate.evaluated.owner) return generateSeo(env, input, options);
      userId = gate.identity.userId;
      const credits = input.imageBase64 || input.imageDataUrl ? 2 : 1;
      const requestId = typeof payload.request_id === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(payload.request_id)
        ? payload.request_id : crypto.randomUUID();
      const inputHash = await sha256Hex(JSON.stringify({ input, provider: options.provider || "" }));
      const monthStart = aiMonthStart();
      // A Worker interrupted after reserving but before finalizing must not
      // permanently consume the customer's allowance.
      await env.DB.prepare(`UPDATE billing_ai_requests SET status = 'failed'
        WHERE user_id = ? AND status = 'pending' AND created_at < strftime('%s','now') - 1800`)
        .bind(userId).run();
      // D1 serializes this count and reservation in one statement.
      const reserved = await env.DB.prepare(`INSERT OR IGNORE INTO billing_ai_requests
        (user_id, request_id, input_hash, month_start, credits, status)
        SELECT ?, ?, ?, ?, ?, 'pending'
        WHERE ? + COALESCE((SELECT SUM(credits) FROM billing_ai_requests
          WHERE user_id = ? AND month_start = ? AND status IN ('pending','completed')), 0) <= 150`)
        .bind(userId, requestId, inputHash, monthStart, credits, credits, userId, monthStart).run();
      if (!Number(reserved?.meta?.changes ?? reserved?.changes ?? 0)) {
        const previous = await env.DB.prepare("SELECT input_hash, status, result_json FROM billing_ai_requests WHERE user_id = ? AND request_id = ?")
          .bind(userId, requestId).first();
        if (!previous) { const error = new Error("Monthly AI credit allowance reached"); error.statusCode = 429; throw error; }
        if (previous.input_hash !== inputHash) { const error = new Error("Request ID was already used for different content"); error.statusCode = 409; throw error; }
        if (previous.status === "completed" && previous.result_json) return JSON.parse(previous.result_json);
        const error = new Error(previous.status === "pending" ? "Generation is already in progress" : "Previous generation failed; start a new request");
        error.statusCode = 409;
        throw error;
      }
      try {
        const result = await generateSeo(env, input, options);
        await env.DB.prepare("UPDATE billing_ai_requests SET status = 'completed', credits = ?, result_json = ? WHERE user_id = ? AND request_id = ? AND status = 'pending'")
          .bind(result.provider === "local" ? 0 : credits, JSON.stringify(result), userId, requestId).run();
        return result;
      } catch (error) {
        await env.DB.prepare("UPDATE billing_ai_requests SET status = 'failed' WHERE user_id = ? AND request_id = ? AND status = 'pending'")
          .bind(userId, requestId).run();
        throw error;
      }
    }, "generateWithCredits");
    if (url.pathname === "/api/generate-premium-seo" && request.method === "POST") {
      try {
        const body = await request.json();
        const userId = requireUser(body?.user_id);
        if (!userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing user_id" }), { status: 400, headers: jsonHeaders });
        }
        // SEO is a web entitlement even if a caller spoofs the client_platform header.
        const billingGate = await ensureBillingAccess(userId, "web", request, true);
        if (!billingGate.ok) {
          return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        }
        const input = await normalizeSeoInput(body);
        if (!input.topic.trim() && !input.imageBase64) {
          return new Response(JSON.stringify({ error: "Provide an image, a text prompt, or both" }), { status: 400, headers: jsonHeaders });
        }
        const requestedProvider = env.ALLOW_SEO_PROVIDER_OVERRIDE === "true" && ["openai", "cloudflare"].includes(body.provider)
          ? body.provider
          : undefined;
        const result = await generateWithCredits(userId, billingGate, body, input, requestedProvider ? { provider: requestedProvider } : {});
        return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err?.message || "SEO generation failed" }), { status: err?.statusCode || 500, headers: jsonHeaders });
      }
    }
    const timingSafeEqual = /* @__PURE__ */ __name((a, b) => {
      if (a.length !== b.length) return false;
      let out = 0;
      for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return out === 0;
    }, "timingSafeEqual");
    const verifyStripeSignature = /* @__PURE__ */ __name(async (rawBody, signatureHeader) => {
      if (!stripeWebhookSecret) throw new Error("Stripe webhook secret is not configured");
      if (!signatureHeader) throw new Error("Missing Stripe signature header");
      const parts = String(signatureHeader).split(",").map((p) => p.trim());
      const timestampPart = parts.find((p) => p.startsWith("t="));
      const sigPart = parts.find((p) => p.startsWith("v1="));
      if (!timestampPart || !sigPart) throw new Error("Invalid Stripe signature header");
      const timestamp = timestampPart.slice(2);
      if (!/^\d+$/.test(timestamp) || Math.abs(nowUnix() - Number(timestamp)) > 300)
        throw new Error("Stripe signature timestamp is outside the allowed window");
      const received = sigPart.slice(3);
      const signedPayload = `${timestamp}.${rawBody}`;
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(stripeWebhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
      const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      if (!timingSafeEqual(expected, received)) throw new Error("Stripe signature verification failed");
      return true;
    }, "verifyStripeSignature");
    try {
      if (url.pathname === "/api/get-folders") {
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing user_id" }), { status: 400, headers: jsonHeaders });
        }
        const identity = await getFirebaseIdentity(request);
        if (!identity) return new Response(JSON.stringify({ success: false, code: "SIGN_IN_REQUIRED", error: "Sign in again to load your workspaces." }), { status: 401, headers: jsonHeaders });
        if (identity.email && !identity.emailVerified) return new Response(JSON.stringify({ success: false, code: "EMAIL_VERIFICATION_REQUIRED", error: "Verify your email address before opening workspaces." }), { status: 403, headers: jsonHeaders });
        if (!matchesIdentity(userId, identity)) return new Response(JSON.stringify({ success: false, code: "IDENTITY_MISMATCH", error: "This workspace request does not match your current sign-in." }), { status: 403, headers: jsonHeaders });
        const userAliases = [...new Set([identity.userId, ...(identity.emailVerified && identity.email ? [identity.email] : []), ...(identity.workspaceOwnerIds || [])])];
        const { results } = await env.DB.prepare(
          `SELECT f.*, (SELECT nickname FROM accounts WHERE folder_id = f.id AND user_id = f.user_id AND platform = 'youtube' LIMIT 1) as youtube_channel, (SELECT profile_picture FROM accounts WHERE folder_id = f.id AND user_id = f.user_id AND platform = 'youtube' LIMIT 1) as youtube_picture, (SELECT COUNT(*) FROM accounts WHERE folder_id = f.id AND user_id = f.user_id AND platform IN ('youtube', 'facebook_page', 'tiktok')) as connected_account_count, EXISTS(SELECT 1 FROM billing_usage_events e WHERE e.user_id = f.user_id AND ((e.event_type = 'publish' AND e.platform IN ('youtube', 'facebook')) OR (e.event_type = 'publish_confirmed' AND e.platform IN ('tiktok', 'facebook')) OR e.event_type = 'publish_metered')) as has_first_post FROM folders f WHERE f.user_id IN (${sqlPlaceholders(userAliases)}) ORDER BY f.created_at DESC`
        ).bind(...userAliases).all();
        let row = await getBillingRow(userId);
        row = await refreshBillingFromStripe(row);
        const entitlement = await withStripeWorkspaceAllowance(
          evaluateBillingAccess(row, 'web', userId, identity, await getPlayEntitlement(identity)), userId);
        const selection = await workspaceSelection(identity, entitlement);
        return new Response(JSON.stringify(results.map((folder) => ({ ...folder,
          workspace_locked: !selection.active.has(String(folder.id)) }))), { headers: jsonHeaders });
      }
      if (url.pathname === '/api/workspaces/select-active' && request.method === 'POST') {
        const identity = await getFirebaseIdentity(request);
        if (!identity?.userId) return Response.json({ success: false, error: 'Sign in to manage workspaces' }, { status: 401, headers: corsHeaders });
        const body = await request.json().catch(() => ({}));
        const requested = Array.isArray(body.folder_ids) ? body.folder_ids.map(String) : [];
        if (!requested.length || requested.length > 11 || new Set(requested).size !== requested.length ||
            requested.some((id) => !/^\d+$/.test(id))) {
          return Response.json({ success: false, error: 'Choose valid workspaces' }, { status: 400, headers: corsHeaders });
        }
        const gate = await ensureBillingAccess(identity.userId, 'web', request);
        if (!gate.ok) return Response.json(gate.body, { status: gate.statusCode, headers: corsHeaders });
        const selection = await workspaceSelection(identity, gate.evaluated);
        const allowance = gate.evaluated.owner || !gate.evaluated.enabled ? selection.ordered.length : gate.evaluated.workspaceAllowance || 1;
        if (requested.length > allowance || requested.some((id) => !selection.ordered.includes(id))) {
          return Response.json({ success: false, error: 'Workspace selection exceeds your paid allowance' }, { status: 403, headers: corsHeaders });
        }
        await env.DB.batch([
          env.DB.prepare('DELETE FROM billing_workspace_choices WHERE user_id = ?').bind(identity.userId),
          ...requested.map((id, priority) => env.DB.prepare('INSERT INTO billing_workspace_choices (user_id, folder_id, priority) VALUES (?, ?, ?)')
            .bind(identity.userId, id, priority))
        ]);
        return Response.json({ success: true }, { headers: corsHeaders });
      }
      if (url.pathname === "/api/add-folder") {
        const { name, user_id } = await request.json();
        const userId = requireUser(user_id);
        if (!name || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing name or user_id" }), { status: 400, headers: jsonHeaders });
        }
        const billingGate = await ensureBillingAccess(userId, "web", request);
        if (!billingGate.ok) return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        const allowance = billingGate.evaluated.reason === "owner_bypass" ? 1000 : billingGate.evaluated.workspaceAllowance || 1;
        const identity = billingGate.identity;
        const aliases = [...new Set([identity.userId, ...(identity.emailVerified && identity.email ? [identity.email] : []), ...(identity.workspaceOwnerIds || [])])];
        const inserted = await env.DB.prepare(`INSERT INTO folders (name, user_id)
          SELECT ?, ? WHERE (SELECT COUNT(*) FROM folders WHERE user_id IN (${sqlPlaceholders(aliases)})) < ?`)
          .bind(name, userId, ...aliases, allowance).run();
        if (!Number(inserted?.meta?.changes ?? inserted?.changes ?? 0)) {
          return Response.json({ success: false, error: "Workspace allowance reached. Review your subscription before adding another." }, { status: 429, headers: jsonHeaders });
        }
        return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/rename-folder") {
        const { id, name, user_id } = await request.json();
        const userId = requireUser(user_id);
        if (!id || !name || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing id, name or user_id" }), { status: 400, headers: jsonHeaders });
        }
        const renameIdentity = await getFirebaseIdentity(request);
        const requestedOwnerIsConfigured = ownerUserIds.has(normalizeUserId(userId)) || ownerEmails.has(normalizeUserId(userId));
        const authenticatedOwnerIsConfigured = renameIdentity && (
          ownerUserIds.has(normalizeUserId(renameIdentity.userId)) || ownerEmails.has(normalizeUserId(renameIdentity.email))
        );
        const mayRenameWorkspace = Boolean(renameIdentity) && (
          matchesIdentity(userId, renameIdentity) || (requestedOwnerIsConfigured && authenticatedOwnerIsConfigured)
        );
        if (!mayRenameWorkspace || !await ownedFolder(env.DB, id, userId)) return new Response(JSON.stringify({ success: false, error: "Workspace access denied" }), { status: 403, headers: jsonHeaders });
        await env.DB.prepare(
          "UPDATE folders SET name = ? WHERE id = ? AND user_id = ?"
        ).bind(name, id, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/delete-folder") {
        const { id, user_id, type } = await request.json();
        const userId = requireUser(user_id);
        if (!id || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing id or user_id" }), { status: 400, headers: jsonHeaders });
        }
        const deleteIdentity = await getFirebaseIdentity(request);
        if (!matchesIdentity(userId, deleteIdentity)) {
          return Response.json({ success: false, error: "Sign in to manage this workspace" }, { status: 403, headers: corsHeaders });
        }
        if (type === "account_only") {
          const acct = await env.DB.prepare(
            "SELECT id, platform, folder_id FROM accounts WHERE (id = ? OR facebook_page_id = ?) AND user_id = ?"
          ).bind(id, id, userId).first();
          if (!acct || !await ownedFolder(env.DB, acct.folder_id, userId)) {
            return Response.json({ success: false, error: "Connected account not found" }, { status: 404, headers: corsHeaders });
          }
          if (acct?.platform === "tiktok") {
            await disconnectTikTok(env.DB, id, userId);
            return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
          }
          if (acct && (acct.platform === "facebook" || acct.platform === "facebook_page")) {
            await env.DB.prepare(
              "DELETE FROM accounts WHERE folder_id = ? AND user_id = ? AND platform IN ('facebook', 'facebook_page')"
            ).bind(acct.folder_id, userId).run();
            await env.DB.prepare("DELETE FROM tokens WHERE folder_id = ? AND platform = 'facebook_page'").bind(acct.folder_id).run();
          } else {
            await env.DB.prepare(
              "DELETE FROM accounts WHERE id = ? AND user_id = ?"
            ).bind(id, userId).run();
            if (acct.platform === "youtube") await env.DB.prepare("DELETE FROM tokens WHERE folder_id = ? AND platform = 'youtube'").bind(acct.folder_id).run();
          }
          return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
        }
        const requestedOwnerIsConfigured = ownerUserIds.has(normalizeUserId(userId)) || ownerEmails.has(normalizeUserId(userId));
        const authenticatedOwnerIsConfigured = deleteIdentity && (
          ownerUserIds.has(normalizeUserId(deleteIdentity.userId)) || ownerEmails.has(normalizeUserId(deleteIdentity.email))
        );
        const mayDeleteWorkspace = Boolean(deleteIdentity) && (
          matchesIdentity(userId, deleteIdentity) || (requestedOwnerIsConfigured && authenticatedOwnerIsConfigured)
        );
        if (!mayDeleteWorkspace || !await ownedFolder(env.DB, id, userId)) return new Response(JSON.stringify({ error: "Workspace access denied" }), { status: 403, headers: jsonHeaders });
        await env.DB.batch([
          env.DB.prepare("DELETE FROM tokens WHERE folder_id = ? AND platform = 'tiktok'").bind(id),
          env.DB.prepare("DELETE FROM upload_sessions WHERE folder_id = ? AND user_id = ? AND platform = 'tiktok'").bind(String(id), userId),
          env.DB.prepare("DELETE FROM tiktok_oauth_states WHERE folder_id = ? AND user_id = ?").bind(String(id), userId)
        ]);
        await env.DB.prepare(
          "DELETE FROM accounts WHERE folder_id = ? AND user_id = ?"
        ).bind(id, userId).run();
        await env.DB.prepare("DELETE FROM tokens WHERE folder_id = ?").bind(id).run();
        await env.DB.prepare(
          "DELETE FROM folders WHERE id = ? AND user_id = ?"
        ).bind(id, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/get-accounts") {
        const folder_id = url.searchParams.get("folder_id");
        const userId = requireUser(url.searchParams.get("user_id"));
        const userEmail = String(url.searchParams.get("user_email") || "").trim();
        if (!folder_id || !userId) {
          return new Response(JSON.stringify([]), { headers: jsonHeaders });
        }
        const identity = await getFirebaseIdentity(request);
        if (!identity) return new Response(JSON.stringify({ code: "SIGN_IN_REQUIRED", error: "Your sign-in expired. Sign in again to load this workspace." }), { status: 401, headers: jsonHeaders });
        if (!matchesIdentity(userId, identity)) {
          const unverified = !identity.emailVerified && String(userId).toLowerCase() === identity.email;
          return new Response(JSON.stringify({ code: unverified ? "EMAIL_VERIFICATION_REQUIRED" : "IDENTITY_MISMATCH",
            error: unverified ? "Verify your Multi Post email address before opening email-owned workspaces, then retry."
              : "This saved account identity does not match your current sign-in." }), { status: 403, headers: jsonHeaders });
        }
        const allowedOwners = [...new Set([identity.userId, ...(identity.emailVerified && identity.email ? [identity.email] : []), ...(identity.workspaceOwnerIds || [])])];
        const folder = await env.DB.prepare(`SELECT id, user_id FROM folders WHERE id = ? AND user_id IN (${sqlPlaceholders(allowedOwners)})`).bind(folder_id, ...allowedOwners).first();
        if (!folder) return new Response(JSON.stringify({ code: "WORKSPACE_ACCESS_DENIED", error: "This workspace belongs to a different Multi Post account. Sign in with the account used to create it." }), { status: 403, headers: jsonHeaders });
        const folderGate = await ensureBillingAccess(folder.user_id, 'web', request, false, folder_id);
        if (!folderGate.ok) return Response.json(folderGate.body, { status: folderGate.statusCode, headers: corsHeaders });
        const workspaceOwner = folder.user_id || userId;
        const userAliases = [workspaceOwner];
        const { results } = await env.DB.prepare(
          `SELECT id, user_id, folder_id, platform, nickname, profile_picture, facebook_user_id,
            facebook_user_name, facebook_page_id, facebook_page_name, facebook_page_picture, tiktok_open_id
            FROM accounts WHERE folder_id = ? AND user_id IN (${sqlPlaceholders(userAliases)}) ORDER BY id DESC`
        ).bind(folder_id, ...userAliases).all();
        return new Response(JSON.stringify(results), { headers: { ...jsonHeaders, "Cache-Control": "no-store", "X-Workspace-Owner": workspaceOwner } });
      }
      if (url.pathname === "/api/billing/plans" && request.method === "GET") {
        const priceCatalog = getPriceCatalog();
        return new Response(JSON.stringify({
          success: true,
          checkout_enabled: webBillingEnabled && stripeCheckoutEnabled && Boolean(stripeCheckoutAccountId && stripeSecretKey && stripeWebhookSecret && priceCatalog.pro.monthly && priceCatalog.pro.yearly),
          plans: {
            pro: {
              key: "pro",
              label: "Creator",
              prices: priceCatalog.pro,
              limits: PLAN_LIMITS.pro
            },
            pro_plus: {
              key: "pro_plus",
              label: "Pro",
              prices: priceCatalog.pro_plus,
              limits: PLAN_LIMITS.pro_plus
            },
            agency: {
              key: "agency",
              label: "Agency",
              prices: priceCatalog.agency,
              limits: PLAN_LIMITS.agency
            }
          },
          trial: {
            days: stripeTrialDays,
            yearly_only: false
          }
        }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/billing/play-purchase" && request.method === "POST") {
        const identity = await getFirebaseIdentity(request);
        if (!identity?.userId) {
          return Response.json({ success: false, error: "Firebase authentication required" }, { status: 401, headers: corsHeaders });
        }
        const body = await request.json().catch(() => ({}));
        const token = body?.purchase_token;
        if (typeof token !== "string" || !token || token.length > 4096) {
          return Response.json({ success: false, error: "Invalid purchase token" }, { status: 400, headers: corsHeaders });
        }
        if (!env.PLAY_SERVICE_ACCOUNT_JSON || !env.PLAY_TOKEN_ENCRYPTION_KEY) {
          return Response.json({ success: false, error: "Play verification is not configured" }, { status: 503, headers: corsHeaders });
        }
        try {
          // Only Google's API response and the authenticated Firebase UID establish access.
          const priorPaid = await env.DB.prepare("SELECT pro_paid_order_id FROM billing_play_purchases WHERE user_id = ? LIMIT 1").bind(identity.userId).first();
          const verified = await verifyPlayPurchase({ token, firebaseUid: identity.userId, serviceAccountJson: env.PLAY_SERVICE_ACCOUNT_JSON, previousPaidOrderId: priorPaid?.pro_paid_order_id });
          const tokenHash = await sha256Hex(token);
          const existing = await env.DB.prepare("SELECT user_id FROM billing_play_token_claims WHERE token_hash = ? LIMIT 1").bind(tokenHash).first();
          if (existing && existing.user_id !== identity.userId) {
            return Response.json({ success: false, error: "Purchase belongs to another account" }, { status: 409, headers: corsHeaders });
          }
          const prior = await env.DB.prepare("SELECT token_hash, expiry_time, subscription_state FROM billing_play_purchases WHERE user_id = ? LIMIT 1").bind(identity.userId).first();
          if (prior && prior.token_hash !== tokenHash) {
            const linkedHash = verified.linkedPurchaseToken ? await sha256Hex(verified.linkedPurchaseToken) : null;
            const priorStillActive = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
              'SUBSCRIPTION_STATE_CANCELED'].includes(prior.subscription_state) && Number(prior.expiry_time || 0) > nowUnix();
            if (linkedHash !== prior.token_hash && priorStillActive) {
              return Response.json({ success: false, error: "Purchase replacement does not match the current subscription" }, { status: 409, headers: corsHeaders });
            }
          }
          await env.DB.prepare("INSERT OR IGNORE INTO billing_play_token_claims (token_hash, user_id) VALUES (?, ?)")
            .bind(tokenHash, identity.userId).run();
          const claim = await env.DB.prepare("SELECT user_id FROM billing_play_token_claims WHERE token_hash = ?").bind(tokenHash).first();
          if (claim?.user_id !== identity.userId) {
            return Response.json({ success: false, error: "Purchase belongs to another account" }, { status: 409, headers: corsHeaders });
          }
          const encrypted = await encryptPurchaseToken(token, env.PLAY_TOKEN_ENCRYPTION_KEY);
          await env.DB.prepare(`INSERT INTO billing_play_purchases
            (user_id, token_hash, encrypted_token, product_id, base_plan_id, subscription_state, expiry_time, trial_end, workspace_quantity, workspace_expiry, workspace_items_json, pro_paid_order_id, last_verified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
            ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, encrypted_token = excluded.encrypted_token,
            product_id = excluded.product_id, base_plan_id = excluded.base_plan_id,
            subscription_state = excluded.subscription_state, expiry_time = excluded.expiry_time, trial_end = excluded.trial_end,
            workspace_quantity = excluded.workspace_quantity, workspace_expiry = excluded.workspace_expiry,
            workspace_items_json = excluded.workspace_items_json, pro_paid_order_id = excluded.pro_paid_order_id,
            last_verified_at = excluded.last_verified_at
            WHERE billing_play_purchases.token_hash = ? OR billing_play_purchases.token_hash = excluded.token_hash`)
            .bind(identity.userId, tokenHash, encrypted, verified.productId, verified.basePlanId, verified.state, verified.expiry,
              verified.trialEnd, verified.workspaceQuantity, verified.workspaceExpiry, JSON.stringify(verified.workspaceItems), verified.paidProOrderId,
              prior?.token_hash || tokenHash).run();
          const current = await env.DB.prepare("SELECT token_hash FROM billing_play_purchases WHERE user_id = ?").bind(identity.userId).first();
          if (current?.token_hash !== tokenHash) {
            return Response.json({ success: false, error: "Subscription changed while restoring; retry with the current purchase" }, { status: 409, headers: corsHeaders });
          }
          return Response.json({ success: true, access: verified.access, status: verified.state, expires_at: verified.expiry, workspace_quantity: verified.workspaceQuantity, paid_pro: verified.paidPro }, { headers: corsHeaders });
        } catch (_) {
          return Response.json({ success: false, error: "Google Play purchase could not be verified" }, { status: 400, headers: corsHeaders });
        }
      }
      if (url.pathname === "/api/billing/status" && request.method === "GET") {
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing user_id" }), { status: 400, headers: jsonHeaders });
        }
        const platform = getClientPlatform(request, null, url.searchParams.get("client_platform"));
        let row = await getBillingRow(userId);
        const authenticatedIdentity = await getFirebaseIdentity(request);
        if (!identityMatchesBillingUser(row, userId, authenticatedIdentity)) {
          return new Response(JSON.stringify({ success: false, error: "Authenticated account does not match this billing account" }), { status: 401, headers: jsonHeaders });
        }
        row = await refreshBillingFromStripe(row);
        const playEntitlement = await getPlayEntitlement(authenticatedIdentity);
        if (row?.stripe_subscription_id && row.subscription_status === "active" &&
            !row.stripe_pro_paid_at && !playEntitlement?.access) {
          try {
            if (await hasPaidStripeProInvoice(row)) row = await getBillingRow(userId);
          } catch (error) { console.warn("Stripe paid Pro verification failed", error?.message || error); }
        }
        const evaluated = await withStripeWorkspaceAllowance(
          evaluateBillingAccess(row, platform, userId, authenticatedIdentity, playEntitlement), userId);
        const effPlan = evaluated.plan || getEffectivePlan(row);
        const usageAliases = [authenticatedIdentity.userId,
          ...(authenticatedIdentity.emailVerified && authenticatedIdentity.email ? [authenticatedIdentity.email] : []),
          ...(authenticatedIdentity.workspaceOwnerIds || [])];
        const usageYt = await countDailyPosts(usageAliases, "youtube");
        const usageTt = await countDailyPosts(usageAliases, "tiktok");
        const usageFb = await countDailyPosts(usageAliases, "facebook");
        const dailyTotal = usageYt.total;
        const aiMonth = aiMonthStart();
        const aiUsed = await env.DB.prepare(`SELECT COALESCE(SUM(credits),0) AS count FROM billing_ai_requests
          WHERE user_id = ? AND month_start = ? AND status IN ('pending','completed')`).bind(authenticatedIdentity.userId, aiMonth).first();
        const publicationsThisMonth = await countMonthlyPublications([authenticatedIdentity.userId,
          ...(authenticatedIdentity.emailVerified && authenticatedIdentity.email ? [authenticatedIdentity.email] : []),
          ...(authenticatedIdentity.workspaceOwnerIds || [])]);
        let workspaceCheckoutEnabled = false;
        if (evaluated.reason === "ok" && evaluated.status === "active" && row?.stripe_pro_paid_at &&
            stripeCheckoutEnabled && stripeWorkspacePriceId && stripeSecretKey && stripeWebhookSecret) {
          try { workspaceCheckoutEnabled = await isStripeProRenewing(row); } catch (error) {
            console.warn("Stripe Pro renewal check failed", error?.message || error);
          }
        }
        return new Response(JSON.stringify({
          success: true,
          billing: {
            enabled: evaluated.enabled,
            access: evaluated.access,
            status: evaluated.status,
            reason: evaluated.reason,
            platform,
            owner_mode: evaluated.reason === "owner_bypass",
            workspace_allowance: evaluated.workspaceAllowance || (evaluated.reason === "owner_bypass" ? null : 1),
            additional_workspaces: playEntitlement?.access ? Number(playEntitlement.workspaceQuantity || 0) : (evaluated.stripeWorkspaceAddons?.length || 0),
            stripe_workspace_addons: evaluated.stripeWorkspaceAddons || [],
            stripe_workspace_paid_pro: evaluated.reason === "ok" && Number(row?.stripe_pro_paid_at || 0) > 0,
            stripe_workspace_checkout_enabled: workspaceCheckoutEnabled,
            workspace_product_ids: playEntitlement?.access ? (playEntitlement.workspaceItems || []).map((item) => item.productId) : [],
            workspace_renewing_ids: playEntitlement?.access ? (playEntitlement.workspaceItems || []).filter((item) => item.renewing).map((item) => item.productId) : [],
            ai_credits: { used: Number(aiUsed?.count || 0), allowance: 150 },
            publications: { used: publicationsThisMonth, allowance: 150 },
            trial_days_default: stripeTrialDays,
            plan: {
              key: effPlan.planKey,
              interval: effPlan.interval || String(row?.billing_interval || ""),
              limits: effPlan.limits
            },
            usage_today: {
              total: dailyTotal,
              youtube: usageYt.platform,
              tiktok: usageTt.platform,
              facebook: usageFb.platform
            },
            subscription: {
              stripe_customer_id: row?.stripe_customer_id || null,
              stripe_subscription_id: row?.stripe_subscription_id || null,
              stripe_price_id: row?.stripe_price_id || null,
              current_period_end: toUnix(row?.current_period_end),
              trial_end: playEntitlement?.trialEnd || toUnix(row?.trial_end),
              trial_used: Number(row?.trial_used || 0) === 1,
              is_owner: Number(row?.is_owner || 0) === 1
            },
            play: playEntitlement ? { state: playEntitlement.state, expires_at: playEntitlement.expiry, base_plan_id: playEntitlement.basePlanId, trial_end: playEntitlement.trialEnd || null, paid_pro: playEntitlement.paidPro === true } : null
          }
        }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/billing/owner-mode" && request.method === "POST") {
        const auth = String(request.headers.get("x-owner-admin-token") || "").trim();
        if (!ownerAdminToken || !auth || auth !== ownerAdminToken) {
          return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
        }
        const body = await request.json().catch(() => ({}));
        const userId = requireUser(body?.user_id);
        const userEmail = body?.user_email ? String(body.user_email).trim().toLowerCase() : null;
        const isOwner = Number(body?.is_owner || 0) === 1 ? 1 : 0;
        if (!userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing user_id" }), { status: 400, headers: jsonHeaders });
        }
        await ensureBillingRow(userId, userEmail);
        await env.DB.prepare(`
          UPDATE billing_subscriptions
          SET is_owner = ?, user_email = COALESCE(?, user_email), updated_at = strftime('%s','now')
          WHERE user_id = ?
        `).bind(isOwner, userEmail, String(userId)).run();
        return new Response(JSON.stringify({ success: true, user_id: String(userId), is_owner: isOwner === 1 }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/billing/create-checkout-session" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const userId = requireUser(body?.user_id);
        const authenticatedIdentity = await getFirebaseIdentity(request);
        if (!identityMatchesBillingUser(null, userId, authenticatedIdentity)) {
          return new Response(JSON.stringify({ success: false, error: "Authenticated account does not match this billing account" }), { status: 401, headers: jsonHeaders });
        }
        const userEmail = authenticatedIdentity?.email || null;
        const platform = getClientPlatform(request, body?.client_platform, null);
        if (!userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing user_id" }), { status: 400, headers: jsonHeaders });
        }
        if (platform === "android") {
          return new Response(JSON.stringify({ success: false, error: "Checkout disabled for Android app builds" }), { status: 400, headers: jsonHeaders });
        }
        if (!webBillingEnabled) {
          return new Response(JSON.stringify({ success: false, error: "Web billing is disabled" }), { status: 400, headers: jsonHeaders });
        }
        if (!stripeCheckoutEnabled || !stripeCheckoutAccountId || !stripeSecretKey || !stripeWebhookSecret) {
          return new Response(JSON.stringify({ success: false, error: "Web checkout is being prepared" }), { status: 503, headers: jsonHeaders });
        }
        const requestedPlan = String(body?.plan_key || "pro").trim().toLowerCase();
        const requestedInterval = String(body?.billing_interval || "monthly").trim().toLowerCase();
        if (requestedPlan !== "pro") {
          return new Response(JSON.stringify({ success: false, error: "Invalid plan selection" }), { status: 400, headers: jsonHeaders });
        }
        if (!["monthly", "yearly"].includes(requestedInterval)) {
          return new Response(JSON.stringify({ success: false, error: "Invalid billing interval" }), { status: 400, headers: jsonHeaders });
        }
        const priceCatalog = getPriceCatalog();
        const chosenPriceId = priceCatalog?.[requestedPlan]?.[requestedInterval] || "";
        if (!chosenPriceId) {
          return new Response(JSON.stringify({ success: false, error: "Selected Stripe price is not configured" }), { status: 500, headers: jsonHeaders });
        }
        // A browser cannot choose an external redirect destination for checkout.
        const checkoutReturnUrl = (candidate, fallback) => {
          try {
            const parsed = new URL(candidate || fallback, frontendBaseUrl);
            return parsed.origin === new URL(frontendBaseUrl).origin ? parsed.href : fallback;
          } catch (_) { return fallback; }
        };
        const successUrl = checkoutReturnUrl(body?.success_url, `${frontendBaseUrl}/settings.html?billing=success`);
        const cancelUrl = checkoutReturnUrl(body?.cancel_url, `${frontendBaseUrl}/settings.html?billing=cancelled`);
        await ensureBillingRow(userId, userEmail);
        const existing = await refreshBillingFromStripe(await getBillingRow(userId));
        const playEntitlement = await getPlayEntitlement(authenticatedIdentity);
        const entitlement = evaluateBillingAccess(existing, "web", userId, authenticatedIdentity, playEntitlement);
        if (entitlement.access || (existing?.stripe_subscription_id && ["past_due", "unpaid", "paused"].includes(String(existing.subscription_status || "").toLowerCase()))) {
          return new Response(JSON.stringify({ success: false, error: "An existing subscription is linked to this account. Manage it in Profile before starting another." }), { status: 409, headers: jsonHeaders });
        }
        const playHistory = await env.DB.prepare("SELECT 1 AS used FROM billing_play_purchases WHERE user_id = ? LIMIT 1").bind(authenticatedIdentity.userId).first();
        const stripeAccount = await stripeApi("/v1/account", "GET");
        if (stripeAccount?.id !== stripeCheckoutAccountId) {
          return new Response(JSON.stringify({ success: false, error: "Stripe checkout account does not match the configured MultiPost account" }), { status: 503, headers: jsonHeaders });
        }
        const stripePrice = await stripeApi(`/v1/prices/${encodeURIComponent(chosenPriceId)}`, "GET");
        const expectedAmount = requestedInterval === "monthly" ? 999 : 7999;
        if (stripePrice?.active !== true || stripePrice?.currency !== "gbp" || stripePrice?.unit_amount !== expectedAmount ||
            stripePrice?.recurring?.interval !== (requestedInterval === "monthly" ? "month" : "year")) {
          return new Response(JSON.stringify({ success: false, error: "Stripe price does not match the displayed MultiPost plan" }), { status: 503, headers: jsonHeaders });
        }
        let stripeCustomerId = await ensureStripeCustomerForUser(userId, userEmail, existing?.stripe_customer_id || null);
        const trialEligible = Number(existing?.trial_used || 0) !== 1 && !playHistory && !existing?.stripe_subscription_id;
        const payload = {
          mode: "subscription",
          customer: stripeCustomerId,
          success_url: successUrl,
          cancel_url: cancelUrl,
          "line_items[0][price]": chosenPriceId,
          "line_items[0][quantity]": "1",
          "metadata[user_id]": String(userId),
          "metadata[app]": "multipost",
          "metadata[plan_key]": requestedPlan,
          "metadata[billing_interval]": requestedInterval,
          client_reference_id: String(userId),
          allow_promotion_codes: "true",
          "subscription_data[metadata][user_id]": String(userId),
          "subscription_data[metadata][app]": "multipost",
          "subscription_data[metadata][plan_key]": requestedPlan,
          "subscription_data[metadata][billing_interval]": requestedInterval
        };
        if (["pro", "pro_plus"].includes(requestedPlan) && trialEligible && stripeTrialDays > 0) {
          payload["subscription_data[trial_period_days]"] = String(Math.floor(stripeTrialDays));
        }
        let session;
        try {
          session = await stripeApi("/v1/checkout/sessions", "POST", payload);
        } catch (error) {
          if (!isStripeNoSuchCustomerError(error)) throw error;
          stripeCustomerId = await ensureStripeCustomerForUser(userId, userEmail, null);
          payload.customer = stripeCustomerId;
          session = await stripeApi("/v1/checkout/sessions", "POST", payload);
        }
        return new Response(JSON.stringify({ success: true, url: session.url || null, session_id: session.id || null }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/billing/workspaces/checkout" && request.method === "POST") {
        const identity = await getFirebaseIdentity(request);
        const body = await request.json().catch(() => ({}));
        const userId = requireUser(body.user_id);
        if (!identityMatchesBillingUser(null, userId, identity)) return Response.json({ success: false, error: "Sign in to manage your own workspaces" }, { status: 401, headers: corsHeaders });
        if (getClientPlatform(request, body.client_platform) === "android") return Response.json({ success: false, error: "Use Google Play for Android workspace purchases" }, { status: 400, headers: corsHeaders });
        if (!webBillingEnabled || !stripeCheckoutEnabled || !stripeWorkspacePriceId || !stripeSecretKey || !stripeWebhookSecret)
          return Response.json({ success: false, error: "Website workspace checkout is unavailable" }, { status: 503, headers: corsHeaders });
        let row = await refreshBillingFromStripe(await getBillingRow(userId));
        const play = await getPlayEntitlement(identity);
        const access = evaluateBillingAccess(row, "web", userId, identity, play);
        if (play?.access || access.reason !== "ok" || access.status !== "active" || access.plan?.planKey !== "pro" || !row?.stripe_subscription_id)
          return Response.json({ success: false, error: "Additional workspaces become available after your first successful Pro subscription payment." }, { status: 403, headers: corsHeaders });
        if (!await hasPaidStripeProInvoice(row))
          return Response.json({ success: false, error: "Additional workspaces become available after your first successful Pro subscription payment." }, { status: 403, headers: corsHeaders });
        row = await getBillingRow(userId);
        if (!await isStripeProRenewing(row))
          return Response.json({ success: false, error: "Your Pro renewal must be active before buying another workspace." }, { status: 403, headers: corsHeaders });
        const addons = await getStripeWorkspaceAddons(userId);
        if (addons.length >= 9) return Response.json({ success: false, error: "The maximum is ten total workspaces." }, { status: 409, headers: corsHeaders });
        const account = await stripeApi("/v1/account", "GET");
        if (account.id !== stripeCheckoutAccountId) return Response.json({ success: false, error: "Stripe account mismatch" }, { status: 503, headers: corsHeaders });
        const price = await stripeApi(`/v1/prices/${encodeURIComponent(stripeWorkspacePriceId)}`, "GET");
        if (price.active !== true || price.currency !== "gbp" || Number(price.unit_amount) !== 499 ||
            price.recurring?.interval !== "month") return Response.json({ success: false, error: "Stripe workspace price mismatch" }, { status: 503, headers: corsHeaders });
        const expiresAt = nowUnix() + 1860;
        const lock = await env.DB.prepare(`INSERT INTO billing_stripe_workspace_checkout_locks (user_id, expires_at)
          VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET stripe_session_id = NULL,
            stripe_subscription_id = NULL, expires_at = excluded.expires_at
          WHERE billing_stripe_workspace_checkout_locks.expires_at < ?`)
          .bind(userId, expiresAt, nowUnix()).run();
        if (!Number(lock?.meta?.changes ?? lock?.changes ?? 0))
          return Response.json({ success: false, error: "A workspace checkout is already open. Finish it or wait for it to expire before trying again." }, { status: 409, headers: corsHeaders });
        try {
          const session = await stripeApi("/v1/checkout/sessions", "POST", {
            mode: "subscription", customer: row.stripe_customer_id,
            success_url: `${frontendBaseUrl}/settings.html?workspace=success`,
            cancel_url: `${frontendBaseUrl}/settings.html?workspace=cancelled`,
            expires_at: String(expiresAt - 60),
            "line_items[0][price]": stripeWorkspacePriceId,
            "line_items[0][quantity]": "1",
            "metadata[user_id]": userId, "metadata[kind]": "workspace_addon", "metadata[app]": "multipost",
            "subscription_data[metadata][user_id]": userId,
            "subscription_data[metadata][kind]": "workspace_addon",
            "subscription_data[metadata][app]": "multipost",
            client_reference_id: userId
          });
          await env.DB.prepare(`UPDATE billing_stripe_workspace_checkout_locks SET stripe_session_id = ? WHERE user_id = ? AND expires_at = ?`)
            .bind(session.id, userId, expiresAt).run();
          return Response.json({ success: true, url: session.url, session_id: session.id }, { headers: corsHeaders });
        } catch (error) {
          await env.DB.prepare(`DELETE FROM billing_stripe_workspace_checkout_locks WHERE user_id = ? AND expires_at = ? AND stripe_session_id IS NULL`)
            .bind(userId, expiresAt).run();
          throw error;
        }
      }
      if (url.pathname === "/api/billing/workspaces/renewal" && request.method === "POST") {
        const identity = await getFirebaseIdentity(request);
        const body = await request.json().catch(() => ({}));
        const userId = requireUser(body.user_id);
        const subscriptionId = String(body.subscription_id || "");
        if (!identityMatchesBillingUser(null, userId, identity)) return Response.json({ success: false, error: "Sign in to manage your own workspaces" }, { status: 401, headers: corsHeaders });
        if (getClientPlatform(request, body.client_platform) === "android" || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId))
          return Response.json({ success: false, error: "Invalid website workspace subscription" }, { status: 400, headers: corsHeaders });
        const addon = await env.DB.prepare(`SELECT * FROM billing_stripe_workspace_addons WHERE user_id = ? AND stripe_subscription_id = ? AND stripe_price_id = ?`)
          .bind(userId, subscriptionId, stripeWorkspacePriceId).first();
        if (!addon || Number(addon.paid_through || 0) <= nowUnix()) return Response.json({ success: false, error: "No paid workspace subscription found" }, { status: 404, headers: corsHeaders });
        const cancel = body.action === "cancel";
        if (!cancel && body.action !== "resume") return Response.json({ success: false, error: "Invalid renewal action" }, { status: 400, headers: corsHeaders });
        if (!cancel && (!await hasPaidStripeProInvoice(await getBillingRow(userId)) ||
            !await isStripeProRenewing(await getBillingRow(userId))))
          return Response.json({ success: false, error: "Resume Pro renewal before resuming an extra workspace." }, { status: 403, headers: corsHeaders });
        if (Boolean(addon.cancel_at_period_end) === cancel) return Response.json({ success: false, error: "Renewal already has this setting" }, { status: 409, headers: corsHeaders });
        const account = await stripeApi("/v1/account", "GET");
        if (account.id !== stripeCheckoutAccountId) return Response.json({ success: false, error: "Stripe account mismatch" }, { status: 503, headers: corsHeaders });
        const current = await stripeApi(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, "GET");
        if (!isStripeWorkspaceSubscription(current) || current.customer !== addon.stripe_customer_id || current.metadata.user_id !== userId ||
            !["active", "past_due"].includes(current.status) || Boolean(current.cancel_at_period_end) === cancel)
          return Response.json({ success: false, error: "Workspace renewal changed; refresh and try again" }, { status: 409, headers: corsHeaders });
        const updated = await stripeApi(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, "POST", { cancel_at_period_end: cancel ? "true" : "false" });
        await persistStripeWorkspaceSubscription(updated);
        return Response.json({ success: true, cancel_at_period_end: Boolean(updated.cancel_at_period_end) }, { headers: corsHeaders });
      }
      if (url.pathname === "/api/billing/create-portal-session" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const userId = requireUser(body?.user_id);
        const authenticatedIdentity = await getFirebaseIdentity(request);
        if (!identityMatchesBillingUser(null, userId, authenticatedIdentity)) {
          return new Response(JSON.stringify({ success: false, error: "Authenticated account does not match this billing account" }), { status: 401, headers: jsonHeaders });
        }
        const userEmail = authenticatedIdentity?.email || null;
        if (!userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing user_id" }), { status: 400, headers: jsonHeaders });
        }
        if (!webBillingEnabled) {
          return new Response(JSON.stringify({ success: false, error: "Web billing is disabled" }), { status: 400, headers: jsonHeaders });
        }
        await ensureBillingRow(userId, userEmail);
        const row = await getBillingRow(userId);
        const stripeCustomerId = await ensureStripeCustomerForUser(userId, userEmail, row?.stripe_customer_id || null);
        const returnUrl = body?.return_url && String(body.return_url).trim() ? String(body.return_url).trim() : `${frontendBaseUrl}/settings.html`;
        const portal = await stripeApi("/v1/billing_portal/sessions", "POST", {
          customer: String(stripeCustomerId),
          return_url: returnUrl
        });
        return new Response(JSON.stringify({ success: true, url: portal.url || null }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/billing/webhook" && request.method === "POST") {
        try {
          const rawBody = await request.text();
          await verifyStripeSignature(rawBody, request.headers.get("stripe-signature"));
          const event = JSON.parse(rawBody || "{}");
          const eventType = String(event?.type || "");
          if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
            const obj = event?.data?.object || {};
            const userId = obj?.client_reference_id || obj?.metadata?.user_id || null;
            if (obj?.subscription) {
              const subscription = await stripeApi(`/v1/subscriptions/${encodeURIComponent(obj.subscription)}`, "GET");
              if (isStripeWorkspaceSubscription(subscription)) {
                await persistStripeWorkspaceSubscription(subscription, userId);
                await env.DB.prepare(`UPDATE billing_stripe_workspace_checkout_locks SET stripe_subscription_id = ?
                  WHERE user_id = ? AND stripe_session_id = ?`)
                  .bind(subscription.id, userId, obj.id).run();
                await env.DB.prepare(`DELETE FROM billing_stripe_workspace_checkout_locks
                  WHERE user_id = ? AND stripe_subscription_id = ? AND EXISTS
                  (SELECT 1 FROM billing_stripe_workspace_addons WHERE stripe_subscription_id = ? AND paid_through > ?)`)
                  .bind(userId, subscription.id, subscription.id, nowUnix()).run();
                // Checkout completion is not payment proof. The invoice event grants access.
              } else await persistStripeSubscription(subscription, userId);
            }
          } else if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
            const sub = event?.data?.object || {};
            if (isStripeWorkspaceSubscription(sub)) await persistStripeWorkspaceSubscription(sub);
            else {
              await persistStripeSubscription(sub);
              await stopStripeWorkspaceRenewalsWithPro(sub);
            }
          } else if (eventType === "invoice.paid" || eventType === "v1.invoice.paid") {
            const invoiceId = event?.data?.object?.id || event?.related_object?.id;
            const invoice = invoiceId ? await stripeApi(`/v1/invoices/${encodeURIComponent(invoiceId)}`, "GET") : null;
            const invoiceSubscriptionId = stripeInvoiceSubscriptionId(invoice);
            if (invoiceSubscriptionId) {
              const subscription = await stripeApi(`/v1/subscriptions/${encodeURIComponent(invoiceSubscriptionId)}`, "GET");
              if (isStripeWorkspaceSubscription(subscription)) {
                if (await persistStripeWorkspaceSubscription(subscription) && invoice.customer === subscription.customer &&
                    invoice.currency === "gbp" && await verifiedStripeInvoicePaymentAmount(invoice) >= 499) {
                  const matchingLine = (invoice.lines?.data || []).find((line) =>
                    (line.price?.id || line.pricing?.price_details?.price) === stripeWorkspacePriceId &&
                    Number(line.quantity || 1) === 1 && Number(line.period?.end || 0) > nowUnix());
                  if (matchingLine) {
                    await env.DB.prepare(`UPDATE billing_stripe_workspace_addons
                      SET paid_through = MAX(paid_through, ?), updated_at = strftime('%s','now')
                      WHERE stripe_subscription_id = ? AND stripe_customer_id = ?`)
                      .bind(Number(matchingLine.period.end), subscription.id, subscription.customer).run();
                    await env.DB.prepare(`DELETE FROM billing_stripe_workspace_checkout_locks
                      WHERE user_id = ? AND stripe_subscription_id = ?`)
                      .bind(subscription.metadata.user_id, subscription.id).run();
                    const pro = await getBillingRow(subscription.metadata.user_id);
                    if (pro?.stripe_subscription_id) {
                      const proSubscription = await stripeApi(`/v1/subscriptions/${encodeURIComponent(pro.stripe_subscription_id)}`, "GET");
                      await stopStripeWorkspaceRenewalsWithPro(proSubscription);
                    }
                  }
                }
              } else if (!isStripeWorkspaceBillingSubscription(subscription)) {
                await persistStripeSubscription(subscription);
                const row = await getBillingRow(subscription.metadata?.user_id || "");
                if (row?.stripe_subscription_id === subscription.id && row.stripe_customer_id === invoice.customer &&
                    await verifiedStripeInvoicePaymentAmount(invoice) > 0) {
                  await env.DB.prepare(`UPDATE billing_subscriptions SET stripe_pro_paid_at = COALESCE(stripe_pro_paid_at, ?)
                    WHERE user_id = ? AND stripe_subscription_id = ?`)
                    .bind(Number(invoice.status_transitions?.paid_at || invoice.created || nowUnix()), row.user_id, subscription.id).run();
                }
              }
            }
          } else if (eventType === "invoice.payment_failed" || eventType === "v1.invoice.payment_failed") {
            const invoiceId = event?.data?.object?.id || event?.related_object?.id;
            const invoice = invoiceId ? await stripeApi(`/v1/invoices/${encodeURIComponent(invoiceId)}`, "GET") : null;
            const invoiceSubscriptionId = stripeInvoiceSubscriptionId(invoice);
            if (invoiceSubscriptionId) {
              const sub = await stripeApi(`/v1/subscriptions/${encodeURIComponent(invoiceSubscriptionId)}`, "GET");
              if (isStripeWorkspaceBillingSubscription(sub)) {
                if (!isStripeWorkspaceSubscription(sub))
                  return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
                await persistStripeWorkspaceSubscription(sub);
                await env.DB.prepare(`UPDATE billing_stripe_workspace_addons SET subscription_status = 'past_due',
                  updated_at = strftime('%s','now') WHERE stripe_subscription_id = ? AND stripe_customer_id = ?`)
                  .bind(sub.id, sub.customer).run();
              } else await persistBillingFromSubscription({ userId: null, stripeCustomerId: invoice.customer || null, status: "past_due" });
            }
          }
          return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, error: err?.message || "Webhook handling failed" }), { status: 400, headers: jsonHeaders });
        }
      }
      if (url.pathname === "/api/auth/android/start" && request.method === "GET") {
        const handoff = await consumeAndroidOAuthHandoff(env.DB, url.searchParams.get("ticket"));
        if (!handoff || !await ownedFolder(env.DB, handoff.folder_id, handoff.user_id)) {
          return new Response("This connection link expired. Return to MultiPost and connect again.", { status: 400, headers: { "Cache-Control": "no-store" } });
        }
        const headers = new Headers({ Location: handoff.authorization_url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
        if (handoff.browser_nonce) headers.set("Set-Cookie", tikTokLinkCookie(handoff.browser_nonce, 600, request.url));
        return new Response(null, { status: 302, headers });
      }
      if (url.pathname === "/api/auth/youtube") {
        if (request.method !== "POST") return new Response("Connect YouTube from your workspace while signed in.", { status: 405, headers: { ...jsonHeaders, Allow: "POST" } });
        const { folder_id: folderId, user_id: requestedUserId, return_to_app: returnToApp } = await request.json();
        const userId = requireUser(requestedUserId);
        if (!folderId || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), { status: 400, headers: jsonHeaders });
        }
        const billingSnapshot = await ensureBillingAccess(userId, getClientPlatform(request), request, false, folderId);
        if (!billingSnapshot.ok) return new Response(JSON.stringify(billingSnapshot.body), { status: billingSnapshot.statusCode, headers: jsonHeaders });
        if (!await ownedFolder(env.DB, folderId, userId)) return new Response(JSON.stringify({ error: "Workspace not found" }), { status: 404, headers: jsonHeaders });
        const linkGate = await ensureLinkingQuota({ userId, platform: "youtube", folderId, evaluated: billingSnapshot.evaluated });
        if (!linkGate.ok) return new Response(JSON.stringify(linkGate.body), { status: linkGate.statusCode, headers: jsonHeaders });
        if (!env.GOOGLE_CLIENT_ID) {
          return new Response(JSON.stringify({ success: false, error: "Missing GOOGLE_CLIENT_ID env var" }), { status: 500, headers: jsonHeaders });
        }
        if (!env.GOOGLE_CLIENT_SECRET) {
          return new Response(JSON.stringify({ success: false, error: "Missing GOOGLE_CLIENT_SECRET env var" }), { status: 500, headers: jsonHeaders });
        }
        const state = await encodeState({ folderId, platform: "youtube", userId, returnToApp: returnToApp === true }, env.GOOGLE_CLIENT_SECRET);
        const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(YOUTUBE_OAUTH_SCOPE)}&access_type=offline&include_granted_scopes=false&prompt=${encodeURIComponent("consent select_account")}&state=${encodeURIComponent(state)}`;
        return Response.json({ url: returnToApp === true ? await createAndroidOAuthHandoff(env.DB, { authorizationUrl: googleAuthUrl, folderId, userId }, siteBaseUrl) : googleAuthUrl }, { headers: jsonHeaders });
      }
      if (url.pathname === "/api/auth/login/tiktok") {
        const clientKey = getTikTokSigninClientKey();
        getTikTokSigninClientSecret();
        const loginState = randomState();
        const scopes = "user.info.basic,video.upload,video.publish";
        const params = new URLSearchParams({
          client_key: clientKey,
          scope: scopes,
          response_type: "code",
          redirect_uri: tiktokLoginRedirectUri,
          state: loginState,
          disable_auto_auth: "1"
        });
        const tiktokAuthUrl = `${tiktokAuthBaseUrl}/v2/auth/authorize/?${params.toString()}`;
        return new Response(null, {
          status: 302,
          headers: {
            Location: tiktokAuthUrl,
            "Set-Cookie": authCookie("mp_tiktok_login_state", loginState, 600)
          }
        });
      }
      if (url.pathname === "/api/auth/tiktok/firebase-token" && request.method === "POST") {
        const cookies = parseCookies(request.headers.get("Cookie"));
        const customToken = cookies.mp_firebase_custom_token || "";
        if (!customToken) {
          return new Response(JSON.stringify({ success: false, error: "Missing TikTok sign-in session. Please try again." }), {
            status: 401,
            headers: { ...jsonHeaders, "Set-Cookie": clearAuthCookie("mp_firebase_custom_token") }
          });
        }
        return new Response(JSON.stringify({ success: true, custom_token: customToken }), {
          headers: { ...jsonHeaders, "Set-Cookie": clearAuthCookie("mp_firebase_custom_token") }
        });
      }
      if (url.pathname === "/api/auth/facebook/firebase-token" && request.method === "POST") {
        const cookies = parseCookies(request.headers.get("Cookie"));
        const customToken = cookies.mp_firebase_custom_token || "";
        if (!customToken) {
          return new Response(JSON.stringify({ success: false, error: "Missing Facebook sign-in session. Please try again." }), {
            status: 401,
            headers: { ...jsonHeaders, "Set-Cookie": clearAuthCookie("mp_firebase_custom_token") }
          });
        }
        return new Response(JSON.stringify({ success: true, custom_token: customToken }), {
          headers: { ...jsonHeaders, "Set-Cookie": clearAuthCookie("mp_firebase_custom_token") }
        });
      }
      if (url.pathname === "/api/auth/login/facebook") {
        const fbClientId = requireEnv(env.FB_CLIENT_ID, "FB_CLIENT_ID");
        requireEnv(env.FB_CLIENT_SECRET, "FB_CLIENT_SECRET");
        const loginState = randomState();
        const facebookSigninScope = "public_profile";
        const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${encodeURIComponent(
          fbClientId
        )}&redirect_uri=${encodeURIComponent(
          fbRedirectUri
        )}&scope=${encodeURIComponent(
          facebookSigninScope
        )}&response_type=code&state=${encodeURIComponent(loginState)}`;
        return new Response(null, {
          status: 302,
          headers: {
            Location: fbAuthUrl,
            "Set-Cookie": authCookie("mp_facebook_login_state", loginState, 600)
          }
        });
      }
      if (url.pathname === "/api/auth/tiktok") {
        if (request.method !== "POST") return new Response("Connect TikTok from your workspace while signed in.", { status: 405, headers: { ...jsonHeaders, Allow: "POST" } });
        const { folder_id: folderId, user_id: userId, return_to_app: returnToApp } = await request.json();
        const identity = await getFirebaseIdentity(request);
        if (!folderId || !userId || !matchesIdentity(userId, identity)) return new Response(JSON.stringify({ error: "Sign in again before connecting TikTok." }), { status: 401, headers: jsonHeaders });
        if (!await ownedFolder(env.DB, folderId, userId)) return new Response(JSON.stringify({ error: "Workspace not found" }), { status: 404, headers: jsonHeaders });
        const billingSnapshot = await ensureBillingAccess(userId, getClientPlatform(request), request, true, folderId);
        if (!billingSnapshot.ok) return new Response(JSON.stringify(billingSnapshot.body), { status: billingSnapshot.statusCode, headers: jsonHeaders });
        const linkGate = await ensureLinkingQuota({ userId, platform: "tiktok", folderId, evaluated: billingSnapshot.evaluated });
        if (!linkGate.ok) return new Response(JSON.stringify(linkGate.body), { status: linkGate.statusCode, headers: jsonHeaders });
        const link = await beginTikTokLink(env.DB, { folderId, userId, identity, authBase: tiktokAuthBaseUrl,
          clientKey: getTikTokPublishClientKey(), redirectUri: tiktokLoginRedirectUri, returnToApp: returnToApp === true });
        const destination = returnToApp === true ? await createAndroidOAuthHandoff(env.DB, { authorizationUrl: link.url, folderId, userId, browserNonce: link.browserNonce }, siteBaseUrl) : link.url;
        return new Response(JSON.stringify({ url: destination }), { headers: { ...jsonHeaders,
          "Cache-Control": "no-store", "Set-Cookie": tikTokLinkCookie(link.browserNonce, 600, request.url) } });
      }
      if (url.pathname === "/api/auth/facebook") {
        if (request.method !== "POST") return new Response("Connect Facebook from your workspace while signed in.", { status: 405, headers: { ...jsonHeaders, Allow: "POST" } });
        const { folder_id: folderId, user_id: requestedUserId, refresh, return_to_app: returnToApp } = await request.json();
        const userId = requireUser(requestedUserId);
        if (!folderId || !userId) return Response.json({ error: "Missing folder_id or user_id" }, { status: 400, headers: jsonHeaders });
        const billingSnapshot = await ensureBillingAccess(userId, getClientPlatform(request), request, false, folderId);
        if (!billingSnapshot.ok) return Response.json(billingSnapshot.body, { status: billingSnapshot.statusCode, headers: jsonHeaders });
        if (!await ownedFolder(env.DB, folderId, userId)) return Response.json({ error: "Workspace not found" }, { status: 404, headers: jsonHeaders });
        const linkGate = await ensureLinkingQuota({ userId, platform: "facebook_page", folderId, evaluated: billingSnapshot.evaluated });
        if (!linkGate.ok) return Response.json(linkGate.body, { status: linkGate.statusCode, headers: jsonHeaders });
        const fbClientId = requireEnv(env.FB_CLIENT_ID, "FB_CLIENT_ID");
        requireEnv(env.FB_CLIENT_SECRET, "FB_CLIENT_SECRET");
        const state = await encodeState({ folderId, platform: "facebook", userId, returnToApp: returnToApp === true }, env.FB_CLIENT_SECRET);
        const fbAuthParams = new URLSearchParams({
          client_id: fbClientId,
          redirect_uri: fbRedirectUri,
          scope: FACEBOOK_PAGE_LINK_SCOPE,
          response_type: "code",
          state
        });
        // Ask Facebook to re-check the granted Page permissions when the user
        // explicitly refreshes a connection. The provider still controls which
        // Facebook profile is signed in and which Pages it returns.
        if (refresh === true) fbAuthParams.set("auth_type", "rerequest");
        const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?${fbAuthParams.toString()}`;
        return Response.json({ url: returnToApp === true ? await createAndroidOAuthHandoff(env.DB, { authorizationUrl: fbAuthUrl, folderId, userId }, siteBaseUrl) : fbAuthUrl }, { headers: jsonHeaders });
      }
      if (url.pathname === "/api/auth/callback/youtube") {
        const code = url.searchParams.get("code");
        const stateObj = await decodeState(url.searchParams.get("state"), env.GOOGLE_CLIENT_SECRET, "youtube");
        const folderId = stateObj?.folderId;
        const userId = requireUser(stateObj?.userId);
        if (!folderId || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing state" }), { status: 400, headers: jsonHeaders });
        }
        if (!code) {
          const err = url.searchParams.get("error") || "missing_code";
          if (stateObj.returnToApp) return Response.redirect(androidOAuthReturn(frontendBaseUrl, folderId, "youtube", false));
          return new Response(JSON.stringify({ success: false, error: `YouTube OAuth failed: ${err}` }), { status: 400, headers: jsonHeaders });
        }
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: "authorization_code"
          })
        });
        const tokens = await safeJson(tokenRes);
        if (!tokens?.access_token || typeof tokens.access_token !== "string" || tokens.access_token === "undefined") {
          const oauthErr = tokens?.error_description || tokens?.error || "Token exchange failed";
          return Response.redirect(
            stateObj.returnToApp ? androidOAuthReturn(frontendBaseUrl, folderId, "youtube", false) : `${frontendBaseUrl}/create-post.html?youtube_error=${encodeURIComponent(oauthErr)}&folder_id=${encodeURIComponent(folderId)}`
          );
        }
        const userRes = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        const userData = await safeJson(userRes);
        const channelName = userData.items?.[0]?.snippet?.title || "Linked YouTube";
        const channelId = userData.items?.[0]?.id || channelName;
        const channelThumbnail = userData.items?.[0]?.snippet?.thumbnails?.default?.url || null;
        await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'youtube'"
          ).bind(String(folderId), String(userId)),
          env.DB.prepare(
            "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at, google_sub, profile_picture) VALUES (?, ?, 'youtube', ?, ?, ?, ?, ?, ?)"
          ).bind(
            String(folderId),
            String(userId),
            String(channelName),
            String(tokens.access_token),
            tokens.refresh_token ? String(tokens.refresh_token) : null,
            nowMs() + Number(tokens.expires_in || 0) * 1e3,
            null,
            channelThumbnail
          )
        ]);
        await upsertToken({
          folderId: String(folderId),
          platform: "youtube",
          accountId: String(channelId),
          accessToken: String(tokens.access_token),
          refreshToken: tokens.refresh_token ? String(tokens.refresh_token) : null,
          expiresAt: nowMs() + Number(tokens.expires_in || 0) * 1e3,
          scope: YOUTUBE_OAUTH_SCOPE
        });
        return Response.redirect(
          stateObj.returnToApp ? androidOAuthReturn(frontendBaseUrl, folderId, "youtube", true) : `${frontendBaseUrl}/create-post.html?youtube_connected=1&account_name=${encodeURIComponent(channelName)}&folder_id=${encodeURIComponent(folderId)}`
        );
      }
      if (url.pathname === "/api/auth/callback/tiktok") {
        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state") || "";
        const cookies = parseCookies(request.headers.get("Cookie"));
        if (!rawState.startsWith("ttlink_") && cookies.mp_tiktok_login_state) {
          const expectedState = cookies.mp_tiktok_login_state || "";
          const returnedState = rawState;
          const error = url.searchParams.get("error") || "";
          const redirectWithError = (message) => new Response(null, {
            status: 302,
            headers: {
              Location: `${frontendBaseUrl}/signin.html?auth_error=${encodeURIComponent(message)}`,
              "Set-Cookie": clearAuthCookie("mp_tiktok_login_state")
            }
          });
          if (error) {
            return redirectWithError(url.searchParams.get("error_description") || error);
          }
          if (!expectedState || !returnedState || expectedState !== returnedState) {
            return redirectWithError("TikTok sign-in state validation failed. Please try again.");
          }
          if (!code) {
            return redirectWithError("TikTok did not return an authorization code.");
          }
          try {
            const tokenRes = await fetch(`${tiktokApiBaseUrl}/v2/oauth/token/`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_key: getTikTokSigninClientKey(),
                client_secret: getTikTokSigninClientSecret(),
                code,
                grant_type: "authorization_code",
                redirect_uri: tiktokLoginRedirectUri
              })
            });
            const tokenJson = await safeJson(tokenRes);
            const tData = tokenJson.data || tokenJson;
            if (!tokenRes.ok || tokenJson.error || tData.error || !tData.access_token) {
              throw new Error(tokenJson.error_description || tData.error_description || tData.error || "TikTok token exchange failed");
            }
            let openId = String(tData.open_id || tData.openid || "");
            let displayName = "TikTok User";
            let avatarUrl = "";
            const userInfoRes = await fetch(`${tiktokApiBaseUrl}/v2/user/info/?fields=open_id,union_id,display_name,avatar_url`, {
              headers: { Authorization: `Bearer ${tData.access_token}` }
            });
            const userInfo = await safeJson(userInfoRes);
            const user = userInfo?.data?.user || {};
            openId = String(user.open_id || openId || "");
            displayName = String(user.display_name || displayName);
            avatarUrl = String(user.avatar_url || "");
            if (!openId) {
              throw new Error("TikTok profile did not include a stable user id.");
            }
            const customToken = await createFirebaseCustomToken({
              uid: `tiktok:${openId}`,
              claims: {
                provider: "tiktok",
                tiktok_open_id: openId,
                name: displayName,
                picture: avatarUrl
              }
            });
            const successHeaders = new Headers({ Location: `${frontendBaseUrl}/signin.html?tiktok_login=complete` });
            successHeaders.append("Set-Cookie", clearAuthCookie("mp_tiktok_login_state"));
            successHeaders.append("Set-Cookie", authCookie("mp_firebase_custom_token", customToken, 120));
            return new Response(null, { status: 302, headers: successHeaders });
          } catch (err) {
            return redirectWithError(err?.message || "TikTok sign-in failed");
          }
        }
        let link;
        try { link = await consumeTikTokLink(env.DB, rawState, cookies.mp_tiktok_link_nonce || ""); }
        catch (_) { return new Response(JSON.stringify({ error: "Invalid or expired TikTok state. Start again from your workspace." }), { status: 400, headers: jsonHeaders }); }
        const folderId = link.folder_id;
        const userId = link.user_id;
        const linkError = (message) => new Response(null, { status: 302, headers: {
          Location: rawState.startsWith("ttlink_android_") ? androidOAuthReturn(frontendBaseUrl, folderId, "tiktok", false) : `${frontendBaseUrl}/folder.html?id=${encodeURIComponent(folderId)}&tiktok_error=${encodeURIComponent(message)}`,
          "Set-Cookie": tikTokLinkCookie("", 0, request.url), "Cache-Control": "no-store"
        } });
        if (!code || url.searchParams.get("error")) return linkError("TikTok authorization cancelled. Your existing connection is unchanged.");
        try {
          const tokenRes = await fetch(`${tiktokApiBaseUrl}/v2/oauth/token/`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_key: getTikTokPublishClientKey(),
              client_secret: getTikTokPublishClientSecret(),
              code,
              grant_type: "authorization_code",
              redirect_uri: `${siteBaseUrl}/api/auth/callback/tiktok`
            })
          });
          const tokenJson = await safeJson(tokenRes);
          const tData = tokenJson.data || tokenJson;
          if (!tokenRes.ok || tokenJson.error || tData.error || !tData.access_token || !tData.open_id) {
            return linkError("TikTok could not complete the connection. Please try again. Your existing connection is unchanged.");
          }
          const accessToken = tData.access_token || tokenJson.access_token;
          const refreshToken = tData.refresh_token || tokenJson.refresh_token;
          const expiresIn = tData.expires_in || tokenJson.expires_in || 0;
          const openId = tData.open_id || tData.openid || "";
          const scope = tData.scope || "video.upload,video.publish,user.info.basic";
          let tiktokNickname = "Linked TikTok";
          let tiktokAvatar = null;
          try {
            const userInfoRes = await fetch(
              `${tiktokApiBaseUrl}/v2/user/info/?fields=display_name,avatar_url`,
              {
                headers: { "Authorization": `Bearer ${accessToken}` }
              }
            );
            const userInfo = await safeJson(userInfoRes);
            const user = userInfo?.data?.user;
            if (user) {
              tiktokNickname = user.display_name?.trim() || "TikTok User";
              tiktokAvatar = user.avatar_url ? String(user.avatar_url) : null;
            }
          } catch (e) {
            console.error("TikTok Profile Fetch Error:", e);
          }
          const duplicate = await env.DB.prepare("SELECT a.folder_id FROM accounts a WHERE a.user_id = ? AND a.platform = 'tiktok' AND (a.tiktok_open_id = ? OR EXISTS (SELECT 1 FROM tokens t WHERE t.folder_id = a.folder_id AND t.platform = 'tiktok' AND t.account_id = ? AND t.access_token = a.access_token)) AND a.folder_id != ? LIMIT 1")
            .bind(userId, String(openId), String(openId), folderId).first();
          if (duplicate) return linkError("TikTok returned an account already linked to another workspace. Switch accounts on tiktok.com, then connect again. Your existing connection is unchanged.");
          await saveTikTokConnection(env.DB, {
            folderId: String(folderId), userId: String(userId), openId: String(openId),
            nickname: tiktokNickname, avatar: tiktokAvatar, accessToken: String(accessToken),
            refreshToken: refreshToken ? String(refreshToken) : null,
            expiresAt: nowMs() + Number(expiresIn) * 1e3, scope: String(scope)
          });
          return new Response(null, { status: 302, headers: {
            Location: rawState.startsWith("ttlink_android_") ? androidOAuthReturn(frontendBaseUrl, folderId, "tiktok", true) : `${frontendBaseUrl}/folder.html?id=${encodeURIComponent(folderId)}&tiktok_connected=1`,
            "Set-Cookie": tikTokLinkCookie("", 0, request.url), "Cache-Control": "no-store"
          } });
        } catch (_) {
          return linkError("TikTok connection failed. Please try again. Your existing connection is unchanged.");
        }
      }

      if (url.pathname === "/api/auth/callback/facebook") {
        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state") || "";
        const cookies = parseCookies(request.headers.get("Cookie"));
        const linkingState = await decodeState(rawState, env.FB_CLIENT_SECRET, "facebook");
        if (!linkingState && cookies.mp_facebook_login_state) {
          const expectedState = cookies.mp_facebook_login_state || "";
          const returnedState = rawState;
          const error = url.searchParams.get("error") || "";
          const redirectWithError = (message) => new Response(null, {
            status: 302,
            headers: {
              Location: `${frontendBaseUrl}/signin.html?auth_error=${encodeURIComponent(message)}`,
              "Set-Cookie": clearAuthCookie("mp_facebook_login_state")
            }
          });
          if (error) {
            return redirectWithError(url.searchParams.get("error_description") || error);
          }
          if (!expectedState || !returnedState || expectedState !== returnedState) {
            return redirectWithError("Facebook sign-in state validation failed. Please try again.");
          }
          if (!code) {
            return redirectWithError("Facebook did not return an authorization code.");
          }
          try {
            const fbClientId = requireEnv(env.FB_CLIENT_ID, "FB_CLIENT_ID");
            const fbClientSecret = requireEnv(env.FB_CLIENT_SECRET, "FB_CLIENT_SECRET");
            const tokenRes = await fetch(
              `${fbGraph}/oauth/access_token?client_id=${encodeURIComponent(
                fbClientId
              )}&redirect_uri=${encodeURIComponent(
                fbRedirectUri
              )}&client_secret=${encodeURIComponent(
                fbClientSecret
              )}&code=${encodeURIComponent(code)}`
            );
            const tokens = await fbSafe(tokenRes);
            const accessToken = tokens?.access_token ? String(tokens.access_token) : "";
            if (!accessToken) {
              throw new Error("Facebook token missing");
            }
            const meProof = await appsecretProof(accessToken);
            const me = await fetchFbJson(
              `${fbGraph}/me?fields=id,name,picture&access_token=${encodeURIComponent(accessToken)}${meProof ? `&appsecret_proof=${encodeURIComponent(meProof)}` : ""}`
            );
            const fbUserId = String(me?.id || "").trim();
            if (!fbUserId) {
              throw new Error("Facebook profile did not include a stable user id.");
            }
            const fbUserName = String(me?.name || "Facebook User");
            const pictureUrl = String(me?.picture?.data?.url || "");
            const customToken = await createFirebaseCustomToken({
              uid: `facebook:${fbUserId}`,
              claims: {
                provider: "facebook",
                facebook_user_id: fbUserId,
                name: fbUserName,
                picture: pictureUrl
              }
            });
            const successHeaders = new Headers({ Location: `${frontendBaseUrl}/signin.html?facebook_login=complete` });
            successHeaders.append("Set-Cookie", clearAuthCookie("mp_facebook_login_state"));
            successHeaders.append("Set-Cookie", authCookie("mp_firebase_custom_token", customToken, 120));
            return new Response(null, { status: 302, headers: successHeaders });
          } catch (err) {
            return redirectWithError(err?.message || "Facebook sign-in failed");
          }
        }
        const stateObj = linkingState;
        const folderId = stateObj?.folderId;
        const userId = requireUser(stateObj?.userId);
        if (!folderId || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing state" }), { status: 400, headers: jsonHeaders });
        }
        if (!code) {
          const err = url.searchParams.get("error") || "missing_code";
          if (stateObj.returnToApp) return Response.redirect(androidOAuthReturn(frontendBaseUrl, folderId, "facebook", false));
          return new Response(JSON.stringify({ success: false, error: `Facebook OAuth failed: ${err}` }), { status: 400, headers: jsonHeaders });
        }
        const fbClientId = requireEnv(env.FB_CLIENT_ID, "FB_CLIENT_ID");
        const fbClientSecret = requireEnv(env.FB_CLIENT_SECRET, "FB_CLIENT_SECRET");
        const tokenRes = await fetch(
          `${fbGraph}/oauth/access_token?client_id=${encodeURIComponent(
            fbClientId
          )}&redirect_uri=${encodeURIComponent(
            fbRedirectUri
          )}&client_secret=${encodeURIComponent(
            fbClientSecret
          )}&code=${encodeURIComponent(code)}`
        );
        const tokens = await fbSafe(tokenRes);
        const accessToken = tokens?.access_token ? String(tokens.access_token) : null;
        const expiresIn = Number(tokens?.expires_in || 0);
        if (!accessToken) {
          if (stateObj.returnToApp) return Response.redirect(androidOAuthReturn(frontendBaseUrl, folderId, "facebook", false));
          return new Response(
            JSON.stringify({ success: false, error: "Facebook token missing", data: tokens }),
            { status: 400, headers: jsonHeaders }
          );
        }
        let fbUserId = "me";
        let fbUserName = "Facebook Account";
        try {
          const meProof = await appsecretProof(accessToken);
          const me = await fetchFbJson(
            `${fbGraph}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}${meProof ? `&appsecret_proof=${encodeURIComponent(meProof)}` : ""}`
          );
          if (me?.id) fbUserId = String(me.id);
          if (me?.name) fbUserName = String(me.name);
        } catch (_) {
        }
        await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'facebook'"
          ).bind(String(folderId), String(userId)),
          env.DB.prepare(
            "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, facebook_user_id, facebook_user_name, facebook_user_access_token) VALUES (?, ?, 'facebook', ?, ?, ?, ?, ?)"
          ).bind(
            String(folderId),
            String(userId),
            fbUserName,
            accessToken,
            fbUserId,
            fbUserName,
            accessToken
          )
        ]);
        await upsertToken({
          folderId: String(folderId),
          platform: "facebook",
          accountId: fbUserId,
          accessToken,
          refreshToken: null,
          expiresAt: nowMs() + expiresIn * 1e3,
          scope: FACEBOOK_PAGE_LINK_SCOPE
        });
        return Response.redirect(
          stateObj.returnToApp ? androidOAuthReturn(frontendBaseUrl, folderId, "facebook", true) : `${frontendBaseUrl}/folder.html?id=${encodeURIComponent(folderId)}&facebook=pages`
        );
      }
      if (url.pathname === "/api/facebook/pages" && request.method === "GET") {
        const folder_id = url.searchParams.get("folder_id") || "";
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!folder_id || !userId) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing folder_id or user_id" }),
            { status: 400, headers: jsonHeaders }
          );
        }
        const identity = await getFirebaseIdentity(request);
        if (!matchesIdentity(userId, identity) || !await ownedFolder(env.DB, folder_id, userId)) {
          return new Response(
            JSON.stringify({ success: false, error: "Sign in again to view this workspace's Facebook Pages." }),
            { status: 403, headers: jsonHeaders }
          );
        }
        const fbAccount = await env.DB.prepare(
          "SELECT COALESCE(facebook_user_access_token, access_token) AS facebook_user_access_token FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'facebook' LIMIT 1"
        ).bind(folder_id, userId).first();
        if (!fbAccount?.facebook_user_access_token) {
          return new Response(
            JSON.stringify({ success: false, error: "Facebook not connected for this folder. Please re-link your Facebook account." }),
            { status: 400, headers: jsonHeaders }
          );
        }
        try {
          const userToken = String(fbAccount.facebook_user_access_token);
          const pagesProof = await appsecretProof(userToken);
          const firstPageUrl = new URL(`${fbGraph}/me/accounts`);
          firstPageUrl.search = new URLSearchParams({
            fields: "id,name,access_token,picture",
            limit: "100",
            access_token: userToken,
            ...(pagesProof ? { appsecret_proof: pagesProof } : {})
          }).toString();
          const pagesById = new Map();
          let nextPageUrl = firstPageUrl.href;
          const graphOrigin = new URL(fbGraph).origin;
          for (let pageRequest = 0; nextPageUrl && pageRequest < 10; pageRequest += 1) {
            const out = await fetchFbJson(nextPageUrl);
            for (const page of Array.isArray(out?.data) ? out.data : []) {
              const id = String(page.id || "");
              if (!id || pagesById.has(id)) continue;
              pagesById.set(id, {
                id,
                name: String(page.name || ""),
                access_token: String(page.access_token || ""),
                picture: page.picture?.data?.url || `https://graph.facebook.com/${id}/picture?type=square`
              });
            }
            const pagingUrl = String(out?.paging?.next || "");
            if (!pagingUrl) break;
            const parsedPagingUrl = new URL(pagingUrl);
            if (parsedPagingUrl.origin !== graphOrigin) break;
            parsedPagingUrl.searchParams.set("access_token", userToken);
            if (pagesProof) parsedPagingUrl.searchParams.set("appsecret_proof", pagesProof);
            nextPageUrl = parsedPagingUrl.href;
          }
          // Meta can keep Pages inside a Business portfolio instead of returning them
          // from /me/accounts. Include those assets when the person granted business
          // access, but only expose pages with a publishable Page access token.
          try {
            const businessesUrl = new URL(`${fbGraph}/me/businesses`);
            businessesUrl.search = new URLSearchParams({
              fields: "id",
              limit: "100",
              access_token: userToken,
              ...(pagesProof ? { appsecret_proof: pagesProof } : {})
            }).toString();
            const businesses = await fetchFbJson(businessesUrl.href);
            for (const business of Array.isArray(businesses?.data) ? businesses.data : []) {
              const businessId = String(business?.id || "");
              if (!businessId) continue;
              for (const edge of ["owned_pages", "client_pages"]) {
                const assetsUrl = new URL(`${fbGraph}/${encodeURIComponent(businessId)}/${edge}`);
                assetsUrl.search = new URLSearchParams({
                  fields: "id,name,access_token,picture",
                  limit: "100",
                  access_token: userToken,
                  ...(pagesProof ? { appsecret_proof: pagesProof } : {})
                }).toString();
                const assets = await fetchFbJson(assetsUrl.href);
                for (const page of Array.isArray(assets?.data) ? assets.data : []) {
                  const id = String(page.id || "");
                  const accessToken = String(page.access_token || "");
                  if (!id || !accessToken || pagesById.has(id)) continue;
                  pagesById.set(id, {
                    id,
                    name: String(page.name || ""),
                    access_token: accessToken,
                    picture: page.picture?.data?.url || `https://graph.facebook.com/${id}/picture?type=square`
                  });
                }
              }
            }
          } catch (_) {
            // Business access is optional. The normal Page list remains usable when
            // a Facebook account has no Business portfolio or has not granted it.
          }
          const pages = [...pagesById.values()];
          return new Response(
            JSON.stringify({ success: true, pages }),
            { headers: jsonHeaders }
          );
        } catch (err) {
          return new Response(
            JSON.stringify({ success: false, error: err.message || "Failed to fetch pages" }),
            { status: 500, headers: jsonHeaders }
          );
        }
      }
      if (url.pathname === "/api/facebook/select-page" && request.method === "POST") {
        const body = await request.json();
        const folder_id = String(body.folder_id || "");
        const userId = requireUser(String(body.user_id || ""));
        const page_id = String(body.page_id || "");
        const page_name = String(body.page_name || "");
        const page_access_token = String(body.page_access_token || "");
        const page_picture = String(body.page_picture || "");
        if (!folder_id || !userId || !page_id || !page_name || !page_access_token) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing required fields" }),
            { status: 400, headers: jsonHeaders }
          );
        }
        const identity = await getFirebaseIdentity(request);
        if (!matchesIdentity(userId, identity) || !await ownedFolder(env.DB, folder_id, userId)) {
          return new Response(
            JSON.stringify({ success: false, error: "Sign in again to choose a Facebook Page for this workspace." }),
            { status: 403, headers: jsonHeaders }
          );
        }
        const billingSnapshot = await ensureBillingAccess(userId, getClientPlatform(request, body?.client_platform, null), request, false, folder_id);
        if (!billingSnapshot.ok) return new Response(JSON.stringify(billingSnapshot.body), { status: billingSnapshot.statusCode, headers: jsonHeaders });
        const linkGate = await ensureLinkingQuota({ userId, platform: "facebook_page", folderId: folder_id, evaluated: billingSnapshot.evaluated });
        if (!linkGate.ok) return new Response(JSON.stringify(linkGate.body), { status: linkGate.statusCode, headers: jsonHeaders });
        await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'facebook_page'"
          ).bind(folder_id, userId),
          env.DB.prepare(
            "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, facebook_page_id, facebook_page_name, facebook_page_access_token, facebook_page_picture, profile_picture) VALUES (?, ?, 'facebook_page', ?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            folder_id,
            userId,
            page_name,
            page_access_token,
            page_id,
            page_name,
            page_access_token,
            page_picture || null,
            page_picture || null
          )
        ]);
        await upsertToken({
          folderId: folder_id,
          platform: "facebook_page",
          accountId: page_id,
          accessToken: page_access_token,
          refreshToken: null,
          expiresAt: null,
          scope: "page_access_token"
        });
        return new Response(
          JSON.stringify({ success: true }),
          { headers: jsonHeaders }
        );
      }
      if (url.pathname === "/api/youtube/init-upload" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!await ownedFolder(env.DB, folder_id, user_id)) {
          return Response.json({ success: false, error: "Workspace access denied" }, { status: 403, headers: corsHeaders });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request), request);
        if (!billingGate.ok) {
          return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        }
        const quotaGate = await ensurePlanQuota(user_id, "youtube", billingGate.evaluated);
        if (!quotaGate.ok) {
          return new Response(JSON.stringify(quotaGate.body), { status: quotaGate.statusCode, headers: jsonHeaders });
        }
        const body = await safeJson(request);
        const title = String(body.title || "").trim();
        const description = String(body.description || "").trim();
        const keywords = String(body.keywords || "").trim();
        let privacyStatus = String(body.privacyStatus || "private").toLowerCase();
        const fileType = String(body.fileType || "video/mp4");
        const fileSize = Number(body.fileSize) || 0;
        if (!title || title.length < 1 || title.length > 100) {
          return new Response(JSON.stringify({ success: false, error: "Title required (1-100 chars)" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!fileSize) {
          return new Response(JSON.stringify({ success: false, error: "fileSize required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (fileSize > MAX_VIDEO_SIZE_BYTES) {
          return new Response(JSON.stringify({ success: false, error: "Video too large (>500MB)" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!["private", "unlisted", "public"].includes(privacyStatus)) {
          privacyStatus = "private";
        }
        let token = await env.DB.prepare(`
          SELECT * FROM tokens
          WHERE folder_id = ? AND platform = 'youtube'
          ORDER BY updated_at DESC LIMIT 1
        `).bind(folder_id).first();
        // Fall back to accounts table if tokens table has no valid token
        if (!token?.access_token || token.access_token === "undefined") {
          const acct = await env.DB.prepare(
            "SELECT id, access_token, refresh_token, expires_at FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'youtube' LIMIT 1"
          ).bind(folder_id, user_id).first();
          if (acct?.access_token && acct.access_token !== "undefined") {
            token = { access_token: acct.access_token, refresh_token: acct.refresh_token || null, expires_at: acct.expires_at || null, account_id: String(acct.id), scope: null };
          }
        }
        if (!token?.access_token || token.access_token === "undefined") {
          return new Response(JSON.stringify({ success: false, error: "No YouTube token found. Link account first." }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        // If tokens table has no refresh_token, borrow it from the accounts table
        let ytRefreshToken = token.refresh_token || null;
        if (!ytRefreshToken) {
          const acct = await env.DB.prepare(
            "SELECT refresh_token FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'youtube' LIMIT 1"
          ).bind(folder_id, user_id).first();
          ytRefreshToken = acct?.refresh_token || null;
        }
        const refreshYTToken = /* @__PURE__ */ __name(async (refreshToken) => {
          if (!refreshToken) return null;
          try {
            const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: "refresh_token"
              })
            });
            const refreshed = await safeJson(refreshRes);
            if (refreshed?.access_token) {
              await upsertToken({
                folderId: folder_id,
                platform: "youtube",
                accountId: token.account_id,
                accessToken: refreshed.access_token,
                refreshToken: refreshed.refresh_token || refreshToken,
                expiresAt: nowMs() + Number(refreshed.expires_in || DEFAULT_TOKEN_EXPIRY_SECONDS) * 1e3,
                scope: token.scope || YOUTUBE_OAUTH_SCOPE
              });
              return refreshed.access_token;
            }
            return null;
          } catch (e) {
            console.error("YouTube token refresh failed:", e);
            return null;
          }
        }, "refreshYTToken");
        let accessToken = token.access_token;
        if (ytRefreshToken && (!token.expires_at || Number(token.expires_at) - nowMs() < TOKEN_REFRESH_WINDOW_MS)) {
          const refreshed = await refreshYTToken(ytRefreshToken);
          if (refreshed) accessToken = refreshed;
        }
        try {
          const initBody = JSON.stringify({
            snippet: {
              title,
              description,
              tags: keywords ? keywords.split(/[\s,]+/).filter(Boolean) : [],
              defaultLanguage: "en"
            },
            status: { privacyStatus, selfDeclaredMadeForKids: false }
          });
          let initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json; charset=UTF-8",
              "X-Upload-Content-Type": fileType,
              "X-Upload-Content-Length": String(fileSize)
            },
            body: initBody
          });
          if (initRes.status === 401 && ytRefreshToken) {
            const retried = await refreshYTToken(ytRefreshToken);
            if (retried) {
              accessToken = retried;
              initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                  "Content-Type": "application/json; charset=UTF-8",
                  "X-Upload-Content-Type": fileType,
                  "X-Upload-Content-Length": String(fileSize)
                },
                body: initBody
              });
            }
          }
          if (!initRes.ok) {
            const errData = await safeJson(initRes);
            if (initRes.status === 401) {
              throw new Error("Your YouTube authorization has expired or was revoked. Please re-link your YouTube account from your workspace settings (go to your folder, remove the YouTube account, then link it again).");
            }
            throw new Error(`YouTube init failed: ${initRes.status} ${JSON.stringify(errData)}`);
          }
          const uploadUrl = initRes.headers.get("Location");
          if (!uploadUrl) {
            throw new Error("No upload location returned by YouTube");
          }
          const sessionId = crypto.randomUUID();
          const chunkSize = fileSize <= UPLOAD_CHUNK_SIZE_BYTES ? fileSize : UPLOAD_CHUNK_SIZE_BYTES;
          const totalChunks = Math.max(1, Math.ceil(fileSize / chunkSize));
          const expiresAt = Math.floor(Date.now() / 1e3) + SESSION_EXPIRY_SECONDS;
          await env.DB.prepare(
            "INSERT INTO upload_sessions (id, platform, upload_url, access_token, file_size, expires_at, folder_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(sessionId, "youtube", uploadUrl, accessToken, fileSize, expiresAt, folder_id, user_id).run();
          await bindPublicationSession(sessionId);
          return new Response(JSON.stringify({
            success: true,
            sessionId,
            uploadUrl,
            chunkSize,
            totalChunks,
            videoSize: fileSize
          }), { headers: jsonHeaders });
        } catch (err) {
          console.error("YouTube init-upload error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Init failed" }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/youtube/upload-chunk" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request), request);
        if (!billingGate.ok) return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        if (!await ownedFolder(env.DB, folder_id, user_id)) {
          return new Response(JSON.stringify({ error: "Workspace access denied" }), { status: 403, headers: jsonHeaders });
        }
        const formData = await request.formData();
        const sessionId = String(formData.get("sessionId") || "").trim();
        const offset = Number(formData.get("offset") || 0);
        const fileType = String(formData.get("fileType") || "video/mp4").trim() || "video/mp4";
        const chunkFile = formData.get("chunk");
        if (!sessionId) {
          return new Response(JSON.stringify({ success: false, error: "sessionId required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!Number.isFinite(offset) || offset < 0) {
          return new Response(JSON.stringify({ success: false, error: "Valid offset required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!chunkFile || !(chunkFile instanceof File)) {
          return new Response(JSON.stringify({ success: false, error: "chunk required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const session = await env.DB.prepare(
          "SELECT * FROM upload_sessions WHERE id = ? AND platform = 'youtube' AND folder_id = ? AND user_id = ? LIMIT 1"
        ).bind(sessionId, folder_id, user_id).first();
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: "Upload session not found or expired" }), {
            status: 404,
            headers: jsonHeaders
          });
        }
        if (Math.floor(Date.now() / 1e3) > session.expires_at) {
          return new Response(JSON.stringify({ success: false, error: "Upload session expired" }), {
            status: 410,
            headers: jsonHeaders
          });
        }
        try {
          const chunkBytes = await chunkFile.arrayBuffer();
          if (!chunkBytes.byteLength) {
            return new Response(JSON.stringify({ success: false, error: "chunk is empty" }), {
              status: 400,
              headers: jsonHeaders
            });
          }
          const totalSize = Number(session.file_size) || 0;
          const chunkEnd = offset + chunkBytes.byteLength - 1;
          if (!totalSize || chunkEnd >= totalSize) {
            return new Response(JSON.stringify({ success: false, error: "Invalid chunk range" }), {
              status: 400,
              headers: jsonHeaders
            });
          }
          const uploadRes = await fetch(session.upload_url, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": fileType,
              "Content-Length": String(chunkBytes.byteLength),
              "Content-Range": `bytes ${offset}-${chunkEnd}/${totalSize}`
            },
            body: chunkBytes
          });
          const uploadText = await uploadRes.text();
          if (uploadRes.status === 308) {
            const range = uploadRes.headers.get("Range") || "";
            const match = range.match(/bytes=0-(\d+)/);
            const uploadedBytes = match ? Number(match[1]) + 1 : chunkEnd + 1;
            return new Response(JSON.stringify({
              success: true,
              complete: false,
              uploadedBytes
            }), { headers: jsonHeaders });
          }
          let uploadData = {};
          if (uploadText) {
            try {
              uploadData = JSON.parse(uploadText);
            } catch {
              uploadData = { raw: uploadText };
            }
          }
          if (!uploadRes.ok) {
            throw new Error(`YouTube chunk upload failed: ${uploadRes.status} ${uploadText}`);
          }
          const videoId = uploadData?.id;
          if (!await finishPublicationSession(sessionId, user_id, "youtube", true)) await recordPublishUsage(user_id, "youtube");
          await env.DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(sessionId).run();
          return new Response(JSON.stringify({
            success: true,
            complete: true,
            videoId,
            youtubeUrl: videoId ? `https://youtube.com/watch?v=${videoId}` : "",
            data: uploadData
          }), { headers: jsonHeaders });
        } catch (err) {
          console.error("YouTube upload-chunk error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Chunk upload failed" }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/tiktok/init-upload" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!matchesIdentity(user_id, await getFirebaseIdentity(request)) || !await ownedFolder(env.DB, folder_id, user_id)) {
          return new Response(JSON.stringify({ error: "Workspace access denied" }), { status: 403, headers: jsonHeaders });
        }

        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request), request);
        if (!billingGate.ok) {
          return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        }
        const quotaGate = await ensurePlanQuota(user_id, "tiktok", billingGate.evaluated);
        if (!quotaGate.ok) {
          return new Response(JSON.stringify(quotaGate.body), { status: quotaGate.statusCode, headers: jsonHeaders });
        }
        const body = await safeJson(request);
        const caption = String(body.caption || "").trim();
        let privacyStatus = String(body.privacyStatus || "SELF_ONLY").toUpperCase();
        const videoSize = Number(body.videoSize) || 0;
        if (!caption) {
          return new Response(JSON.stringify({ success: false, error: "Caption required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!videoSize || videoSize <= 0) {
          return new Response(JSON.stringify({ success: false, error: "videoSize required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (videoSize > MAX_VIDEO_SIZE_BYTES) {
          return new Response(JSON.stringify({ success: false, error: "Video too large (>500MB)" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const validPrivacyLevels = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];
        if (!validPrivacyLevels.includes(privacyStatus)) {
          privacyStatus = "SELF_ONLY";
        }
        const tiktokAccount = await tikTokPublishingAccount(env.DB, folder_id, user_id);
        let tiktokAccessToken = String(tiktokAccount?.access_token || "").trim();
        let tiktokRefreshToken = String(tiktokAccount?.refresh_token || "").trim();
        let tiktokExpiresAt = Number(tiktokAccount?.expires_at || 0);
        let tiktokAccountId = String(tiktokAccount?.tiktok_open_id || "").trim();
        let persistedAccessToken = tiktokAccessToken;
        let refreshedBeforeInit = false;
        if (!tiktokAccessToken) {
          return new Response(JSON.stringify({ success: false, error: "No TikTok token found. Link account first." }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        try {
          const persistTikTokTokens = /* @__PURE__ */ __name(async () => {
            const updated = await env.DB.prepare(
              "UPDATE accounts SET access_token = ?, refresh_token = ?, expires_at = ?, tiktok_open_id = COALESCE(tiktok_open_id, ?) WHERE id = ? AND folder_id = ? AND user_id = ? AND platform = 'tiktok' AND access_token = ?"
            ).bind(tiktokAccessToken, tiktokRefreshToken || null, tiktokExpiresAt || null, tiktokAccountId || null, tiktokAccount.id, folder_id, user_id, persistedAccessToken).run();
            if (!updated.meta?.changes && !updated.changes) throw new Error("TikTok connection changed while uploading. Start again from this workspace.");
            persistedAccessToken = tiktokAccessToken;
            // A late refresh cannot recreate credentials after disconnect/reconnect.
            if (tiktokAccountId) await env.DB.prepare(`
              INSERT INTO tokens (folder_id, platform, account_id, access_token, refresh_token, expires_at, scope, updated_at)
              SELECT ?, 'tiktok', ?, ?, ?, ?, ?, strftime('%s','now')
              FROM accounts WHERE id = ? AND folder_id = ? AND user_id = ? AND access_token = ?
              ON CONFLICT(folder_id, platform, account_id) DO UPDATE SET
              access_token = excluded.access_token, refresh_token = excluded.refresh_token,
              expires_at = excluded.expires_at, updated_at = excluded.updated_at
            `).bind(folder_id, tiktokAccountId, tiktokAccessToken, tiktokRefreshToken || null, tiktokExpiresAt || null,
              "video.upload,video.publish,user.info.basic", tiktokAccount.id, folder_id, user_id, tiktokAccessToken).run();
          }, "persistTikTokTokens");
          if (tiktokRefreshToken && (!tiktokExpiresAt || tiktokExpiresAt - nowMs() < TOKEN_REFRESH_WINDOW_MS)) {
            const refreshed = await refreshTikTokAccessToken(tiktokRefreshToken);
            if (tiktokAccountId && refreshed.accountId && refreshed.accountId !== tiktokAccountId) throw new Error("TikTok refresh returned a different account. Reconnect this workspace.");
            tiktokAccessToken = refreshed.accessToken;
            tiktokRefreshToken = refreshed.refreshToken;
            tiktokExpiresAt = refreshed.expiresAt;
            tiktokAccountId = String(refreshed.accountId || tiktokAccountId || "").trim();
            await persistTikTokTokens();
            refreshedBeforeInit = true;
          }
          const buildInitBody = /* @__PURE__ */ __name((privacy, chunkSize, totalChunks) => JSON.stringify({
            post_info: {
              title: caption,
              privacy_level: privacy,
              disable_duet: false,
              disable_comment: false,
              disable_stitch: false,
              video_cover_timestamp_ms: 0
            },
            source_info: {
              source: "FILE_UPLOAD",
              video_size: videoSize,
              chunk_size: chunkSize,
              total_chunk_count: totalChunks
            }
          }), "buildInitBody");
          const isChunkConfigError = /* @__PURE__ */ __name((data) => {
            const haystack = JSON.stringify(data?.error || data || {}).toLowerCase();
            return haystack.includes("chunk") && (haystack.includes("invalid") || haystack.includes("size"));
          }, "isChunkConfigError");
          const isUnauditedPrivateAccountError = /* @__PURE__ */ __name(
            (data) => data?.error?.code === "unaudited_client_can_only_post_to_private_accounts",
            "isUnauditedPrivateAccountError"
          );
          const unauditedPrivateAccountMessage = "TikTok rejected this publish because the TikTok app is unaudited. For testing, connect a TikTok account set to Private, or submit the TikTok app for Content Posting API review to enable posting from public accounts.";
          const chunkProfiles = buildTikTokChunkProfiles(videoSize);
          let initRes = null;
          let initData = null;
          let selectedChunkSize = chunkProfiles[0].chunkSize;
          let selectedTotalChunks = chunkProfiles[0].totalChunks;
          let privacyDowngraded = false;
          let lastChunkErr = null;
          const triedChunkProfiles = [];
          for (const profile of chunkProfiles) {
            let attemptPrivacy = privacyStatus;
            triedChunkProfiles.push(`${profile.chunkSize}/${profile.totalChunks}`);
            console.log("tiktok_chunks", {
              videoSize,
              chunkSize: profile.chunkSize,
              totalChunks: profile.totalChunks,
              remainder: videoSize % profile.chunkSize
            });
            initRes = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/video/init/`, {
              method: "POST",
              headers: { Authorization: `Bearer ${tiktokAccessToken}`, "Content-Type": "application/json; charset=UTF-8" },
              body: buildInitBody(attemptPrivacy, profile.chunkSize, profile.totalChunks)
            });
            initData = await safeJson(initRes);
            if (initData?.error?.code === "access_token_invalid" && tiktokRefreshToken && !refreshedBeforeInit) {
              const refreshed = await refreshTikTokAccessToken(tiktokRefreshToken);
              if (tiktokAccountId && refreshed.accountId && refreshed.accountId !== tiktokAccountId) throw new Error("TikTok refresh returned a different account. Reconnect this workspace.");
              tiktokAccessToken = refreshed.accessToken;
              tiktokRefreshToken = refreshed.refreshToken;
              tiktokExpiresAt = refreshed.expiresAt;
              tiktokAccountId = String(refreshed.accountId || tiktokAccountId || "").trim();
              await persistTikTokTokens();
              initRes = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/video/init/`, {
                method: "POST",
                headers: { Authorization: `Bearer ${tiktokAccessToken}`, "Content-Type": "application/json; charset=UTF-8" },
                body: buildInitBody(attemptPrivacy, profile.chunkSize, profile.totalChunks)
              });
              initData = await safeJson(initRes);
            }
            if (isUnauditedPrivateAccountError(initData)) {
              privacyDowngraded = attemptPrivacy !== "SELF_ONLY";
              attemptPrivacy = "SELF_ONLY";
              initRes = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/video/init/`, {
                method: "POST",
                headers: { Authorization: `Bearer ${tiktokAccessToken}`, "Content-Type": "application/json; charset=UTF-8" },
                body: buildInitBody("SELF_ONLY", profile.chunkSize, profile.totalChunks)
              });
              initData = await safeJson(initRes);
              if (isUnauditedPrivateAccountError(initData)) {
                throw new Error(unauditedPrivateAccountMessage);
              }
            }
            if (initRes.ok && (!initData?.error?.code || initData.error.code === "ok")) {
              selectedChunkSize = profile.chunkSize;
              selectedTotalChunks = profile.totalChunks;
              privacyStatus = attemptPrivacy;
              lastChunkErr = null;
              break;
            }
            if (isChunkConfigError(initData)) {
              lastChunkErr = initData?.error || initData;
              continue;
            }
            throw new Error(`TikTok init failed: ${JSON.stringify(initData?.error || initData)}`);
          }
          if (lastChunkErr) {
            throw new Error(`TikTok init failed after chunk fallback attempts (${triedChunkProfiles.join(", ")}): ${JSON.stringify(lastChunkErr)}`);
          }
          const publishId = initData?.data?.publish_id;
          const uploadUrl = initData?.data?.upload_url;
          if (!publishId || !uploadUrl) {
            throw new Error(`TikTok init missing publish_id or upload_url: ${JSON.stringify(initData)}`);
          }
          const sessionId = crypto.randomUUID();
          const expiresAt = Math.floor(Date.now() / 1e3) + SESSION_EXPIRY_SECONDS;
          await env.DB.prepare(
            "INSERT INTO upload_sessions (id, platform, upload_url, access_token, video_id, title, file_size, expires_at, folder_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(sessionId, "tiktok", uploadUrl, tiktokAccessToken, publishId, privacyStatus, videoSize, expiresAt, folder_id, user_id).run();
          await bindPublicationSession(sessionId);
          return new Response(JSON.stringify({
            success: true,
            sessionId,
            publishId,
            chunkSize: selectedChunkSize,
            totalChunks: selectedTotalChunks,
            videoSize,
            ...(privacyDowngraded ? { warning: "Your TikTok app is unaudited, so this post was automatically set to Private (SELF_ONLY). Submit your app for review at https://developers.tiktok.com/ to enable public posting." } : {})
          }), { headers: jsonHeaders });
        } catch (err) {
          console.error("TikTok init-upload error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Init failed" }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/tiktok/upload-chunk" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!matchesIdentity(user_id, await getFirebaseIdentity(request)) || !await ownedFolder(env.DB, folder_id, user_id)) {
          return new Response(JSON.stringify({ error: "Workspace access denied" }), { status: 403, headers: jsonHeaders });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request), request);
        if (!billingGate.ok) return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });

        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const formData = await request.formData();
        const sessionId = String(formData.get("sessionId") || "").trim();
        const offset = Number(formData.get("offset") || 0);
        const chunkFile = formData.get("chunk");
        if (!sessionId) {
          return new Response(JSON.stringify({ success: false, error: "sessionId required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!chunkFile || !(chunkFile instanceof File)) {
          return new Response(JSON.stringify({ success: false, error: "chunk required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const session = await env.DB.prepare(
          "SELECT * FROM upload_sessions WHERE id = ? AND platform = 'tiktok' AND folder_id = ? AND user_id = ? LIMIT 1"
        ).bind(sessionId, folder_id, user_id).first();
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: "Upload session not found or expired" }), {
            status: 404,
            headers: jsonHeaders
          });
        }
        if (Math.floor(Date.now() / 1e3) > session.expires_at) {
          return new Response(JSON.stringify({ success: false, error: "Upload session expired" }), {
            status: 410,
            headers: jsonHeaders
          });
        }
        try {
          const chunkBytes = await chunkFile.arrayBuffer();
          const chunkEnd = offset + chunkBytes.byteLength - 1;
          const totalSize = session.file_size;
          const uploadRes = await fetch(session.upload_url, {
            method: "PUT",
            headers: {
              "Content-Type": "video/mp4",
              "Content-Range": `bytes ${offset}-${chunkEnd}/${totalSize}`
            },
            body: chunkBytes
          });
          const uploadResText = await uploadRes.text();
          if (!uploadRes.ok) {
            throw new Error(`TikTok chunk upload failed: ${uploadRes.status} ${uploadResText}`);
          }
          const complete = chunkEnd + 1 >= Number(session.file_size);
          return new Response(JSON.stringify({
            success: true,
            complete,
            publishId: String(session.video_id || "")
          }), { headers: jsonHeaders });
        } catch (err) {
          console.error("TikTok upload-chunk error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Chunk upload failed" }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/tiktok/publish-status" && request.method === "GET") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!matchesIdentity(user_id, await getFirebaseIdentity(request)) || !await ownedFolder(env.DB, folder_id, user_id)) {
          return new Response(JSON.stringify({ error: "Workspace access denied" }), { status: 403, headers: jsonHeaders });
        }

        const publishId = String(url.searchParams.get("publishId") || "").trim();
        const sessionId = String(url.searchParams.get("sessionId") || "").trim();
        if (!folder_id || !user_id || !publishId) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id, user_id, or publishId" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        let session = null;
        if (sessionId) {
          session = await env.DB.prepare(
            "SELECT * FROM upload_sessions WHERE id = ? AND platform = 'tiktok' AND folder_id = ? AND user_id = ? LIMIT 1"
          ).bind(sessionId, folder_id, user_id).first();
        }
        if (!session) {
          session = await env.DB.prepare(
            "SELECT * FROM upload_sessions WHERE video_id = ? AND platform = 'tiktok' AND folder_id = ? AND user_id = ? ORDER BY expires_at DESC LIMIT 1"
          ).bind(publishId, folder_id, user_id).first();
        }
        if (!session?.access_token || String(session.video_id || "") !== publishId) {
          return new Response(JSON.stringify({ success: false, error: "TikTok publish session not found" }), {
            status: 404,
            headers: jsonHeaders
          });
        }
        try {
          const statusRes = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/status/fetch/`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json; charset=UTF-8"
            },
            body: JSON.stringify({ publish_id: publishId })
          });
          const statusJson = await safeJson(statusRes);
          if (!statusRes.ok || (statusJson?.error?.code && statusJson.error.code !== "ok")) {
            throw new Error(`TikTok status failed: ${JSON.stringify(statusJson?.error || statusJson)}`);
          }
          const data = statusJson?.data || statusJson || {};
          const publishState = evaluateTikTokPublishStatus(data);
          const { status, failed, requiresUserAction, complete, publiclyAvailable, postId } = publishState;
          const privacyStatus = String(session.title || "").toUpperCase();
          const expectsPublicPost = privacyStatus === "PUBLIC_TO_EVERYONE";
          const ready = publiclyAvailable || (complete && !expectsPublicPost);
          let tiktokUrl = String(
            data.share_url ||
            data.public_share_url ||
            data.video_url ||
            data.post_url ||
            data.url ||
            ""
          ).trim();
          let creatorUsername = "";
          let tiktokProfileUrl = "";
          if (complete && !tiktokUrl) {
            try {
              const creatorRes = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/creator_info/query/`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                  "Content-Type": "application/json; charset=UTF-8"
                },
                body: JSON.stringify({})
              });
              const creatorJson = await safeJson(creatorRes);
              const creator = creatorJson?.data || creatorJson || {};
              creatorUsername = String(creator.creator_username || creator.username || "").trim().replace(/^@+/, "");
              if (creatorRes.ok && creatorUsername && postId) {
                tiktokUrl = `https://www.tiktok.com/@${encodeURIComponent(creatorUsername)}/video/${encodeURIComponent(postId)}`;
              }
              if (creatorRes.ok && creatorUsername) {
                tiktokProfileUrl = `https://www.tiktok.com/@${encodeURIComponent(creatorUsername)}`;
              }
            } catch (creatorErr) {
              console.warn("TikTok creator info lookup failed:", creatorErr?.message || creatorErr);
            }
          }
          const viewUrl = tiktokUrl || tiktokProfileUrl || "https://www.tiktok.com/";
          if (ready || failed) {
            const metered = await finishPublicationSession(session.id, user_id, "tiktok", ready);
            const removed = await env.DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(session.id).run();
            if (ready && !metered && Number(removed?.meta?.changes ?? removed?.changes ?? 0) > 0) await recordPublishUsage(user_id, "tiktok", "publish_confirmed");
          }
          return new Response(JSON.stringify({
            success: true,
            ready,
            complete,
            publiclyAvailable,
            requiresUserAction,
            privacyStatus,
            failed,
            publishId,
            status,
            postId,
            creatorUsername,
            tiktokUrl,
            tiktokProfileUrl,
            viewUrl,
            viewLabel: tiktokUrl ? "View on TikTok" : creatorUsername ? "Open TikTok Profile" : "Open TikTok",
            message: requiresUserAction
              ? "Open TikTok and finish the draft from your inbox before it will be published."
              : ready && !publiclyAvailable
                ? "TikTok completed the post with restricted visibility and has no public video link."
                : complete && expectsPublicPost
                  ? "TikTok posted the video and is still completing public moderation."
                : "",
            data
          }), { headers: jsonHeaders });
        } catch (err) {
          console.error("TikTok publish-status error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Status check failed" }), {
            status: 502,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/facebook/init-upload" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!matchesIdentity(user_id, await getFirebaseIdentity(request)) || !await ownedFolder(env.DB, folder_id, user_id)) {
          return new Response(JSON.stringify({ error: "Workspace access denied" }), { status: 403, headers: jsonHeaders });
        }
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request), request);
        if (!billingGate.ok) {
          return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        }
        const quotaGate = await ensurePlanQuota(user_id, "facebook", billingGate.evaluated);
        if (!quotaGate.ok) {
          return new Response(JSON.stringify(quotaGate.body), { status: quotaGate.statusCode, headers: jsonHeaders });
        }
        const body = await safeJson(request);
        const title = String(body.title || "").trim();
        const description = String(body.description || "").trim();
        const fileSize = Number(body.fileSize) || 0;
        if (!title) {
          return new Response(JSON.stringify({ success: false, error: "Title required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!fileSize || fileSize <= 0) {
          return new Response(JSON.stringify({ success: false, error: "fileSize required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (fileSize > MAX_FACEBOOK_VIDEO_SIZE_BYTES) {
          return new Response(JSON.stringify({ success: false, error: "Facebook Reel exceeds this upload route's 90MB limit. Compress or trim it before uploading." }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const pageAccount = await env.DB.prepare(
          "SELECT facebook_page_id, facebook_page_access_token FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'facebook_page' LIMIT 1"
        ).bind(folder_id, user_id).first();
        if (!pageAccount?.facebook_page_id || !pageAccount?.facebook_page_access_token) {
          return new Response(JSON.stringify({ success: false, error: "No Facebook Page selected. Please select a page in your workspace settings." }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const pageId = String(pageAccount.facebook_page_id);
        const pageAccessToken = String(pageAccount.facebook_page_access_token);
        try {
          const uploadProof = await appsecretProof(pageAccessToken);
          const uploadProofParam = uploadProof ? `?appsecret_proof=${encodeURIComponent(uploadProof)}` : "";
          const startRes = await fetchFbJson(`${fbGraph}/${encodeURIComponent(pageId)}/video_reels${uploadProofParam}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ access_token: pageAccessToken, upload_phase: "start" })
          });
          const videoId = startRes?.video_id;
          const uploadUrl = startRes?.upload_url;
          if (!videoId || !uploadUrl) {
            throw new Error(`Bad reels start response: ${JSON.stringify(startRes)}`);
          }
          // Facebook's Reels upload URL expects the complete binary in one
          // request. It is not a resumable chunk endpoint: offset must stay 0.
          const chunkSize = fileSize;
          const totalChunks = 1;
          const sessionId = crypto.randomUUID();
          const expiresAt = Math.floor(Date.now() / 1e3) + SESSION_EXPIRY_SECONDS;
          await env.DB.prepare(
            "INSERT INTO upload_sessions (id, platform, upload_url, access_token, video_id, page_id, title, description, file_size, expires_at, folder_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(sessionId, "facebook", uploadUrl, pageAccessToken, videoId, pageId, title, description, fileSize, expiresAt, folder_id, user_id).run();
          await bindPublicationSession(sessionId);
          return new Response(JSON.stringify({ success: true, sessionId, videoId, chunkSize, totalChunks }), { headers: jsonHeaders });
        } catch (err) {
          console.error("Facebook init-upload error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Init failed" }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/facebook/upload-chunk" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!matchesIdentity(user_id, await getFirebaseIdentity(request)) || !await ownedFolder(env.DB, folder_id, user_id)) {
          return new Response(JSON.stringify({ error: "Workspace access denied" }), { status: 403, headers: jsonHeaders });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request), request);
        if (!billingGate.ok) return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const formData = await request.formData();
        const sessionId = String(formData.get("sessionId") || "").trim();
        const offset = Number(formData.get("offset") || 0);
        const chunkFile = formData.get("chunk");
        if (!sessionId) {
          return new Response(JSON.stringify({ success: false, error: "sessionId required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!chunkFile || !(chunkFile instanceof File)) {
          return new Response(JSON.stringify({ success: false, error: "chunk required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const session = await env.DB.prepare(
          "SELECT * FROM upload_sessions WHERE id = ? AND platform = 'facebook' AND folder_id = ? AND user_id = ? LIMIT 1"
        ).bind(sessionId, folder_id, user_id).first();
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: "Upload session not found or expired" }), {
            status: 404,
            headers: jsonHeaders
          });
        }
        if (Math.floor(Date.now() / 1e3) > session.expires_at) {
          return new Response(JSON.stringify({ success: false, error: "Upload session expired" }), {
            status: 410,
            headers: jsonHeaders
          });
        }
        if (offset !== 0) {
          return new Response(JSON.stringify({
            success: false,
            error: `Facebook Reels requires offset 0; received ${offset}`
          }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (Number(chunkFile.size) !== Number(session.file_size)) {
          return new Response(JSON.stringify({
            success: false,
            error: `Facebook Reels requires the complete video in one request (${session.file_size} bytes expected, ${chunkFile.size} received)`
          }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        try {
          const chunkBytes = await chunkFile.arrayBuffer();
          const upRes = await fetch(session.upload_url, {
            method: "POST",
            headers: {
              Authorization: `OAuth ${session.access_token}`,
              "Content-Type": "application/octet-stream",
              offset: "0",
              file_size: String(session.file_size)
            },
            body: chunkBytes
          });
          const upText = await upRes.text();
          if (!upRes.ok) {
            throw new Error(`Facebook chunk upload failed ${upRes.status}: ${upText}`);
          }
          return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
        } catch (err) {
          console.error("Facebook upload-chunk error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Chunk upload failed" }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/facebook/finish-upload" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!matchesIdentity(user_id, await getFirebaseIdentity(request)) || !await ownedFolder(env.DB, folder_id, user_id)) {
          return new Response(JSON.stringify({ error: "Workspace access denied" }), { status: 403, headers: jsonHeaders });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request), request);
        if (!billingGate.ok) return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const body = await safeJson(request);
        const sessionId = String(body.sessionId || "").trim();
        if (!sessionId) {
          return new Response(JSON.stringify({ success: false, error: "sessionId required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const session = await env.DB.prepare(
          "SELECT * FROM upload_sessions WHERE id = ? AND platform = 'facebook' AND folder_id = ? AND user_id = ? LIMIT 1"
        ).bind(sessionId, folder_id, user_id).first();
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: "Upload session not found or expired" }), {
            status: 404,
            headers: jsonHeaders
          });
        }
        if (Math.floor(Date.now() / 1e3) > session.expires_at) {
          return new Response(JSON.stringify({ success: false, error: "Upload session expired" }), {
            status: 410,
            headers: jsonHeaders
          });
        }
        try {
          const pageId = String(session.page_id);
          const pageAccessToken = String(session.access_token);
          const videoId = String(session.video_id);
          const uploadProof = await appsecretProof(pageAccessToken);
          const uploadProofParam = uploadProof ? `?appsecret_proof=${encodeURIComponent(uploadProof)}` : "";
          const finishRes = await fetchFbJson(`${fbGraph}/${encodeURIComponent(pageId)}/video_reels${uploadProofParam}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              access_token: pageAccessToken,
              upload_phase: "finish",
              video_id: videoId,
              video_state: "PUBLISHED",
              title: session.title || "",
              description: session.description || ""
            })
          });
          const pageUrl = `https://www.facebook.com/${encodeURIComponent(pageId)}`;
          const postUrl = finishRes?.post_id ? `https://www.facebook.com/${finishRes.post_id}` : "";
          const videoUrl = `https://www.facebook.com/${encodeURIComponent(pageId)}/videos/${encodeURIComponent(videoId)}`;
          return new Response(JSON.stringify({
            success: true,
            videoId,
            pageId,
            postUrl,
            pageUrl,
            videoUrl,
            facebookUrl: pageUrl,
            processing: true,
            data: finishRes
          }), { headers: jsonHeaders });
        } catch (err) {
          console.error("Facebook finish-upload error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Finish failed" }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/facebook/video-status" && request.method === "GET") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        const videoId = String(url.searchParams.get("videoId") || "").trim();
        if (!matchesIdentity(user_id, await getFirebaseIdentity(request)) || !await ownedFolder(env.DB, folder_id, user_id)) {
          return new Response(JSON.stringify({ error: "Workspace access denied" }), { status: 403, headers: jsonHeaders });
        }
        if (!folder_id || !user_id || !videoId) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id, user_id, or videoId" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const session = await env.DB.prepare(
          "SELECT * FROM upload_sessions WHERE video_id = ? AND platform = 'facebook' AND folder_id = ? AND user_id = ? ORDER BY expires_at DESC LIMIT 1"
        ).bind(videoId, folder_id, user_id).first();
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: "Facebook publish session not found or expired" }), {
            status: 404,
            headers: jsonHeaders
          });
        }
        const pageAccount = await env.DB.prepare(
          "SELECT facebook_page_id, facebook_page_access_token FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'facebook_page' LIMIT 1"
        ).bind(folder_id, user_id).first();
        if (!pageAccount?.facebook_page_id || !pageAccount?.facebook_page_access_token) {
          return new Response(JSON.stringify({ success: false, error: "No Facebook Page selected" }), {
            status: 404,
            headers: jsonHeaders
          });
        }
        try {
          const pageId = String(pageAccount.facebook_page_id);
          const pageAccessToken = String(pageAccount.facebook_page_access_token);
          if (String(session.page_id || "") !== pageId) {
            return new Response(JSON.stringify({ success: false, error: "Facebook Page selection changed during publishing" }), {
              status: 409,
              headers: jsonHeaders
            });
          }
          const params = new URLSearchParams({
            access_token: pageAccessToken,
            fields: "id,status,permalink_url,published"
          });
          const proof = await appsecretProof(pageAccessToken);
          if (proof) params.set("appsecret_proof", proof);
          const video = await fetchFbJson(`${fbGraph}/${encodeURIComponent(videoId)}?${params.toString()}`);
          const status = video?.status || {};
          const readiness = evaluateFacebookVideoReadiness(videoId, video);
          if (readiness.ready) {
            const metered = await finishPublicationSession(session.id, user_id, "facebook", true);
            const removed = await env.DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(session.id).run();
            if (!metered && Number(removed?.meta?.changes ?? removed?.changes ?? 0) > 0) await recordPublishUsage(user_id, "facebook", "publish_confirmed");
          } else if (readiness.failed) {
            await finishPublicationSession(session.id, user_id, "facebook", false);
            await env.DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(session.id).run();
          }
          return new Response(JSON.stringify({
            success: true,
            ready: readiness.ready,
            videoId,
            status,
            processingReady: readiness.processingReady,
            published: readiness.published,
            failed: readiness.failed,
            permalinkReady: readiness.permalinkReady,
            videoUrl: readiness.ready ? readiness.permalinkUrl : "",
            pageUrl: `https://www.facebook.com/${encodeURIComponent(pageId)}`
          }), { headers: jsonHeaders });
        } catch (err) {
          console.error("Facebook video-status error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Status check failed" }), {
            status: 502,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/facebook/upload-image" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request), request);
        if (!billingGate.ok) {
          return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        }
        const quotaGate = await ensurePlanQuota(user_id, "facebook", billingGate.evaluated);
        if (!quotaGate.ok) {
          return new Response(JSON.stringify(quotaGate.body), { status: quotaGate.statusCode, headers: jsonHeaders });
        }
        const formData = await request.formData();
        const title = String(formData.get("title") || "").trim();
        const description = String(formData.get("description") || "").trim();
        const imageFile = formData.get("image");
        if (!imageFile || !(imageFile instanceof File)) {
          return new Response(JSON.stringify({ success: false, error: "Valid image file required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!String(imageFile.type || "").toLowerCase().startsWith("image/")) {
          return new Response(JSON.stringify({ success: false, error: "File must be an image" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
          return new Response(JSON.stringify({ success: false, error: "Image too large (>25MB)" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const pageAccount = await env.DB.prepare(
          "SELECT facebook_page_id, facebook_page_access_token FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'facebook_page' LIMIT 1"
        ).bind(folder_id, user_id).first();
        if (!pageAccount?.facebook_page_id || !pageAccount?.facebook_page_access_token) {
          return new Response(JSON.stringify({ success: false, error: "No Facebook Page selected. Please select a page in your workspace settings." }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const pageId = String(pageAccount.facebook_page_id);
        const pageAccessToken = String(pageAccount.facebook_page_access_token);
        const caption = [title, description].filter(Boolean).join("\n\n");
        try {
          const uploadProof = await appsecretProof(pageAccessToken);
          const uploadProofParam = uploadProof ? `?appsecret_proof=${encodeURIComponent(uploadProof)}` : "";
          const fbForm = new FormData();
          fbForm.append("access_token", pageAccessToken);
          if (caption) fbForm.append("caption", caption);
          fbForm.append("published", "true");
          fbForm.append("source", imageFile, imageFile.name || "image.jpg");
          const res = await fetch(`${fbGraph}/${encodeURIComponent(pageId)}/photos${uploadProofParam}`, {
            method: "POST",
            body: fbForm
          });
          const out = await safeJson(res);
          if (!res.ok || out?.error) {
            throw new Error(`Facebook image upload failed: ${JSON.stringify(out?.error || out)}`);
          }
          let postId = String(out?.post_id || "").trim();
          const photoId = String(out?.id || "").trim();
          const pageUrl = `https://www.facebook.com/${encodeURIComponent(pageId)}`;
          const postUrl = postId ? `https://www.facebook.com/${postId}` : "";
          await recordPublishUsage(user_id, "facebook");
          return new Response(JSON.stringify({
            success: true,
            postId,
            photoId,
            pageId,
            postUrl,
            pageUrl,
            facebookUrl: postUrl || pageUrl
          }), { headers: jsonHeaders });
        } catch (err) {
          console.error("Facebook image upload error:", err);
          const errMsg = err.message || "Facebook image upload failed";
          const isAuthErr = errMsg.includes("OAuthException") || errMsg.includes('"code":190') || errMsg.includes('"code": 190');
          const friendlyMsg = isAuthErr ? "Your Facebook authorization has expired. Please re-link your Facebook account from your workspace settings (go to your folder, remove the Facebook account, then link it again)." : errMsg;
          return new Response(JSON.stringify({
            success: false,
            error: friendlyMsg
          }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/youtube/upload" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!await ownedFolder(env.DB, folder_id, user_id)) {
          return Response.json({ success: false, error: "Workspace access denied" }, { status: 403, headers: corsHeaders });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request), request);
        if (!billingGate.ok) {
          return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        }
        const quotaGate = await ensurePlanQuota(user_id, "youtube", billingGate.evaluated);
        if (!quotaGate.ok) {
          return new Response(JSON.stringify(quotaGate.body), { status: quotaGate.statusCode, headers: jsonHeaders });
        }
        const formData = await request.formData();
        const title = String(formData.get("title") || "").trim();
        const description = String(formData.get("description") || "").trim();
        const keywords = String(formData.get("keywords") || "").trim();
        let privacyStatus = String(formData.get("privacyStatus") || "private").toLowerCase();
        const videoFile = formData.get("video");
        if (!title || title.length < 1 || title.length > 100) {
          return new Response(JSON.stringify({ success: false, error: "Title required (1-100 chars)" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!videoFile || !(videoFile instanceof File)) {
          return new Response(JSON.stringify({ success: false, error: "Valid video file required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (videoFile.size > MAX_VIDEO_SIZE_BYTES) {
          return new Response(JSON.stringify({ success: false, error: "Video too large (>500MB)" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!["private", "unlisted", "public"].includes(privacyStatus)) {
          privacyStatus = "private";
        }
        let token = await env.DB.prepare(`
          SELECT * FROM tokens 
          WHERE folder_id = ? AND platform = 'youtube' 
          ORDER BY updated_at DESC LIMIT 1
        `).bind(folder_id).first();
        // Fall back to accounts table if tokens table has no valid token
        if (!token?.access_token || token.access_token === "undefined") {
          const acct = await env.DB.prepare(
            "SELECT id, access_token, refresh_token, expires_at FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'youtube' LIMIT 1"
          ).bind(folder_id, user_id).first();
          if (acct?.access_token && acct.access_token !== "undefined") {
            token = { access_token: acct.access_token, refresh_token: acct.refresh_token || null, expires_at: acct.expires_at || null, account_id: String(acct.id), scope: null };
          }
        }
        if (!token?.access_token || token.access_token === "undefined") {
          return new Response(JSON.stringify({ success: false, error: "No YouTube token found. Link account first." }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        // If tokens table has no refresh_token, borrow it from the accounts table
        let ytRefreshToken = token.refresh_token || null;
        if (!ytRefreshToken) {
          const acct = await env.DB.prepare(
            "SELECT refresh_token FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'youtube' LIMIT 1"
          ).bind(folder_id, user_id).first();
          ytRefreshToken = acct?.refresh_token || null;
        }
        const refreshYouTubeToken = /* @__PURE__ */ __name(async (refreshToken) => {
          if (!refreshToken) return null;
          try {
            const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: "refresh_token"
              })
            });
            const refreshed = await safeJson(refreshRes);
            if (refreshed?.access_token) {
              await upsertToken({
                folderId: folder_id,
                platform: "youtube",
                accountId: token.account_id,
                accessToken: refreshed.access_token,
                refreshToken: refreshed.refresh_token || refreshToken,
                expiresAt: nowMs() + Number(refreshed.expires_in || DEFAULT_TOKEN_EXPIRY_SECONDS) * 1e3,
                scope: token.scope || YOUTUBE_OAUTH_SCOPE
              });
              return refreshed.access_token;
            }
            console.warn("YouTube token refresh: response missing access_token, falling back to stored token");
            return null;
          } catch (refreshErr) {
            console.error("YouTube token refresh failed:", refreshErr);
            return null;
          }
        }, "refreshYouTubeToken");
        let accessToken = token.access_token;
        if (ytRefreshToken && (!token.expires_at || Number(token.expires_at) - nowMs() < TOKEN_REFRESH_WINDOW_MS)) {
          const refreshed = await refreshYouTubeToken(ytRefreshToken);
          if (refreshed) accessToken = refreshed;
        }
        const buildInitBody = /* @__PURE__ */ __name(() => JSON.stringify({
          snippet: {
            title,
            description,
            tags: keywords ? keywords.split(/[\s,]+/).filter(Boolean) : [],
            defaultLanguage: "en"
          },
          status: {
            privacyStatus,
            selfDeclaredMadeForKids: false
          }
        }), "buildInitBody");
        try {
          let initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json; charset=UTF-8",
              "X-Upload-Content-Type": videoFile.type || "video/mp4",
              "X-Upload-Content-Length": String(videoFile.size)
            },
            body: buildInitBody()
          });
          if (initRes.status === 401 && ytRefreshToken) {
            const retried = await refreshYouTubeToken(ytRefreshToken);
            if (retried) {
              accessToken = retried;
              initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                  "Content-Type": "application/json; charset=UTF-8",
                  "X-Upload-Content-Type": videoFile.type || "video/mp4",
                  "X-Upload-Content-Length": String(videoFile.size)
                },
                body: buildInitBody()
              });
            }
          }
          if (!initRes.ok) {
            const errData = await safeJson(initRes);
            if (initRes.status === 401) {
              throw new Error("Your YouTube authorization has expired or was revoked. Please re-link your YouTube account from your workspace settings (go to your folder, remove the YouTube account, then link it again).");
            }
            throw new Error(`YouTube init failed: ${initRes.status} ${JSON.stringify(errData)}`);
          }
          const location = initRes.headers.get("Location");
          if (!location) {
            throw new Error("No upload location returned");
          }
          const videoBytes = await videoFile.arrayBuffer();
          const uploadRes = await fetch(location, {
            method: "PUT",
            headers: {
              "Content-Type": videoFile.type || "video/mp4",
              "X-Upload-Content-Length": String(videoFile.size)
            },
            body: videoBytes
          });
          if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            throw new Error(`YouTube upload failed: ${uploadRes.status} ${errText}`);
          }
          const uploadData = await safeJson(uploadRes);
          const videoId = uploadData?.id;
          await recordPublishUsage(user_id, "youtube");
          return new Response(JSON.stringify({
            success: true,
            videoId,
            youtubeUrl: `https://youtube.com/watch?v=${videoId}`,
            data: uploadData
          }), {
            headers: jsonHeaders
          });
        } catch (err) {
          console.error("YouTube upload error:", err);
          return new Response(JSON.stringify({
            success: false,
            error: err.message || "Upload failed",
            details: err.stack
          }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/facebook/upload" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request), request);
        if (!billingGate.ok) {
          return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        }
        const quotaGate = await ensurePlanQuota(user_id, "facebook", billingGate.evaluated);
        if (!quotaGate.ok) {
          return new Response(JSON.stringify(quotaGate.body), { status: quotaGate.statusCode, headers: jsonHeaders });
        }
        const formData = await request.formData();
        const title = String(formData.get("title") || "").trim();
        const description = String(formData.get("description") || "").trim();
        const videoFile = formData.get("video");
        if (!title) {
          return new Response(JSON.stringify({ success: false, error: "Title required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (!videoFile || !(videoFile instanceof File)) {
          return new Response(JSON.stringify({ success: false, error: "Valid video file required" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        if (videoFile.size > MAX_VIDEO_SIZE_BYTES) {
          return new Response(JSON.stringify({ success: false, error: "Video too large (>500MB)" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const pageAccount = await env.DB.prepare(
          "SELECT facebook_page_id, facebook_page_access_token FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'facebook_page' LIMIT 1"
        ).bind(folder_id, user_id).first();
        if (!pageAccount?.facebook_page_id || !pageAccount?.facebook_page_access_token) {
          return new Response(JSON.stringify({ success: false, error: "No Facebook Page selected. Please select a page in your workspace settings." }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const pageId = String(pageAccount.facebook_page_id);
        const pageAccessToken = String(pageAccount.facebook_page_access_token);
        try {
          const videoBytes = await videoFile.arrayBuffer();
          const uploadProof = await appsecretProof(pageAccessToken);
          const uploadProofParam = uploadProof ? `?appsecret_proof=${encodeURIComponent(uploadProof)}` : "";
          const startRes = await fetchFbJson(`${fbGraph}/${encodeURIComponent(pageId)}/video_reels${uploadProofParam}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              access_token: pageAccessToken,
              upload_phase: "start"
            })
          });
          const videoId = startRes?.video_id;
          const uploadUrl = startRes?.upload_url;
          if (!videoId || !uploadUrl) {
            throw new Error(`Bad reels start response: ${JSON.stringify(startRes)}`);
          }
          const upRes = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              Authorization: `OAuth ${pageAccessToken}`,
              "Content-Type": "application/octet-stream",
              offset: "0",
              file_size: String(videoBytes.byteLength)
            },
            body: videoBytes
          });
          const upText = await upRes.text();
          if (!upRes.ok) {
            throw new Error(`Facebook reels upload failed ${upRes.status}: ${upText}`);
          }
          const finishRes = await fetchFbJson(`${fbGraph}/${encodeURIComponent(pageId)}/video_reels${uploadProofParam}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              access_token: pageAccessToken,
              upload_phase: "finish",
              video_id: String(videoId),
              video_state: "PUBLISHED",
              title,
              description: description || ""
            })
          });
          // Meta accepts the Reel before its publishing phase completes. Keep
          // the reserved place pending until /facebook/video-status verifies it.
          const sessionId = crypto.randomUUID();
          publicationSlotRetained = true;
          await env.DB.prepare(`INSERT INTO upload_sessions
            (id, platform, upload_url, access_token, video_id, page_id, title, description, file_size, expires_at, folder_id, user_id)
            VALUES (?, 'facebook', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(sessionId, pageAccessToken, videoId, pageId, title, description, videoBytes.byteLength,
              nowUnix() + SESSION_EXPIRY_SECONDS, folder_id, user_id).run();
          await bindPublicationSession(sessionId);
          return new Response(JSON.stringify({
            success: true,
            sessionId,
            videoId,
            facebookUrl: finishRes?.post_id ? `https://www.facebook.com/${finishRes.post_id}` : `https://www.facebook.com/video/${videoId}`,
            data: finishRes
          }), {
            headers: jsonHeaders
          });
        } catch (err) {
          console.error("Facebook upload error:", err);
          const errMsg = err.message || "Facebook upload failed";
          // Facebook auth errors include OAuthException or error code 190 in the message
          const isAuthErr = errMsg.includes("OAuthException") || errMsg.includes('"code":190') || errMsg.includes('"code": 190');
          const friendlyMsg = isAuthErr
            ? "Your Facebook authorization has expired. Please re-link your Facebook account from your workspace settings (go to your folder, remove the Facebook account, then link it again)."
            : errMsg;
          return new Response(JSON.stringify({
            success: false,
            error: friendlyMsg
          }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/post-video" && request.method === "POST") {
        const { account_id, video_url, image_url, media_type, title, platform, description, page_id, folder_id, user_id, client_platform } = await request.json();
        const account = account_id ? await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(account_id).first() : null;
        if (platform === "tiktok" && (!matchesIdentity(user_id || "", await getFirebaseIdentity(request)) ||
          !await ownedFolder(env.DB, folder_id, user_id) || !account || account.platform !== "tiktok" ||
          String(account.folder_id) !== String(folder_id) || account.user_id !== user_id)) {
          return new Response(JSON.stringify({ error: "TikTok account does not belong to this workspace" }), { status: 403, headers: jsonHeaders });
        }
        const billingUserId = requireUser(user_id) || requireUser(account?.user_id);
        if (!billingUserId || !folder_id || !await ownedFolder(env.DB, folder_id, billingUserId) ||
            (account && (String(account.folder_id) !== String(folder_id) || account.user_id !== billingUserId))) {
          return Response.json({ success: false, error: "Workspace access denied" }, { status: 403, headers: corsHeaders });
        }
        const billingGate = await ensureBillingAccess(billingUserId, getClientPlatform(request, client_platform), request, false, folder_id);
        if (!billingGate.ok) {
          return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        }
        if (platform === "tiktok") {
          // This old URL endpoint has no verified final-publish callback. Keep
          // TikTok on the session/status flow so a 150-post cap is measurable.
          return Response.json({ success: false, error: "Use the TikTok upload flow from your workspace to publish." }, { status: 400, headers: corsHeaders });
        }
        const quotaPlatform = platform === "tiktok" ? "tiktok" : platform === "facebook" ? "facebook" : "youtube";
        const quotaGate = await ensurePlanQuota(billingUserId, quotaPlatform, billingGate.evaluated);
        if (!quotaGate.ok) {
          return new Response(JSON.stringify(quotaGate.body), { status: quotaGate.statusCode, headers: jsonHeaders });
        }
        const bearer = account?.access_token;
        if (platform === "tiktok") {
          const tiktokRes = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/video/init/`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${bearer}`,
              "Content-Type": "application/json; charset=UTF-8"
            },
            body: JSON.stringify({
              post_info: {
                title,
                privacy_level: "SELF_ONLY",
                disable_duet: false,
                disable_comment: false
              },
              source_info: {
                source: "PULL_FROM_URL",
                video_url
              }
            })
          });
          const result = await safeJson(tiktokRes);
          if (!tiktokRes.ok || (result?.error?.code && result.error.code !== "ok")) {
            return new Response(JSON.stringify({ success: false, error: `TikTok init failed: ${JSON.stringify(result?.error || result)}` }), { headers: jsonHeaders });
          }
          return new Response(JSON.stringify(result), { headers: jsonHeaders });
        }
        if (platform === "facebook") {
          const desc = String(description || title || "").trim();
          const providedMediaUrl = String(image_url || video_url || "").trim();
          const postAsImage = String(media_type || "").toLowerCase() === "image" || !!image_url || looksLikeImageUrl(providedMediaUrl);
          let pageId = page_id ? String(page_id) : null;
          let pageAccessToken = null;
          const selectedPage = await env.DB.prepare(
            "SELECT facebook_page_id, facebook_page_access_token FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'facebook_page' LIMIT 1"
          ).bind(String(folder_id), billingUserId).first();
          if (!selectedPage?.facebook_page_id || !selectedPage?.facebook_page_access_token ||
              (pageId && pageId !== String(selectedPage.facebook_page_id))) {
            return Response.json({ success: false, error: 'Select the Facebook Page linked to this workspace before publishing.' },
              { status: 403, headers: corsHeaders });
          }
          pageId = String(selectedPage.facebook_page_id);
          pageAccessToken = String(selectedPage.facebook_page_access_token);
          if (!pageAccessToken && account?.platform === "facebook_page" && account?.access_token) {
            pageAccessToken = String(account.access_token);
          }
          if (!pageAccessToken && pageId && folder_id) {
            const tok = await env.DB.prepare(
              "SELECT access_token FROM tokens WHERE folder_id = ? AND platform = 'facebook_page' AND account_id = ? ORDER BY updated_at DESC LIMIT 1"
            ).bind(String(folder_id), String(pageId)).first();
            if (tok?.access_token) pageAccessToken = String(tok.access_token);
          }
          if (!pageId) {
            return new Response(JSON.stringify({ success: false, error: "Missing page_id for facebook" }), {
              status: 400,
              headers: jsonHeaders
            });
          }
          if (!pageAccessToken) {
            return new Response(JSON.stringify({ success: false, error: "Missing Facebook Page access token. Link Facebook first." }), {
              status: 400,
              headers: jsonHeaders
            });
          }
          if (!providedMediaUrl) {
            return new Response(JSON.stringify({ success: false, error: "Missing media URL (image_url or video_url)" }), {
              status: 400,
              headers: jsonHeaders
            });
          }
          if (postAsImage) {
            const out = await publishFacebookPhotoFromUrl({
              pageId,
              pageAccessToken: String(pageAccessToken),
              imageUrl: providedMediaUrl,
              caption: desc
            });
            await recordPublishUsage(billingUserId, "facebook");
            return new Response(JSON.stringify({
              success: true,
              data: out,
              postType: "image",
              postUrl: out.postUrl,
              pageUrl: out.pageUrl,
              facebookUrl: out.facebookUrl
            }), {
              headers: jsonHeaders
            });
          }
          const out = await publishFacebookReelFromUrl({
            pageId,
            pageAccessToken: String(pageAccessToken),
            videoUrl: providedMediaUrl,
            description: desc
          });
          const sessionId = crypto.randomUUID();
          publicationSlotRetained = true;
          await env.DB.prepare(`INSERT INTO upload_sessions
            (id, platform, upload_url, access_token, video_id, page_id, description, expires_at, folder_id, user_id)
            VALUES (?, 'facebook', NULL, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(sessionId, pageAccessToken, String(out.video_id), pageId, desc,
              nowUnix() + SESSION_EXPIRY_SECONDS, folder_id, billingUserId).run();
          await bindPublicationSession(sessionId);
          return new Response(JSON.stringify({
            success: true,
            sessionId,
            data: out,
            postType: "video",
            postUrl: out.postUrl,
            pageUrl: out.pageUrl,
            videoUrl: out.videoUrl,
            facebookUrl: out.facebookUrl,
            processing: true
          }), {
            headers: jsonHeaders
          });
        }
        return new Response(JSON.stringify({ success: false, error: "Unsupported platform" }), {
          status: 400,
          headers: jsonHeaders
        });
      }
      if (url.pathname === "/api/generate-seo" && request.method === "POST") {
        const payload = await request.json();
        const identity = await getFirebaseIdentity(request);
        const userId = requireUser(payload?.user_id || identity?.userId);
        const billingGate = await ensureBillingAccess(userId, "web", request, true);
        if (!billingGate.ok) return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
        const sharedInput = await normalizeSeoInput(payload);
        if (!sharedInput.topic.trim() && !sharedInput.imageBase64) {
          return new Response(JSON.stringify({ success: false, error: "Provide an image, a text prompt, or both" }), { status: 400, headers: jsonHeaders });
        }
        const sharedResult = await generateWithCredits(userId, billingGate, payload, sharedInput);
        return new Response(JSON.stringify(sharedResult), { status: 200, headers: jsonHeaders });
        const imageBase64 = payload.image_base64 || "";
        const imageFilename = payload.image_filename || "";
        const textPrompt = payload.prompt || "";
        const folderId = payload.folder_id || "";
        const folderName = payload.folder_name || "";
        const ytChannel = payload.youtube_channel || "";
        const fbAccount = payload.facebook_account || "";
        const ttAccount = payload.tiktok_account || "";
        const hasImage = !!(imageBase64 && imageFilename);
        const hasText = !!textPrompt.trim();
        if (!hasImage && !hasText) {
          return new Response(
            JSON.stringify({ success: false, error: "Provide an image, a text prompt, or both" }),
            {
              status: 400,
              headers: jsonHeaders
            }
          );
        }
        const brandParts = [];
        if (folderName) brandParts.push(`Brand/Channel: ${folderName}`);
        if (ytChannel) brandParts.push(`YouTube: ${ytChannel}`);
        if (fbAccount) brandParts.push(`Facebook: ${fbAccount}`);
        if (ttAccount) brandParts.push(`TikTok: ${ttAccount}`);
        const brandContext = brandParts.length ? brandParts.join(". ") + ". " : "";
        const seoSystemPrompt = `You are an expert social media SEO strategist with deep knowledge of YouTube, TikTok, and Facebook algorithms. Your goal is to generate high-quality, trending, platform-optimized SEO content that maximises discoverability and engagement.

Platform requirements:
- YouTube: Titles must be 50-60 characters, keyword-rich, and compelling. Descriptions must be 150-300 characters with a strong hook and relevant keywords naturally embedded. Keywords must be 15-20 specific, trending, high-volume search terms separated by commas (mix broad + niche terms). Optimize for YouTube search and suggested videos.
- TikTok: Caption must be under 150 characters with 3-5 highly relevant trending hashtags including #fyp and #foryoupage. Use conversational tone, emojis, and hooks that drive shares. Optimize for the TikTok For You Page algorithm.
- Facebook: Title must be 40-60 characters. Description must be 100-200 characters followed by 5-8 relevant hashtags. Optimize for Facebook Reels discovery and shares.

Quality rules:
- Generate SPECIFIC, NICHE content \u2014 never generic filler text
- Use currently trending keywords and hashtags for maximum reach
- Match the exact content topic/mood \u2014 be precise, not vague
- Each platform's content must be uniquely optimised, not copy-pasted
- Titles must be clickable and curiosity-driving
- Keywords must include a mix of high-volume broad terms and specific niche terms

Return ONLY valid JSON with no markdown, no extra text, no explanations:
{
  "youtube": {
    "title": "Engaging title 50-60 chars",
    "description": "Compelling description 150-300 chars with keywords embedded naturally",
    "keywords": "15-20 trending comma-separated keywords, mix of broad and niche"
  },
  "tiktok": {
    "allInOne": "Hook caption under 150 chars with emojis and 3-5 trending hashtags #fyp #foryoupage"
  },
  "facebook": {
    "title": "Reels title 40-60 chars",
    "descriptionAndTags": "Engaging description 100-200 chars\\n\\n#hashtag1 #hashtag2 #hashtag3 #hashtag4 #hashtag5"
  }
}`;
        const parseSeoText = /* @__PURE__ */ __name((rawText) => {
          rawText = rawText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
          const firstBrace = rawText.indexOf("{");
          const lastBrace = rawText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) rawText = rawText.slice(firstBrace, lastBrace + 1).trim();
          return JSON.parse(rawText);
        }, "parseSeoText");
        let parsed = null;
        let seoProvider = "";
        const apiKey = env.OPENAI_API_KEY;
        if (apiKey) {
          try {
            const oaiMessages = (
              /** @type {{ role: string, content: string | Array<{type: string, text?: string, image_url?: {url: string}}>}[]} */
              [{ role: "system", content: seoSystemPrompt }]
            );
            if (hasImage) {
              const mimeType = imageFilename.toLowerCase().split(".").pop() === "png" ? "image/png" : "image/jpeg";
              oaiMessages.push({ role: "user", content: [
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
                { type: "text", text: `${brandContext}${hasText ? `Analyze this image and description to generate SEO: ${textPrompt}` : "Analyze this image carefully and generate platform-optimized SEO content."}` }
              ] });
            } else {
              oaiMessages.push({ role: "user", content: `${brandContext}Generate platform-optimized SEO content for the following:
${textPrompt}

Generate trending, specific SEO \u2014 not generic content.` });
            }
            const oaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "gpt-4o", messages: oaiMessages, response_format: { type: "json_object" } })
            });
            if (!oaiResponse.ok) {
              const errorText = await oaiResponse.text();
              throw new Error(`OpenAI API ${oaiResponse.status}: ${errorText.slice(0, 300)}`);
            }
            const oaiData = await oaiResponse.json();
            if (oaiData.choices?.[0]?.message?.content) {
              parsed = parseSeoText(oaiData.choices[0].message.content);
              if (!hasSeoContent(parsed)) throw new Error("OpenAI returned incomplete SEO content");
              seoProvider = "openai";
            } else {
              throw new Error("OpenAI returned no SEO content");
            }
          } catch (e) {
            console.error("OpenAI failed, falling back to Cloudflare AI...", e.message);
            parsed = null;
          }
        }
        if (!parsed) {
          try {
            let aiResponse = null;
            if (hasImage) {
              const mimeType = imageFilename.toLowerCase().split(".").pop() === "png" ? "image/png" : "image/jpeg";
              const userContent = hasText ? `${brandContext}Analyze this image and the following context to generate platform-optimized SEO content.

Context: ${textPrompt}

Generate trending, specific SEO \u2014 not generic content.` : `${brandContext}Analyze this image carefully and generate platform-optimized SEO content based on what you see.

Generate trending, specific SEO \u2014 not generic content.`;
              aiResponse = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
                messages: [
                  { role: "system", content: seoSystemPrompt },
                  { role: "user", content: userContent }
                ],
                images: [{ data: imageBase64, mimeType }]
              });
            } else {
              aiResponse = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
                messages: [
                  { role: "system", content: seoSystemPrompt },
                  {
                    role: "user",
                    content: `${brandContext}Generate platform-optimized SEO content for the following:
${textPrompt}

Generate trending, specific SEO \u2014 not generic content.`
                  }
                ]
              });
            }
            let rawText;
            if (typeof aiResponse === "string") {
              rawText = aiResponse;
            } else if (typeof aiResponse?.response === "string") {
              rawText = aiResponse.response;
            } else if (typeof aiResponse?.result?.response === "string") {
              rawText = aiResponse.result.response;
            } else {
              rawText = JSON.stringify(aiResponse);
            }
            parsed = parseSeoText(rawText);
            if (!hasSeoContent(parsed)) throw new Error("Cloudflare AI returned incomplete SEO content");
            seoProvider = "cloudflare";
          } catch (_) {
            parsed = null;
          }
        }
        if (!hasSeoContent(parsed)) {
          parsed = makeDeterministicSeoFallback(`${brandContext}${textPrompt}`);
          seoProvider = "local";
        }
        const cleanData = parsed ? {
          youtube: {
            title: String(parsed?.youtube?.title || ""),
            description: String(parsed?.youtube?.description || ""),
            keywords: String(parsed?.youtube?.keywords || "")
          },
          tiktok: {
            allInOne: String(parsed?.tiktok?.allInOne || "")
          },
          facebook: {
            title: String(parsed?.facebook?.title || ""),
            descriptionAndTags: String(parsed?.facebook?.descriptionAndTags || "")
          }
        } : typeof fallbackSeo === "function" ? fallbackSeo(textPrompt) : {};
        return new Response(JSON.stringify({
          success: true,
          data: cleanData,
          provider: seoProvider,
          fallbackUsed: seoProvider !== "openai"
        }), {
          status: 200,
          headers: jsonHeaders
        });
      }
      if (!url.pathname.startsWith("/api/")) {
        return Response.redirect(frontendBaseUrl, 302);
      }
      // --- Cross-Account Protection: RISC security event receiver ---
      // Helper: decode a base64url-encoded string to a plain string
      const base64UrlDecode = /* @__PURE__ */ __name((b64url) => {
        const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
        return atob(padded);
      }, "base64UrlDecode");
      // Helper: decode a base64url string to an ArrayBuffer (for signature verification)
      const base64UrlToBuffer = /* @__PURE__ */ __name((b64url) => {
        const binary = base64UrlDecode(b64url);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
      }, "base64UrlToBuffer");
      // Helper: validate a RISC security event JWT from Google
      const validateRiscToken = /* @__PURE__ */ __name(async (token) => {
        const parts = token.split(".");
        if (parts.length !== 3) throw new Error("Invalid JWT format");
        const [headerB64, payloadB64, sigB64] = parts;
        const header = JSON.parse(base64UrlDecode(headerB64));
        const kid = header.kid;
        if (!kid) throw new Error("Missing kid in JWT header");
        // Fetch Google RISC discovery document
        const riscConfigRes = await fetch("https://accounts.google.com/.well-known/risc-configuration");
        if (!riscConfigRes.ok) throw new Error("Failed to fetch RISC configuration");
        const riscConfig = await riscConfigRes.json();
        // Fetch Google public signing keys
        const jwksRes = await fetch(riscConfig.jwks_uri);
        if (!jwksRes.ok) throw new Error("Failed to fetch JWKS");
        const jwks = await jwksRes.json();
        const jwk = jwks.keys.find((k) => k.kid === kid);
        if (!jwk) throw new Error("Public key not found for kid: " + kid);
        // Import and verify the signature
        const publicKey = await crypto.subtle.importKey(
          "jwk",
          jwk,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"]
        );
        const encoder = new TextEncoder();
        const valid = await crypto.subtle.verify(
          "RSASSA-PKCS1-v1_5",
          publicKey,
          base64UrlToBuffer(sigB64),
          encoder.encode(`${headerB64}.${payloadB64}`)
        );
        if (!valid) throw new Error("Invalid JWT signature");
        // Decode and validate payload claims
        const payload = JSON.parse(base64UrlDecode(payloadB64));
        if (payload.iss !== riscConfig.issuer) {
          throw new Error("Invalid issuer: " + payload.iss);
        }
        const allowedAudiences = (env.GOOGLE_CLIENT_ID || "")
          .split(",").map((s) => s.trim()).filter(Boolean);
        const tokenAudiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (!tokenAudiences.some((a) => allowedAudiences.includes(a))) {
          throw new Error("Invalid audience: " + tokenAudiences.join(", "));
        }
        return payload;
      }, "validateRiscToken");
      // Helper: revoke all YouTube tokens linked to a Google Account ID
      const revokeGoogleAccountTokens = /* @__PURE__ */ __name(async (googleSub) => {
        const { results } = await env.DB.prepare(
          "SELECT id, folder_id FROM accounts WHERE google_sub = ? AND platform = 'youtube'"
        ).bind(googleSub).all();
        if (!results || results.length === 0) return;
        const stmts = [];
        for (const acct of results) {
          stmts.push(
            env.DB.prepare("DELETE FROM tokens WHERE folder_id = ? AND platform = 'youtube'")
              .bind(String(acct.folder_id))
          );
          stmts.push(
            env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(acct.id)
          );
        }
        await env.DB.batch(stmts);
      }, "revokeGoogleAccountTokens");
      // Helper: dispatch a RISC event to the appropriate action
      const handleRiscEvent = /* @__PURE__ */ __name(async (eventType, eventData, googleSub) => {
        const SESSIONS_REVOKED = "https://schemas.openid.net/secevent/risc/event-type/sessions-revoked";
        const TOKENS_REVOKED = "https://schemas.openid.net/secevent/oauth/event-type/tokens-revoked";
        const TOKEN_REVOKED = "https://schemas.openid.net/secevent/oauth/event-type/token-revoked";
        const ACCOUNT_DISABLED = "https://schemas.openid.net/secevent/risc/event-type/account-disabled";
        const ACCOUNT_ENABLED = "https://schemas.openid.net/secevent/risc/event-type/account-enabled";
        const CREDENTIAL_CHANGE = "https://schemas.openid.net/secevent/risc/event-type/account-credential-change-required";
        const VERIFICATION = "https://schemas.openid.net/secevent/risc/event-type/verification";
        if (eventType === SESSIONS_REVOKED || eventType === ACCOUNT_DISABLED || eventType === TOKENS_REVOKED) {
          // Required: end user's open sessions by revoking stored Google/YouTube tokens
          await revokeGoogleAccountTokens(googleSub);
        } else if (eventType === TOKEN_REVOKED) {
          // Required: if we hold the identified refresh token, delete it
          const subject = eventData.subject || {};
          const tokenType = subject.token_type;
          const alg = subject.token_identifier_alg;
          const tokenValue = subject.token;
          if (tokenType === "refresh_token" && alg === "prefix" && tokenValue) {
            // Per RISC spec, `token` contains the first 16 characters of the refresh token
            const prefix = tokenValue + "%";
            await env.DB.batch([
              env.DB.prepare(
                "DELETE FROM tokens WHERE platform = 'youtube' AND refresh_token LIKE ?"
              ).bind(prefix),
              env.DB.prepare(
                "DELETE FROM accounts WHERE platform = 'youtube' AND refresh_token LIKE ?"
              ).bind(prefix)
            ]);
          } else {
            // Cannot match token precisely; fall back to revoking all tokens for this user
            await revokeGoogleAccountTokens(googleSub);
          }
        } else if (eventType === ACCOUNT_ENABLED) {
          // Suggested: user may re-authorize; no action required on our side
        } else if (eventType === CREDENTIAL_CHANGE) {
          // Suggested: event is logged; no further automated action required
        } else if (eventType === VERIFICATION) {
          // Test token; event is logged
          console.log("RISC verification token received");
        }
      }, "handleRiscEvent");
      if (url.pathname === "/api/security-events/google" && request.method === "POST") {
        try {
          const body = await request.text();
          let payload;
          try {
            payload = await validateRiscToken(body);
          } catch (validationErr) {
            console.error("RISC token validation failed:", validationErr.message);
            return new Response(JSON.stringify({ error: validationErr.message }), {
              status: 400,
              headers: jsonHeaders
            });
          }
          const jti = payload.jti ? String(payload.jti) : null;
          // De-duplicate: ignore events we have already processed
          if (jti) {
            const existing = await env.DB.prepare(
              "SELECT id FROM risc_events WHERE jti = ?"
            ).bind(jti).first();
            if (existing) {
              return new Response("", { status: 202 });
            }
          }
          // Extract the first event type and its data
          const events = payload.events || {};
          const eventType = Object.keys(events)[0] || null;
          const eventData = eventType ? (events[eventType] || {}) : {};
          const subject = eventData.subject || {};
          const googleSub = subject.sub ? String(subject.sub) : null;
          // Log the event for audit and de-duplication
          if (jti) {
            await env.DB.prepare(
              "INSERT OR IGNORE INTO risc_events (jti, event_type, google_sub) VALUES (?, ?, ?)"
            ).bind(jti, eventType, googleSub).run();
          }
          if (googleSub && eventType) {
            await handleRiscEvent(eventType, eventData, googleSub);
          }
          return new Response("", { status: 202 });
        } catch (riscErr) {
          console.error("RISC endpoint error:", riscErr.message);
          return new Response(JSON.stringify({ error: "Internal error" }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      return new Response(JSON.stringify({ success: false, error: "Not found" }), {
        status: 404,
        headers: jsonHeaders
      });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), {
        status: err.statusCode || 500,
        headers: jsonHeaders
      });
    } finally {
      if (publicationSlotId && !publicationSlotRetained) {
        try { await releasePublicationSlot(publicationSlotId); }
        catch (error) { console.error("Publication reservation cleanup failed", error); }
      }
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
