# Multi Post private operational analytics

Separate Cloudflare Pages admin project. On 2026-10-07 the user explicitly authorized production passive analytics, following the isolated preview. Main has not been merged and the customer frontend has not been deployed or edited.

## Current deployment

- Admin preview alias: https://feat-private-admin-analytics.multipost-private-admin.pages.dev
- Live backend: existing `multipost-seo-worker`, routed to multipostapp.co.uk/api and /api/* (including www).
- Live version: `b32536e1-88ff-4f46-9013-fded28be2c5a`, 100% traffic.
- Admin deployment: https://51680f85.multipost-private-admin.pages.dev
- Database: existing accountsmultipostapp (`19dfae46-a6cb-4e88-ab7c-2ab2fea3279a`).
- Isolated preview Worker/database remain available through wrangler.analytics-preview.toml.
- Branch: feat/private-admin-analytics-20261007

Cloudflare Access is configured for `*.multipost-private-admin.pages.dev` using the existing `mrwhite.cloudflareaccess.com` team. The sole allowed email is `alexbryantwork3234@outlook.com`; login uses the existing One-time PIN identity provider, with a 24-hour application session. Application ID: `cd1354ce-0994-434e-8be3-d4eebd5d447a`; dedicated policy ID: `62c0f3f2-738a-4e2f-ab33-f6a7713c14c6`. All pages, assets, APIs and CSV exports require a validated Access JWT and the admin allowlist. The root production Pages hostname is not deployed; the middleware also denies unauthenticated direct requests.

## Access configuration

The saved self-hosted application covers both the branch alias and all immutable preview deployment hosts. Its dedicated Allow policy includes only the exact owner email, and accepts only One-time PIN. No public/bypass policy was added. `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `ADMIN_EMAILS` are set in admin/wrangler.toml. Future custom hostnames need equivalent Access protection before deployment. Never commit service tokens or other secrets. Access was provisioned through the signed-in Cloudflare dashboard because Wrangler OAuth lacks Access policy write scope. The user confirmed the exact email-only grant before application creation.

The middleware independently validates RS256 signature, key ID, issuer, audience, expiration, issue time, not-before and allowlisted email. Missing config/JWT, invalid claims/signatures, certificate fetch failure and unknown admins fail closed. There is no development bypass in deployed code.

Official reference: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

## Deployment and rollback

From repository root: `npm ci`, `npm test`, `npx wrangler deploy --config wrangler.analytics-preview.toml`.
From `admin/`: `npx wrangler pages deploy public --project-name multipost-private-admin --branch feat-private-admin-analytics-20261007`.

Production rollout used `wrangler versions upload --keep-vars` followed by an explicit `versions deploy` of the version above. All existing bindings and secret names were compared with the previously deployed version and unchanged. No trigger deployment or route changes were made. Only ANALYTICS_ENABLED and configured model pricing were added.

Migrations 0008 and 0009 were executed as individual additive SQL statements using the D1 query API. Existing user/account/billing tables were untouched. Do not apply the entire original schema or unrelated pending migrations to live D1. These manual applications are not recorded in the D1 migration journal; inspect existing analytics tables/columns before applying migrations again.

To roll back passive production collection without touching customer data: `npx wrangler versions deploy 29e6ab1c-5633-44d1-972f-12751f68a35b@100 --yes --env ''`. This is the exact pre-rollout production version. Keep analytics tables for review; rollback does not require destructive schema changes. To isolate the admin again, restore its isolated preview D1 binding and redeploy only the separate admin Pages project. Existing Access protection must remain enabled.

## Data and instrumentation

`ANALYTICS_ENABLED=true` enables background, best-effort D1 telemetry. Unset/false disables it. The production configuration now enables it as authorized. `ctx.waitUntil` schedules writes; write failures are caught and cannot alter API results. This means telemetry is not guaranteed exactly-once or durable during D1 outages. Failures are not logged with sensitive bodies.

`analytics_seo_events` stores an event UUID, folder-owner internal ID when an existing folder is found, explicit unverified/unattributed status, timestamp, provider used, providers attempted, nullable success and safe error categories for each remote provider, local fallback flag, elapsed duration, actual text/image mode, selected model, overall outcome, returned OpenAI input/output/total tokens and estimated USD cost. Returned usage is retained even if OpenAI output parsing fails and another provider succeeds. No prompt, response, brand name, image or image URL is stored.

`analytics_activity` stores known existing internal IDs carried by the request, backend activity/publishing-request classification, platform, timestamp, HTTP success and status class. Bounded JSON responses are inspected in memory only for allowlisted publishing outcomes; the generic post-video request is also inspected for existing user/platform attribution. Bodies are never retained. Separate fields record request outcome, endpoint stage and reported publishing state. Pending uploads are never labelled completed publishes. Existing `billing_usage_events` provide a separately labelled publishing usage view. Upload initiation and 2xx are not proof of a completed publish.

Safe error categories: authentication, rate_limit, provider_unavailable, invalid_request, invalid_output, timeout, provider_error. No exception messages or raw upstream error bodies are written into analytics. SEO provider failure logs now use those categories.

Read-only explicit column queries reuse folders, accounts, billing_subscriptions and billing_usage_events. Token fields, Stripe IDs, dedicated email fields, payment data, passwords and secret headers are not selected by the reporting endpoint. Stored platform links mean connected records exist, not that credentials are still valid.

Firebase sign-in/signup occurs entirely client-side. Backend user IDs are currently client supplied and not authenticated assertions. Signup dates, verified sign-ins and acquisition sources cannot be reconstructed safely from this repo without extra infrastructure or frontend changes; they are explicitly unavailable. First folder date is separately labelled and never presented as signup. SEO already sends folder_id, so folder-owner attribution requires no frontend change, but it is unverified. Last backend activity includes SEO and observed requests.

Pricing is configured in `ANALYTICS_MODEL_PRICING`: JSON keyed by the requested OpenAI model, with input_per_million and output_per_million USD rates. Production uses GPT-4o standard uncached rates of $2.50/$10.00 per million tokens, checked 2026-10-07 at https://developers.openai.com/api/docs/models/gpt-4o . This is an estimate, excludes cached-input discounts, taxes and other billing adjustments, and is not an invoice. Unknown usage or missing pricing remains null; no fabricated zero cost. Cloudflare/local costs are not estimated.

## Privacy, retention and exports

Admin reporting is read-only and same-origin. No CORS allowances, external analytics or third-party scripts are included. UI values use textContent, queries use bound parameters, and CSV values are quoted with formula-leading characters neutralized. All responses are no-store with CSP, frame denial, no-referrer and nosniff headers. Export is subject to the same Access middleware.

Date windows are 1–90 days. User/event lists and CSV exports are capped at 1,000 records and labelled accordingly; SEO provider summary aggregates the full selected window. This is a bounded operational dashboard, not a bulk historical export system. Current user/connection cards reflect the returned directory and are capped at 1,000.

Production instrumentation was explicitly authorized by the user. Suggested operational retention is 90 days: delete older analytics_activity/analytics_seo_events with a scheduled job, and support erasing records by internal user ID. No production retention job or existing billing/account deletion behavior was changed. Restrict CSV handling as customer activity data; do not upload it to public repositories.

## Validation and limitations

59 tests cover fallback providers, malformed requests, nullable pricing, telemetry failure isolation, real SQLite migrations/report queries, secret exclusion, JWT validation and fail-closed behavior, CSV injection prevention, existing Facebook scope/readiness tests and exact equality of the protected Worker implementation region against origin/main.

Synthetic-data browser QA checks overview, search filtering, individual-user view and mobile layout. Screenshots contain demo users only. Styling follows the requested navy/gold palette; the Bryant reference dashboard was not available for exact visual matching.

The existing dependency tree reports four high-severity development-tool advisories; no dependency versions were changed. Updating the shared deployment tool is a separate maintenance decision. A real text-only SEO action was performed in the signed-in live frontend and verified in the protected dashboard. It used local deterministic fallback after safe OpenAI rate_limit and Cloudflare provider_error failures. Thirteen live frontend files match origin/main after normalizing Cloudflare security/email-obfuscation injections. Existing Facebook linkage remained visible. Guard responses and successful Facebook/TikTok status polling match the original Worker under unavailable analytics in differential tests. Live reconnects and actual platform delivery still require the user's chosen normal publishing test; no claim of completed external publishing verification is made.
