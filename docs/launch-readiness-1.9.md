# MultiPost 1.9 first-use and billing launch gate — 1 November 2026

Branch: `feat/subscription-stage2-play-billing`. No merge, deployment, product
activation, customer charge, or release upload was performed in this review.

**2 November continuation:** the original Mac worktree was unavailable in the
new Work environment, so development resumed from the last pushed commit on
this same branch. See `docs/workspace-billing-verification.md` for the add-on
catalogue finding, quota test evidence and remaining release blockers. The
later branch changes must not be confused with the older internal-testing AAB.

## Verified Play state

| Item | Status | Evidence |
| --- | --- | --- |
| `multipost_pro` monthly £9.99, yearly £79.99 | PASS, draft | Play Console product editor, 175/175 regions for each base plan; user-facing UK prices previously saved. |
| `trial-7d-monthly` | PASS, draft | Editor: one-week free phase, New customer acquisition, Never had any subscription in this app, no tags. |
| `trial-7d-yearly` | PASS, draft | Created and saved in this review with the same criteria on yearly; both offers appear Draft in the base-plan table. |
| Internal track release 9 (1.9) | PASS | Play Console: active internal-testing track, available to internal testers, released 1 Nov 2026 at 18:15. This does not verify the source used for that uploaded AAB. |
| Upload certificate | PARTIAL | Local 1.8 and 1.9-branch AABs both show SHA-256 `3D:37:61:C3:F4:61:CC:82:BF:E6:86:D2:95:F0:82:3C:A2:6A:5D:01:5B:8C:31:2D:78:AF:47:23:E0:D4:BD:1A`, matching Play Console Upload key. The password-protected candidate `/Users/alexb/Desktop/multipost-upload.jks` has not been opened, so its alias certificate and signing suitability remain unverified. |

The next branch build is prepared as version code 10, version name 1.9.1.
The old AAB and APK in the checkout predate the edits below. Do not upload them
as a validation of this branch.

## First-use implementation and limits

| Gate | Status | Evidence / next step |
| --- | --- | --- |
| Dashboard welcome and help before subscribing | PASS in code | `app.html` and public `help.html` explain the supported YouTube, Facebook Page, TikTok, AI SEO and posting flow. No unsupported Instagram or scheduled-post promise. Still needs device and new-account UX testing. |
| Three-step progress | PASS in tests | Authenticated `get-folders` returns counts of linked social accounts and an account-owned publication flag. The dashboard renders 0/3 to 3/3 and actions. Pending TikTok initiation and Facebook Reels submission do not complete the post step; their ready status records completion. This is still not a complete 150-publication meter. |
| Empty/network/billing states | PASS in code; NOT TESTED live | Empty workspace lists are distinguished from HTTP/auth/network errors; Retry preserves a real error. Billing status distinguishes verified Play trials, active/canceled Play, Stripe access, owner, no access and unknown status. Live Firebase/Stripe/Play account fixtures remain required. |
| Trial eligibility and checkout wording | PASS in code; NOT TESTED device | Native Billing Library only labels named `trial-7d-{basePlan}` P1W offers returned as eligible by Play. Profile uses Play's formatted regional price, disables purchase until server billing status is available, hides purchase choices for already-entitled users, and explains automatic renewal and cancellation. A prospective first payment date is approximate; Play checkout supplies the exact date. |
| Full data deletion | FAIL | The existing Profile action deleted only Firebase login. Its wording is corrected and full-deletion instructions are visible, but backend workspace/token erasure and subscription treatment are not implemented. |
| UI security | PARTIAL | Dashboard workspace labels and pictures are escaped/URL constrained. Other pages and `get-accounts` still need a broader token-exposure and stored-XSS review. |

The first-post flag is conservative evidence of a recorded publication rather
than an unsaved draft. The currently named step is “Create your first post”; it
marks complete after YouTube/Facebook records a post or TikTok confirms one.
There is no durable draft object or scheduling implementation in this source.

## Workspace billing architecture — revised 2 November

Google Play Subscription with add-ons permits one unique product ID per line
item, all line items in a purchase must use the same recurring period, and it
is unavailable in South Korea. A subscription product cannot simply be bought
in quantity N. The existing Android client queries only `multipost_pro`, and
the backend stores one Play token per user and enforces no folder count.

**Earlier provisional catalogue:** keep `multipost_workspace` as one subscription
product, with quantity-tier base plans such as `monthly-1` through
`monthly-10` and `yearly-1` through `yearly-10`. Tier N costs N × £4.99/month
or N × £39.99/year in the UK, with converted local prices. A Play add-on
purchase pairs Pro monthly with workspace monthly-N or Pro yearly with
workspace yearly-N. The selected tier grants exactly N additional workspaces
when both verified line items are active. Change quantity by replacing the
workspace line item/base plan, not by adding the same SKU twice. Keep paid
workspaces inaccessible if Pro lapses, while explaining any continued charges
and making cancellation available. A separate design is required for Korea or
other unsupported add-on paths. No workspace product has been created.

