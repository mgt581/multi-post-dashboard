# Stage 2 Google Play subscriptions: configuration and release gate

This branch is isolated from production. The main Play subscription and two
trial offers were saved as drafts in Play Console. No Stripe price, Worker,
website or Android bundle was deployed or uploaded by this branch work.

## Product catalogue

* Subscription product: `multipost_pro`
* Auto-renewing base plans: `monthly` (£9.99) and `yearly` (£79.99)
* Draft one-week introductory offers: `trial-7d-monthly` and
  `trial-7d-yearly`, both New customer acquisition → Never had any
  subscription in this app, blank tags, inherited 175-region availability.
  The Play Console displayed both as Draft on 1 November 2026. Play decides
  offer eligibility; the trial usage allowance is still provisional.

## Backend preparation before any test release

1. Apply `migrations/0009_play_subscriptions.sql`, then
   `migrations/0010_play_trial_phase.sql` to the intended D1 database.
2. Enable the Google Play Developer API and grant the service account the
   minimum Play Console permission required to view purchase/subscription data
   and acknowledge subscriptions. Store its JSON as the Worker secret
   `PLAY_SERVICE_ACCOUNT_JSON`. Do not commit or log it.
3. Generate a random 32-byte key, Base64 encode it, and store it as the Worker
   secret `PLAY_TOKEN_ENCRYPTION_KEY`. Keep this secret backed up securely:
   losing it prevents refresh of existing encrypted purchase tokens.
4. Test the Worker in an isolated preview environment. Existing Stripe rows
   retain their independent entitlement path. Only enable
   `WEB_BILLING_ENABLED=true` after the entire paywall, Stripe and Play flows
   have been tested. The current production setting is not changed here.
5. Configure Play real-time developer notifications and reconciliation for
   refunds, revocations and purchases made outside the app. The Worker currently
   refreshes stored Play subscriptions when a signed-in user accesses a gated
   route, at most five minutes after the last verification. An unavailable Play
   API fails closed for Play access after that interval.

## Validation on this branch (1 November 2026)

* `npm test`: 102 passed, 0 failed after first-use changes. Before this review, four assertions also
  failed on the untouched Stage 1 commit `bc7edad`: two expected superseded
  Creator/Pro pricing, one expected an owner email on the display-only pricing
  page, and one expected a live Firebase checkout on that display-only page.
  Tests now check the intended staged paywall and legacy Stripe mappings.
* Regression tests cover Play active/trial, canceled before/after expiry,
  expired/revoked, hold/paused/pending, wrong product or account, encrypted
  tokens, duplicate tokens, Stripe fallback, spoofed Android headers, the
  formerly unguarded legacy SEO route, upload completion, workspace creation,
  OAuth linking, and the main-frame native message contract. Google responses
  and Firebase identity in these tests are mocked; no live purchase was made.
* `node --check worker.js` and `git diff --check` pass. Existing social media
  publishing and Firebase integration tests pass. Native sign-in, WebView,
  social publishing, and Play purchase flows still need device validation.
  `npm run build` (Wrangler dry run) could not start because this checkout has
  no installed `wrangler` executable. No Worker bundle was produced.
* `./gradlew --offline --no-daemon :app:assembleDebug :app:testDebugUnitTest`
  was attempted with Android Studio's JBR and local Gradle cache. Gradle failed
  **before compilation** because this restricted environment forbids its
  daemon listening on a local socket (`java.net.SocketException: Operation not
  permitted`). No APK or native unit test result was produced; do not interpret
  this as a compilation failure or success. A repeat with a writable task-local
  Gradle home failed at the same socket restriction. The existing debug APK
  predates these changes. No AGP/Gradle upgrade was attempted.

## Entitlement and route audit

* Google `subscriptionsv2.get` must match `multipost_pro`, `monthly`/`yearly`,
  and the SHA-256 obfuscated Firebase UID. Access requires an active, grace,
  or canceled-with-future-expiry state. Expiry, hold, pause, pending, and
  revoked/expired are denied. A unique token hash and account binding prevent
  another account registering a stored token; tokens are AES-GCM encrypted.
  Initial purchases are acknowledged after verification.
* No route grants access because the request says `client_platform=android`.
  Authentication and entitlement are checked on premium SEO, the legacy SEO
  route, publication start and completion, linking starts, page selection, and
  workspace creation. Read-only workspace/status routes still authenticate.
  The general `WEB_BILLING_ENABLED` switch can disable billing for all clients;
  it must be true in the launch environment. Owner access requires a verified
  Firebase account configured on the server.
* YouTube and Facebook OAuth starts now use authenticated POST requests from
  `folder.html` and return the provider URL for navigation. Redirect callback
  state is HMAC-signed with the respective existing provider secret and expires
  after ten minutes. Legacy in-flight callback states must restart linking
  after a future Worker deployment. Existing Stripe rows retain their
  independent path. Stripe `active` rows without a period end are presently
  accepted by the pre-existing code if Stripe refresh is unavailable; audit
  actual rows and fix this before a trial-and-paid-only public launch.
  The signed OAuth state is not yet bound to the initiating browser session;
  add and test a browser-bound nonce before public release to prevent a
  user being tricked into completing another account's link flow.
