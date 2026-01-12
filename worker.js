export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

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
        JSON.stringify({
          success: true,
          data: structured,
        }),
        {
          status: 200,
          headers: corsHeaders(),
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          success: false,
          error: err.message || "Worker error",
          data: {
            youtube: { title: "", description: "", hashtags: "" },
            tiktok: { caption: "", hashtags: "" },
            instagram: { caption: "", hashtags: "" },
          },
        }),
        {
          status: 200,
          headers: corsHeaders(),
        }
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
