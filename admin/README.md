# Multi Post private analytics preview

Separate Cloudflare Pages project, separate preview Worker and isolated preview D1. No main/production deployment or production migrations are part of this branch.

## Current deployment

- Admin preview alias: https://feat-private-admin-analytics.multipost-private-admin.pages.dev
- Preview API Worker: https://multipost-analytics-review-20261007.alexbryant.workers.dev
- Database: multipost-analytics-preview-20261007 (`32bc5623-7df0-47e6-8954-144db86d3f6f`)
- Branch: feat/private-admin-analytics-20261007

Access environment settings are deliberately blank. All pages, assets, APIs and CSV exports deny requests until validated Access JWT settings and an admin email allowlist are configured. A Pages URL does not imply that an Access edge application/policy has been provisioned.

## Finish Access configuration

An account administrator must create a Cloudflare Access self-hosted application covering both the branch alias and deployment preview hosts (and any future custom hostname). Set an allow policy limited to intended admin emails, no public/bypass policy. Enable Pages preview Access protection where available. Configure preview-only `ACCESS_TEAM_DOMAIN` (hostname, no scheme), `ACCESS_AUD` (that application's audience), and `ADMIN_EMAILS` (comma-separated emails) in admin/wrangler.toml and redeploy the branch preview. If hosts use different Access application audiences, deploy separate configurations or use a single application covering them. Never commit service tokens or other secrets. The current Wrangler OAuth scope list has no Access policy write permission.

The middleware independently validates RS256 signature, key ID, issuer, audience, expiration, issue time, not-before and allowlisted email. Missing config/JWT, invalid claims/signatures, certificate fetch failure and unknown admins fail closed. There is no development bypass in deployed code.

Official reference: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

## Safe preview deployment

From repository root: `npm ci`, `npm test`, `npx wrangler deploy --config wrangler.analytics-preview.toml`.
From `admin/`: `npx wrangler pages deploy public --project-name multipost-private-admin --branch feat-private-admin-analytics-20261007`.

Do NOT use the repository's normal deploy or `--env preview`: those existing configurations reference production D1. Do NOT apply migration 0008 to production as part of this preview. The isolated database has schema.sql and migration 0008 applied; it contains no copied production customer records or OAuth credentials. No OAuth/API/billing secrets have been provisioned on the new Worker. Production continues running its existing code and does not send telemetry to this preview.

## Data and instrumentation

`ANALYTICS_ENABLED=true` enables background, best-effort D1 telemetry. Unset/false disables it. The existing production configuration is unchanged and does not enable it. `ctx.waitUntil` schedules writes; write failures are caught and cannot alter API results. This means telemetry is not guaranteed exactly-once or durable during D1 outages. Failures are not logged with sensitive bodies.

`analytics_seo_events` stores an event UUID, folder-owner internal ID when an existing folder is found, explicit unverified/unattributed status, timestamp, provider used, providers attempted, nullable success and safe error categories for each remote provider, local fallback flag, elapsed duration, actual text/image mode, selected model, overall outcome, returned OpenAI input/output/total tokens and estimated USD cost. Returned usage is retained even if OpenAI output parsing fails and another provider succeeds. No prompt, response, brand name, image or image URL is stored.

`analytics_activity` stores known existing internal IDs carried by the request, backend activity/publishing-request classification, platform, timestamp, HTTP success and status class. It does not parse or retain request/response bodies. Existing `billing_usage_events` provide a separately labelled publishing usage view. Upload initiation and 2xx are not proof of a completed publish.

Safe error categories: authentication, rate_limit, provider_unavailable, invalid_request, invalid_output, timeout, provider_error. No exception messages or raw upstream error bodies are written into analytics. SEO provider failure logs now use those categories.

Read-only explicit column queries reuse folders, accounts, billing_subscriptions and billing_usage_events. Token fields, Stripe IDs, emails, payment data, passwords and secret headers are not selected by the reporting endpoint. Stored platform links mean connected records exist, not that credentials are still valid.

Firebase sign-in/signup occurs entirely client-side. Backend user IDs are currently client supplied and not authenticated assertions. Signup dates, verified sign-ins and acquisition sources cannot be reconstructed safely from this repo without extra infrastructure or frontend changes; they are explicitly unavailable. First folder date is separately labelled and never presented as signup. SEO already sends folder_id, so folder-owner attribution requires no frontend change, but it is unverified. Last backend activity includes SEO and observed requests.

Pricing is configured in `ANALYTICS_MODEL_PRICING`: JSON keyed by the requested OpenAI model, with input_per_million and output_per_million USD rates. Preview uses GPT-4o standard uncached rates of $2.50/$10.00 per million tokens, checked 2026-10-07 at https://developers.openai.com/api/docs/models/gpt-4o . This is an estimate, excludes cached-input discounts, taxes and other billing adjustments, and is not an invoice. Unknown usage or missing pricing remains null; no fabricated zero cost. Cloudflare/local costs are not estimated.

## Privacy, retention and exports

Admin reporting is read-only and same-origin. No CORS allowances, external analytics or third-party scripts are included. UI values use textContent, queries use bound parameters, and CSV values are quoted with formula-leading characters neutralized. All responses are no-store with CSP, frame denial, no-referrer and nosniff headers. Export is subject to the same Access middleware.

Date windows are 1–90 days. User/event lists and CSV exports are capped at 1,000 records and labelled accordingly; SEO provider summary aggregates the full selected window. This is a bounded preview, not a bulk historical export system. Current user/connection cards reflect the returned directory and are capped at 1,000.

Before enabling any production instrumentation (outside this request), approve retention and privacy policy alignment. Suggested operational retention is 90 days: delete older analytics_activity/analytics_seo_events with a scheduled job, and support erasing records by internal user ID. No production retention job or existing billing/account deletion behavior was changed. Restrict CSV handling as customer activity data; do not upload it to public repositories.

## Validation and limitations

18 tests cover fallback providers, malformed requests, nullable pricing, telemetry failure isolation, real SQLite migrations/report queries, secret exclusion, JWT validation and fail-closed behavior, CSV injection prevention, existing Facebook scope/readiness tests and exact equality of the protected Worker implementation region against origin/main.

Synthetic-data browser QA checks overview, search filtering, individual-user view and mobile layout. Screenshots contain demo users only. Styling follows the requested navy/gold palette; the Bryant reference dashboard was not available for exact visual matching.

The existing dependency tree reports four high-severity development-tool advisories; no dependency versions were changed. Updating the shared deployment tool is a separate maintenance decision. No live OAuth or publishing tests were run against third-party accounts during this preview.
