# Stage 2 Google Play subscriptions: configuration and release gate

This branch is isolated from production. It does not create Play products,
change Stripe prices, deploy a Worker or website, or upload an Android bundle.

## Product catalogue

* Subscription product: `multipost_pro`
* Auto-renewing base plans: `monthly` (£9.99) and `yearly` (£79.99)
* Seven-day free trial: provisional; configure as eligible Play introductory
  offers after commercial and abuse checks. Offer eligibility is decided by Play.

## Backend preparation before any test release

1. Apply `migrations/0009_play_subscriptions.sql` to the intended D1 database.
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

## Before a release

* Verify the upload keystore certificate SHA-256 matches both the Play Console
  **upload** certificate and the existing version 1.8 AAB certificate:
  `3D:37:61:C3:F4:61:CC:82:BF:E6:86:D2:95:F0:82:3C:A2:6A:5D:01:5B:8C:31:2D:78:AF:47:23:E0:D4:BD:1A`.
* Build and inspect an unsigned debug APK, then a signed AAB only with explicit
  approval. Check the manifest has `com.android.vending.BILLING`, package
  `uk.co.multipostapp`, version code 9, and the same upload certificate.
* Test monthly, yearly, eligible and ineligible trials, purchase restoration,
  cancellation at period end, account hold, expiry, refund/revocation, Google
  sign-in, image upload, and each social publishing platform on a Play test track.
* The branch's `settings.html` contains the Android Play controls. The existing
  live website does not. An Android-only build cannot show those controls until
  this branch's website is tested and deliberately deployed, or equivalent UI
  is embedded in the native wrapper. Do not activate paid plans prematurely.
* The existing 1.8 AAB has upload certificate SHA-256 as shown above. The
  candidate `multipost-upload.jks` is password-protected PKCS12; a password-free
  local inspection failed, so its certificate has **not** been matched. No
  signed 1.9 bundle is prepared or authorized.

## Current limitations

The original Android app has no native unit tests. No live Play Developer API,
service account, Play products, subscription events, or signed release was used
in Stage 2. Stage 3 credit and workspace allowances remain unimplemented.
The WebView's `JavascriptInterface` is exposed to embedded frames when a
trusted page is open. An embedded frame could invoke the native purchase UI;
it cannot grant itself entitlement because the backend verifies the token and
Firebase account with Google. Before release, replace the bridge with an
origin-aware message listener or constrain embedded content and validate this
on a device. The five-minute Play refresh window also means refunds and
revocations can take up to that long to remove access without RTDN.
