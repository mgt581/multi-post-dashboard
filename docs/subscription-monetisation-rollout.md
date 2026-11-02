# MultiPostApp subscription monetisation rollout

## Status

- Branch: `feat/subscription-stage1-paywall`
- Production branch: untouched
- Stage 1: complete on this branch only
- No deployment, live charge, Stripe product change, Google Play product change, or app-release submission is authorised by this work.

## Cost-audit findings

The live SEO path is OpenAI `gpt-4o-2024-08-06` first, Cloudflare Workers AI fallback, then local deterministic fallback. The OpenAI model snapshot is deprecated and must be evaluated before launch.

Actual OpenAI organisation, project, 30/90 day spend, token categories, failure rate, and cached-token rate could not be audited because the account Usage/Billing area was not available and the Worker discards the API `usage` object. The application currently does not store per-generation cost telemetry.

Planning costs use a conservative model:
- Text SEO: about £0.0054 per successful generation
- Image SEO: about £0.0070 typical; £0.0084 conservative upper case
- Assumptions: 1,400 text input tokens, 300 output tokens, 5% retry provision, £0.79/USD and no cache savings

At £9.99/month including VAT, 150 credits are commercially safe. At full use, the conservative AI cost is approximately £0.81 for text-only, £0.63 for image-only, or £0.71 for a 60% text / 40% image request mix.

## Proposed customer catalogue

| Product | Price | Entitlement target |
| --- | ---: | --- |
| Pro Monthly | £9.99/month | 1 workspace, 1 YouTube, 1 Facebook Page, 1 TikTok, 150 AI credits and 150 successful platform publications per billing period |
| Pro Yearly | £79.99/year | Same allowance, reset each monthly entitlement period |
| Additional workspace | £4.99/month or £39.99/year | One additional workspace and one additional account slot per platform; AI credits remain account-level unless explicitly purchased |
| Credit pack 25 | £2.99 | 25 consumable AI credits |
| Credit pack 100 | £8.99 | 100 consumable AI credits |
| Credit pack 250 | £17.99 | 250 consumable AI credits |
| Trial | 7 days | Recommended: 15 AI credits and 3 successful platform publications |

Manual editing never consumes AI credits. A publication means one confirmed successful delivery to one platform. A three-platform post therefore uses three publication allowances. Failed attempts use none.

## Six-stage delivery plan

### Stage 1 — Paywall UX and product contract (complete)

- Replace the old public pricing display (£7.99 / £79) on this branch with the approved catalogue.
- Make the page display-only: no checkout request, no Stripe product use, and no billing setting change.
- Publish this rollout contract and a regression test that prevents accidental checkout activation.
- Define the entitlement vocabulary used by later stages.

### Stage 2 — Android entitlement foundation and Google Play Billing

- Add the Google Play Billing Library to the native Android app.
- Create subscription and consumable product identifiers in a sandbox-only environment after explicit approval.
- Verify purchase tokens server-side, acknowledge subscriptions and consume credit packs server-side.
- Remove the general Android billing/quota bypass. Android access must come only from a verified Play entitlement.

### Stage 3 — Stripe web checkout and entitlement sync

- Create the Stripe price mapping only after product/pricing approval.
- Keep web checkout Firebase-authenticated, use signed Stripe webhooks, and persist the canonical subscription period/status.
- Make annual plans expose monthly allowance periods rather than a single yearly 1,800-credit bucket.
- Add trial eligibility keyed to verified identity and Stripe customer.

### Stage 4 — AI credits, usage ledger and abuse controls

- Add immutable credit ledger entries: grant, reserve, settle, refund, expiry and purchase.
- Atomically reserve credits before generation and settle/refund only after outcome.
- Store model, provider, input, cached input, output tokens, image detail, request ID, retry count, duration, status and calculated cost.
- Add idempotency and per-user/IP rate limits.

### Stage 5 — Workspaces, publication quotas and top-ups

- Add `workspace_limit`, add-on quantity and account-slot enforcement per workspace.
- Add monthly publication ledger with atomic quota enforcement.
- Count only platform-confirmed success. Fix TikTok, which currently records usage at upload initiation rather than confirmed completion.
- Implement credit packs and additional workspace purchases for both verified web and Play transactions.

### Stage 6 — Validation, sandbox testing and release readiness

- Test Stripe and Play sandbox flows: trial, renewal, cancellation, expiry, restore, refund, duplicate webhook, duplicate purchase token, credit refund and quota boundary.
- Test Android/Web parity and ensure a spoofed header cannot gain entitlement.
- Run migration rehearsal on a copy of D1 data; add monitoring, budget alerts and customer-support tooling.
- Complete legal copy, refund terms, privacy disclosures, Google Play policy review and staged release checklist.
- Obtain explicit approval before deployment, real product activation or store submission.

## Dependencies and launch risks

1. **Android bypass:** general publishing quota logic includes an Android bypass path. SEO forces web entitlement evaluation, but the general bypass must be removed in Stage 2.
2. **No AI ledger:** current code has no credits, monthly reset, cost telemetry or purchase ledger.
3. **Publishing accounting is not monthly:** current plans use daily caps. TikTok can charge a failed upload because its usage event is created at initiation.
4. **No workspace add-on:** current account caps are global by user, not workspace based.
5. **No Google Play Billing:** the Android app is a WebView and has no Play Billing dependency or server-side purchase verification.
6. **Deprecated model:** GPT-4o snapshot must be replaced or formally retained only after quality/cost testing.
7. **Prices not yet verified:** current HTML/Stripe mappings show older plan names and prices. Do not reuse those mappings for the new catalogue.
8. **Actual API cost evidence remains incomplete:** sign into the OpenAI Platform Usage area with a billing-authorised account and export 30/90-day project usage before Stage 4 is accepted.

## Stage 1 acceptance criteria

- The branch has the approved visual paywall and product information.
- The page contains no checkout/session request or live purchase action.
- The old price catalogue is removed from this page.
- A regression test enforces that Stage 1 remains non-transactional.
- Main remains unchanged.
