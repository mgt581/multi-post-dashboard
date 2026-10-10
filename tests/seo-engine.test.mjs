import test from "node:test";
import assert from "node:assert/strict";
import { generateSeo, makeLocalFallback, normalizeSeoInput, SEO_MODELS, SEO_SCHEMA, MAX_SEO_IMAGE_BYTES } from "../services/seoEngine.mjs";

const validSeo = {
  youtube: {
    title: "FIFA Street 2 PS2 Skills and Match Gameplay",
    description: "Watch FIFA Street 2 gameplay on PS2, featuring street football matches and skill moves. See how the classic game plays on original hardware.",
    keywords: "FIFA Street 2, FIFA Street 2 PS2, PS2 gameplay, street football game, FIFA gameplay, retro football games, PlayStation 2 games, EA Sports Big"
  },
  tiktok: { allInOne: "FIFA Street 2 skills on PS2 ⚽ #FIFAStreet2 #PS2Gaming #RetroGaming" },
  facebook: {
    title: "FIFA Street 2 Gameplay on PS2",
    descriptionAndTags: "Street football matches and skill moves from FIFA Street 2 on PlayStation 2.\n\n#FIFAStreet2 #PS2Gaming #RetroFootball"
  }
};

function openAiResponse(data = validSeo, status = 200) {
  return new Response(JSON.stringify(status === 200
    ? { choices: [{ message: { content: JSON.stringify(data) } }] }
    : { error: { message: "failed" } }), { status, headers: { "content-type": "application/json" } });
}

test("uses pinned GPT-4o structured output before Cloudflare", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return openAiResponse();
  };
  let cloudflareCalls = 0;
  try {
    const result = await generateSeo({ OPENAI_API_KEY: "test", AI: { run: async () => { cloudflareCalls += 1; } } }, { topic: "FIFA Street 2 PS2 gameplay" });
    assert.equal(result.provider, "openai");
    assert.equal(result.telemetry.model, SEO_MODELS.openai);
    assert.equal(requestBody.response_format.type, "json_schema");
    assert.equal(requestBody.response_format.json_schema.strict, true);
    assert.deepEqual(requestBody.response_format.json_schema.schema, SEO_SCHEMA);
    assert.equal(cloudflareCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to Cloudflare and supplies its JSON schema", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => openAiResponse({}, 429);
  let cloudflareRequest;
  try {
    const result = await generateSeo({ OPENAI_API_KEY: "test", AI: { run: async (_model, request) => {
      cloudflareRequest = request;
      return { response: JSON.stringify(validSeo) };
    } } }, { topic: "FIFA Street 2 PS2 gameplay" });
    assert.equal(result.provider, "cloudflare");
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.telemetry.failures[0].provider, "openai");
    assert.equal(cloudflareRequest.response_format.type, "json_schema");
    assert.deepEqual(cloudflareRequest.response_format.json_schema, SEO_SCHEMA);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retries output that fails complete-field validation", async () => {
  let attempts = 0;
  const result = await generateSeo({ AI: { run: async () => {
    attempts += 1;
    return { response: JSON.stringify(attempts === 1 ? { youtube: { title: "partial" } } : validSeo) };
  } } }, { topic: "FIFA Street 2 PS2 gameplay" }, { provider: "cloudflare" });
  assert.equal(attempts, 2);
  assert.equal(result.telemetry.attempts, 2);
});

test("repairs a short Facebook caption from supplied facts", async () => {
  const shortFacebook = structuredClone(validSeo);
  shortFacebook.facebook.descriptionAndTags = "#FIFAStreet2 #PS2Gaming";
  const result = await generateSeo({ AI: { run: async () => ({ response: JSON.stringify(shortFacebook) }) } }, { topic: "FIFA Street 2 PS2 gameplay featuring street football skills and matches" }, { provider: "cloudflare" });
  assert.equal(result.telemetry.attempts, 1);
  assert.match(result.data.facebook.descriptionAndTags, /FIFA Street 2 PS2 gameplay/);
  assert.ok((result.data.facebook.descriptionAndTags.match(/#/g) || []).length >= 3);
});

test("uses deterministic local output only after both providers fail", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => openAiResponse({}, 500);
  try {
    const result = await generateSeo({ OPENAI_API_KEY: "test", AI: { run: async () => { throw new Error("AI unavailable"); } } }, { topic: "Bicycle inner tube tutorial" });
    assert.equal(result.provider, "local");
    assert.deepEqual(result.telemetry.failures.map(({ provider }) => provider), ["openai", "cloudflare"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizes uploaded image input without exposing credentials", async () => {
  const input = await normalizeSeoInput({ prompt: "Product demo", image_base64: "YWJj", image_filename: "demo.png" });
  assert.equal(input.topic, "Product demo");
  assert.equal(input.imageMimeType, "image/png");
  assert.equal(input.imageDataUrl, "data:image/png;base64,YWJj");
});

test("passes an AI-compatible image to both OpenAI and Cloudflare vision", async () => {
  const dataUrl = "data:image/jpeg;base64,/9j/2Q==";
  const input = await normalizeSeoInput({ topic: "Phone photo", image_url: dataUrl });
  const originalFetch = globalThis.fetch;
  let openAiImage;
  globalThis.fetch = async (_url, init) => {
    openAiImage = JSON.parse(init.body).messages[1].content[0].image_url.url;
    return openAiResponse();
  };
  try {
    const openAi = await generateSeo({ OPENAI_API_KEY: "test" }, input, { provider: "openai" });
    assert.equal(openAi.provider, "openai");
    assert.equal(openAiImage, dataUrl);
  } finally {
    globalThis.fetch = originalFetch;
  }
  let cloudflareModel;
  let cloudflareImage;
  const cloudflare = await generateSeo({ AI: { run: async (model, request) => {
    cloudflareModel = model;
    cloudflareImage = request.images[0];
    return { response: JSON.stringify(validSeo) };
  } } }, input, { provider: "cloudflare" });
  assert.equal(cloudflare.provider, "cloudflare");
  assert.equal(cloudflareModel, SEO_MODELS.cloudflareVision);
  assert.deepEqual(cloudflareImage, { data: "/9j/2Q==", mimeType: "image/jpeg" });
});

test("rejects oversized, malformed and HEIC image payloads before calling AI", async () => {
  await assert.rejects(
    normalizeSeoInput({ image_url: `data:image/jpeg;base64,${"A".repeat(Math.ceil((MAX_SEO_IMAGE_BYTES + 1) * 4 / 3))}` }),
    /too large/i
  );
  await assert.rejects(normalizeSeoInput({ image_url: "data:image/heic;base64,YWJj" }), /converted in the browser/i);
  await assert.rejects(normalizeSeoInput({ image_url: "data:image/jpeg,not-base64" }), /invalid/i);
});

test("local fallback avoids generic viral and engagement filler", () => {
  const output = JSON.stringify(makeLocalFallback("Handmade jewellery phone photography tutorial")).toLowerCase();
  for (const phrase of ["must watch", "viral", "trending", "fyp", "like and follow"]) assert.equal(output.includes(phrase), false);
});
