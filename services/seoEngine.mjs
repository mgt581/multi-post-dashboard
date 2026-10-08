const OPENAI_MODEL = "gpt-4o-2024-08-06";
const CLOUDFLARE_TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CLOUDFLARE_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

export const SEO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["youtube", "tiktok", "facebook"],
  properties: {
    youtube: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "keywords"],
      properties: {
        title: { type: "string", minLength: 20, maxLength: 70 },
        description: { type: "string", minLength: 80, maxLength: 500 },
        keywords: { type: "string", minLength: 20, maxLength: 500 }
      }
    },
    tiktok: {
      type: "object",
      additionalProperties: false,
      required: ["allInOne"],
      properties: { allInOne: { type: "string", minLength: 20, maxLength: 150 } }
    },
    facebook: {
      type: "object",
      additionalProperties: false,
      required: ["title", "descriptionAndTags"],
      properties: {
        title: { type: "string", minLength: 15, maxLength: 70 },
        descriptionAndTags: { type: "string", minLength: 50, maxLength: 500 }
      }
    }
  }
};

const SYSTEM_PROMPT = `You create accurate social metadata from only the facts supplied by the user or visibly present in an attached image.

Write distinct copy for each platform:
- YouTube title: lead with the exact searchable subject, 45-65 characters where natural. Description: 2 concise sentences, 100-300 characters. Keywords: 8-15 comma-separated phrases ordered from precise to broader discovery terms.
- TikTok allInOne: a natural hook plus 3-5 specific hashtags, maximum 150 characters. Do not force #fyp, #viral, or #trending unless those terms are genuinely relevant.
- Facebook title: clear and shareable, 30-60 characters where natural. descriptionAndTags: useful context followed by a blank line and 3-6 specific hashtags.

Adapt to the content category. Gaming copy should name the game, platform, mode or moment supplied. Local-business copy should name the service and location supplied. Product copy should focus on stated features and use cases. Tutorials should state the outcome and method.

Accuracy and quality rules:
- Never invent locations, prices, results, product features, people, gameplay events, dates, trends, or claims.
- Never claim content is live, new, official, best, proven, or viral unless the input says so.
- Avoid filler such as exciting, amazing, must watch, game-changing, ultimate, you won't believe, and generic calls for likes or follows.
- Prefer concrete search phrases over broad social-media tags.
- Do not repeat the same opening, title, or hashtag set across platforms.
- Return only the requested JSON object.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hashtagCount(value) {
  return (String(value).match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
}

function validateSeo(value) {
  const errors = [];
  const yt = value?.youtube;
  const tt = value?.tiktok;
  const fb = value?.facebook;
  if (!yt || !tt || !fb) errors.push("all platform objects are required");
  const fields = [
    ["youtube.title", yt?.title, 20, 70],
    ["youtube.description", yt?.description, 80, 500],
    ["youtube.keywords", yt?.keywords, 20, 500],
    ["tiktok.allInOne", tt?.allInOne, 20, 150],
    ["facebook.title", fb?.title, 15, 70],
    ["facebook.descriptionAndTags", fb?.descriptionAndTags, 50, 500]
  ];
  for (const [name, raw, min, max] of fields) {
    const valueText = text(raw);
    if (valueText.length < min || valueText.length > max) errors.push(`${name} must be ${min}-${max} characters`);
  }
  const keywords = String(yt?.keywords || "").split(",").map(text).filter(Boolean);
  if (keywords.length < 8 || keywords.length > 15) errors.push("youtube.keywords must contain 8-15 phrases");
  const tikTokTags = hashtagCount(tt?.allInOne);
  if (tikTokTags < 3 || tikTokTags > 5) errors.push("tiktok.allInOne must contain 3-5 hashtags");
  const facebookTags = hashtagCount(fb?.descriptionAndTags);
  if (facebookTags < 3 || facebookTags > 6) errors.push("facebook.descriptionAndTags must contain 3-6 hashtags");
  return errors;
}

function cleanSeo(value) {
  return {
    youtube: {
      title: text(value.youtube.title),
      description: text(value.youtube.description),
      keywords: String(value.youtube.keywords).split(",").map(text).filter(Boolean).join(", ")
    },
    tiktok: { allInOne: text(value.tiktok.allInOne) },
    facebook: {
      title: text(value.facebook.title),
      descriptionAndTags: String(value.facebook.descriptionAndTags).trim().replace(/\n{3,}/g, "\n\n")
    }
  };
}

function fillRelevantHashtags(value) {
  const copy = structuredClone(value);
  const keywordTags = String(copy?.youtube?.keywords || "").split(",").map(text).filter(Boolean)
    .map((keyword) => `#${keyword.replace(/[^\p{L}\p{N}]/gu, "")}`).filter((tag) => tag.length > 2);
  for (const [platform, field, minimum] of [["tiktok", "allInOne", 3], ["facebook", "descriptionAndTags", 3]]) {
    let current = String(copy?.[platform]?.[field] || "").trim();
    const existing = new Set((current.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase()));
    for (const tag of keywordTags) {
      if (hashtagCount(current) >= minimum) break;
      if (!existing.has(tag.toLowerCase())) current += ` ${tag}`;
    }
    copy[platform][field] = current;
  }
  return copy;
}

