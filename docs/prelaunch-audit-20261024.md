# MultiPost prelaunch audit — 24 October 2026

Status: NOT approved for commercial advertising. Preview deployment and browser integration testing are blocked. Production is unchanged.

## Baseline and preservation

- Source baseline: `3c5431fd6e27a2251f68a58ec59d613129f95942`, matching the current GitHub main branch on inspection.
- Work is isolated in `audit/prelaunch-preview-20261024`. Nothing was merged to main.
- The older Desktop checkout contains pre-existing merge conflicts. It was left untouched. A clean current checkout was recovered from the 20 October workspace.
- No production database migrations, Firebase user changes, social posts, subscription purchases, advertising campaigns or production deployments were performed.
- Safari successfully loaded the existing account's brands and YouTube, TikTok and Facebook Page connection records. This proves account-record loading, not provider authorization or publishing health.

## Changes prepared

| Area | Repair |
| --- | --- |
| Facebook and YouTube linking | Require authenticated POST and matching workspace ownership. Store random state server-side, bind it to a browser nonce, expire it after ten minutes and consume it once. Reject forged legacy callback state. Existing TikTok OAuth state table is reused; no new migration is needed. |
| Facebook API | Move Graph and login requests from retired v18.0 to v24.0. Actual provider behavior needs integration testing. |
| Publishing ownership | Guard legacy Facebook image/video and YouTube upload routes before touching credentials. Bind new YouTube resumable sessions to user and workspace. Old in-progress YouTube sessions need restarting after a future approved deployment. |
| Cross-platform mapping | Publishing screens adopt the server's verified workspace-owner header. This prevents using a different Firebase provider UID after loading the correct saved workspace. |
| TikTok audience | Load available audiences from creator information, require an explicit audience choice, re-check before upload and remove the automatic privacy downgrade. Comments, Duet and Stitch are disabled in this upload flow. |
| Registration | Send verification on signup; show resend, refresh and switch-account controls. Prevent unverified accounts from redirecting into a workspace they cannot load. Hide Google sign-in in explicit Android app mode. |
| Old access URL | Replace mock auth.html with a redirect to the real sign-in. |
| Workspace UI | Preserve brand names in navigation, exclude Facebook's login record from the publishing-account count, escape rendered brand/account text and label icon-only rename/delete controls. |
| Homepage | Keep existing design; improve customer copy and pricing discovery, add customer CTA and explain Facebook Page/TikTok restrictions. |
| Pricing | Explain trial eligibility, annual billing, automatic renewal and platform limits. Match source behavior: Creator/Pro can get a first eligible trial; Agency does not. Live Stripe prices remain unverified. |
| Policies | Correct inaccurate no-sign-in statements; disclose Firebase, Stripe and requested AI processing; add renewal/trial explanations. These are review drafts, not a legal sign-off. |
| SEO | Add canonical homepage, sitemap and robots rules. Preview responses are noindex. |
| Preview | Prepare dedicated isolated Worker, a new synthetic-only D1 database and a deployment workflow restricted to this audit branch. Real OAuth, posting, AI usage, deletion and payment APIs are blocked in the review entrypoint. |

## Validation completed

- Original baseline: 86 tests passed.
- Updated suite: **100 tests passed, 0 failed**.
- Tests cover forged ownership, cross-provider identities, unverified aliases, state tampering/wrong browser/expiration/replay, TikTok per-workspace tokens and refresh races, publish-state interpretation, upload chunk sizing, existing billing logic and image processing.
- Added a YouTube init/chunk/completion test with synthetic provider responses. No real YouTube content was transmitted.
- Preview page-render tests exercise 11 public/application pages, verify removal of production API/Firebase imports in the isolated entrypoint and syntax-check the resulting inline scripts.
- All 16 source inline scripts parsed successfully; the local href/src audit found no missing file targets.
- Production Worker bundle passed Wrangler dry-run. No production deployment was executed.
- Revised homepage was opened as a local file in Safari and inspected at a 390 × 844 responsive viewport. This is an initial layout check, not full hosted mobile acceptance testing.

## Deployment blockers

GitHub Actions run:
https://github.com/mgt581/multi-post-dashboard/actions/runs/40045461679

The job did not start. GitHub's annotation states: “The job was not started because your account is locked due to a billing issue.” Consequently no preview database or Worker was created by this workflow.

Cloudflare Dashboard is signed out in Safari. Saved-password autofill did not provide credentials. Local HTTP preview hosting was also unavailable: the execution sandbox rejected binding to 127.0.0.1 with EPERM. No security restriction was bypassed.

There is **no verified hosted preview URL yet**. The configured URL must not be represented as deployed or tested.

## Outstanding launch gates

1. Restore deployment access, deploy the isolated review build, then perform browser walkthroughs of brands, linking/cancellation/replay, publishing UI, billing blocks and mobile layouts.
2. Verify actual Meta app mode/Advanced Access and TikTok Content Posting approval, scopes, app credentials and registered preview callbacks. Connected database records do not establish those provider permissions. Provider restrictions cannot be solved by UI changes.
3. Run explicitly authorized end-to-end posts from safe test accounts. Current coverage uses provider fixtures. Facebook/TikTok live publishing failures have not been reproduced or proven resolved; YouTube has not received a real smoke-test upload in this audit.
4. Inspect Firebase project settings and verify web/Android identity behavior with a non-owner test customer. The backend has configured-owner alias support; that is not evidence of general account linking for every customer. No new Android package was built.
5. Verify Stripe's live prices, currency/tax, trial/renewal/cancellation behavior, webhook delivery and payment-failure access using test mode. Source/config pricing checks are not live Stripe verification.
6. Resolve the native billing entitlement design: current server logic trusts client_platform=android to bypass web billing for uploads. That is an existing behavior, not a secure native receipt check.
7. No active GA4 measurement ID or Meta/TikTok advertising pixels were found in the reviewed source. Conversion attribution is not configured or verified. Do not invent tracking IDs or enable advertising cookies without the appropriate setup.
8. Confirm legal business details, retention schedule, lawful bases and international processor/transfer arrangements. Draft policy improvements do not complete those business confirmations.
9. Complete the user's personal preview review. Only after explicit production authorization should deployment, final smoke tests and an advertising-readiness decision occur.

## Reference documentation

- Meta Graph API version lifecycle: https://developers.facebook.com/docs/graph-api/changelog/versions/
- TikTok Direct Post prerequisites and audit restrictions: https://developers.tiktok.com/doc/content-posting-api-get-started
- TikTok Direct Post API and creator information: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- ICO privacy information requirements: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/

## Resume

Sign into the existing Cloudflare account in Safari, or resolve the GitHub Actions billing lock without authorizing production changes. Resume from this branch and report. Deploy only `prelaunch-preview-worker.mjs` using the generated dedicated preview configuration, never the default production wrangler.toml. Real credentials must not be added to the synthetic preview. The full OAuth and provider smoke tests need a separately configured test environment and explicit posting permission.
