export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---------------- CORS ----------------
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // ---------------- OAUTH START ----------------
    if (request.method === "GET" && url.pathname === "/oauth/start") {
      return oauthStart(env);
    }

    // ---------------- OAUTH CALLBACK ----------------
    if (request.method === "GET" && url.pathname === "/oauth/callback") {
      return oauthCallback(url);
    }

    // ---------------- SEO GENERATOR ----------------
    if (request.method !== "POST") {
      return json({ success: false, error: "POST only" }, 405);
    }

    try {
      const body = await request.json();
      const prompt = body?.prompt?.trim();
      if (!prompt) throw new Error("Missing prompt");

      const openaiResponse = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            input: `
Return ONLY valid JSON.

{
  "youtube": { "title": "", "description": "", "hashtags": "" },
  "tiktok": { "caption": "", "hashtags": "" },
  "instagram": { "caption": "", "hashtags": "" }
}

Topic:
${prompt}
            `,
          }),
        }
      );

      const raw = await openaiResponse.json();
      const text =
        raw?.output_text ||
        raw?.output?.[0]?.content?.[0]?.text ||
        "";

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = {
          youtube: { title: "", description: "", hashtags: "" },
          tiktok: { caption: "", hashtags: "" },
          instagram: { caption: "", hashtags: "" },
        };
      }

      return json({ success: true, data });
    } catch (err) {
      return json({
        success: false,
        error: err.message || "Worker error",
      });
    }
  },
};

// ---------------- OAUTH HELPERS ----------------
function oauthStart(env) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload",
    access_type: "offline",
    prompt: "consent",
  });

  return Response.redirect(
    "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString(),
    302
  );
}

function oauthCallback(url) {
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`OAuth error: ${error}`, { status: 400 });
  }

  if (!code) {
    return new Response("Missing authorization code", { status: 400 });
  }

  // Proof-of-life callback (token exchange comes next step)
  return new Response(
    `OAuth success. Authorization code received:\n\n${code}`,
    { status: 200 }
  );
}

// ---------------- UTIL ----------------
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
