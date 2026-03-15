var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var worker_default = {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    const HARD_DEFAULT_SITE = "https://multipostapp.co.uk";
    const siteBaseUrl = env.BASE_URL && String(env.BASE_URL).trim() ? String(env.BASE_URL).trim() : HARD_DEFAULT_SITE;
    const frontendBaseUrl = env.FRONTEND_URL && String(env.FRONTEND_URL).trim() ? String(env.FRONTEND_URL).trim() : siteBaseUrl;
    if (url.pathname === "/" || url.pathname === "") {
      return Response.redirect(frontendBaseUrl, 302);
    }
    const requireUser = /* @__PURE__ */ __name22(
      (val) => val && typeof val === "string" && val.trim() ? val.trim() : null,
      "requireUser"
    );
    const redirectUri = `${siteBaseUrl}/api/auth/callback/youtube`;
    const fbRedirectUri = `${siteBaseUrl}/api/auth/callback/facebook`;
    const nowMs = /* @__PURE__ */ __name22(() => Date.now(), "nowMs");
    const safeJson = /* @__PURE__ */ __name22(async (res) => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    }, "safeJson");
    const encodeState = /* @__PURE__ */ __name22((obj) => {
      try {
        return btoa(JSON.stringify(obj));
      } catch {
        return String(obj?.folderId || "");
      }
    }, "encodeState");
    const decodeState = /* @__PURE__ */ __name22((stateStr) => {
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
    const upsertToken = /* @__PURE__ */ __name22(
      async ({ folderId, platform, accountId, accessToken, refreshToken, expiresAt, scope }) => {
        const safeFolderId = folderId == null ? null : String(folderId);
        const safePlatform = platform == null ? null : String(platform);
        const safeAccountId = accountId == null ? null : String(accountId);
        const safeAccessToken = accessToken == null ? null : String(accessToken);
        const safeRefreshToken = refreshToken == null ? null : String(refreshToken);
        const safeExpiresAt = expiresAt == null ? null : Number(expiresAt);
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
      },
      "upsertToken"
    );
    const requireEnv = /* @__PURE__ */ __name22((envVal, name) => {
      const v = envVal && String(envVal).trim() ? String(envVal).trim() : null;
      if (!v) throw new Error(`Missing ${name} env var`);
      return v;
    }, "requireEnv");
    const fbGraph = "https://graph.facebook.com/v18.0";
    const fbSafe = /* @__PURE__ */ __name22(async (res) => {
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(`Facebook API ${res.status}: ${JSON.stringify(data)}`);
      }
      if (data?.error) {
        throw new Error(`Facebook API error: ${JSON.stringify(data.error)}`);
      }
      return data;
    }, "fbSafe");
    const fetchFbJson = /* @__PURE__ */ __name22(async (fbUrl, init) => {
      const res = await fetch(fbUrl, init);
      return fbSafe(res);
    }, "fetchFbJson");
    const fetchPageTokens = /* @__PURE__ */ __name22(async (userAccessToken) => {
      const fbUrl = `${fbGraph}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(
        userAccessToken
      )}`;
      const out = await fetchFbJson(fbUrl);
      return Array.isArray(out?.data) ? out.data : [];
    }, "fetchPageTokens");
    const publishFacebookReelFromUrl = /* @__PURE__ */ __name22(
      async ({ pageId, pageAccessToken, videoUrl, description }) => {
        const startRes = await fetchFbJson(`${fbGraph}/${encodeURIComponent(pageId)}/video_reels`, {
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
            "Content-Type": "application/octet-stream"
          },
          body: buf
        });
        const upText = await upRes.text();
        if (!upRes.ok) {
          throw new Error(`Reels upload failed ${upRes.status}: ${upText}`);
        }
        const finishRes = await fetchFbJson(`${fbGraph}/${encodeURIComponent(pageId)}/video_reels`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            access_token: pageAccessToken,
            upload_phase: "finish",
            video_id: String(videoId),
            description: description || ""
          })
        });
        return { video_id: videoId, finish: finishRes };
      },
      "publishFacebookReelFromUrl"
    );

    const cleanText = /* @__PURE__ */ __name22((value) => {
      return String(value || "").replace(/\s+/g, " ").trim();
    }, "cleanText");

    const makeKeywords = /* @__PURE__ */ __name22((prompt) => {
      const cleaned = cleanText(prompt)
        .toLowerCase()
        .replace(/[^\w\s]/g, " ");
      const words = cleaned
        .split(/\s+/)
        .filter(Boolean)
        .filter((w) => w.length > 2);

      const unique = [...new Set(words)];
      const base = unique.slice(0, 8);

      const extras = [
        "viral meme",
        "funny clip",
        "relatable content",
        "social media humor",
        "public interaction",
        "meme plug"
      ];

      return [...new Set([...base, ...extras])].join(", ");
    }, "makeKeywords");

    const fallbackSeo = /* @__PURE__ */ __name22((prompt) => {
      const idea = cleanText(prompt) || "viral meme clip";
      const lower = idea.toLowerCase();

      let youtubeTitle = idea;
      if (!/[|:-]/.test(youtubeTitle)) {
        youtubeTitle = `${idea} | Meme Plug`;
      }

      let youtubeDescription = `Funny viral content based on: ${idea}. Perfect for meme lovers, relatable moments, and short-form social content. #MemePlug #viral #meme`;
      let tiktokCaption = `POV: ${lower} 💀 #MemePlug #viral #funnymeme #relatable`;
      let facebookTitle = idea.charAt(0).toUpperCase() + idea.slice(1);
      let facebookDescriptionAndTags = `${idea} 😂 Follow for more relatable meme content. #MemePlug #viral #meme #funny`;

      if (/pov[:\s-]/i.test(idea)) {
        tiktokCaption = `${idea} 💀 #MemePlug #viral #funnymeme #relatable`;
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
          return new Response("Missing user_id", { status: 400, headers: corsHeaders });
        }
        const { results } = await env.DB.prepare(
          "SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC"
        ).bind(userId).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }
      if (url.pathname === "/api/add-folder") {
        const { name, user_id } = await request.json();
        const userId = requireUser(user_id);
        if (!name || !userId) {
          return new Response("Missing name or user_id", { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare(
          "INSERT INTO folders (name, user_id) VALUES (?, ?)"
        ).bind(name, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
      if (url.pathname === "/api/rename-folder") {
        const { id, name, user_id } = await request.json();
        const userId = requireUser(user_id);
        if (!id || !name || !userId) {
          return new Response("Missing id, name or user_id", { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare(
          "UPDATE folders SET name = ? WHERE id = ? AND user_id = ?"
        ).bind(name, id, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
      if (url.pathname === "/api/delete-folder") {
        const { id, user_id, type } = await request.json();
        const userId = requireUser(user_id);
        if (!id || !userId) {
          return new Response("Missing id or user_id", { status: 400, headers: corsHeaders });
        }
        if (type === "account_only") {
          await env.DB.prepare(
            "DELETE FROM accounts WHERE id = ? AND user_id = ?"
          ).bind(id, userId).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
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
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
      if (url.pathname === "/api/get-accounts") {
        const folder_id = url.searchParams.get("folder_id");
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!folder_id || !userId) {
          return new Response(JSON.stringify([]), { headers: corsHeaders });
        }
        const { results } = await env.DB.prepare(
          "SELECT * FROM accounts WHERE folder_id = ? AND user_id = ?"
        ).bind(folder_id, userId).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }
      if (url.pathname === "/api/auth/youtube") {
        const legacyState = url.searchParams.get("state");
        const stateObj = decodeState(legacyState);
        const folderId = url.searchParams.get("folder_id") || stateObj.folderId;
        const userId = requireUser(url.searchParams.get("user_id") || stateObj.userId);
        const state = encodeState({ folderId, platform: "youtube", userId });
        if (!env.GOOGLE_CLIENT_ID) {
          return new Response("Missing GOOGLE_CLIENT_ID env var", { status: 500, headers: corsHeaders });
        }
        if (!env.GOOGLE_CLIENT_SECRET) {
          return new Response("Missing GOOGLE_CLIENT_SECRET env var", { status: 500, headers: corsHeaders });
        }
        const scope = "https://www.googleapis.com/auth/youtube.upload";
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
        const stateObj = decodeState(legacyState);
        const folderId = url.searchParams.get("folder_id") || stateObj.folderId;
        const userId = requireUser(url.searchParams.get("user_id") || stateObj.userId);
        const fbClientId = requireEnv(env.FB_CLIENT_ID, "FB_CLIENT_ID");
        requireEnv(env.FB_CLIENT_SECRET, "FB_CLIENT_SECRET");
        const state = encodeState({ folderId, platform: "facebook", userId });
        const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${encodeURIComponent(
          fbClientId
        )}&redirect_uri=${encodeURIComponent(
          fbRedirectUri
        )}&scope=${encodeURIComponent(
          "pages_manage_posts,pages_show_list"
        )}&response_type=code&state=${encodeURIComponent(state)}`;
        return Response.redirect(fbAuthUrl);
      }
      if (url.pathname === "/api/auth/callback/youtube") {
        const code = url.searchParams.get("code");
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;
        const userId = requireUser(stateObj.userId);
        if (!folderId || !userId) {
          return new Response("Missing state", { status: 400, headers: corsHeaders });
        }
        if (!code) {
          const err = url.searchParams.get("error") || "missing_code";
          return new Response(`YouTube OAuth failed: ${err}`, { status: 400, headers: corsHeaders });
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
        await env.DB.prepare(
          "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'youtube', ?, ?, ?, ?)"
        ).bind(
          String(folderId),
          String(userId),
          String(channelName),
          String(tokens.access_token),
          tokens.refresh_token ? String(tokens.refresh_token) : null,
          nowMs() + Number(tokens.expires_in || 0) * 1e3
        ).run();
        await upsertToken({
          folderId: String(folderId),
          platform: "youtube",
          accountId: String(channelId),
          accessToken: String(tokens.access_token),
          refreshToken: tokens.refresh_token ? String(tokens.refresh_token) : null,
          expiresAt: nowMs() + Number(tokens.expires_in || 0) * 1e3,
          scope: "https://www.googleapis.com/auth/youtube.upload"
        });
        return Response.redirect(`${frontendBaseUrl}/create-post.html`);
      }
      if (url.pathname === "/api/auth/callback/tiktok") {
        const code = url.searchParams.get("code");
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;
        const userId = requireUser(stateObj.userId);
        if (!folderId || !userId) {
          return new Response("Missing state", { status: 400, headers: corsHeaders });
        }
        if (!code) {
          const err = url.searchParams.get("error") || "missing_code";
          return new Response(`TikTok OAuth failed: ${err}`, { status: 400, headers: corsHeaders });
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
        const openId = tData.open_id || tData.openid || "Linked TikTok";
        const scope = tData.scope || "video.upload,video.publish,user.info.basic";
        await env.DB.prepare(
          "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'tiktok', 'Linked TikTok', ?, ?, ?)"
        ).bind(
          String(folderId),
          String(userId),
          String(accessToken),
          refreshToken ? String(refreshToken) : null,
          nowMs() + Number(expiresIn) * 1e3
        ).run();
        await upsertToken({
          folderId: String(folderId),
          platform: "tiktok",
          accountId: String(openId),
          accessToken: String(accessToken),
          refreshToken: refreshToken ? String(refreshToken) : null,
          expiresAt: nowMs() + Number(expiresIn) * 1e3,
          scope: String(scope)
        });
        return Response.redirect(`${frontendBaseUrl}/create-post.html`);
      }
      if (url.pathname === "/api/auth/callback/facebook") {
        const code = url.searchParams.get("code");
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;
        const userId = requireUser(stateObj.userId);
        if (!folderId || !userId) {
          return new Response("Missing state", { status: 400, headers: corsHeaders });
        }
        if (!code) {
          const err = url.searchParams.get("error") || "missing_code";
          return new Response(`Facebook OAuth failed: ${err}`, { status: 400, headers: corsHeaders });
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
            JSON.stringify({
              success: false,
              error: "Facebook token missing",
              data: tokens
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
          );
        }
        let fbAccountId = "me";
        let fbAccountName = "Facebook Account";
        try {
          const meRes = await fetch(
            `${fbGraph}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
          );
          const me = await fbSafe(meRes);
          if (me?.id) fbAccountId = String(me.id);
          if (me?.name) fbAccountName = String(me.name);
        } catch (_) {
        }
        await env.DB.prepare(
          "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'facebook', ?, ?, NULL, ?)"
        ).bind(
          String(folderId),
          String(userId),
          fbAccountName,
          accessToken,
          nowMs() + expiresIn * 1e3
        ).run();
        await upsertToken({
          folderId: String(folderId),
          platform: "facebook",
          accountId: fbAccountId,
          accessToken,
          refreshToken: null,
          expiresAt: nowMs() + expiresIn * 1e3,
          scope: "pages_manage_posts,pages_show_list"
        });
        try {
          const pages = await fetchPageTokens(accessToken);
          for (const p of pages) {
            if (!p?.id || !p?.access_token) continue;
            await upsertToken({
              folderId: String(folderId),
              platform: "facebook_page",
              accountId: String(p.id),
              accessToken: String(p.access_token),
              refreshToken: null,
              expiresAt: null,
              scope: "page_access_token"
            });
            try {
              await env.DB.prepare(
                "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'facebook_page', ?, ?, NULL, NULL)"
              ).bind(
                String(folderId),
                String(userId),
                String(p.name || `Facebook Page ${p.id}`),
                String(p.access_token)
              ).run();
            } catch (_) {
            }
          }
        } catch (_) {
        }
        return Response.redirect(`${frontendBaseUrl}/create-post.html`);
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
          return new Response(JSON.stringify(result), { headers: corsHeaders });
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
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          if (!pageAccessToken) {
            return new Response(JSON.stringify({ success: false, error: "Missing Facebook Page access token. Link Facebook first." }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          if (!video_url) {
            return new Response(JSON.stringify({ success: false, error: "Missing video_url" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          const out = await publishFacebookReelFromUrl({
            pageId,
            pageAccessToken: String(pageAccessToken),
            videoUrl: String(video_url),
            description: desc
          });
          return new Response(JSON.stringify({ success: true, data: out }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ success: false, error: "Unsupported platform" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (url.pathname === "/api/generate-seo" && request.method === "POST") {
        const { prompt } = await request.json();

        if (!prompt || !String(prompt).trim()) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing prompt" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
          );
        }

        let parsed = null;
        let aiResponse = null;
        let rawText = "";

        try {
          aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
            messages: [
              {
                role: "system",
                content: `You are a viral social media SEO expert.

Return ONLY valid JSON.
Do not use markdown.
Do not use code fences.
Do not add explanations.

Use exactly this structure:
{
  "youtube": {
    "title": "",
    "description": "",
    "keywords": ""
  },
  "tiktok": {
    "allInOne": ""
  },
  "facebook": {
    "title": "",
    "descriptionAndTags": ""
  }
}`
              },
              {
                role: "user",
                content: `Generate viral SEO content for this post idea, even if it is short, messy, vague, or misspelled: ${prompt}`
              }
            ]
          });

          if (typeof aiResponse === "string") {
            rawText = aiResponse;
          } else if (typeof aiResponse?.response === "string") {
            rawText = aiResponse.response;
          } else if (typeof aiResponse?.result?.response === "string") {
            rawText = aiResponse.result.response;
          } else {
            rawText = JSON.stringify(aiResponse);
          }

          rawText = rawText
            .trim()
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();

          const firstBrace = rawText.indexOf("{");
          const lastBrace = rawText.lastIndexOf("}");

          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            rawText = rawText.slice(firstBrace, lastBrace + 1).trim();
          }

          parsed = JSON.parse(rawText);
        } catch (_) {
          parsed = null;
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
        } : fallbackSeo(prompt);

        return new Response(JSON.stringify({
          success: true,
          data: cleanData,
          fallbackUsed: !parsed
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (!url.pathname.startsWith("/api/")) {
        return Response.redirect(frontendBaseUrl, 302);
      }
      const response = await fetch(request);
      if (response.headers.get("content-type")?.includes("text/html")) {
        const newResponse = new Response(response.body, response);
        newResponse.headers.set(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://cdnjs.cloudflare.com https://sf-security.ibytedtos.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https://www.gstatic.com https://p16-sign-va.tiktokcdn.com https://graph.facebook.com; connect-src 'self' https://multipost-seo-worker.alexbryant.workers.dev https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://open.tiktokapis.com https://www.tiktok.com https://graph.facebook.com https://www.facebook.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://libraweb-i18n.tiktok.com https://mcs-i18n.tiktok.com; frame-src 'self' https://accounts.google.com https://www.facebook.com https://www.tiktok.com; object-src 'none'; base-uri 'self';"
        );
        return newResponse;
      }
      return response;
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
