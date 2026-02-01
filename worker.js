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
    // Use configured base URL for OAuth callbacks to ensure consistency
    // Falls back to request hostname if not configured
    const baseUrl = env.BASE_URL || `https://${url.hostname}`;
    
    // Frontend URL for redirects after OAuth (can be different from API base URL)
    // If not set, assumes frontend is served from same domain as API
    const frontendUrl = env.FRONTEND_URL || baseUrl;

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
        
        // Log the redirect URI for debugging
        const redirect = `${baseUrl}/api/auth/callback/${platform}`;
        console.log(`Initiating OAuth for ${platform} with redirect URI: ${redirect}`);
        console.log(`BASE_URL env: ${env.BASE_URL || 'not set'}, Using: ${baseUrl}`);
        
        const state = encodeState({ folderId: url.searchParams.get("folder_id"), userId: url.searchParams.get("user_id"), platform });

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
        const error = url.searchParams.get("error");
        const { folderId, userId } = decodeState(url.searchParams.get("state"));
        const callbackUri = `${baseUrl}/api/auth/callback/${platform}`;

        console.log(`OAuth callback for ${platform}, callbackUri: ${callbackUri}, has code: ${!!code}, error: ${error || 'none'}`);

        // Handle OAuth errors (e.g., user denied access or redirect URI mismatch)
        if (error || !code) {
          console.error(`OAuth error for ${platform}:`, error || 'No authorization code received');
          return Response.redirect(`${frontendUrl}/folder.html?id=${folderId}&error=${encodeURIComponent(error || 'auth_failed')}`);
        }

        let tokenUrl, body, authHeader;
        if (platform === "youtube") {
          tokenUrl = "https://oauth2.googleapis.com/token";
          body = new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callbackUri, grant_type: "authorization_code" });
        } else if (platform === "tiktok") {
          tokenUrl = "https://open.tiktokapis.com/v2/oauth/token/";
          body = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: callbackUri });
        } else if (platform === "facebook") {
          tokenUrl = "https://graph.facebook.com/v18.0/oauth/access_token";
          body = new URLSearchParams({ code, client_id: env.FB_CLIENT_ID, client_secret: env.FB_CLIENT_SECRET, redirect_uri: callbackUri });
        }

        console.log(`Exchanging code for ${platform} at ${tokenUrl}`);
        const tRes = await fetch(tokenUrl, { method: "POST", body });
        const tokens = await safeJson(tRes);
        const accessToken = tokens.access_token || tokens.data?.access_token;

        // Check if token exchange failed
        if (!accessToken || tokens.error) {
          console.error(`Token exchange failed for ${platform}:`, tokens.error || tokens);
          return Response.redirect(`${frontendUrl}/folder.html?id=${folderId}&error=token_exchange_failed`);
        }

        console.log(`Successfully authenticated ${platform} for folder ${folderId}`);
        await env.DB.prepare("INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(folderId, userId, platform, "Linked Account", accessToken, tokens.refresh_token, nowMs() + (tokens.expires_in || 0) * 1000).run();
        await upsertToken({ folderId, userId, platform, accountId: "me", accessToken, refreshToken: tokens.refresh_token, expiresAt: nowMs() + (tokens.expires_in || 0) * 1000 });

        return Response.redirect(`${frontendUrl}/folder.html?id=${folderId}&success=account_linked`);
      }

      if (url.pathname === "/api/generate-seo") {
        const body = await request.json();
        const { prompt } = body;
        
        if (!prompt) {
          return new Response(JSON.stringify({ success: false, error: "Prompt is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Using Cloudflare Workers AI as requested in the snippet
        const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-awq', {
          messages: [
            {
              role: "system",
              content: "You are an SEO expert for YouTube, TikTok, and Instagram. Create high-engagement titles and descriptions with relevant keywords. Output ONLY raw JSON with keys: youtube, tiktok, facebook."
            },
            {
              role: "user",
              content: `Write viral SEO content for: ${prompt}`
            }
          ],
          response_format: { type: "json_object" }
        });

        // The result from env.AI.run varies by model, usually it's in .response
        const content = aiResponse.response || aiResponse;

        return new Response(JSON.stringify({ success: true, data: content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Serve static HTML files for common pages
      // This allows the worker to serve the frontend if needed
      if (url.pathname === "/" || url.pathname === "/index.html") {
        // Redirect to the frontend URL or serve a simple info page
        if (frontendUrl !== baseUrl) {
          return Response.redirect(frontendUrl, 302);
        }
        // If no separate frontend, return API info
        return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Multipost API</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; line-height: 1.6; color: #333; }
    h1 { color: #4f46e5; }
    .endpoint { background: #f8fafc; padding: 15px; margin: 10px 0; border-left: 4px solid #4f46e5; border-radius: 4px; }
    code { background: #e2e8f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  </style>
</head>
<body>
  <h1>Multipost API</h1>
  <p>This is the API endpoint for the Multipost application.</p>
  <p>Visit <a href="https://multipostapp.co.uk">https://multipostapp.co.uk</a> to use the application.</p>
  
  <h2>Available API Endpoints:</h2>
  <div class="endpoint">
    <strong>GET</strong> <code>/api/get-folders?user_id={userId}</code>
  </div>
  <div class="endpoint">
    <strong>POST</strong> <code>/api/add-folder</code>
  </div>
  <div class="endpoint">
    <strong>POST</strong> <code>/api/delete-folder</code>
  </div>
  <div class="endpoint">
    <strong>GET</strong> <code>/api/get-accounts?folder_id={folderId}&user_id={userId}</code>
  </div>
  <div class="endpoint">
    <strong>GET</strong> <code>/api/auth/{platform}</code> - YouTube, TikTok, Facebook
  </div>
  <div class="endpoint">
    <strong>POST</strong> <code>/api/generate-seo</code>
  </div>
</body>
</html>`, {
          headers: { "Content-Type": "text/html;charset=UTF-8" }
        });
      }

      // For other non-API paths, redirect to frontend or return 404
      if (!url.pathname.startsWith("/api/")) {
        if (frontendUrl !== baseUrl) {
          // Redirect to the same path on the frontend
          return Response.redirect(frontendUrl + url.pathname + url.search, 302);
        }
      }

      // Return 404 for unknown routes instead of creating infinite loop
      return new Response(JSON.stringify({ success: false, error: "Not Found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { headers: corsHeaders });
    }
  }
};
export { worker_default as default };