function parseModelOutput(result) {
  if (result && typeof result === "object" && result.youtube) return result;
  const raw = typeof result === "string"
    ? result
    : result?.response ?? result?.result?.response ?? result?.choices?.[0]?.message?.content;
  if (raw && typeof raw === "object") return raw;
  const source = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model returned no JSON object");
  return JSON.parse(source.slice(start, end + 1));
}

function brandContext(input) {
  const parts = [
    input.folderName && `Brand/channel: ${input.folderName}`,
    input.youtubeChannel && `YouTube channel: ${input.youtubeChannel}`,
    input.facebookAccount && `Facebook account: ${input.facebookAccount}`,
    input.tiktokAccount && `TikTok account: ${input.tiktokAccount}`
  ].filter(Boolean);
  return parts.length ? `Account context (use only when relevant): ${parts.join("; ")}.\n\n` : "";
}

function userPrompt(input, repairErrors = []) {
  const topic = text(input.topic) || "Describe only what can be confirmed from the image.";
  const repair = repairErrors.length
    ? `\n\nYour previous result failed validation: ${repairErrors.join("; ")}. Return a corrected complete object.`
    : "";
  return `${brandContext(input)}Content supplied by the user:\n${topic}${repair}`;
}

async function retry(operation, { attempts = 2 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(200 * attempt);
    }
  }
  throw lastError;
}

async function callOpenAI(env, input, repairErrors) {
  if (!env.OPENAI_API_KEY) throw new Error("OpenAI is not configured");
  const content = [{ type: "text", text: userPrompt(input, repairErrors) }];
  if (input.imageDataUrl) content.unshift({ type: "image_url", image_url: { url: input.imageDataUrl } });
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.35,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: input.imageDataUrl ? content : content[0].text }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "social_seo", strict: true, schema: SEO_SCHEMA }
      }
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`OpenAI API ${response.status}: ${detail.slice(0, 180)}`);
    error.status = response.status;
    throw error;
  }
  return parseModelOutput(await response.json());
}

async function callCloudflare(env, input, repairErrors, model = CLOUDFLARE_TEXT_MODEL) {
  if (!env.AI?.run) throw new Error("Cloudflare Workers AI is not configured");
  const hasImage = Boolean(input.imageBase64);
  const request = {
    messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt(input, repairErrors) }],
    temperature: 0.35,
    max_tokens: 850
  };
  if (hasImage) request.images = [{ data: input.imageBase64, mimeType: input.imageMimeType || "image/jpeg" }];
  if (!hasImage) request.response_format = { type: "json_schema", json_schema: SEO_SCHEMA };
  return parseModelOutput(await env.AI.run(hasImage ? CLOUDFLARE_VISION_MODEL : model, request));
}

