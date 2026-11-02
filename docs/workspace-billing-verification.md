# MultiPost workspace billing verification — 2 November 2026

Status: **architecture gate, no workspace product created and no purchase UI enabled**.

## Play rules and the product choice

Google's Subscription with add-ons documentation permits multiple unique
subscription products in one purchase, auto-renewing only, and requires the
same monthly or yearly period for all items. An existing purchase must be
replaced with its old purchase token. Adding an item applies a prorated charge;
removing an item is deferred to the end of its paid period. The feature is not
available in South Korea. Pro retains its existing 175-region availability.

The proposed single `multipost_workspace` product with `monthly-1` through
`monthly-10` and `yearly-1` through `yearly-10` can represent a quantity, but
Google documents only `CHARGE_FULL_PRICE` and `WITHOUT_PRORATION` for switches
between base plans of the *same product*. An ordinary deferred downgrade of
the workspace tier cannot be assumed to work. `WITHOUT_PRORATION` changes the
entitlement immediately while charging the new price at renewal; we must not
remove paid capacity before its period ends. Google might allow app-side
grandfathering until renewal, but this requires an actual licensed purchase
test and reconciliation of the old entitlement. **Do not create or activate
the proposed tier catalogue yet.**

Recommended safer catalogue for approval: ten distinct recurring products,
`multipost_workspace_01` through `multipost_workspace_10`, each with `monthly`
at £4.99 and `yearly` at £39.99 in the UK. Add the unique products alongside
`multipost_pro` in the same-period Play purchase; each active, verified line
item grants one additional workspace. The bundle can contain Pro and up to ten
distinct workspace items, below Google's 50-item limit. Increasing quantity
adds another unused item with a prorated charge. Decreasing quantity removes
one item at its period end. Never count a deferred, unpaid or expired item.
Monthly and yearly Pro must be switched together with the workspace items to
preserve matching periods; exact proration and checkout display require
licensed tester validation. Do not show a workspace purchase option in South
Korea. The main Pro subscription remains available there if Play supports it.

Google's official references:

- https://developer.android.com/google/play/billing/subscription-with-addons
- https://developer.android.com/google/play/billing/subscriptions
- https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2

## Branch implementation now

The backend has an inactive preparatory verifier for the original
`multipost_workspace` tier proposal. It grants 0–10 only when the Google
Developer API returns a paid, current, matching-period line item alongside
verified Pro, with a matching obfuscated Firebase account ID and active
purchase state. A future deferred line with no successful order grants zero.
The verified quantity and expiry are cached with the encrypted current token.
The server checks the total folder count atomically when creating a folder;
existing Stripe Pro Plus and Agency tier caps remain 3 and 100 respectively.

This is **not a completed add-on**. The distinct-product recommendation would
require changing the product verifier, native query/checkout and management
UI before any SKU could be created. Renewal, cancellation, refund, grace,
restore, token lineage and duplicate-token checks have local fixtures, but
no real Google API purchase was tested. Five-minute entitlement cache and no
RTDN mean a refund can have up to five minutes of stale access. A downgrade
can leave more existing workspaces usable than paid for: creation is capped,
but the user cannot choose which existing workspaces stay active. Implement
this selection and enforce it on every protected route before testing charges.

## Other launch gates

AI reservations use calendar UTC months (150 credits; text 1, image 2), replay
by request ID, and release on failure or a deterministic local fallback. Publication preflight counts
150 confirmed records across authenticated UID/email aliases in the UTC
calendar month, excluding failed or merely initiated TikTok uploads. It is
**not a strict concurrent cap**: concurrent requests can both pass before
either records a success, and legacy Reel URL publishing counts at submission.
An atomic publication reservation and provider confirmation design remains
required. The existing Stripe `active` row without a period end can still be
accepted if refresh fails; audit actual rows before tightening it.

The current cloud checkout lacks the Mac's candidate upload keystore and the
previous signed AAB. It also lacks a cached Gradle 9.6 distribution and an
Android SDK. `./gradlew :app:assembleDebug :app:testDebugUnitTest --offline`
failed while downloading Gradle because the network could not reach
services.gradle.org; compilation never began. Version code 10 (`1.9.1`) is
set in the branch, but Play's current maximum version code must be checked
again before signing. No signed bundle can be prepared here.
