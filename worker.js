// worker.js - Full Production v2.3.0
// Features: Multi-user Folders, Multi-Account Persistence (Refresh Tokens), and Workers AI
var worker_default = {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    // Handle Preflight CORS requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const baseUrl = `https://${url.hostname}`;

    /**
     * Decodes the Base64 state string from the frontend
     * Format: btoa("folderId|userId")
     */
    const decodeState = (state) => {
      try {
        const decoded = atob(state);
        const [fId, uId] = decoded.split("|");
        return { folderId: fId, userId: uId };
      } catch (e) {
        console.error("State Decode Error:", e);
        return { folderId: state, userId: null };
      }
    };

    try {
      // --- FOLDER MANAGEMENT ---
      if (url.pathname === "/api/get-folders") {
        const userId = url.searchParams.get("user_id");
        if (!userId) return new Response("Missing User ID", { status: 400, headers: corsHeaders });
        
        const { results } = await env.DB.prepare("SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC")
          .bind(userId)
          .all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      if (url.pathname === "/api/add-folder") {
        const { name, user_id } = await request.json();
        await env.DB.prepare("INSERT INTO folders (name, user_id) VALUES (?, ?)")
          .bind(name, user_id)
          .run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/delete-folder") {
        const { id, user_id, type } = await request.json();
        if (type === "account_only") {
          await env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(id).run();
        } else {
          await env.DB.prepare("DELETE FROM accounts WHERE folder_id = ?").bind(id).run();
          await env.DB.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").bind(id, user_id).run();
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // --- ACCOUNT MANAGEMENT ---
      if (url.pathname === "/api/get-accounts") {
        const folder_id = url.searchParams.get("folder_id");
        const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE folder_id = ?")
          .bind(folder_id)
          .all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // --- OAUTH INITIATION (PERSISTENCE LOGIC ADDED) ---
      if (url.pathname === "/api/auth/youtube") {
        const state = url.searchParams.get("state");
        const redirectUri = `${baseUrl}/api/auth/callback/youtube`;
        // Added access_type=offline (for refresh tokens) and prompt=select_account (to allow multi-accounting)
        const target = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload&access_type=offline&prompt=select_account&state=${state}`;
        return Response.redirect(target);
      }

      if (url.pathname === "/api/auth/tiktok") {
        const state = url.searchParams.get("state");
        const redirectUri = `${baseUrl}/api/auth/callback/tiktok`;
        // TikTok logic to bypass auto-auth
        const target = `https://www.tiktok.com/v2/auth/authorize/?client_key=${env.TIKTOK_CLIENT_KEY}&scope=video.upload,video.publish,user.info.basic&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
        return Response.redirect(target);
      }

      if (url.pathname === "/api/auth/facebook") {
        const state = url.searchParams.get("state");
        const redirectUri = `${baseUrl}/api/auth/callback/facebook`;
        // Added auth_type=reauthenticate to force account switching
        const target = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${env.FB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&config_id=1283545206972587&response_type=code&auth_type=reauthenticate&state=${state}`;
        return Response.redirect(target);
      }

      // --- OAUTH CALLBACKS ---
      if (url.pathname === "/api/auth/callback/youtube") {
        const code = url.searchParams.get("code");
        const { folderId } = decodeState(url.searchParams.get("state"));
        
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: `${baseUrl}/api/auth/callback/youtube`,
            grant_type: "authorization_code"
          })
        });
        const tokens = await tokenRes.json();
        
        await env.DB.prepare("INSERT INTO accounts (folder_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, 'youtube', 'YouTube Channel', ?, ?, ?)")
          .bind(folderId, tokens.access_token, tokens.refresh_token, Date.now() + (tokens.expires_in * 1000))
          .run();
        
        return Response.redirect(`${baseUrl}/folder.html`);
      }

      if (url.pathname === "/api/auth/callback/tiktok") {
        const code = url.searchParams.get("code");
        const { folderId } = decodeState(url.searchParams.get("state"));
        
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
        const tokens = await tokenRes.json();
        
        await env.DB.prepare("INSERT INTO accounts (folder_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, 'tiktok', 'TikTok User', ?, ?, ?)")
          .bind(folderId, tokens.access_token, tokens.refresh_token, Date.now() + (tokens.expires_in * 1000))
          .run();
        
        return Response.redirect(`${baseUrl}/folder.html`);
      }

      if (url.pathname === "/api/auth/callback/facebook") {
        const code = url.searchParams.get("code");
        const { folderId } = decodeState(url.searchParams.get("state"));
        
        const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${env.FB_CLIENT_ID}&redirect_uri=${baseUrl}/api/auth/callback/facebook&client_secret=${env.FB_CLIENT_SECRET}&code=${code}`);
        const tokens = await tokenRes.json();
        
        await env.DB.prepare("INSERT INTO accounts (folder_id, platform, nickname, access_token, expires_at) VALUES (?, 'facebook', 'FB Page', ?, ?)")
          .bind(folderId, tokens.access_token, Date.now() + (tokens.expires_in || 5184000) * 1000)
          .run();
        
        return Response.redirect(`${baseUrl}/folder.html`);
      }

      // --- AI SERVICES ---
      if (url.pathname === "/api/generate-seo" && request.method === "POST") {
        const { prompt } = await request.json();
        const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages: [
            { role: "system", content: "You are a viral social media SEO expert. Output ONLY valid JSON with 'title', 'description', and 'hashtags'." },
            { role: "user", content: `Generate SEO for: ${prompt}` }
          ]
        });
        return new Response(JSON.stringify({ success: true, data: aiResponse }), { headers: corsHeaders });
      }

      return new Response("Multipost API v2.3.0 - Persistence Enabled", { headers: corsHeaders });

    } catch (err) {
      console.error("Worker Error:", err.message);
      return new Response(JSON.stringify({ success: false, error: err.message }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }
};

export { worker_default as default };
