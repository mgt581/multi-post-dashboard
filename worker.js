// worker.js - DUAL-DOMAIN PRODUCTION STABLE
var worker_default = {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);

    // API_URL should be your workers.dev address
    const apiBase = env.API_URL || `https://${url.hostname}`;
    // FRONTEND_URL should be https://multipostapp.co.uk
    const frontendBase = env.FRONTEND_URL || apiBase;

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
      try {
        await env.DB.prepare(`
          INSERT INTO tokens (folder_id, platform, account_id, access_token, refresh_token, expires_at, scope, updated_at, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), ?)
          ON CONFLICT(folder_id, platform, account_id)
          DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=strftime('%s','now'), user_id=COALESCE(excluded.user_id, tokens.user_id)
        `).bind(folderId, platform, accountId, accessToken, refreshToken, expiresAt, scope, userId).run();
      } catch (e) { console.error("Token save failed", e); }
    };

    try {
      // --- API ROUTES ---
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

      if (url.pathname === "/api/get-accounts") {
        const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE folder_id = ? AND user_id = ?").bind(url.searchParams.get("folder_id"), url.searchParams.get("user_id")).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // --- OAUTH INITIATION ---
      if (url.pathname.startsWith("/api/auth/")) {
        const platform = url.pathname.split("/")[3];
        const state = encodeState({ folderId: url.searchParams.get("folder_id"), userId: url.searchParams.get("user_id"), platform });
        const redirect = `${apiBase}/api/auth/callback/${platform}`;

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

      // --- OAUTH CALLBACKS ---
      if (url.pathname.includes("/api/auth/callback/")) {
        const platform = url.pathname.split("/")[4];
        const code = url.searchParams.get("code");
        const { folderId, userId } = decodeState(url.searchParams.get("state"));
        const cbUri = `${apiBase}/api/auth/callback/${platform}`;

        let tokenUrl, body;
        if (platform === "youtube") {
          tokenUrl = "https://oauth2.googleapis.com/token";
          body = new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: cbUri, grant_type: "authorization_code" });
        } else if (platform === "tiktok") {
          tokenUrl = "https://open.tiktokapis.com/v2/oauth/token/";
          body = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: cbUri });
        } else if (platform === "facebook") {
          tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${env.FB_CLIENT_ID}&redirect_uri=${encodeURIComponent(cbUri)}&client_secret=${env.FB_CLIENT_SECRET}&code=${code}`;
        }

        const tRes = await fetch(tokenUrl, { method: platform === "facebook" ? "GET" : "POST", body: platform === "facebook" ? null : body });
        const tokens = await safeJson(tRes);
        const accessToken = tokens.access_token || tokens.data?.access_token;
        const refreshToken = tokens.refresh_token || tokens.data?.refresh_token || null;

        if (accessToken) {
          await env.DB.prepare("INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(folderId, userId, platform, "Linked Account", accessToken, refreshToken, nowMs() + 3600 * 1000).run();
          await upsertToken({ folderId, userId, platform, accountId: "me", accessToken, refreshToken, expiresAt: nowMs() + 3600 * 1000, userId });
        }

        // REDIRECT BACK TO FRONTEND (multipostapp.co.uk)
        return Response.redirect(`${frontendBase}/folder.html?id=${folderId}`);
      }

      // --- SEO GENERATOR ---
      if (url.pathname === "/api/generate-seo") {
        const { prompt } = await request.json();
        const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-awq', {
          messages: [
            { role: "system", content: "You are a social media SEO expert. Output ONLY raw JSON. Keys: youtube, tiktok, facebook." },
            { role: "user", content: `Viral SEO for: ${prompt}` }
          ],
          response_format: { type: "json_object" }
        });
        return new Response(JSON.stringify({ success: true, data: aiResponse.response || aiResponse }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response("Not Found", { status: 404 });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 200, headers: corsHeaders });
    }
  }
};
export { worker_default as default };
