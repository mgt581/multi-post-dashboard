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
    const frontendBaseUrl = env.FRONTEND_URL || HARD_DEFAULT_SITE;

    const requireUser = (val) => (val && typeof val === "string") ? val : null;

    try {
      // --- GET FOLDERS ---
      if (url.pathname === "/api/get-folders") {
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!userId) return new Response("Missing user_id", { status: 400, headers: corsHeaders });
        const { results } = await env.DB.prepare("SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // --- ADD FOLDER ---
      if (url.pathname === "/api/add-folder") {
        const { name, user_id } = await request.json();
        const userId = requireUser(user_id);
        if (!name || !userId) return new Response(JSON.stringify({ success: false, error: "Missing name or user_id" }), { status: 400, headers: corsHeaders });
        await env.DB.prepare("INSERT INTO folders (name, user_id) VALUES (?, ?)").bind(name, userId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // --- GET ACCOUNTS ---
      if (url.pathname === "/api/get-accounts") {
        const folder_id = url.searchParams.get("folder_id");
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!folder_id || !userId) return new Response(JSON.stringify([]), { headers: corsHeaders });
        const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE folder_id = ? AND user_id = ?").bind(folder_id, userId).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }

      // --- DELETE FOLDER / ACCOUNT ---
      if (url.pathname === "/api/delete-folder") {
        const { id, user_id, type } = await request.json();
        const userId = requireUser(user_id);
        if (!id || !userId) return new Response("Missing id or user_id", { status: 400, headers: corsHeaders });

        if (type === "account_only") {
          await env.DB.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?").bind(id, userId).run();
        } else {
          await env.DB.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").bind(id, userId).run();
          await env.DB.prepare("DELETE FROM accounts WHERE folder_id = ? AND user_id = ?").bind(id, userId).run();
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // --- AUTH REDIRECTS (Templates) ---
      if (url.pathname === "/api/auth/youtube") {
        const folderId = url.searchParams.get("folder_id");
        const userId = requireUser(url.searchParams.get("user_id"));
        // This is a placeholder for your actual OAuth flow logic
        return new Response("YouTube Auth Placeholder. Use your full OAuth logic here.", { status: 200, headers: corsHeaders });
      }

      if (!url.pathname.startsWith("/api/")) {
        return Response.redirect(frontendBaseUrl, 302);
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};

export { worker_default as default };