* In-flight YouTube resumable upload sessions created before this version do
  not have owner fields and cannot be completed by the new guarded chunk route.
  Clear or finish these sessions before a later Worker deployment.
  Workspace count enforcement remains Stage 3: creation now requires a paid
  entitlement but has no server-side maximum workspace count yet.
  The unused legacy `app.js` still calls `/api/generate-seo` without an ID
  token; this route now correctly rejects anonymous calls. If that script is
  reintroduced to a page, update it to use authenticated SEO first.
* The dashboard's Getting started progress now comes from authenticated
  workspace rows: saved workspace count, connected social account count and
  recorded post activity. Pending TikTok uploads no longer record publish
  usage; a confirmed finished TikTok post records `publish_confirmed`. Old
  TikTok initiation events are ignored for first-use progress. Facebook
  Reels now record only after the provider status confirms readiness.
* Play free-trial phase uses verified `subscriptionsv2.get` line item
  `offerPhase.freeTrial` and a named offer ID, persisted in `trial_end` for
  dashboard display. Entitlement still depends on state and expiry. Trial
  purchase and expiration must be validated on a device.
* Ordinary authenticated `get-accounts` responses still include some YouTube
  and Facebook bearer credentials. Remove them from reads and redesign page
  selection around server-held credentials before public launch.
* Profile previously claimed Firebase sign-in deletion erased all data. It
  now accurately describes its limited effect and links to a full deletion
  request. Complete authenticated backend erasure and billing treatment are
  required before launch.

## Before a release

* Verify the upload keystore certificate SHA-256 matches both the Play Console
  **upload** certificate and the existing version 1.8 AAB certificate:
  `3D:37:61:C3:F4:61:CC:82:BF:E6:86:D2:95:F0:82:3C:A2:6A:5D:01:5B:8C:31:2D:78:AF:47:23:E0:D4:BD:1A`.
  On the Mac, run
  `'/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool' -list -v -keystore '/Users/alexb/Desktop/multipost-upload.jks' -alias multipost`;
  enter the password only in the local prompt. Compare with Play Console →
  Protected with Play → Play Store protection → Manage Play app signing →
  Upload key certificate. Do not send or
  store the password in chat or scripts.
* Build and inspect an unsigned debug APK, then a signed AAB only with explicit
  approval. Check the manifest has `com.android.vending.BILLING`, package
  `uk.co.multipostapp`, version code 10 (`1.9.1`), and the same upload certificate.
  In Android Studio open the isolated `stage2-dashboard/android` project and
  run `./gradlew :app:assembleDebug :app:testDebugUnitTest` in its terminal.
  Sync must resolve `androidx.webkit:webkit:1.15.0`; no native compilation has
  succeeded in this restricted workspace.
* Test monthly, yearly, eligible and ineligible trials, purchase restoration,
  cancellation at period end, account hold, expiry, refund/revocation, Google
  sign-in, image upload, and each social publishing platform on a Play test track.
* The native WebView starts at the live `app.html` and navigates to
  `settings.html` through the existing Profile link. Play buttons only appear
  when the branch's **`settings.html`** is served from
  `https://multipostapp.co.uk` or `https://www.multipostapp.co.uk` in the new
  Android wrapper. The `folder.html` and `app.html` branch changes also need
  deployment for authenticated linking and workspace creation. The backend
  requires `worker.js`, `play-subscriptions.mjs`, the D1 migration, and Worker
  secrets. The live site has none of these Stage 2 changes. An isolated preview
  host is not accepted by the native origin allowlist; use an approved staging
  build with an explicit staging origin before internal purchase tests, or
  deliberately deploy the reviewed frontend/backend together after approval.
  Do not activate paid plans prematurely.
* Deploy `app.html`, `folder.html`, `settings.html`, `help.html`, `pricing.html`,
  `create-post.html`, `billing-ui.mjs`, the Worker modules and migrations as one
  reviewed release unit when approval is given. A lone
  backend deploy would break the old GET OAuth start links; a lone frontend
  deploy would call POST routes the live backend does not support. Keep
  existing Stripe webhook/configuration and active subscriber rows intact.
  Coordinate cache invalidation and allow any in-progress OAuth or YouTube
  upload sessions to finish before the paired change.
* The existing 1.8 AAB has upload certificate SHA-256 as shown above. The
  candidate `multipost-upload.jks` is password-protected PKCS12; a password-free
  local inspection failed, so its certificate has **not** been matched. No
  signed bundle from this branch is prepared or authorized. The user's reported
  existing Internal Testing 1.9 upload has not been matched to this checkout.

## Current limitations

The original Android app has no native unit tests. No live Play Developer API,
service account, Play products, subscription events, or signed release was used
in Stage 2. Stage 3 credit and workspace allowances remain unimplemented.
The WebView Billing and Google sign-in bridges now use origin-aware messages,
reject all subframes, and fail closed on unsupported WebViews. Their compilation
and actual device behavior remain unverified. The five-minute Play refresh
window means refunds and revocations can take up to that long to remove access
without RTDN; a purchase made outside the app needs a reconciliation path.
Native build, signing, and a test purchase are still release blockers.
Both base plans and offers are Draft and cannot be tested for purchase until
a separately approved controlled activation. Workspace quantity, AI credits,
150 successful publications, subscription replacement flows and RTDN remain
launch blockers. See `docs/launch-readiness-1.9.md` for the decision and gate.
