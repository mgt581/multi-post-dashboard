var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var WORKER_VERSION = "2026-04-24-youtube-two-scopes";
var worker_default = {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, folder_id, user_id, client_platform",
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
      return new Response(JSON.stringify({ ok: true, service: "multipost-worker", version: WORKER_VERSION }), {
        status: 200,
        headers: jsonHeaders
      });
    }
    if (url.pathname === "/api/generate-premium-seo" && request.method === "POST") {
      try {
        const body = await request.json();
        const apiKey = env.OPENAI_API_KEY;
        const topic = body.topic || "";
        const imageUrl = body.image_url || "";
        const folderName = body.folder_name || "";
        const ytChannel = body.youtube_channel || "";
        const fbAccount = body.facebook_account || "";
        const ttAccount = body.tiktok_account || "";
        const brandParts = [];
        if (folderName) brandParts.push(`Brand/Channel: ${folderName}`);
        if (ytChannel) brandParts.push(`YouTube: ${ytChannel}`);
        if (fbAccount) brandParts.push(`Facebook: ${fbAccount}`);
        if (ttAccount) brandParts.push(`TikTok: ${ttAccount}`);
        const brandContext = brandParts.length ? brandParts.join(". ") + ". " : "";
        const effectiveTopic = topic || "viral video";
        const seoSystemPrompt = `You are an expert social media SEO strategist with deep knowledge of YouTube, TikTok, and Facebook algorithms. Your goal is to generate high-quality, trending, platform-optimized SEO content that maximises discoverability and engagement.

Platform requirements:
- YouTube: Titles must be 50-60 characters, keyword-rich, and compelling. Descriptions must be 150-300 characters with a strong hook and relevant keywords naturally embedded. Keywords must be 15-20 specific, trending, high-volume search terms separated by commas (mix broad + niche terms). Optimize for YouTube search and suggested videos.
- TikTok: Caption must be under 150 characters with 3-5 highly relevant trending hashtags including #fyp and #foryoupage. Use conversational tone, emojis, and hooks that drive shares. Optimize for the TikTok For You Page algorithm.
- Facebook: Title must be 40-60 characters. Description must be 100-200 characters followed by 5-8 relevant hashtags. Optimize for Facebook Reels discovery and shares.

Quality rules:
- Generate SPECIFIC, NICHE content \u2014 never generic filler text
- Use currently trending keywords and hashtags for maximum reach
- Match the exact content topic/mood \u2014 be precise, not vague
- Each platform\u2019s content must be uniquely optimised, not copy-pasted
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
        let imageBase64 = "";
        let imageMimeType = "image/jpeg";
        if (imageUrl) {
          if (imageUrl.startsWith("data:")) {
            const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              imageMimeType = match[1];
              imageBase64 = match[2];
            }
          } else {
            try {
              const imgRes = await fetch(imageUrl);
              if (imgRes.ok) {
                imageMimeType = (imgRes.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
                const buf = await imgRes.arrayBuffer();
                const bytes = new Uint8Array(buf);
                const chunks = [];
                for (let i = 0; i < bytes.length; i += 8192) {
                  chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
                }
                imageBase64 = btoa(chunks.join(""));
              }
            } catch (imgErr) {
              console.error("Image fetch failed:", imgErr.message);
            }
          }
        }
        const hasImage = !!imageBase64;
        const hasText = !!topic.trim();
        const parseSeoText = /* @__PURE__ */ __name((rawText) => {
          rawText = rawText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
          const firstBrace = rawText.indexOf("{");
          const lastBrace = rawText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) rawText = rawText.slice(firstBrace, lastBrace + 1).trim();
          return JSON.parse(rawText);
        }, "parseSeoText");
        const makeLocalFallbackSeo = /* @__PURE__ */ __name((promptText) => {
          const idea = String(promptText || "viral short video").trim() || "viral short video";
          const words = idea.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean).filter((w) => w.length > 2);
          const keywordSeed = [...new Set(words)].slice(0, 10);
          const extraKeywords = ["viral", "trending", "shorts", "reels", "fyp", "social media", "marketing"];
          const keywordText = [...new Set([...keywordSeed, ...extraKeywords])].join(", ");
          const titleBase = idea.length > 56 ? `${idea.slice(0, 56)}...` : idea;
          return {
            youtube: {
              title: `${titleBase} | Must Watch`,
              description: `Discover ${idea} with optimized copy crafted for reach and engagement. Share, comment and follow for more high-performing content ideas.`,
              keywords: keywordText
            },
            tiktok: {
              allInOne: `${idea} 🚀 #fyp #foryoupage #viral #trending #socialmedia`
            },
            facebook: {
              title: `${titleBase} | Growth Tips`,
              descriptionAndTags: `Boost your reach with this ${idea} content strategy.\n\n#marketing #socialmedia #facebook #business #growth`
            }
          };
        }, "makeLocalFallbackSeo");
        let finalData = null;
        if (apiKey) {
          try {
            const oaiMessages = (
              /** @type {{ role: string, content: string | Array<{type: string, text?: string, image_url?: {url: string}}>}[]} */
              [{ role: "system", content: seoSystemPrompt }]
            );
            if (hasImage) {
              oaiMessages.push({ role: "user", content: [
                { type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
                { type: "text", text: `${brandContext}${hasText ? `Analyze this image and description to generate SEO: ${topic}` : "Analyze this image carefully and generate platform-optimized SEO content."}` }
              ] });
            } else {
              oaiMessages.push({ role: "user", content: `${brandContext}Generate platform-optimized SEO content for the following:
${effectiveTopic}

Generate trending, specific SEO \u2014 not generic content.` });
            }
            const flagshipResponse = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "gpt-4o", messages: oaiMessages, response_format: { type: "json_object" } })
            });
            const oaiData = await flagshipResponse.json();
            if (oaiData.choices?.[0]?.message?.content) {
              try {
                finalData = parseSeoText(oaiData.choices[0].message.content);
              } catch {
              }
            }
          } catch (e) {
            console.error("OpenAI failed, falling back...", e.message);
          }
        }
        if (!finalData) {
          try {
            let aiResponse;
            if (hasImage) {
              const userContent = hasText ? `${brandContext}Analyze this image and the following context to generate platform-optimized SEO content.

Context: ${topic}

Generate trending, specific SEO \u2014 not generic content.` : `${brandContext}Analyze this image carefully and generate platform-optimized SEO content based on what you see.

Generate trending, specific SEO \u2014 not generic content.`;
              aiResponse = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
                messages: [{ role: "system", content: seoSystemPrompt }, { role: "user", content: userContent }],
                images: [{ data: imageBase64, mimeType: imageMimeType }]
              });
            } else {
              aiResponse = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
                messages: [
                  { role: "system", content: seoSystemPrompt },
                  { role: "user", content: `${brandContext}Generate platform-optimized SEO content for the following:
${effectiveTopic}

Generate trending, specific SEO \u2014 not generic content.` }
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
            try {
              finalData = parseSeoText(rawText);
            } catch {
            }
          } catch (aiErr) {
            console.error("Workers AI failed, using deterministic fallback...", aiErr?.message || aiErr);
          }
        }
        if (!finalData) {
          finalData = makeLocalFallbackSeo(`${brandContext}${effectiveTopic}`);
        }
        const cleanData = finalData ? {
          youtube: {
            title: String(finalData?.youtube?.title || ""),
            description: String(finalData?.youtube?.description || ""),
            keywords: String(finalData?.youtube?.keywords || "")
          },
          tiktok: { allInOne: String(finalData?.tiktok?.allInOne || "") },
          facebook: {
            title: String(finalData?.facebook?.title || ""),
            descriptionAndTags: String(finalData?.facebook?.descriptionAndTags || "")
          }
        } : null;
        if (!cleanData) throw new Error("AI returned no content. Please try again.");
        return new Response(JSON.stringify({ success: true, data: cleanData }), {
          status: 200,
          headers: jsonHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: jsonHeaders });
      }
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
    const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;
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
    const encodeState = /* @__PURE__ */ __name((obj) => {
      try {
        return btoa(JSON.stringify(obj));
      } catch {
        return String(obj?.folderId || "");
      }
    }, "encodeState");
    const decodeState = /* @__PURE__ */ __name((stateStr) => {
      if (!stateStr) return { folderId: null, userId: null, platform: null };
      try {
        return JSON.parse(atob(stateStr));
      } catch {
        try {
          const raw = atob(stateStr);
          const [folderId] = raw.split("|");
          return { folderId: folderId || raw, userId: null, platform: null };
        } catch {
          return { folderId: stateStr, userId: null, platform: null };
        }
      }
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
      return { video_id: videoId, finish: finishRes };
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
      return out;
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
    const ownerUserIds = parseCsvSet(env.BILLING_OWNER_USER_IDS || "");
    const ownerEmails = parseCsvSet(env.BILLING_OWNER_EMAILS || "");
    const ownerAdminToken = env.OWNER_ADMIN_TOKEN ? String(env.OWNER_ADMIN_TOKEN).trim() : "";
    const stripeSecretKey = env.STRIPE_SECRET_KEY ? String(env.STRIPE_SECRET_KEY).trim() : "";
    const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET ? String(env.STRIPE_WEBHOOK_SECRET).trim() : "";
    const stripeTrialDays = Number(env.STRIPE_TRIAL_DAYS || 7) > 0 ? Number(env.STRIPE_TRIAL_DAYS || 7) : 7;
    const PLAN_LIMITS = {
      pro: {
        key: "pro",
        label: "Pro",
        account_caps: { youtube: 1, tiktok: 1, facebook_page: 1 },
        daily_total_posts: 6,
        daily_per_platform_posts: { youtube: 2, tiktok: 2, facebook: 2 }
      },
      pro_plus: {
        key: "pro_plus",
        label: "Pro Plus",
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
    const evaluateBillingAccess = /* @__PURE__ */ __name((row, platform, requestedUserId = "", requestedUserEmail = "") => {
      const userId = String(row?.user_id || "").trim();
      const userEmail = String(row?.user_email || "").trim().toLowerCase();
      const requested = String(requestedUserId || "").trim().toLowerCase();
      const requestedEmail = String(requestedUserEmail || "").trim().toLowerCase();
      const ownerByDbFlag = Number(row?.is_owner || 0) === 1;
      const ownerByConfig = ownerUserIds.has(userId.toLowerCase()) || (userEmail && ownerEmails.has(userEmail)) || (requested && (ownerUserIds.has(requested) || ownerEmails.has(requested))) || (requestedEmail && ownerEmails.has(requestedEmail));
      if (ownerByDbFlag || ownerByConfig) {
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
      if (platform === "android") {
        return {
          enabled: true,
          access: true,
          reason: "android_bypass",
          status: "not_required_android"
        };
      }
      const now = nowUnix();
      const status = String(row?.subscription_status || "").toLowerCase();
      const trialEnd = toUnix(row?.trial_end);
      const currentPeriodEnd = toUnix(row?.current_period_end);
      const isStatusActive = ["active", "trialing"].includes(status);
      const hasActiveTime = (trialEnd && trialEnd > now) || (currentPeriodEnd && currentPeriodEnd > now);
      return {
        enabled: true,
        access: !!(isStatusActive || hasActiveTime),
        reason: isStatusActive || hasActiveTime ? "ok" : "subscription_required",
        status: status || "inactive",
        owner: false,
        plan: getEffectivePlan(row)
      };
    }, "evaluateBillingAccess");
    const countDailyPosts = /* @__PURE__ */ __name(async (userId, platform) => {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const dayStart = Math.floor(start.getTime() / 1e3);
      const dayEnd = dayStart + 86400;
      try {
        const total = await env.DB.prepare(`
          SELECT COUNT(*) AS count
          FROM billing_usage_events
          WHERE user_id = ? AND event_type = 'publish' AND created_at >= ? AND created_at < ?
        `).bind(String(userId), dayStart, dayEnd).first();
        const byPlatform = await env.DB.prepare(`
          SELECT COUNT(*) AS count
          FROM billing_usage_events
          WHERE user_id = ? AND event_type = 'publish' AND platform = ? AND created_at >= ? AND created_at < ?
        `).bind(String(userId), String(platform), dayStart, dayEnd).first();
        return { total: Number(total?.count || 0), platform: Number(byPlatform?.count || 0), dayStart, dayEnd };
      } catch (_) {
        return { total: 0, platform: 0, dayStart, dayEnd };
      }
    }, "countDailyPosts");
    const recordPublishUsage = /* @__PURE__ */ __name(async (userId, platform) => {
      try {
        await env.DB.prepare(`
          INSERT INTO billing_usage_events (user_id, event_type, platform, created_at)
          VALUES (?, 'publish', ?, strftime('%s','now'))
        `).bind(String(userId), String(platform)).run();
      } catch (_) {
      }
    }, "recordPublishUsage");
    const ensurePlanQuota = /* @__PURE__ */ __name(async (userId, platform, evaluated) => {
      if (!evaluated?.enabled || evaluated?.reason === "android_bypass" || evaluated?.reason === "owner_bypass") {
        return { ok: true };
      }
      const limits = evaluated?.plan?.limits || PLAN_LIMITS.pro;
      const usage = await countDailyPosts(userId, platform);
      const platformLimit = Number(limits?.daily_per_platform_posts?.[platform] || 0);
      if (platformLimit > 0 && usage.platform >= platformLimit) {
        return { ok: false, statusCode: 429, body: { success: false, error: `Daily ${platform} posting limit reached for your plan` } };
      }
      const totalLimit = Number(limits?.daily_total_posts || 0);
      if (totalLimit > 0 && usage.total >= totalLimit) {
        return { ok: false, statusCode: 429, body: { success: false, error: "Daily posting limit reached for your plan" } };
      }
      return { ok: true };
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
      if (!evaluated?.enabled || evaluated?.reason === "android_bypass" || evaluated?.reason === "owner_bypass") return { ok: true };
      const limits = evaluated?.plan?.limits || PLAN_LIMITS.pro;
      const cap = Number(limits?.account_caps?.[platform] || 0);
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
    const ensureBillingAccess = /* @__PURE__ */ __name(async (userId, platform) => {
      if (!userId) {
        return { ok: false, statusCode: 400, body: { success: false, error: "Missing user_id" } };
      }
      const row = await getBillingRow(userId);
      const evaluated = evaluateBillingAccess(row, platform, userId);
      if (evaluated.access) {
        return { ok: true, row, evaluated };
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
        const userEmail = String(url.searchParams.get("user_email") || "").trim();
        if (!userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing user_id" }), { status: 400, headers: jsonHeaders });
        }
        const userAliases = await getUserAliases(userId, userEmail);
        const { results } = await env.DB.prepare(
          `SELECT f.*, (SELECT nickname FROM accounts WHERE folder_id = f.id AND user_id = f.user_id AND platform = 'youtube' LIMIT 1) as youtube_channel, (SELECT profile_picture FROM accounts WHERE folder_id = f.id AND user_id = f.user_id AND platform = 'youtube' LIMIT 1) as youtube_picture FROM folders f WHERE f.user_id IN (${sqlPlaceholders(userAliases)}) ORDER BY f.created_at DESC`
        ).bind(...userAliases).all();
        return new Response(JSON.stringify(results), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/add-folder") {
        const { name, user_id } = await request.json();
        const userId = requireUser(user_id);
        if (!name || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing name or user_id" }), { status: 400, headers: jsonHeaders });
        }
        await env.DB.prepare(
          "INSERT INTO folders (name, user_id) VALUES (?, ?)"
        ).bind(name, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/rename-folder") {
        const { id, name, user_id } = await request.json();
        const userId = requireUser(user_id);
        if (!id || !name || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing id, name or user_id" }), { status: 400, headers: jsonHeaders });
        }
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
        if (type === "account_only") {
          const acct = await env.DB.prepare(
            "SELECT platform, folder_id FROM accounts WHERE id = ? AND user_id = ?"
          ).bind(id, userId).first();
          if (acct && (acct.platform === "facebook" || acct.platform === "facebook_page")) {
            await env.DB.prepare(
              "DELETE FROM accounts WHERE folder_id = ? AND user_id = ? AND platform IN ('facebook', 'facebook_page')"
            ).bind(acct.folder_id, userId).run();
          } else {
            await env.DB.prepare(
              "DELETE FROM accounts WHERE id = ? AND user_id = ?"
            ).bind(id, userId).run();
          }
          return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
        }
        await env.DB.prepare(
          "DELETE FROM accounts WHERE folder_id = ? AND user_id = ?"
        ).bind(id, userId).run();
        await env.DB.prepare(
          "DELETE FROM folders WHERE id = ? AND user_id = ?"
        ).bind(id, userId).run();
        await env.DB.prepare(`
          DELETE FROM tokens
          WHERE folder_id IN (SELECT id FROM folders WHERE id = ? AND user_id = ?)
        `).bind(id, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/get-accounts") {
        const folder_id = url.searchParams.get("folder_id");
        const userId = requireUser(url.searchParams.get("user_id"));
        const userEmail = String(url.searchParams.get("user_email") || "").trim();
        if (!folder_id || !userId) {
          return new Response(JSON.stringify([]), { headers: jsonHeaders });
        }
        const userAliases = await getUserAliases(userId, userEmail);
        const { results } = await env.DB.prepare(
          `SELECT * FROM accounts WHERE folder_id = ? AND user_id IN (${sqlPlaceholders(userAliases)}) ORDER BY id DESC`
        ).bind(folder_id, ...userAliases).all();
        return new Response(JSON.stringify(results), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/billing/plans" && request.method === "GET") {
        const priceCatalog = getPriceCatalog();
        return new Response(JSON.stringify({
          success: true,
          plans: {
            pro: {
              key: "pro",
              label: "Pro",
              prices: priceCatalog.pro,
              limits: PLAN_LIMITS.pro
            },
            pro_plus: {
              key: "pro_plus",
              label: "Pro Plus",
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
            yearly_only: true
          }
        }), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/billing/status" && request.method === "GET") {
        const userId = requireUser(url.searchParams.get("user_id"));
        const userEmail = String(url.searchParams.get("user_email") || "").trim();
        if (!userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing user_id" }), { status: 400, headers: jsonHeaders });
        }
        const platform = getClientPlatform(request, null, url.searchParams.get("client_platform"));
        const row = await getBillingRow(userId);
        const evaluated = evaluateBillingAccess(row, platform, userId, userEmail);
        const effPlan = getEffectivePlan(row);
        const usageYt = await countDailyPosts(userId, "youtube");
        const usageTt = await countDailyPosts(userId, "tiktok");
        const usageFb = await countDailyPosts(userId, "facebook");
        const dailyTotal = usageYt.total;
        return new Response(JSON.stringify({
          success: true,
          billing: {
            enabled: evaluated.enabled,
            access: evaluated.access,
            status: evaluated.status,
            reason: evaluated.reason,
            platform,
            owner_mode: evaluated.reason === "owner_bypass",
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
              trial_end: toUnix(row?.trial_end),
              trial_used: Number(row?.trial_used || 0) === 1,
              is_owner: Number(row?.is_owner || 0) === 1
            }
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
        const userEmail = body?.user_email ? String(body.user_email).trim() : null;
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
        const requestedPlan = String(body?.plan_key || "pro").trim().toLowerCase();
        const requestedInterval = String(body?.billing_interval || "monthly").trim().toLowerCase();
        if (!PLAN_LIMITS[requestedPlan]) {
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
        const successUrl = body?.success_url && String(body.success_url).trim() ? String(body.success_url).trim() : `${frontendBaseUrl}/settings.html?billing=success`;
        const cancelUrl = body?.cancel_url && String(body.cancel_url).trim() ? String(body.cancel_url).trim() : `${frontendBaseUrl}/settings.html?billing=cancelled`;
        await ensureBillingRow(userId, userEmail);
        const existing = await getBillingRow(userId);
        let stripeCustomerId = await ensureStripeCustomerForUser(userId, userEmail, existing?.stripe_customer_id || null);
        const trialEligible = Number(existing?.trial_used || 0) !== 1;
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
        if (requestedInterval === "yearly" && trialEligible && stripeTrialDays > 0) {
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
      if (url.pathname === "/api/billing/create-portal-session" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const userId = requireUser(body?.user_id);
        const userEmail = body?.user_email ? String(body.user_email).trim() : null;
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
          if (eventType === "checkout.session.completed") {
            const obj = event?.data?.object || {};
            const userId = obj?.client_reference_id || obj?.metadata?.user_id || null;
            await persistBillingFromSubscription({
              userId,
              stripeCustomerId: obj?.customer || null,
              stripeSubscriptionId: obj?.subscription || null,
              planKey: obj?.metadata?.plan_key || null,
              billingInterval: obj?.metadata?.billing_interval || null,
              status: "active"
            });
          } else if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
            const sub = event?.data?.object || {};
            const userId = sub?.metadata?.user_id || null;
            const firstItem = sub?.items?.data?.[0] || null;
            await persistBillingFromSubscription({
              userId,
              stripeCustomerId: sub?.customer || null,
              stripeSubscriptionId: sub?.id || null,
              stripePriceId: firstItem?.price?.id || null,
              planKey: sub?.metadata?.plan_key || null,
              billingInterval: sub?.metadata?.billing_interval || firstItem?.price?.recurring?.interval || null,
              status: sub?.status || null,
              currentPeriodEnd: sub?.current_period_end || null,
              trialEnd: sub?.trial_end || null
            });
          } else if (eventType === "invoice.payment_failed") {
            const invoice = event?.data?.object || {};
            await persistBillingFromSubscription({
              userId: null,
              stripeCustomerId: invoice?.customer || null,
              status: "past_due"
            });
          }
          return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, error: err?.message || "Webhook handling failed" }), { status: 400, headers: jsonHeaders });
        }
      }
      if (url.pathname === "/api/auth/youtube") {
        const legacyState = url.searchParams.get("state");
        const stateObj = decodeState(legacyState);
        const folderId = url.searchParams.get("folder_id") || stateObj.folderId;
        const userId = requireUser(url.searchParams.get("user_id") || stateObj.userId);
        if (!folderId || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), { status: 400, headers: jsonHeaders });
        }
        const billingSnapshot = await ensureBillingAccess(userId, getClientPlatform(request, null, url.searchParams.get("client_platform")));
        if (billingSnapshot.ok) {
          const linkGate = await ensureLinkingQuota({ userId, platform: "youtube", folderId, evaluated: billingSnapshot.evaluated });
          if (!linkGate.ok) {
            return new Response(JSON.stringify(linkGate.body), { status: linkGate.statusCode, headers: jsonHeaders });
          }
        }
        const state = encodeState({ folderId, platform: "youtube", userId });
        if (!env.GOOGLE_CLIENT_ID) {
          return new Response(JSON.stringify({ success: false, error: "Missing GOOGLE_CLIENT_ID env var" }), { status: 500, headers: jsonHeaders });
        }
        if (!env.GOOGLE_CLIENT_SECRET) {
          return new Response(JSON.stringify({ success: false, error: "Missing GOOGLE_CLIENT_SECRET env var" }), { status: 500, headers: jsonHeaders });
        }
        const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(YOUTUBE_OAUTH_SCOPE)}&access_type=offline&include_granted_scopes=false&prompt=${encodeURIComponent("consent select_account")}&state=${encodeURIComponent(state)}`;
        return Response.redirect(googleAuthUrl);
      }
      if (url.pathname === "/api/auth/login/tiktok") {
        const clientKey = requireEnv(env.TIKTOK_CLIENT_KEY, "TIKTOK_CLIENT_KEY");
        requireEnv(env.TIKTOK_CLIENT_SECRET, "TIKTOK_CLIENT_SECRET");
        const loginState = randomState();
        const scopes = "user.info.basic";
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
      if (url.pathname === "/api/auth/login/facebook") {
        const fbClientId = requireEnv(env.FB_CLIENT_ID, "FB_CLIENT_ID");
        requireEnv(env.FB_CLIENT_SECRET, "FB_CLIENT_SECRET");
        const loginState = randomState();
        const params = new URLSearchParams({
          client_id: fbClientId,
          redirect_uri: fbRedirectUri,
          scope: "public_profile,email",
          response_type: "code",
          state: loginState,
          auth_type: "rerequest",
          return_scopes: "true"
        });
        return new Response(null, {
          status: 302,
          headers: {
            Location: `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`,
            "Set-Cookie": authCookie("mp_facebook_login_state", loginState, 600)
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
      if (url.pathname === "/api/auth/tiktok") {
        const folderId = url.searchParams.get("folder_id");
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!folderId || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), { status: 400, headers: jsonHeaders });
        }
        const billingSnapshot = await ensureBillingAccess(userId, getClientPlatform(request, null, url.searchParams.get("client_platform")));
        if (billingSnapshot.ok) {
          const linkGate = await ensureLinkingQuota({ userId, platform: "tiktok", folderId, evaluated: billingSnapshot.evaluated });
          if (!linkGate.ok) {
            return new Response(JSON.stringify(linkGate.body), { status: linkGate.statusCode, headers: jsonHeaders });
          }
        }
        const tiktokRedirectUri = `${siteBaseUrl}/api/auth/callback/tiktok`;
        const scopes = "video.upload,video.publish,user.info.basic";
        const state = encodeState({ folderId, platform: "tiktok", userId });
        const tiktokAuthUrl = `${tiktokAuthBaseUrl}/v2/auth/authorize/?client_key=${env.TIKTOK_CLIENT_KEY}&scope=${encodeURIComponent(scopes)}&response_type=code&redirect_uri=${encodeURIComponent(tiktokRedirectUri)}&state=${encodeURIComponent(state)}&disable_auto_auth=1`;
        return Response.redirect(tiktokAuthUrl);
      }
      if (url.pathname === "/api/auth/facebook") {
        const legacyState = url.searchParams.get("state");
        const stateObj = decodeState(legacyState) || {};
        const folderId = url.searchParams.get("folder_id") || stateObj.folderId || "";
        const userId = requireUser(url.searchParams.get("user_id") || stateObj.userId || "");
        const fbClientId = requireEnv(env.FB_CLIENT_ID, "FB_CLIENT_ID");
        requireEnv(env.FB_CLIENT_SECRET, "FB_CLIENT_SECRET");
        const state = encodeState({ folderId, platform: "facebook", userId });
        const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${encodeURIComponent(
          fbClientId
        )}&redirect_uri=${encodeURIComponent(
          fbRedirectUri
        )}&scope=${encodeURIComponent(
          "pages_show_list,pages_manage_posts"
        )}&response_type=code&state=${encodeURIComponent(state)}`;
        return Response.redirect(fbAuthUrl);
      }
      if (url.pathname === "/api/auth/callback/youtube") {
        const code = url.searchParams.get("code");
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;
        const userId = requireUser(stateObj.userId);
        if (!folderId || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing state" }), { status: 400, headers: jsonHeaders });
        }
        if (!code) {
          const err = url.searchParams.get("error") || "missing_code";
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
            `${frontendBaseUrl}/create-post.html?youtube_error=${encodeURIComponent(oauthErr)}&folder_id=${encodeURIComponent(folderId)}`
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
          `${frontendBaseUrl}/create-post.html?youtube_connected=1&account_name=${encodeURIComponent(channelName)}&folder_id=${encodeURIComponent(folderId)}`
        );
      }
      if (url.pathname === "/api/auth/callback/tiktok") {
        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state") || "";
        const cookies = parseCookies(request.headers.get("Cookie"));
        if (cookies.mp_tiktok_login_state) {
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
                client_key: requireEnv(env.TIKTOK_CLIENT_KEY, "TIKTOK_CLIENT_KEY"),
                client_secret: requireEnv(env.TIKTOK_CLIENT_SECRET, "TIKTOK_CLIENT_SECRET"),
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
        const stateObj = decodeState(rawState);
        const folderId = stateObj.folderId;
        const userId = requireUser(stateObj.userId);
        if (!folderId || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing state" }), { status: 400, headers: jsonHeaders });
        }
        if (!code) {
          const err = url.searchParams.get("error") || "missing_code";
          return new Response(JSON.stringify({ success: false, error: `TikTok OAuth failed: ${err}` }), { status: 400, headers: jsonHeaders });
        }
        const tokenRes = await fetch(`${tiktokApiBaseUrl}/v2/oauth/token/`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: env.TIKTOK_CLIENT_KEY,
            client_secret: env.TIKTOK_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: `${siteBaseUrl}/api/auth/callback/tiktok`
          })
        });
        const tokenJson = await safeJson(tokenRes);
        const tData = tokenJson.data || tokenJson;
        if (tokenJson.error || tData.error) {
          throw new Error(tokenJson.error_description || tData.error_description || "TikTok Exchange Failed");
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
        await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'tiktok'"
          ).bind(String(folderId), String(userId)),
          env.DB.prepare(
            "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at, profile_picture) VALUES (?, ?, 'tiktok', ?, ?, ?, ?, ?)"
          ).bind(
            String(folderId),
            String(userId),
            String(tiktokNickname),
            String(accessToken),
            refreshToken ? String(refreshToken) : null,
            nowMs() + Number(expiresIn) * 1e3,
            tiktokAvatar
          )
        ]);
        await upsertToken({
          folderId: String(folderId),
          platform: "tiktok",
          accountId: String(openId),
          accessToken: String(accessToken),
          refreshToken: refreshToken ? String(refreshToken) : null,
          expiresAt: nowMs() + Number(expiresIn) * 1e3,
          scope: String(scope)
        });
        return Response.redirect(
          `${frontendBaseUrl}/create-post.html?tiktok_connected=1&account_name=${encodeURIComponent(tiktokNickname)}&folder_id=${encodeURIComponent(folderId)}`
        );
      }
      if (url.pathname === "/api/auth/callback/facebook") {
        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state") || "";
        const cookies = parseCookies(request.headers.get("Cookie"));
        if (cookies.mp_facebook_login_state) {
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
            const tokenParams = new URLSearchParams({
              client_id: fbClientId,
              redirect_uri: fbRedirectUri,
              client_secret: fbClientSecret,
              code
            });
            const tokens = await fbSafe(await fetch(`${fbGraph}/oauth/access_token?${tokenParams.toString()}`));
            const accessToken = tokens?.access_token ? String(tokens.access_token) : "";
            if (!accessToken) {
              throw new Error("Facebook token exchange did not return an access token.");
            }
            const meProof = await appsecretProof(accessToken);
            const me = await fetchFbJson(
              `${fbGraph}/me?fields=id,name,email,picture&access_token=${encodeURIComponent(accessToken)}${meProof ? `&appsecret_proof=${encodeURIComponent(meProof)}` : ""}`
            );
            const fbUserId = String(me?.id || "");
            if (!fbUserId) {
              throw new Error("Facebook profile did not include a stable user id.");
            }
            const displayName = String(me?.name || "Facebook User");
            const email = me?.email ? String(me.email) : "";
            const picture = me?.picture?.data?.url ? String(me.picture.data.url) : `https://graph.facebook.com/${encodeURIComponent(fbUserId)}/picture?type=square`;
            const customToken = await createFirebaseCustomToken({
              uid: `facebook:${fbUserId}`,
              claims: {
                provider: "facebook",
                facebook_user_id: fbUserId,
                name: displayName,
                email,
                picture
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
        const stateObj = decodeState(rawState);
        const folderId = stateObj.folderId;
        const userId = requireUser(stateObj.userId);
        if (!folderId || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing state" }), { status: 400, headers: jsonHeaders });
        }
        if (!code) {
          const err = url.searchParams.get("error") || "missing_code";
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
          scope: "pages_manage_posts,pages_show_list"
        });
        return Response.redirect(
          `${frontendBaseUrl}/folder.html?id=${encodeURIComponent(folderId)}&facebook=pages`
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
          const fbUrl = `${fbGraph}/me/accounts?fields=id,name,access_token,picture&access_token=${encodeURIComponent(userToken)}${pagesProof ? `&appsecret_proof=${encodeURIComponent(pagesProof)}` : ""}`;
          const out = await fetchFbJson(fbUrl);
          const pages = Array.isArray(out?.data) ? out.data.map((p) => ({
            id: String(p.id || ""),
            name: String(p.name || ""),
            access_token: String(p.access_token || ""),
            picture: p.picture?.data?.url || `https://graph.facebook.com/${p.id}/picture?type=square`
          })) : [];
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
        const billingSnapshot = await ensureBillingAccess(userId, getClientPlatform(request, body?.client_platform, null));
        if (billingSnapshot.ok) {
          const linkGate = await ensureLinkingQuota({ userId, platform: "facebook_page", folderId: folder_id, evaluated: billingSnapshot.evaluated });
          if (!linkGate.ok) {
            return new Response(JSON.stringify(linkGate.body), { status: linkGate.statusCode, headers: jsonHeaders });
          }
        }
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
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request));
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
          await recordPublishUsage(user_id, "youtube");
          return new Response(JSON.stringify({ success: true, uploadUrl }), { headers: jsonHeaders });
        } catch (err) {
          console.error("YouTube init-upload error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Init failed" }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/tiktok/init-upload" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request));
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
        const token = await env.DB.prepare(`
          SELECT * FROM tokens
          WHERE folder_id = ? AND platform = 'tiktok'
          ORDER BY updated_at DESC LIMIT 1
        `).bind(folder_id).first();
        if (!token?.access_token) {
          return new Response(JSON.stringify({ success: false, error: "No TikTok token found. Link account first." }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        try {
          const CHUNK_SIZE = 10 * 1024 * 1024;
          const chunkSize = videoSize <= CHUNK_SIZE ? videoSize : CHUNK_SIZE;
          const totalChunks = Math.max(1, Math.floor(videoSize / chunkSize));
          const buildInitBody = /* @__PURE__ */ __name((privacy) => JSON.stringify({
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
          console.log("tiktok_chunks", { videoSize, chunkSize, totalChunks, remainder: videoSize % chunkSize });
          let initRes = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/video/init/`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8" },
            body: buildInitBody(privacyStatus)
          });
          let initData = await safeJson(initRes);
          let privacyDowngraded = false;
          if (initData?.error?.code === "unaudited_client_can_only_post_to_private_accounts") {
            privacyDowngraded = privacyStatus !== "SELF_ONLY";
            privacyStatus = "SELF_ONLY";
            const retryRes = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/video/init/`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8" },
              body: buildInitBody("SELF_ONLY")
            });
            initData = await safeJson(retryRes);
            if (!retryRes.ok || (initData?.error?.code && initData.error.code !== "ok")) {
              throw new Error(`TikTok init failed: ${JSON.stringify(initData?.error || initData)}`);
            }
          } else if (!initRes.ok || (initData?.error?.code && initData.error.code !== "ok")) {
            throw new Error(`TikTok init failed: ${JSON.stringify(initData?.error || initData)}`);
          }
          const publishId = initData?.data?.publish_id;
          const uploadUrl = initData?.data?.upload_url;
          if (!publishId || !uploadUrl) {
            throw new Error(`TikTok init missing publish_id or upload_url: ${JSON.stringify(initData)}`);
          }
          const sessionId = crypto.randomUUID();
          const expiresAt = Math.floor(Date.now() / 1e3) + SESSION_EXPIRY_SECONDS;
          await env.DB.prepare(
            "INSERT INTO upload_sessions (id, platform, upload_url, access_token, video_id, file_size, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(sessionId, "tiktok", uploadUrl, token.access_token, publishId, videoSize, expiresAt).run();
          await recordPublishUsage(user_id, "tiktok");
          return new Response(JSON.stringify({
            success: true,
            sessionId,
            publishId,
            chunkSize,
            totalChunks,
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
          "SELECT * FROM upload_sessions WHERE id = ? AND platform = 'tiktok' LIMIT 1"
        ).bind(sessionId).first();
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
          return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
        } catch (err) {
          console.error("TikTok upload-chunk error:", err);
          return new Response(JSON.stringify({ success: false, error: err.message || "Chunk upload failed" }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/facebook/init-upload" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request));
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
        if (fileSize > MAX_VIDEO_SIZE_BYTES) {
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
          const sessionId = crypto.randomUUID();
          const expiresAt = Math.floor(Date.now() / 1e3) + SESSION_EXPIRY_SECONDS;
          await env.DB.prepare(
            "INSERT INTO upload_sessions (id, platform, upload_url, access_token, video_id, page_id, title, description, file_size, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(sessionId, "facebook", uploadUrl, pageAccessToken, videoId, pageId, title, description, fileSize, expiresAt).run();
          await recordPublishUsage(user_id, "facebook");
          return new Response(JSON.stringify({ success: true, sessionId, videoId }), { headers: jsonHeaders });
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
          "SELECT * FROM upload_sessions WHERE id = ? AND platform = 'facebook' LIMIT 1"
        ).bind(sessionId).first();
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
          const upRes = await fetch(session.upload_url, {
            method: "POST",
            headers: {
              Authorization: `OAuth ${session.access_token}`,
              "Content-Type": "application/octet-stream",
              offset: String(offset),
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
          "SELECT * FROM upload_sessions WHERE id = ? AND platform = 'facebook' LIMIT 1"
        ).bind(sessionId).first();
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
          await env.DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(sessionId).run();
          return new Response(JSON.stringify({
            success: true,
            videoId,
            facebookUrl: finishRes?.post_id ? `https://www.facebook.com/${finishRes.post_id}` : `https://www.facebook.com/video/${videoId}`,
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
      if (url.pathname === "/api/facebook/upload-image" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request));
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
          const postId = String(out?.post_id || "").trim();
          const photoId = String(out?.id || "").trim();
          await recordPublishUsage(user_id, "facebook");
          return new Response(JSON.stringify({
            success: true,
            postId,
            photoId,
            facebookUrl: postId ? `https://www.facebook.com/${postId}` : photoId ? `https://www.facebook.com/photo/?fbid=${photoId}` : ""
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
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request));
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
        const billingGate = await ensureBillingAccess(user_id, getClientPlatform(request));
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
          await recordPublishUsage(user_id, "facebook");
          return new Response(JSON.stringify({
            success: true,
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
        const billingUserId = requireUser(user_id) || requireUser(account?.user_id);
        const billingGate = await ensureBillingAccess(billingUserId, getClientPlatform(request, client_platform));
        if (!billingGate.ok) {
          return new Response(JSON.stringify(billingGate.body), { status: billingGate.statusCode, headers: jsonHeaders });
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
          await recordPublishUsage(billingUserId, "tiktok");
          return new Response(JSON.stringify(result), { headers: jsonHeaders });
        }
        if (platform === "facebook") {
          const desc = String(description || title || "").trim();
          const providedMediaUrl = String(image_url || video_url || "").trim();
          const postAsImage = String(media_type || "").toLowerCase() === "image" || !!image_url || looksLikeImageUrl(providedMediaUrl);
          let pageId = page_id ? String(page_id) : null;
          let pageAccessToken = null;
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
            return new Response(JSON.stringify({ success: true, data: out, postType: "image" }), {
              headers: jsonHeaders
            });
          }
          const out = await publishFacebookReelFromUrl({
            pageId,
            pageAccessToken: String(pageAccessToken),
            videoUrl: providedMediaUrl,
            description: desc
          });
          await recordPublishUsage(billingUserId, "facebook");
          return new Response(JSON.stringify({ success: true, data: out, postType: "video" }), {
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
            const oaiData = await oaiResponse.json();
            if (oaiData.choices?.[0]?.message?.content) {
              try {
                parsed = parseSeoText(oaiData.choices[0].message.content);
              } catch {
              }
            }
          } catch (e) {
            console.error("OpenAI failed, falling back to Cloudflare AI...", e.message);
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
            try {
              parsed = parseSeoText(rawText);
            } catch {
            }
          } catch (_) {
            parsed = null;
          }
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
          fallbackUsed: !parsed
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
        status: 500,
        headers: jsonHeaders
      });
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
