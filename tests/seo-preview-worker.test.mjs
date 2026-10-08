import test from "node:test";
import assert from "node:assert/strict";
import worker from "../seo-preview-worker.mjs";

const cookie = { cookie: "seo_preview=test-token" };
const validSeo = {
  youtube: {
    title: "FIFA Street 2 PS2 Gameplay and Skills",
    description: "FIFA Street 2 gameplay on PlayStation 2 featuring street football matches and skill moves from the supplied video details.",
    keywords: "FIFA Street 2, FIFA Street 2 PS2, PS2 gameplay, street football, FIFA skills, football games, retro gaming, PlayStation 2"
  },
  tiktok: { allInOne: "FIFA Street 2 skills on PS2 #FIFAStreet2 #PS2Gaming #StreetFootball" },
  facebook: { title: "FIFA Street 2 on PS2", descriptionAndTags: "Street football skills and matches from FIFA Street 2 on PS2.\n\n#FIFAStreet2 #PS2Gaming #StreetFootball" }
};

test("private preview presents two independent provider buttons", async () => {
  const response = await worker.fetch(new Request("https://preview.example/", { headers: cookie }), { PREVIEW_ACCESS_TOKEN: "test-token" });
  const html = await response.text();
  assert.match(html, /Generate with OpenAI GPT-4o/);
  assert.match(html, /Generate with Cloudflare Llama 3\.3 70B/);
  assert.doesNotMatch(html, /Generate with local/);
  const script = html.match(/<script>([\s\S]+)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("Cloudflare comparison request is pinned and never falls back", async () => {
  const request = new Request("https://preview.example/api/generate", {
    method: "POST",
    headers: { ...cookie, "content-type": "application/json" },
    body: JSON.stringify({ provider: "cloudflare", topic: "FIFA Street 2 PS2 gameplay" })
  });
  const response = await worker.fetch(request, { PREVIEW_ACCESS_TOKEN: "test-token", AI: { run: async () => { throw new Error("Cloudflare unavailable"); } } });
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.match(body.error, /cloudflare failed/i);
  assert.doesNotMatch(JSON.stringify(body), /"provider":"local"/);
});

test("Cloudflare comparison reports the actual provider and model", async () => {
  const request = new Request("https://preview.example/api/generate", {
    method: "POST",
    headers: { ...cookie, "content-type": "application/json" },
    body: JSON.stringify({ provider: "cloudflare", topic: "FIFA Street 2 PS2 gameplay" })
  });
  const response = await worker.fetch(request, { PREVIEW_ACCESS_TOKEN: "test-token", AI: { run: async () => ({ response: JSON.stringify(validSeo) }) } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.provider, "cloudflare");
  assert.equal(body.telemetry.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
});
