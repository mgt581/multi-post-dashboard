/**
 * Multipost App - Master Worker
 * Handles Workspace Folders, Multi-Platform OAuth, Viral SEO, and Direct Posting.
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    const safeUserId = (raw) => {
      const v = (raw || "").trim();
      if (!v || v === "null" || v === "undefined") return null;
      return v;
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const baseUrl = `https://${url.hostname}`;

    try {
      // --- 1. WORKSPACE / FOLDER LOGIC ---
      if (url.pathname === "/api/get-folders") {
        const userId = safeUserId(url.searchParams.get("user_id"));
        if (!userId) {
          return new Response("Missing or invalid user_id", { status: 400, headers: corsHeaders });
        }
        const { results } = await env.DB.prepare("SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      if (url.pathname === "/api/add-folder") {
        const { name, user_id } = await request.json();
        const userId = safeUserId(user_id);
        if (!userId || !name) {
          return new Response("Missing name or user_id", { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare("INSERT INTO folders (name, user_id) VALUES (?, ?)").bind(name, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/rename-folder") {
        const { id, name, user_id } = await request.json();
        const userId = safeUserId(user_id);
        if (!id || !name || !userId) {
          return new Response("Missing id or name", { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare("UPDATE folders SET name = ? WHERE id = ? AND user_id = ?").bind(name, id, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (url.pathname === "/api/delete-folder") {
        const { id, user_id } = await request.json();
        const userId = safeUserId(user_id);
        if (!id || !userId) {
          return new Response("Missing id", { status: 400, headers: corsHeaders });
        }
        // Delete associated accounts first (foreign key constraint)
        await env.DB.prepare("DELETE FROM accounts WHERE folder_id = ? AND user_id = ?").bind(id, userId).run();
        // Then delete the folder
        await env.DB.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").bind(id, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // --- 2. ACCOUNT MANAGEMENT ---
      if (url.pathname === "/api/get-accounts") {
        const folder_id = url.searchParams.get("folder_id");
        const userId = safeUserId(url.searchParams.get("user_id"));
        if (!folder_id || !userId) {
          return new Response("Missing folder_id or user_id", { status: 400, headers: corsHeaders });
        }
        const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE folder_id = ? AND user_id = ?").bind(folder_id, userId).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      if (url.pathname === "/api/delete-account" && request.method === "POST") {
        const { id, user_id } = await request.json();
        const userId = safeUserId(user_id);
        if (!id || !userId) {
          return new Response("Missing id", { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?").bind(id, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // --- 3. MULTI-PLATFORM AUTH INITIATION ---

      // YOUTUBE INITIATION (Fixed Syntax)
      if (url.pathname === "/api/auth/youtube") {
        const folderId = url.searchParams.get("folder_id");
        const userId = safeUserId(url.searchParams.get("user_id"));
        if (!folderId || !userId) {
          return new Response("Missing folder_id or user_id", { status: 400, headers: corsHeaders });
        }
        const folder = await env.DB.prepare("SELECT id FROM folders WHERE id = ? AND user_id = ?").bind(folderId, userId).first();
        if (!folder) {
          return new Response("Folder not found", { status: 404, headers: corsHeaders });
        }
        const redirectUri = `${baseUrl}/api/auth/callback/youtube`;
        const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload&access_type=offline&prompt=select_account+consent&state=${folderId}`;
        return Response.redirect(googleAuthUrl);
      }

      // TIKTOK INITIATION
      if (url.pathname === "/api/auth/tiktok") {
        const folderId = url.searchParams.get("folder_id");
        const userId = safeUserId(url.searchParams.get("user_id"));
        if (!folderId || !userId) {
          return new Response("Missing folder_id or user_id", { status: 400, headers: corsHeaders });
        }
        const folder = await env.DB.prepare("SELECT id FROM folders WHERE id = ? AND user_id = ?").bind(folderId, userId).first();
        if (!folder) {
          return new Response("Folder not found", { status: 404, headers: corsHeaders });
        }
        const redirectUri = `${baseUrl}/api/auth/callback/tiktok`;
        const scopes = "video.upload,video.publish,user.info.basic";
        const tiktokAuthUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${env.TIKTOK_CLIENT_KEY}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${folderId}`;
        return Response.redirect(tiktokAuthUrl);
      }

      // FACEBOOK INITIATION
      if (url.pathname === "/api/auth/facebook") {
        const folderId = url.searchParams.get("folder_id");
        const userId = safeUserId(url.searchParams.get("user_id"));
        if (!folderId || !userId) {
          return new Response("Missing folder_id or user_id", { status: 400, headers: corsHeaders });
        }
        const folder = await env.DB.prepare("SELECT id FROM folders WHERE id = ? AND user_id = ?").bind(folderId, userId).first();
        if (!folder) {
          return new Response("Folder not found", { status: 404, headers: corsHeaders });
        }
        const redirectUri = `${baseUrl}/api/auth/callback/facebook`;
        const authNonce = crypto.randomUUID();
        const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${env.FB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=pages_manage_posts,pages_show_list&auth_type=reauthenticate&auth_nonce=${authNonce}&state=${folderId}`;
        return Response.redirect(fbAuthUrl);
      }

      // --- 4. CALLBACK HANDLERS ---

      // YOUTUBE CALLBACK
      if (url.pathname === "/api/auth/callback/youtube") {
        const code = url.searchParams.get("code");
        const folderId = url.searchParams.get("state");
        const redirectUri = `${baseUrl}/api/auth/callback/youtube`;

        const folder = await env.DB.prepare("SELECT user_id FROM folders WHERE id = ?").bind(folderId).first();
        if (!folder) {
          return new Response("Folder not found", { status: 404, headers: corsHeaders });
        }

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code, 
            client_id: env.GOOGLE_CLIENT_ID, 
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri, 
            grant_type: "authorization_code",
          }),
        });
        const tokens = await tokenRes.json();

        const userRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
          headers: { "Authorization": `Bearer ${tokens.access_token}` }
        });
        const userData = await userRes.json();
        const channelName = userData.items?.[0]?.snippet?.title || "Linked YouTube";

        await env.DB.prepare("INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'youtube', ?, ?, ?, ?)")
          .bind(folderId, folder.user_id, channelName, tokens.access_token, tokens.refresh_token, Date.now() + (tokens.expires_in * 1000)).run();
        
        return Response.redirect(`${baseUrl}/folder.html?id=${folderId}`);
      }

      // TIKTOK CALLBACK
      if (url.pathname === "/api/auth/callback/tiktok") {
        const code = url.searchParams.get("code");
        const folderId = url.searchParams.get("state");
        const folder = await env.DB.prepare("SELECT user_id FROM folders WHERE id = ?").bind(folderId).first();
        if (!folder) {
          return new Response("Folder not found", { status: 404, headers: corsHeaders });
        }
        const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: env.TIKTOK_CLIENT_KEY, 
            client_secret: env.TIKTOK_CLIENT_SECRET,
            code, 
            grant_type: "authorization_code", 
            redirect_uri: `${baseUrl}/api/auth/callback/tiktok`,
          }),
        });
        const tokens = await tokenRes.json();
        
        if (tokens.error) throw new Error(tokens.error_description || "TikTok Exchange Failed");

        await env.DB.prepare("INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'tiktok', 'Linked TikTok', ?, ?, ?)")
          .bind(folderId, folder.user_id, tokens.access_token, tokens.refresh_token, Date.now() + (tokens.expires_in * 1000)).run();
        return Response.redirect(`${baseUrl}/folder.html?id=${folderId}`);
      }

      // FACEBOOK CALLBACK
      if (url.pathname === "/api/auth/callback/facebook") {
        const code = url.searchParams.get("code");
        const folderId = url.searchParams.get("state");
        const folder = await env.DB.prepare("SELECT user_id FROM folders WHERE id = ?").bind(folderId).first();
        if (!folder) {
          return new Response("Folder not found", { status: 404, headers: corsHeaders });
        }
        const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${env.FB_CLIENT_ID}&redirect_uri=${baseUrl}/api/auth/callback/facebook&client_secret=${env.FB_CLIENT_SECRET}&code=${code}`);
        const tokens = await tokenRes.json();
        await env.DB.prepare("INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at) VALUES (?, ?, 'facebook', 'Linked Facebook', ?, 'none', ?)")
          .bind(folderId, folder.user_id, tokens.access_token, Date.now() + (tokens.expires_in * 1000)).run();
        return Response.redirect(`${baseUrl}/folder.html?id=${folderId}`);
      }

      // --- 5. POSTING LOGIC ---
      if (url.pathname === "/api/post-video" && request.method === "POST") {
        const { account_id, video_url, title, platform } = await request.json();
        const account = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(account_id).first();

        if (platform === "tiktok") {
          const tiktokRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${account.access_token}`,
              "Content-Type": "application/json; charset=UTF-8"
            },
            body: JSON.stringify({
              post_info: { title, privacy_level: "SELF_ONLY", disable_duet: false, disable_comment: false },
              source_info: { source: "PULL_FROM_URL", video_url: video_url }
            })
          });
          const result = await tiktokRes.json();
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        }
      }

      // --- 6. SEO LOGIC ---
      if (url.pathname === "/api/generate-seo" && request.method === "POST") {
        const { prompt } = await request.json();
        const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages: [
            { role: "system", content: "Output ONLY raw JSON. Structure: { \"youtube\": {\"title\": \"\", \"description\": \"\", \"keywords\": \"\"}, \"tiktok\": {\"allInOne\": \"\"}, \"facebook\": {\"title\": \"\", \"descriptionAndTags\": \"\"} }." },
            { role: "user", content: `Viral 2026 SEO for: ${prompt}` }
          ]
        });

        const raw = aiResponse?.response || aiResponse;
        let parsed;
        try {
          parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch (e) {
          return new Response(JSON.stringify({ success: false, error: "AI parse failed", detail: e.message, raw }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const payload = {
          youtube: parsed?.youtube || {},
          tiktok: parsed?.tiktok || {},
          facebook: parsed?.facebook || {},
          raw: parsed,
        };

        return new Response(JSON.stringify({ success: true, ...payload }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response("Multipost API Active", { headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
