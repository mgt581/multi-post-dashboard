var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var WORKER_VERSION = "2026-03-23c";
var worker_default = {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, folder_id, user_id",
      "X-Worker-Version": WORKER_VERSION
    };
    const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    const siteBaseUrl = env.BASE_URL || "https://multipostapp.co.uk";
    const frontendBaseUrl = env.FRONTEND_URL || siteBaseUrl;
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
    const redirectUri = `${siteBaseUrl}/api/auth/callback/youtube`;
    const fbRedirectUri = `${siteBaseUrl}/api/auth/callback/facebook`;
    const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;
    const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1e3;
    const DEFAULT_TOKEN_EXPIRY_SECONDS = 3600;
    const SESSION_EXPIRY_SECONDS = 3600;
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
    try {
      if (url.pathname === "/api/get-folders") {
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing user_id" }), { status: 400, headers: jsonHeaders });
        }
        const { results } = await env.DB.prepare(
          "SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC"
        ).bind(userId).all();
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
        if (!folder_id || !userId) {
          return new Response(JSON.stringify([]), { headers: jsonHeaders });
        }
        const { results } = await env.DB.prepare(
          "SELECT * FROM accounts WHERE folder_id = ? AND user_id = ? ORDER BY id DESC"
        ).bind(folder_id, userId).all();
        return new Response(JSON.stringify(results), { headers: jsonHeaders });
      }
      if (url.pathname === "/api/auth/youtube") {
        const legacyState = url.searchParams.get("state");
        const stateObj = decodeState(legacyState);
        const folderId = url.searchParams.get("folder_id") || stateObj.folderId;
        const userId = requireUser(url.searchParams.get("user_id") || stateObj.userId);
        const state = encodeState({ folderId, platform: "youtube", userId });
        if (!env.GOOGLE_CLIENT_ID) {
          return new Response(JSON.stringify({ success: false, error: "Missing GOOGLE_CLIENT_ID env var" }), { status: 500, headers: jsonHeaders });
        }
        if (!env.GOOGLE_CLIENT_SECRET) {
          return new Response(JSON.stringify({ success: false, error: "Missing GOOGLE_CLIENT_SECRET env var" }), { status: 500, headers: jsonHeaders });
        }
        const scope = "https://www.googleapis.com/auth/youtube.upload openid";
        const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&include_granted_scopes=true&prompt=${encodeURIComponent("consent select_account")}&state=${encodeURIComponent(state)}`;
        return Response.redirect(googleAuthUrl);
      }
      if (url.pathname === "/api/auth/tiktok") {
        const folderId = url.searchParams.get("folder_id");
        const userId = requireUser(url.searchParams.get("user_id"));
        const tiktokRedirectUri = `${siteBaseUrl}/api/auth/callback/tiktok`;
        const scopes = "video.upload,video.publish,user.info.basic";
        const state = encodeState({ folderId, platform: "tiktok", userId });
        const tiktokAuthUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${env.TIKTOK_CLIENT_KEY}&scope=${encodeURIComponent(scopes)}&response_type=code&redirect_uri=${encodeURIComponent(tiktokRedirectUri)}&state=${encodeURIComponent(state)}`;
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
          "public_profile,pages_show_list,pages_read_engagement,pages_manage_posts"
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
        const userRes = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        const userData = await safeJson(userRes);
        const channelName = userData.items?.[0]?.snippet?.title || "Linked YouTube";
        const channelId = userData.items?.[0]?.id || channelName;
        const channelThumbnail = userData.items?.[0]?.snippet?.thumbnails?.default?.url || null;
        // Fetch Google Account ID (sub) to support Cross-Account Protection (RISC)
        let googleSub = null;
        try {
          const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
          });
          if (userinfoRes.ok) {
            const userinfo = await userinfoRes.json();
            googleSub = userinfo.sub || null;
          }
        } catch (_) {}
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
            googleSub,
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
          scope: "https://www.googleapis.com/auth/youtube.upload"
        });
        return Response.redirect(
          `${frontendBaseUrl}/create-post.html?youtube_connected=1&account_name=${encodeURIComponent(channelName)}&folder_id=${encodeURIComponent(folderId)}`
        );
      }
      if (url.pathname === "/api/auth/callback/tiktok") {
        const code = url.searchParams.get("code");
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;
        const userId = requireUser(stateObj.userId);
        if (!folderId || !userId) {
          return new Response(JSON.stringify({ success: false, error: "Missing state" }), { status: 400, headers: jsonHeaders });
        }
        if (!code) {
          const err = url.searchParams.get("error") || "missing_code";
          return new Response(JSON.stringify({ success: false, error: `TikTok OAuth failed: ${err}` }), { status: 400, headers: jsonHeaders });
        }
        const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
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
            "https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url",
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
        const stateObj = decodeState(url.searchParams.get("state"));
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
        const token = await env.DB.prepare(`
          SELECT * FROM tokens
          WHERE folder_id = ? AND platform = 'youtube'
          ORDER BY updated_at DESC LIMIT 1
        `).bind(folder_id).first();
        if (!token?.access_token) {
          return new Response(JSON.stringify({ success: false, error: "No YouTube token found. Link account first." }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const refreshYTToken = /* @__PURE__ */ __name(async (currentToken) => {
          if (!currentToken.refresh_token) return null;
          try {
            const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_CLIENT_SECRET,
                refresh_token: currentToken.refresh_token,
                grant_type: "refresh_token"
              })
            });
            const refreshed = await safeJson(refreshRes);
            if (refreshed?.access_token) {
              await upsertToken({
                folderId: folder_id,
                platform: "youtube",
                accountId: currentToken.account_id,
                accessToken: refreshed.access_token,
                refreshToken: refreshed.refresh_token || currentToken.refresh_token,
                expiresAt: nowMs() + Number(refreshed.expires_in || DEFAULT_TOKEN_EXPIRY_SECONDS) * 1e3,
                scope: currentToken.scope || "https://www.googleapis.com/auth/youtube.upload"
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
        if (token.refresh_token && (!token.expires_at || Number(token.expires_at) - nowMs() < TOKEN_REFRESH_WINDOW_MS)) {
          const refreshed = await refreshYTToken(token);
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
              "X-Upload-Content-Type": fileType,
              "X-Upload-Content-Length": String(fileSize)
            },
            body: initBody
          });
          if (initRes.status === 401 && token.refresh_token) {
            const retried = await refreshYTToken(token);
            if (retried) {
              accessToken = retried;
              initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                  "X-Upload-Content-Type": fileType,
                  "X-Upload-Content-Length": String(fileSize)
                },
                body: initBody
              });
            }
          }
          if (!initRes.ok) {
            const errData = await safeJson(initRes);
            throw new Error(`YouTube init failed: ${initRes.status} ${JSON.stringify(errData)}`);
          }
          const uploadUrl = initRes.headers.get("Location");
          if (!uploadUrl) {
            throw new Error("No upload location returned by YouTube");
          }
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
          let initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
            method: "POST",
            headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8" },
            body: buildInitBody(privacyStatus)
          });
          let initData = await safeJson(initRes);
          let privacyDowngraded = false;
          if (initData?.error?.code === "unaudited_client_can_only_post_to_private_accounts") {
            privacyDowngraded = privacyStatus !== "SELF_ONLY";
            privacyStatus = "SELF_ONLY";
            const retryRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
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
      if (url.pathname === "/api/youtube/upload" && request.method === "POST") {
        const folder_id = request.headers.get("folder_id") || "";
        const user_id = request.headers.get("user_id") || "";
        if (!folder_id || !user_id) {
          return new Response(JSON.stringify({ success: false, error: "Missing folder_id or user_id" }), {
            status: 400,
            headers: jsonHeaders
          });
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
        const token = await env.DB.prepare(`
          SELECT * FROM tokens 
          WHERE folder_id = ? AND platform = 'youtube' 
          ORDER BY updated_at DESC LIMIT 1
        `).bind(folder_id).first();
        if (!token?.access_token) {
          return new Response(JSON.stringify({ success: false, error: "No YouTube token found. Link account first." }), {
            status: 400,
            headers: jsonHeaders
          });
        }
        const refreshYouTubeToken = /* @__PURE__ */ __name(async (currentToken) => {
          if (!currentToken.refresh_token) return null;
          try {
            const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_CLIENT_SECRET,
                refresh_token: currentToken.refresh_token,
                grant_type: "refresh_token"
              })
            });
            const refreshed = await safeJson(refreshRes);
            if (refreshed?.access_token) {
              await upsertToken({
                folderId: folder_id,
                platform: "youtube",
                accountId: currentToken.account_id,
                accessToken: refreshed.access_token,
                refreshToken: refreshed.refresh_token || currentToken.refresh_token,
                expiresAt: nowMs() + Number(refreshed.expires_in || DEFAULT_TOKEN_EXPIRY_SECONDS) * 1e3,
                scope: currentToken.scope || "https://www.googleapis.com/auth/youtube.upload"
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
        if (token.refresh_token && (!token.expires_at || Number(token.expires_at) - nowMs() < TOKEN_REFRESH_WINDOW_MS)) {
          const refreshed = await refreshYouTubeToken(token);
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
              "X-Upload-Content-Type": videoFile.type || "video/mp4"
            },
            body: buildInitBody()
          });
          if (initRes.status === 401 && token.refresh_token) {
            const retried = await refreshYouTubeToken(token);
            if (retried) {
              accessToken = retried;
              initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                  "X-Upload-Content-Type": videoFile.type || "video/mp4"
                },
                body: buildInitBody()
              });
            }
          }
          if (!initRes.ok) {
            const errData = await safeJson(initRes);
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
          return new Response(JSON.stringify({
            success: false,
            error: err.message || "Facebook upload failed"
          }), {
            status: 500,
            headers: jsonHeaders
          });
        }
      }
      if (url.pathname === "/api/post-video" && request.method === "POST") {
        const { account_id, video_url, title, platform, description, page_id, folder_id } = await request.json();
        const account = account_id ? await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(account_id).first() : null;
        const bearer = account?.access_token;
        if (platform === "tiktok") {
          const tiktokRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
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
          if (!video_url) {
            return new Response(JSON.stringify({ success: false, error: "Missing video_url" }), {
              status: 400,
              headers: jsonHeaders
            });
          }
          const out = await publishFacebookReelFromUrl({
            pageId,
            pageAccessToken: String(pageAccessToken),
            videoUrl: String(video_url),
            description: desc
          });
          return new Response(JSON.stringify({ success: true, data: out }), {
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
