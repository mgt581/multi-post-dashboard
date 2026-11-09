# Android additional workspace purchase: paid eligibility

The repository and Android Studio project are prepared as version 1.9.6 (code 15).
This source change has **not** been uploaded to Google Play. Version 1.9.5
(code 14) stays on internal testing and production is unchanged.

## Current behaviour and targeted changes

- Pro's seven-day trial and one included workspace remain intact. Android
  settings now says: “Additional workspaces become available after your first
  successful Pro subscription payment.” The add button stays disabled until
  Google order verification confirms a positive Pro charge.
- Google Play subscription status alone cannot unlock add-ons. The Worker
  checks the latest successful Pro order with `orders.get`, requires a processed
  positive Pro line, and retains an earlier verified positive order through a
  zero-value `KEEP_EXISTING` add-on change. A failed order lookup preserves Pro
  access but locks additional workspace entitlement.
- Nine paid extra workspaces plus one included workspace is the maximum. The
  native checkout rejects stale or repeated carts. Workspace rows are retained
  and locked, rather than deleted, when entitlement shrinks.
- Monthly and yearly add-ons use their existing matching Play base plans. The
  UK price verified for product 01 is £4.99/month or £39.99/year; no price was
  changed. Google requires bundled items to share a billing period.

## Release order

1. Confirm the Google Play service account has **View financial data** and
   **Manage orders and subscriptions**, because the new paid check uses
   `orders.get`. If it cannot read orders, Pro still works but add-ons remain
   locked.
2. Apply `migrations/0017_play_paid_pro_order.sql` to the production D1 database
   before deploying the Worker. This is an additive column.
3. Review the preview, then deploy the Worker and settings UI. The changed
   settings controls run only inside the Android wrapper. Do not promote the
   Android app to production. Verify existing website Pro and workspace
   behaviour after deployment.
4. Test with a trial account and a genuinely paid Pro account in the existing
   internal 1.9.5 build. If the Play checkout still returns code 6, record the
   exact Play message and investigate it separately. Do not infer that the
   trial restriction caused it.
5. If a new native bundle is needed, sign version 1.9.6 (code 15) from Android
   Studio and release it to internal testing. It has the nine-add-on cap and
   duplicate checkout guard. The unsigned local build is not a Play release.

## Device checks before any production promotion

- Trial: Pro features work in one workspace; extra purchase stays locked with
  the exact message above.
- Paid monthly and yearly Pro: Google order confirms the first real payment;
  the matching extra workspace price appears in Play checkout. Cancel the
  checkout once and verify that no entitlement or workspace is created.
- Complete one add-on purchase: refresh and restore both show the same verified
  entitlement, and only then can a second workspace be created. Rapid repeat
  taps and restoring the same token do not create duplicates or extra charges.
- Cancel the add-on or Pro renewal and test expiry/failed payment: entitled
  workspace access lasts only through the Play-reported paid period; customer
  workspace data remains saved and can be selected again after restoration.
- Verify the existing paid Pro subscription and website app continue working.
