var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

var worker_default = {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const HARD_DEFAULT_SITE = "https://multipostapp.co.uk";
    const siteBaseUrl = env.BASE_URL || HARD_DEFAULT_SITE;
    const frontendBaseUrl = env.FRONTEND_URL || siteBaseUrl;

    const requireUser = (val) => (val && typeof val === "string") ? val : null;
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
      try { return JSON.parse(atob(stateStr)); } catch { return { folderId: stateStr, platform: null }; }
    };

    // Helper to save tokens
    const upsertToken = async ({ folderId, platform, accountId, accessToken, refreshToken, expiresAt, scope }) => {
      if (!folderId || !platform || !accountId || !accessToken) return;
      await env.DB.prepare(`
        INSERT INTO tokens (folder_id, platform, account_id, access_token, refresh_token, expires_at, scope, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
        ON CONFLICT(folder_id, platform, account_id)
        DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=strftime('%s','now')
      `).bind(folderId, platform, accountId, accessToken, refreshToken, expiresAt, scope).run();
    };

    try {
      // --- FOLDER MANAGEMENT ---
      if (url.pathname === "/api/get-folders") {
        const userId = requireUser(url.searchParams.get("user_id"));
        const { results } = await env.DB.prepare("SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      if (url.pathname === "/api/add-folder") {
        const { name, user_id } = await request.json();
        await env.DB.prepare("INSERT INTO folders (name, user_id) VALUES (?, ?)").bind(name, requireUser(user_id)).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/rename-folder") {
        const { id, name, user_id } = await request.json();
        await env.DB.prepare("UPDATE folders SET name = ? WHERE id = ? AND user_id = ?").bind(name, id, requireUser(user_id)).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/get-accounts") {
        const folder_id = url.searchParams.get("folder_id");
        const userId = requireUser(url.searchParams.get("user_id"));
        const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE folder_id = ? AND user_id = ?").bind(folder_id, userId).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      if (url.pathname === "/api/delete-folder") {
        const { id, user_id, type } = await request.json();
        const userId = requireUser(user_id);
        if (type === "account_only") {
          await env.DB.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?").bind(id, userId).run();
        } else {
          await env.DB.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").bind(id, userId).run();
          await env.DB.prepare("DELETE FROM accounts WHERE folder_id = ? AND user_id = ?").bind(id, userId).run();
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // --- AUTH FLOWS ---
      if (url.pathname === "/api/auth/youtube") {
        const state = encodeState({ folderId: url.searchParams.get("folder_id"), userId: url.searchParams.get("user_id"), platform: "youtube" });
        const redirect = `${siteBaseUrl}/api/auth/callback/youtube`;
        const scope = "https://www.googleapis.com/auth/youtube.upload";
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${state}`;
        return Response.redirect(authUrl);
      }

      if (url.pathname === "/api/auth/callback/youtube") {
        const code = url.searchParams.get("code");
        const state = decodeState(url.searchParams.get("state"));
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${siteBaseUrl}/api/auth/callback/youtube`, grant_type: "authorization_code" })
        });
        const tokens = await safeJson(tokenRes);

        await env.DB.prepare("INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'youtube', 'YouTube Channel', ?, ?, ?)")
          .bind(state.folderId, state.userId, tokens.access_token, tokens.refresh_token, nowMs() + (tokens.expires_in * 1000)).run();

        return Response.redirect(`${frontendBaseUrl}/folder.html?id=${state.folderId}`);
      }

      // --- AI SEO ---
      if (url.pathname === "/api/generate-seo" && request.method === "POST") {
        const { prompt } = await request.json();
        const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages: [{ role: "system", content: "You are a viral social media SEO expert." }, { role: "user", content: prompt }]
        });
        return new Response(JSON.stringify({ success: true, data: aiResponse }), { headers: corsHeaders });
      }

      if (!url.pathname.startsWith("/api/")) {
        return Response.redirect(frontendBaseUrl, 302);
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};

export { worker_default as default };