The customer approved a maximum of 10 and exclusion of unsupported bundled
purchases in South Korea. Further review found that same-product base-plan
switches do not provide the straightforward deferred downgrade assumed here.
**Do not use this provisional catalogue without reviewing the distinct-product
alternative in `docs/workspace-billing-verification.md`.**

After approval, implement product querying and add-on/replacement flow using
the old token, server-side verification of every `lineItem`, product-to-quantity
mapping, account hash and linked-token lineage, acknowledgement, token storage
that handles replacements and independent subscriptions, RTDN plus periodic
reconciliation, and atomic maximum-workspace enforcement. Reconcile Stripe
customers through verified Stripe subscription items; never infer quantity
from a client claim or an absent billing row. Test downgrade with existing
folders and explicit excess-workspace handling before charging.

## Launch-readiness status

| Area | Status | Blocking evidence / next action |
| --- | --- | --- |
| Google Play trial drafts | PASS | Both saved; neither active. |
| Play token validation | PASS in mocked tests; NOT TESTED live | Google Developer API service account, D1 migration 0009/0010, encryption key, RTDN and purchase test are not configured here. |
| Existing Stripe access | PASS in mocked tests; NOT TESTED live | Independent Stripe path remains; active rows lacking a period end are still trusted if refresh fails. Audit real rows before launch. |
| Workspace quantity and add-on | PARTIAL / BLOCKED | Atomic folder creation cap and provisional verified Play tier parsing have been added in migration 0011. No SKU or Android purchase flow exists. Same-product base-plan downgrades need a different catalogue or validated grandfathering; excess existing workspaces remain accessible after downgrade. See workspace verification note. |
| AI credits | PASS in local tests; NOT TESTED live | Atomic 150-credit UTC calendar-month reservation for both SEO routes; text 1/image 2, failed/local fallback zero, same-key replay. Migration 0011 and live API tests are still required. Trial-period allowance remains provisional. |
| 150 successful monthly publications | PARTIAL / FAIL launch gate | Migration 0012 atomically reserves places; 114 local JS tests include concurrent final-place, YouTube completion, TikTok failed and complete status. Pending sessions do not show as successful but can tie up places without reconciliation. Legacy Facebook Reel URL path records at submission, and cross-month completion can be attributed to initiation month. Live provider/device tests and reconciliation remain required. |
| Account login and social flows | PASS in automated fixtures; NOT TESTED live | 114 JS tests cover simulated auth, OAuth and publishing cases. The YouTube start and legacy URL publishing paths now verify workspace ownership; `/api/get-accounts` does not expose provider tokens; account-only removal requires Firebase authentication. New Firebase users, provider credentials, Android sign-in and device WebView still need manual verification. |
| Android compilation and unit tests | BLOCKED | This resumed cloud checkout has no Android SDK or cached Gradle 9.6 distribution; the offline wrapper failed before compilation because it could not download Gradle. Android Studio on the Mac must run `:app:assembleDebug :app:testDebugUnitTest` for the current branch. |
| Signed code-10 AAB | BLOCKED | Candidate keystore certificate is not verified; no build from latest edits and no authorization to upload. Verify alias locally without sharing a password. |
| Internal billing test | BLOCKED | Draft plans/offers cannot be purchased; use license testers after separate activation approval, staging backend/frontend, and code-10 verified build. Existing internal 9 (1.9) is older than these edits. |
| Privacy, deletion and platform claims | FAIL / NOT TESTED | Backend data deletion, Data Safety accuracy, store listing, vitals, device compatibility, TikTok provider restrictions and image/video UX need verification. Instagram and scheduling are not supported by this code. |

## Coordinated path to the next internal build

1. Decide the workspace catalogue described in the new verification note. Implement and
   test quantity/replacement and Stripe compatibility; complete excess-workspace
   locking and publication-session reconciliation before showing those benefits.
2. Finish account deletion and token-exposure fixes; run auth, new-user,
   existing Stripe, trial, cancelled and expired browser/device scenarios.
3. On this isolated branch in Android Studio, sync without upgrading AGP,
   build unsigned debug and run native unit tests. Verify Firebase login,
   WebView origin bridge, image upload, OAuth and all supported posting flows.
4. Prepare isolated staging origin accepted by a staging Android variant and
   stage reviewed frontend/Worker modules together with D1 migrations,
   service-account secret and token-encryption key. No live website change is
   authorized here.
5. Locally inspect the candidate keystore alias certificate using its password
   prompt; compare the SHA-256 with Play Upload key and local AAB. Never send
   the password or keystore through chat. Produce a signed code-10 bundle only
   after verification and explicit approval.
6. Seek separate approval for controlled draft-plan/offer activation and
   internal-track upload. Use Play license testers for eligible/ineligible
   trials, renewal, grace, hold, cancellation, refund, replacement and restore.
   Then recheck store listing, policy disclosures, privacy and Android vitals.

No customer purchase, production release or store review submission was made.
