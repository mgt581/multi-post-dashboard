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

    // Helpers (added, does NOT remove anything)
    const nowMs = () => Date.now();
    const safeJson = async (res) => {
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { raw: text }; }
    };
    const encodeState = (obj) => {
      try { return btoa(JSON.stringify(obj)); } catch { return String(obj?.folderId || ""); }
    };
    const decodeState = (stateStr) => {
      if (!stateStr) return { folderId: null, platform: null };
      try {
        return JSON.parse(atob(stateStr));
      } catch {
        // legacy format: "folderId|userId"
        try {
          const raw = atob(stateStr);
          const [folderId] = raw.split("|");
          return { folderId: folderId || raw, platform: null };
        } catch {
          return { folderId: stateStr, platform: null };
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
      scope
    }) => {
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
    };

    try {
      // --- FOLDERS ---
      if (url.pathname === "/api/get-folders") {
        const { results } = await env.DB.prepare("SELECT * FROM folders ORDER BY created_at DESC").all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      if (url.pathname === "/api/add-folder") {
        const { name } = await request.json();
        await env.DB.prepare("INSERT INTO folders (name) VALUES (?)").bind(name).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/rename-folder") {
        const { id, name } = await request.json();
        if (!id || !name) return new Response("Missing id or name", { status: 400, headers: corsHeaders });
        await env.DB.prepare("UPDATE folders SET name = ? WHERE id = ?").bind(name, id).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/delete-folder") {
        const { id } = await request.json();
        if (!id) return new Response("Missing id", { status: 400, headers: corsHeaders });

        // keep original deletes
        await env.DB.prepare("DELETE FROM accounts WHERE folder_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM folders WHERE id = ?").bind(id).run();

        // added: also remove tokens for this folder (doesn't remove anything)
        await env.DB.prepare("DELETE FROM tokens WHERE folder_id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // --- ACCOUNTS (legacy UI still uses this; we keep it) ---
      if (url.pathname === "/api/get-accounts") {
        const folder_id = url.searchParams.get("folder_id");
        const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE folder_id = ?").bind(folder_id).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // Added: tokens lookup per folder+platform (optional, doesn't remove anything)
      if (url.pathname === "/api/get-tokens") {
        const folder_id = url.searchParams.get("folder_id");
        const platform = url.searchParams.get("platform");
        if (!folder_id) return new Response(JSON.stringify([]), { headers: corsHeaders });

        let q = "SELECT folder_id, platform, account_id, expires_at, updated_at FROM tokens WHERE folder_id = ?";
        const binds = [folder_id];
        if (platform) {
          q += " AND platform = ?";
          binds.push(platform);
        }
        const { results } = await env.DB.prepare(q).bind(...binds).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // --- AUTH START ---
      if (url.pathname === "/api/auth/youtube") {
        const legacyState = url.searchParams.get("state");
        const stateObj = decodeState(legacyState);
        const folderId = url.searchParams.get("folder_id") || stateObj.folderId;

        // upgraded state (folder + platform) while still compatible
        const state = encodeState({ folderId, platform: "youtube" });

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
        const redirectUri = `${baseUrl}/api/auth/callback/tiktok`;
        const scopes = "video.upload,video.publish,user.info.basic";

        // upgraded state (folder + platform) while still compatible
        const state = encodeState({ folderId, platform: "tiktok" });

        const tiktokAuthUrl =
          `https://www.tiktok.com/v2/auth/authorize/?client_key=${env.TIKTOK_CLIENT_KEY}` +
          `&scope=${encodeURIComponent(scopes)}` +
          `&response_type=code` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&state=${state}`;

        return Response.redirect(tiktokAuthUrl);
      }

      if (url.pathname === "/api/auth/facebook") {
        const legacyState = url.searchParams.get("state");
        const stateObj = decodeState(legacyState);
        const folderId = url.searchParams.get("folder_id") || stateObj.folderId;

        // upgraded state (folder + platform) while still compatible
        const state = encodeState({ folderId, platform: "facebook" });

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

        // state can be encoded JSON or old plain folderId
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;

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
        const channelId = userData.items?.[0]?.id || channelName; // fallback

        // KEEP original behaviour (accounts table) so your UI doesn't break
        await env.DB.prepare(
          "INSERT INTO accounts (folder_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, 'youtube', ?, ?, ?, ?)"
        ).bind(
          folderId,
          channelName,
          tokens.access_token,
          tokens.refresh_token,
          nowMs() + (tokens.expires_in || 0) * 1e3
        ).run();

        // NEW: also write to tokens table (multi-account safe)
        await upsertToken({
          folderId,
          platform: "youtube",
          accountId: channelId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: nowMs() + (tokens.expires_in || 0) * 1000,
          scope: "https://www.googleapis.com/auth/youtube.upload"
        });

        return Response.redirect(`${baseUrl}/create-post.html`);
      }

      if (url.pathname === "/api/auth/callback/tiktok") {
        const code = url.searchParams.get("code");

        // state can be encoded JSON or old plain folderId
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;

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
        const tData = tokenJson.data || tokenJson; // TikTok sometimes nests under data

        if (tokenJson.error) throw new Error(tokenJson.error_description || "TikTok Exchange Failed");
        if (tData.error) throw new Error(tData.error_description || "TikTok Exchange Failed");

        const accessToken = tData.access_token || tokenJson.access_token;
        const refreshToken = tData.refresh_token || tokenJson.refresh_token;
        const expiresIn = tData.expires_in || tokenJson.expires_in || 0;
        const openId = tData.open_id || tData.openid || tData.openId || "Linked TikTok"; // best-effort
        const scope = tData.scope || "video.upload,video.publish,user.info.basic";

        // KEEP original behaviour (accounts table) so your UI doesn't break
        await env.DB.prepare(
          "INSERT INTO accounts (folder_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, 'tiktok', 'Linked TikTok', ?, ?, ?)"
        ).bind(
          folderId,
          accessToken,
          refreshToken,
          nowMs() + expiresIn * 1e3
        ).run();

        // NEW: also write to tokens table (multi-account safe)
        await upsertToken({
          folderId,
          platform: "tiktok",
          accountId: openId,
          accessToken,
          refreshToken,
          expiresAt: nowMs() + expiresIn * 1000,
          scope
        });

        return Response.redirect(`${baseUrl}/create-post.html`);
      }

      if (url.pathname === "/api/auth/callback/facebook") {
        const code = url.searchParams.get("code");

        // state can be encoded JSON or old plain folderId
        const stateObj = decodeState(url.searchParams.get("state"));
        const folderId = stateObj.folderId;

        const tokenRes = await fetch(
          `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${env.FB_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(fbRedirectUri)}` +
          `&client_secret=${env.FB_CLIENT_SECRET}` +
          `&code=${code}`
        );

        const tokens = await safeJson(tokenRes);
        const accessToken = tokens.access_token;
        const expiresIn = tokens.expires_in || 0;

        // Try to get a stable Facebook user id for account_id
        let fbAccountId = "me";
        try {
          const meRes = await fetch(`https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
          const me = await safeJson(meRes);
          if (me?.id) fbAccountId = me.id;
        } catch (_) {
          // ignore, fallback to "me"
        }

        // KEEP original behaviour (accounts table) so your UI doesn't break
        await env.DB.prepare(
          "INSERT INTO accounts (folder_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, 'facebook', 'FB Page', ?, NULL, ?)"
        ).bind(
          folderId,
          accessToken,
          nowMs() + expiresIn * 1e3
        ).run();

        // NEW: also write to tokens table (multi-account safe)
        await upsertToken({
          folderId,
          platform: "facebook",
          accountId: fbAccountId,
          accessToken,
          refreshToken: null,
          expiresAt: nowMs() + expiresIn * 1000,
          scope: "pages_manage_posts,pages_show_list"
        });

        return Response.redirect(`${baseUrl}/create-post.html`);
      }

      // --- POSTING ---
      if (url.pathname === "/api/post-video" && request.method === "POST") {
        const { account_id, video_url, title, platform } = await request.json();

        // KEEP original behaviour: your UI passes accounts.id (legacy)
        const account = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(account_id).first();

        // Added: optional token-first posting if client passes token_account_id + folder_id
        // (Does not remove anything; legacy still works)
        const token_account_id = url.searchParams.get("token_account_id");
        const folder_id = url.searchParams.get("folder_id");
        let tokenRow = null;
        if (folder_id && token_account_id && platform) {
          tokenRow = await env.DB.prepare(
            "SELECT * FROM tokens WHERE folder_id = ? AND platform = ? AND account_id = ?"
          ).bind(folder_id, platform, token_account_id).first();
        }

        // Choose token source: prefer tokenRow if present
        const bearer = tokenRow?.access_token || account?.access_token;

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
      }

      // --- SEO GENERATOR ---
      if (url.pathname === "/api/generate-seo" && request.method === "POST") {
        const { prompt } = await request.json();
        const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages: [
            {
              role: "system",
              content: `You are a viral social media SEO expert. Output ONLY raw JSON. 
              For the "tiktok" "allInOne" field, you MUST write a complete, viral caption. 
              Include a hook, a short description, and 5-10 relevant hashtags. 
              IMPORTANT: Do NOT return a URL link. Return original written content only.
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

      return fetch(request);
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
