var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var worker_default = {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    const baseUrl = `https://${url.hostname}`;
    const HARD_DEFAULT_SITE = "https://multipostapp.co.uk";
    const siteBaseUrl = env.BASE_URL && String(env.BASE_URL).trim() ? String(env.BASE_URL).trim() : HARD_DEFAULT_SITE;
    const frontendBaseUrl = env.FRONTEND_URL && String(env.FRONTEND_URL).trim() ? String(env.FRONTEND_URL).trim() : siteBaseUrl;
    if (url.pathname === "/" || url.pathname === "") {
      return Response.redirect(frontendBaseUrl, 302);
    }
    const requireUser = /* @__PURE__ */ __name2(
      (val) => val && typeof val === "string" ? val : null,
      "requireUser"
    );
    const redirectUri = `${siteBaseUrl}/api/auth/callback/youtube`;
    const fbRedirectUri = `${siteBaseUrl}/api/auth/callback/facebook`;
    const nowMs = /* @__PURE__ */ __name2(() => Date.now(), "nowMs");
    const safeJson = /* @__PURE__ */ __name2(async (res) => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    }, "safeJson");
    const encodeState = /* @__PURE__ */ __name2((obj) => {
      try {
        return btoa(JSON.stringify(obj));
      } catch {
        return String(obj?.folderId || "");
      }
    }, "encodeState");
    const decodeState = /* @__PURE__ */ __name2((stateStr) => {
      if (!stateStr) return { folderId: null, platform: null };
      try {
        return JSON.parse(atob(stateStr));
      } catch {
        try {
          const raw = atob(stateStr);
          const [folderId] = raw.split("|");
          return { folderId: folderId || raw, platform: null };
        } catch {
          return { folderId: stateStr, platform: null };
        }
      }
    }, "decodeState");
    const upsertToken = /* @__PURE__ */ __name2(
      async ({ folderId, platform, accountId, accessToken, refreshToken, expiresAt, scope }) => {
        if (!folderId || !platform || !accountId || !accessToken) return;
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
          folderId,
          platform,
          accountId,
          accessToken,
          refreshToken ?? null,
          expiresAt ?? null,
          scope ?? null
        ).run();
      },
      "upsertToken"
    );
    const fetchYouTubeIdentity = /* @__PURE__ */ __name2(
      async (accessToken) => {
        if (!accessToken) {
          throw new Error("Missing access_token for YouTube identity fetch");
        }
        const ytRes = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { "Authorization": `Bearer ${accessToken}` } }
        );
        const ytData = await safeJson(ytRes);
        if (!ytRes.ok) {
          const msg = ytData?.error?.message || ytData?.raw || JSON.stringify(ytData);
          throw new Error(`YouTube channels.list failed (${ytRes.status}): ${msg}`);
        }
        const ch = ytData?.items?.[0];
        if (!ch) {
          throw new Error("YouTube channels.list returned no channel (items[0] missing).");
        }
        const title = ch?.snippet?.title || "Linked YouTube";
        const channelId = ch?.id || title;
        const customUrl = ch?.snippet?.customUrl || null;
        const displayHandle = customUrl ? `@${String(customUrl).replace(/^@/, "")}` : null;
        return {
          channelId,
          title,
          customUrl,
          displayHandle
        };
      },
      "fetchYouTubeIdentity"
    );
    try {
      if (url.pathname === "/api/get-folders") {
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!userId) return new Response("Missing user_id", { status: 400, headers: corsHeaders });
        const { results } = await env.DB.prepare(
          "SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC"
        ).bind(userId).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }
      if (url.pathname === "/api/add-folder") {
        const { name, user_id } = await request.json();
        const userId = requireUser(user_id);
        if (!name || !userId) return new Response("Missing name or user_id", { status: 400, headers: corsHeaders });
        await env.DB.prepare("INSERT INTO folders (name, user_id) VALUES (?, ?)").bind(name, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
      if (url.pathname === "/api/rename-folder") {
        const { id, name, user_id } = await request.json();
        const userId = requireUser(user_id);
        if (!id || !name || !userId) return new Response("Missing id, name or user_id", { status: 400, headers: corsHeaders });
        await env.DB.prepare("UPDATE folders SET name = ? WHERE id = ? AND user_id = ?").bind(name, id, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
      if (url.pathname === "/api/delete-folder") {
        const { id, user_id, type } = await request.json();
        const userId = requireUser(user_id);
        if (!id || !userId) return new Response("Missing id or user_id", { status: 400, headers: corsHeaders });
        if (type === "account_only") {
          await env.DB.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?").bind(id, userId).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
        await env.DB.prepare("DELETE FROM accounts WHERE folder_id = ? AND user_id = ?").bind(id, userId).run();
        await env.DB.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").bind(id, userId).run();
        await env.DB.prepare(`
          DELETE FROM tokens
          WHERE folder_id IN (SELECT id FROM folders WHERE id = ? AND user_id = ?)
        `).bind(id, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
      if (url.pathname === "/api/get-accounts") {
        const folder_id = url.searchParams.get("folder_id");
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!folder_id || !userId) return new Response(JSON.stringify([]), { headers: corsHeaders });
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
        const tiktokAuthUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${env.TIKTOK_CLIENT_KEY}&scope=${encodeURIComponent(scopes)}&response_type=code&redirect_uri=${encodeURIComponent(tiktokRedirectUri)}&state=${state}`;
        return Response.redirect(tiktokAuthUrl);
      }
      if (url.pathname === "/api/auth/facebook") {
        const legacyState = url.searchParams.get("state");
        const stateObj = decodeState(legacyState);
        const folderId = url.searchParams.get("folder_id") || stateObj.folderId;
        const userId = requireUser(url.searchParams.get("user_id") || stateObj.userId);
        const state = encodeState({ folderId, platform: "facebook", userId });
        const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${env.FB_CLIENT_ID}&redirect_uri=${encodeURIComponent(fbRedirectUri)}&scope=pages_manage_posts,pages_show_list&state=${state}`;
        return Response.redirect(fbAuthUrl);
      }
      if (url.pathname === "/api/auth/callback/youtube") {
        const code = url.searchParams.get("code");
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;
        const userId = requireUser(stateObj.userId);
        if (!folderId || !userId) return new Response("Missing state", { status: 400, headers: corsHeaders });
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
        if (!tokenRes.ok) {
          const msg = tokens?.error_description || tokens?.error || tokens?.raw || JSON.stringify(tokens);
          return new Response(`YouTube token exchange failed (${tokenRes.status}): ${msg}`, { status: 400, headers: corsHeaders });
        }
        const identity = await fetchYouTubeIdentity(tokens.access_token);
        const channelTitle = identity.title || "Linked YouTube";
        const channelId = identity.channelId || channelTitle;
        await env.DB.prepare(`
          INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at)
          VALUES (?, ?, 'youtube', ?, ?, ?, ?)
        `).bind(
          folderId ?? null,
          userId ?? null,
          channelTitle ?? null,
          tokens?.access_token ?? null,
          tokens?.refresh_token ?? null,
          tokens?.expires_in ? nowMs() + tokens.expires_in * 1e3 : null
        ).run();
        if (!tokens?.refresh_token) {
          try {
            await env.DB.prepare(`
              UPDATE accounts
              SET access_token = ?, expires_at = ?
              WHERE folder_id = ? AND user_id = ? AND platform = 'youtube'
            `).bind(
              tokens?.access_token ?? null,
              tokens?.expires_in ? nowMs() + tokens.expires_in * 1e3 : null,
              folderId,
              userId
            ).run();
          } catch (_) {
          }
        }
        await upsertToken({
          folderId,
          platform: "youtube",
          accountId: channelId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: nowMs() + (tokens.expires_in || 0) * 1e3,
          scope: "https://www.googleapis.com/auth/youtube.upload"
        });
        return Response.redirect(`${frontendBaseUrl}/create-post.html`);
      }
      if (url.pathname === "/api/auth/callback/tiktok") {
        const code = url.searchParams.get("code");
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;
        const userId = requireUser(stateObj.userId);
        if (!folderId || !userId) return new Response("Missing state", { status: 400, headers: corsHeaders });
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
          folderId,
          userId,
          accessToken,
          refreshToken,
          nowMs() + expiresIn * 1e3
        ).run();
        await upsertToken({
          folderId,
          platform: "tiktok",
          accountId: openId,
          accessToken,
          refreshToken,
          expiresAt: nowMs() + expiresIn * 1e3,
          scope
        });
        return Response.redirect(`${frontendBaseUrl}/create-post.html`);
      }
      if (url.pathname === "/api/auth/callback/facebook") {
        const code = url.searchParams.get("code");
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;
        const userId = requireUser(stateObj.userId);
        if (!folderId || !userId) return new Response("Missing state", { status: 400, headers: corsHeaders });
        if (!code) {
          const err = url.searchParams.get("error") || "missing_code";
          return new Response(`Facebook OAuth failed: ${err}`, { status: 400, headers: corsHeaders });
        }
        const tokenRes = await fetch(
          `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${env.FB_CLIENT_ID}&redirect_uri=${encodeURIComponent(fbRedirectUri)}&client_secret=${env.FB_CLIENT_SECRET}&code=${code}`
        );
        const tokens = await safeJson(tokenRes);
        const accessToken = tokens.access_token;
        const expiresIn = tokens.expires_in || 0;
        let fbAccountId = "me";
        try {
          const meRes = await fetch(
            `https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
          );
          const me = await safeJson(meRes);
          if (me?.id) fbAccountId = me.id;
        } catch (_) {
        }
        await env.DB.prepare(
          "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'facebook', 'FB Page', ?, NULL, ?)"
        ).bind(
          folderId,
          userId,
          accessToken,
          nowMs() + expiresIn * 1e3
        ).run();
        await upsertToken({
          folderId,
          platform: "facebook",
          accountId: fbAccountId,
          accessToken,
          refreshToken: null,
          expiresAt: nowMs() + expiresIn * 1e3,
          scope: "pages_manage_posts,pages_show_list"
        });
        return Response.redirect(`${frontendBaseUrl}/create-post.html`);
      }
      if (url.pathname === "/api/post-video" && request.method === "POST") {
        const { account_id, video_url, title, platform } = await request.json();
        const account = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(account_id).first();
        const bearer = account?.access_token;
        if (platform === "tiktok") {
          const tiktokRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${bearer}`,
              "Content-Type": "application/json; charset=UTF-8"
            },
            body: JSON.stringify({
              post_info: { title, privacy_level: "SELF_ONLY", disable_duet: false, disable_comment: false },
              source_info: { source: "PULL_FROM_URL", video_url }
            })
          });
          const result = await safeJson(tiktokRes);
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: false, error: "Unsupported platform" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (url.pathname === "/api/generate-seo" && request.method === "POST") {
        const { prompt } = await request.json();
        const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages: [
            {
              role: "system",
              content: `You are a viral social media SEO expert. Output ONLY raw JSON.
              Structure: {
                "youtube": {"title": "", "description": "", "keywords": ""},
                "tiktok": {"allInOne": ""},
                "facebook": {"title": "", "descriptionAndTags": ""}
              }.`
            },
            { role: "user", content: `Generate viral 2026 SEO content for: ${prompt}` }
          ]
        });
        return new Response(JSON.stringify({ success: true, data: aiResponse }), {
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