async function generateValidated(provider, env, input, options = {}) {
  const startedAt = Date.now();
  let validationErrors = [];
  let attempts = 0;
  const data = await retry(async () => {
    attempts += 1;
    const rawCandidate = provider === "openai"
      ? await callOpenAI(env, input, validationErrors)
      : await callCloudflare(env, input, validationErrors, options.cloudflareModel);
    const candidate = fillRelevantHashtags(rawCandidate);
    validationErrors = validateSeo(candidate);
    if (validationErrors.length) throw new Error(`Invalid SEO output: ${validationErrors.join("; ")}`);
    return cleanSeo(candidate);
  });
  return { data, attempts, durationMs: Date.now() - startedAt };
}

export function makeLocalFallback(topic) {
  const subject = text(topic) || "Short video";
  const title = subject.length > 62 ? `${subject.slice(0, 59).trim()}…` : subject;
  const terms = [...new Set(subject.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter((word) => word.length > 2))].slice(0, 10);
  const tags = terms.slice(0, 4).map((word) => `#${word.replace(/-/g, "")}`).join(" ") || "#video #creator #content";
  return {
    youtube: {
      title,
      description: `${subject}. This description uses only the details supplied and can be edited before publishing.`,
      keywords: [...terms, "video guide", "creator video"].slice(0, 10).join(", ")
    },
    tiktok: { allInOne: `${title} ${tags}`.slice(0, 150) },
    facebook: { title, descriptionAndTags: `${subject}.\n\n${tags}` }
  };
}

export async function generateSeo(env, input, options = {}) {
  const order = options.provider ? [options.provider] : ["openai", "cloudflare"];
  const failures = [];
  for (const provider of order) {
    try {
      const result = await generateValidated(provider, env, input, options);
      return {
        success: true,
        data: result.data,
        provider,
        fallbackUsed: provider !== "openai",
        telemetry: { provider, model: provider === "openai" ? OPENAI_MODEL : (input.imageBase64 ? CLOUDFLARE_VISION_MODEL : (options.cloudflareModel || CLOUDFLARE_TEXT_MODEL)), attempts: result.attempts, durationMs: result.durationMs, failures }
      };
    } catch (error) {
      failures.push({ provider, reason: String(error?.message || error).slice(0, 240) });
      console.error("SEO provider failed", { provider, reason: failures.at(-1).reason });
    }
  }
  if (options.provider) throw new Error(`${options.provider} failed: ${failures[0]?.reason || "unknown error"}`);
  return {
    success: true,
    data: makeLocalFallback(input.topic),
    provider: "local",
    fallbackUsed: true,
    telemetry: { provider: "local", model: "deterministic-v2", attempts: 0, durationMs: 0, failures }
  };
}

export async function normalizeSeoInput(payload = {}) {
  const imageBase64 = payload.image_base64 || "";
  const extension = String(payload.image_filename || "").toLowerCase().split(".").pop();
  const imageMimeType = extension === "png" ? "image/png" : "image/jpeg";
  const normalized = {
    topic: payload.topic ?? payload.prompt ?? "",
    folderName: payload.folder_name || "",
    youtubeChannel: payload.youtube_channel || "",
    facebookAccount: payload.facebook_account || "",
    tiktokAccount: payload.tiktok_account || "",
    imageBase64,
    imageMimeType,
    imageDataUrl: payload.image_url || (imageBase64 ? `data:${imageMimeType};base64,${imageBase64}` : "")
  };
  if (!normalized.imageBase64 && normalized.imageDataUrl && !normalized.imageDataUrl.startsWith("data:")) {
    const response = await fetch(normalized.imageDataUrl);
    if (!response.ok) throw new Error(`Image download failed with status ${response.status}`);
    const mime = (response.headers.get("content-type") || "image/jpeg").split(";")[0];
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    normalized.imageBase64 = btoa(binary);
    normalized.imageMimeType = mime;
    normalized.imageDataUrl = `data:${mime};base64,${normalized.imageBase64}`;
  } else if (normalized.imageDataUrl.startsWith("data:") && !normalized.imageBase64) {
    const match = normalized.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      normalized.imageMimeType = match[1];
      normalized.imageBase64 = match[2];
    }
  }
  return normalized;
}

export const SEO_MODELS = { openai: OPENAI_MODEL, cloudflareText: CLOUDFLARE_TEXT_MODEL, cloudflareVision: CLOUDFLARE_VISION_MODEL };
