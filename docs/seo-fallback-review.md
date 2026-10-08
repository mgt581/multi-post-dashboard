# SEO fallback review

## Provider order

The production path remains OpenAI GPT-4o first, Cloudflare Workers AI second, and deterministic local output last. The response reports `provider`, `fallbackUsed`, and bounded telemetry containing model, attempts, duration, and prior failure reasons. It never includes credentials or request headers.

## Cloudflare model decision

Prices and the free allocation below were checked against Cloudflare's Workers AI pricing documentation on 8 October 2026.

| Model | Input / 1M tokens | Output / 1M tokens | Practical assessment |
| --- | ---: | ---: | --- |
| Llama 3.3 70B Instruct FP8 Fast | $0.293 | $2.253 | Selected for the text fallback. Best balance of instruction following, specific copy, JSON-mode support, and speed for short generations. |
| Llama 3.1 8B Instruct FP8 Fast | $0.045 | $0.384 | Much cheaper and faster, but more generic and less reliable across three platform formats. Useful only if cost becomes more important than quality. |
| DeepSeek R1 Distill Qwen 32B | $0.497 | $4.881 | Strong reasoning is unnecessary for this copy task; slower and more expensive, with no consistent SEO-quality gain. |
| Llama 3.2 11B Vision Instruct | $0.049 | $0.676 | Retained for image input because the selected 70B text model does not accept images. Text context is supplied alongside the image. |

Cloudflare includes 10,000 Neurons per day. Above that allowance, Workers Paid is required and usage is $0.011 per 1,000 Neurons. Llama 3.3 70B uses 26,668 Neurons per million input tokens and 204,805 per million output tokens. A representative request with 700 input and 350 output tokens is about 90 Neurons, so the free allocation is roughly 110 such generations per day. Actual usage varies with input and output length.

Safeguards in this change: output is capped at 850 tokens, only one validation retry is allowed, the paid OpenAI call is never retried into an unbounded loop, provider errors are bounded before logging or returning as telemetry, and Cloudflare dashboard Neuron alerts should be configured around 7,500 and 9,000 Neurons per day.

## Quality rules

The prompt now separates YouTube, TikTok, and Facebook requirements. It removes mandatory generic tags such as `#fyp`, prohibits unsupported claims and invented details, and gives category-specific guidance for gaming, local businesses, products, tutorials, and other factual content. Validation requires all six output fields, platform length limits, 8-15 YouTube keyword phrases, 3-5 TikTok hashtags, and 3-6 Facebook hashtags.

## Preview isolation

`wrangler.preview.toml` deploys a dedicated comparison Worker whose only binding is Workers AI. It has no D1 database, production route, publishing endpoint, OAuth setting, billing setting, or live frontend. Access requires the separately stored `SEO_PREVIEW_ACCESS_TOKEN`. The existing OpenAI key is injected from GitHub Actions secrets and is never printed or committed.
