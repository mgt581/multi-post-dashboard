/**
 * SEO generation service using the OpenAI Responses API.
 * Compatible with Cloudflare Workers (uses fetch, not the openai npm package).
 *
 * @param {string} apiKey - OpenAI API key from env
 * @param {object} [input] - Optional input overrides
 * @returns {Promise<object>} The raw response from the Responses API
 */
export async function generateSeoWithStoredPrompt(apiKey, input = {}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: {
        id: "pmpt_69bb3de30e6c8190b0e48b46e4afd3ba043a4d710bb3ae18",
        version: "1"
      },
      ...input
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Responses API error ${response.status}: ${err}`);
  }

  return response.json();
}
