// worker.js
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

    // Hard-coded redirect URIs for custom domain compatibility
    const redirectUri = "https://multipostapp.co.uk/api/auth/callback/youtube";
    const fbRedirectUri = "https://multipostapp.co.uk/api/auth/callback/facebook";

    // Helpers
    const nowMs = () => Date.now();
    const safeJson = async (res) => {
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { raw: text }; }
    };
    const encodeState = (obj) => {
      try { return btoa(JSON.stringify(obj)); } catch { return String(obj?.folderId || ""); }
    };
    const decodeState = (stateStr) => {
      if (!stateStr) return { folderId: null, userId: null, platform: null };
      try {
        const decoded = JSON.parse(atob(stateStr));
        // Ensure both JSON and legacy fields work
        return {
          folderId: decoded.folderId || decoded.folder_id,
          userId: decoded.userId || decoded.user_id,
          platform: decoded.platform
        };
      } catch {
        try {
          const raw = atob(stateStr);
          const parts = raw.split("|");
          return {
            folderId: parts[0] || raw,
            userId: parts[1] || null,
            platform: null
          };
        } catch {
          return { folderId: stateStr, userId: null, platform: null };
        }
      }
    };

    const upsertToken = async ({
      folderId,
      platform,
      accountId,
      accessToken,
      refreshToken,
      expiresAt,
      scope,
      userId
    }) => {
      if (!folderId || !platform || !accountId || !accessToken) return;

      await env.DB.prepare(`
        INSERT INTO tokens (
          folder_id, platform, account_id, access_token, refresh_token, expires_at, scope, updated_at, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), ?)
        ON CONFLICT(folder_id, platform, account_id)
        DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_at = excluded.expires_at,
          scope = excluded.scope,
          updated_at = strftime('%s','now'),
          user_id = COALESCE(excluded.user_id, tokens.user_id)
      `).bind(
        folderId,
        platform,
        accountId,
        accessToken,
        refreshToken ?? null,
        expiresAt ?? null,
        scope ?? null,
        userId ?? null
      ).run();
    };

    try {
      // --- FOLDERS ---
      if (url.pathname === "/api/get-folders") {
        const userId = url.searchParams.get("user_id");
        if (!userId) return new Response("Missing user_id", { status: 400, headers: corsHeaders });

        const { results } = await env.DB.prepare("SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC")
          .bind(userId)
          .all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      if (url.pathname === "/api/add-folder") {
        const { name, user_id } = await request.json();
        if (!name || !user_id) return new Response("Missing name or user_id", { status: 400, headers: corsHeaders });

        await env.DB.prepare("INSERT INTO folders (name, user_id) VALUES (?, ?)")
          .bind(name, user_id)
          .run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/rename-folder") {
        const { id, name, user_id } = await request.json();
        const { success } = await env.DB.prepare("UPDATE folders SET name = ? WHERE id = ? AND user_id = ?")
          .bind(name, id, user_id)
          .run();
        return new Response(JSON.stringify({ success }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/delete-folder") {
        const { id, user_id, type } = await request.json();

        if (type === "account_only") {
          await env.DB.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?").bind(id, user_id).run();
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        const folder = await env.DB.prepare("SELECT id FROM folders WHERE id = ? AND user_id = ?")
          .bind(id, user_id)
          .first();

        if (!folder) return new Response("Unauthorized", { status: 403, headers: corsHeaders });

        await env.DB.prepare("DELETE FROM accounts WHERE folder_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM tokens WHERE folder_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM folders WHERE id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // --- ACCOUNTS ---
      if (url.pathname === "/api/get-accounts") {
        const folder_id = url.searchParams.get("folder_id");
        const user_id = url.searchParams.get("user_id");
        const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE folder_id = ? AND user_id = ?")
          .bind(folder_id, user_id)
          .all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // --- AUTH START ---
      if (url.pathname === "/api/auth/youtube") {
        const folderId = url.searchParams.get("folder_id");
        const userId = url.searchParams.get("user_id");
        const state = encodeState({ folderId, userId, platform: "youtube" });

        const googleAuthUrl =
          `https://accounts.google.com/o/oauth2/v2/auth?client_id=${env.GOOGLE_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&response_type=code` +
          `&scope=https://www.googleapis.com/auth/youtube.upload` +
          `&access_type=offline&prompt=select_account+consent` +
          `&state=${state}`;

        return Response.redirect(googleAuthUrl);
      }

      if (url.pathname === "/api/auth/tiktok") {
        const folderId = url.searchParams.get("folder_id");
        const userId = url.searchParams.get("user_id");
        const state = encodeState({ folderId, userId, platform: "tiktok" });
        const scopes = "video.upload,video.publish,user.info.basic";

        const tiktokAuthUrl =
          `https://www.tiktok.com/v2/auth/authorize/?client_key=${env.TIKTOK_CLIENT_KEY}` +
          `&scope=${encodeURIComponent(scopes)}` +
          `&response_type=code` +
          `&redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/callback/tiktok`)}` +
          `&state=${state}`;

        return Response.redirect(tiktokAuthUrl);
      }

      if (url.pathname === "/api/auth/facebook") {
        const folderId = url.searchParams.get("folder_id");
        const userId = url.searchParams.get("user_id");
        const state = encodeState({ folderId, userId, platform: "facebook" });

        const fbAuthUrl =
          `https://www.facebook.com/v18.0/dialog/oauth?client_id=${env.FB_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(fbRedirectUri)}` +
          `&scope=pages_manage_posts,pages_show_list` +
          `&state=${state}`;

        return Response.redirect(fbAuthUrl);
      }

      // --- AUTH CALLBACKS ---
      if (url.pathname === "/api/auth/callback/youtube") {
        const code = url.searchParams.get("code");
        const { folderId, userId } = decodeState(url.searchParams.get("state"));

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
        const userRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
          headers: { "Authorization": `Bearer ${tokens.access_token}` }
        });

        const userData = await safeJson(userRes);
        const channelName = userData.items?.[0]?.snippet?.title || "Linked YouTube";
        const channelId = userData.items?.[0]?.id || channelName;

        await env.DB.prepare(
          "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'youtube', ?, ?, ?, ?)"
        ).bind(
          folderId,
          userId,
          channelName,
          tokens.access_token,
          tokens.refresh_token,
          nowMs() + (tokens.expires_in || 0) * 1e3
        ).run();

        await upsertToken({
          folderId, userId, platform: "youtube", accountId: channelId,
          accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
          expiresAt: nowMs() + (tokens.expires_in || 0) * 1000,
          scope: "https://www.googleapis.com/auth/youtube.upload"
        });

        return Response.redirect(`${baseUrl}/create-post.html`);
      }

      if (url.pathname === "/api/auth/callback/tiktok") {
        const code = url.searchParams.get("code");
        const { folderId, userId } = decodeState(url.searchParams.get("state"));

        const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: env.TIKTOK_CLIENT_KEY,
            client_secret: env.TIKTOK_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: `${baseUrl}/api/auth/callback/tiktok`
          })
        });

        const tokenJson = await safeJson(tokenRes);
        const tData = tokenJson.data || tokenJson;

        const accessToken = tData.access_token || tokenJson.access_token;
        const refreshToken = tData.refresh_token || tokenJson.refresh_token;
        const expiresIn = tData.expires_in || tokenJson.expires_in || 0;
        const openId = tData.open_id || tData.openid || tData.openId || "Linked TikTok";

        await env.DB.prepare(
          "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'tiktok', 'Linked TikTok', ?, ?, ?)"
        ).bind(
          folderId, userId, accessToken, refreshToken, nowMs() + expiresIn * 1e3
        ).run();

        await upsertToken({
          folderId, userId, platform: "tiktok", accountId: openId,
          accessToken, refreshToken,
          expiresAt: nowMs() + expiresIn * 1000,
          scope: tData.scope || "video.upload,video.publish,user.info.basic"
        });

        return Response.redirect(`${baseUrl}/create-post.html`);
      }

      if (url.pathname === "/api/auth/callback/facebook") {
        const code = url.searchParams.get("code");
        const { folderId, userId } = decodeState(url.searchParams.get("state"));

        const tokenRes = await fetch(
          `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${env.FB_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(fbRedirectUri)}` +
          `&client_secret=${env.FB_CLIENT_SECRET}` +
          `&code=${code}`
        );

        const tokens = await safeJson(tokenRes);
        const accessToken = tokens.access_token;
        const expiresIn = tokens.expires_in || 0;

        let fbAccountId = "me";
        try {
          const meRes = await fetch(`https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
          const me = await safeJson(meRes);
          if (me?.id) fbAccountId = me.id;
        } catch (_) {}

        await env.DB.prepare(
          "INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'facebook', 'FB Page', ?, NULL, ?)"
        ).bind(
          folderId, userId, accessToken, nowMs() + expiresIn * 1e3
        ).run();

        await upsertToken({
          folderId, userId, platform: "facebook", accountId: fbAccountId,
          accessToken, refreshToken: null,
          expiresAt: nowMs() + expiresIn * 1000,
          scope: "pages_manage_posts,pages_show_list"
        });

        return Response.redirect(`${baseUrl}/create-post.html`);
      }

      // --- SEO GENERATOR (OpenAI Fallback) ---
      if (url.pathname === "/api/generate-seo" && request.method === "POST") {
        const { prompt } = await request.json();

        if (!env.OPENAI_API_KEY) {
          return new Response(JSON.stringify({
            success: false,
            error: "OpenAI API Key not set. Please run 'wrangler secret put OPENAI_API_KEY' in your terminal."
          }), { status: 500, headers: corsHeaders });
        }

        const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o",
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
            ],
            response_format: { type: "json_object" }
          })
        });

        const openAiData = await openAiRes.json();

        if (openAiData.error) {
           return new Response(JSON.stringify({ success: false, error: openAiData.error.message }), {
             status: 400, headers: corsHeaders
           });
        }

        const content = openAiData.choices?.[0]?.message?.content;
        return new Response(JSON.stringify({ success: true, data: content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return fetch(request);
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};

export { worker_default as default };
