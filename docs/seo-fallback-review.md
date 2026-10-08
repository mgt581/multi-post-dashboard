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

## Test results

Thirteen automated tests pass. They cover provider ordering, strict OpenAI and Cloudflare schemas, transient failure fallback, validation retry, deterministic final fallback, image normalization, structural repair, and generic-filler rejection. Both production and isolated-preview Worker bundles pass dry-run builds.

The final live comparison ran on 8 October 2026 against six scenarios: FIFA Street 2 on PS2, a Leeds bakery, a rechargeable desk fan, a bicycle inner-tube tutorial, an autumn woodland walk, and handmade-jewellery phone photography.

| Provider | Complete responses | Mean latency | Bounded relevance/format score |
| --- | ---: | ---: | ---: |
| Current production OpenAI baseline | 6/6 | 2.39 s | 70.0/100 |
| Improved Llama 3.3 70B fallback | 6/6 | 6.35 s | 89.3/100 |

The bounded score checks whether supplied topic terms survive, whether titles are distinct by platform, and whether banned filler such as `#fyp`, `#viral`, `must watch`, and unsupported clickbait appears. It is a regression signal, not a general measure of writing quality. OpenAI was faster and more expressive; the improved Cloudflare output was more literal, consistently formatted, and avoided the generic mandatory hashtags present in the current production OpenAI prompt.

A separate single-run model comparison found that Llama 3.1 8B was faster but sometimes invented claims such as a bakery being “famous” or labelled a product demo as a “review.” DeepSeek R1 32B was much slower and introduced details such as editing steps that were not supplied. Llama 3.3 70B was the most conservative option; deterministic structural repair now handles its occasional short or malformed hashtag sections.

## Preview isolation

`wrangler.preview.toml` deploys a dedicated comparison Worker whose only binding is Workers AI. It has no D1 database, production route, publishing endpoint, OAuth setting, billing setting, or live frontend. Access requires the separately stored `SEO_PREVIEW_ACCESS_TOKEN`. The existing OpenAI key is injected from GitHub Actions secrets and is never printed or committed.

If GitHub Actions cannot inject that secret, the preview obtains the OpenAI comparison from the existing production generation-only endpoint. It rejects any response whose reported provider is not `openai`. This path does not call publishing, OAuth, billing, or database routes and cannot read or write user data.
