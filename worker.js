// worker.js - PRODUCTION STABLE VERSION
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

    // Helpers
    const nowMs = () => Date.now();
    const safeJson = async (res) => {
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { raw: text }; }
    };
    const encodeState = (obj) => btoa(JSON.stringify(obj));
    const decodeState = (stateStr) => {
      if (!stateStr) return { folderId: null, userId: null };
      try { return JSON.parse(atob(stateStr)); } catch { return { folderId: stateStr, userId: null }; }
    };

    const upsertToken = async ({ folderId, platform, accountId, accessToken, refreshToken, expiresAt, scope, userId }) => {
      if (!folderId || !platform || !accountId || !accessToken) return;
      await env.DB.prepare(`
        INSERT INTO tokens (folder_id, platform, account_id, access_token, refresh_token, expires_at, scope, updated_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), ?)
        ON CONFLICT(folder_id, platform, account_id)
        DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=strftime('%s','now'), user_id=COALESCE(excluded.user_id, tokens.user_id)
      `).bind(folderId, platform, accountId, accessToken, refreshToken, expiresAt, scope, userId).run();
    };

    try {
      if (url.pathname === "/api/get-folders") {
        const userId = url.searchParams.get("user_id");
        const { results } = await env.DB.prepare("SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      if (url.pathname === "/api/add-folder") {
        const { name, user_id } = await request.json();
        await env.DB.prepare("INSERT INTO folders (name, user_id) VALUES (?, ?)").bind(name, user_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/delete-folder") {
        const { id, user_id, type } = await request.json();
        if (type === "account_only") {
          await env.DB.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?").bind(id, user_id).run();
        } else {
          await env.DB.prepare("DELETE FROM accounts WHERE folder_id = ?").bind(id).run();
          await env.DB.prepare("DELETE FROM tokens WHERE folder_id = ?").bind(id).run();
          await env.DB.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").bind(id, user_id).run();
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/get-accounts") {
        const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE folder_id = ? AND user_id = ?").bind(url.searchParams.get("folder_id"), url.searchParams.get("user_id")).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // AUTH START - Using dynamic baseUrl
      if (url.pathname.startsWith("/api/auth/")) {
        const platform = url.pathname.split("/")[3];
        const state = encodeState({ folderId: url.searchParams.get("folder_id"), userId: url.searchParams.get("user_id"), platform });
        const redirect = `${baseUrl}/api/auth/callback/${platform}`;

        if (platform === "youtube") {
          return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload&access_type=offline&prompt=select_account+consent&state=${state}`);
        }
        if (platform === "tiktok") {
          return Response.redirect(`https://www.tiktok.com/v2/auth/authorize/?client_key=${env.TIKTOK_CLIENT_KEY}&scope=video.upload,video.publish,user.info.basic&response_type=code&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`);
        }
        if (platform === "facebook") {
          return Response.redirect(`https://www.facebook.com/v18.0/dialog/oauth?client_id=${env.FB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&scope=pages_manage_posts,pages_show_list&state=${state}`);
        }
      }

      // CALLBACKS
      if (url.pathname.includes("/api/auth/callback/")) {
        const platform = url.pathname.split("/")[4];
        const code = url.searchParams.get("code");
        const { folderId, userId } = decodeState(url.searchParams.get("state"));
        const callbackUri = `${baseUrl}/api/auth/callback/${platform}`;

        let tokenUrl, body, authHeader;
        if (platform === "youtube") {
          tokenUrl = "https://oauth2.googleapis.com/token";
          body = new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callbackUri, grant_type: "authorization_code" });
        } else if (platform === "tiktok") {
          tokenUrl = "https://open.tiktokapis.com/v2/oauth/token/";
          body = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: callbackUri });
        }

        const tRes = await fetch(tokenUrl, { method: "POST", body });
        const tokens = await safeJson(tRes);
        const accessToken = tokens.access_token || tokens.data?.access_token;

        await env.DB.prepare("INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(folderId, userId, platform, "Linked Account", accessToken, tokens.refresh_token, nowMs() + (tokens.expires_in || 0) * 1000).run();
        await upsertToken({ folderId, userId, platform, accountId: "me", accessToken, refreshToken: tokens.refresh_token, expiresAt: nowMs() + (tokens.expires_in || 0) * 1000 });

        return Response.redirect(`${baseUrl}/folder.html?id=${folderId}`);
      }

      if (url.pathname === "/api/generate-seo") {
        const { prompt } = await request.json();
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [{ role: "system", content: "Output ONLY raw JSON. Keys: youtube, tiktok, facebook." }, { role: "user", content: `Viral SEO for: ${prompt}` }],
            response_format: { type: "json_object" }
          })
        });
        const data = await res.json();
        return new Response(JSON.stringify({ success: true, data: data.choices[0].message.content }), { headers: corsHeaders });
      }

      return fetch(request);
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { headers: corsHeaders });
    }
  }
};
export { worker_default as default };
