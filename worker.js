export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ----------------------------
    // CORS preflight
    // ----------------------------
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // ----------------------------
    // OAuth START
    // ----------------------------
    if (request.method === "GET" && url.pathname === "/oauth/start") {
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: [
          "https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly",
        ].join(" "),
        access_type: "offline",
        prompt: "consent",
      });

      return Response.redirect(
        `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        302
      );
    }

    // ----------------------------
    // OAuth CALLBACK
    // ----------------------------
    if (request.method === "GET" && url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        return new Response(`OAuth error: ${error}`, { status: 400 });
      }

      if (!code) {
        return new Response("Missing code", { status: 400 });
      }

      // For now: just confirm OAuth worked
      return new Response(
        `OAuth success 🎉\n\nAuth code:\n${code}`,
        { status: 200 }
      );
    }

    // ----------------------------
    // SEO GENERATOR (existing logic)
    // ----------------------------
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "POST only" }),
        { status: 405, headers: corsHeaders() }
      );
    }

    try {
      const body = await request.json();
      const prompt = body?.prompt?.trim();

      if (!prompt) {
        throw new Error("Missing prompt");
      }

      const openaiResponse = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            input: `
Return ONLY valid JSON in this exact structure.
Do not include markdown. Do not include commentary.

{
  "youtube": {
    "title": "",
    "description": "",
    "hashtags": ""
  },
  "tiktok": {
    "caption": "",
    "hashtags": ""
  },
  "instagram": {
    "caption": "",
    "hashtags": ""
  }
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

      let structured;
      try {
        structured = JSON.parse(text);
      } catch {
        structured = {
          youtube: { title: "", description: "", hashtags: "" },
          tiktok: { caption: "", hashtags: "" },
          instagram: { caption: "", hashtags: "" },
        };
      }

      return new Response(
        JSON.stringify({ success: true, data: structured }),
        { status: 200, headers: corsHeaders() }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          success: false,
          error: err.message || "Worker error",
        }),
        { status: 200, headers: corsHeaders() }
      );
    }
  },
};

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
}
