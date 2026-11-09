# Android workspace purchase repair — 9 November 2026

The original version-code-10 AAB downloaded from Play Console does not contain
`changeWorkspaces`, `onMultiPostWorkspacePlans`, `onMultiPostPlayCountry`, or
the `multipost_workspace_%02d` product template in its DEX files. It can sell
Pro, but cannot return workspace prices or launch add-on checkout. The source
already contained these features, so a frontend-only deployment could not
repair the installed binary.

Version 1.9.2, code 11 packages the existing add-on implementation. Refresh now
retries Play country detection and replays its result to the current page before
querying products. The Settings page checks the next unused add-on and retained
renewing products instead of requiring all ten unused products at one price.
The website's Stripe purchase path is unchanged.

## Build and artifact verification

The Android project builds with JDK 17, Gradle 8.11.1, and the existing Android
Gradle Plugin 8.10.1. The wrapper is pinned to the version used for verification.
`assembleDebug`, `bundleRelease`, and `testDebugUnitTest` completed successfully.
There are currently no native unit-test source files; Kotlin compilation and
artifact inspection are the native checks. The JavaScript suite has 148 passing
tests, including partial catalogue and unsupported-region purchase gating.

The generated release AAB contains all four workspace markers missing from
the published version. The debug APK reports `uk.co.multipostapp`, version
`1.9.2`, code `11`. The generated release AAB is unsigned and must be signed
with the existing Play upload key before uploading.

## Google sign-in and social-account return

The Play App Signing certificate has SHA-1
`DC:30:04:9A:01:BB:A4:2F:FA:EB:A7:5A:E7:34:3A:1F:D6:DC:2E:00`.
Firebase's `uk.co.multipostapp` registration previously listed only another
certificate. With owner confirmation, the Play certificate was added and the
new `google-services.json` downloaded for this build. The website registration
and existing Android fingerprint were preserved.

The app opens social authorization in a Custom Tab via a short-lived, single-use
handoff. TikTok's browser nonce is set in that browser, rather than left in the
WebView cookie jar. Server callbacks return Android connections to a dedicated
verified App Link; only that return page is handled by the manifest. It reopens
the original workspace in the existing app activity. The return URL contains
navigation status only, never Firebase tokens or provider credentials. The page
offers an explicit Open MultiPost fallback when automatic app opening is blocked.
Website connections retain their existing callback destinations.

Migration `0016_android_oauth_handoffs.sql` was applied directly in the production
D1 console and the table and index verified. Existing records were not modified.
Pre-change Time Travel bookmark:
`00000d63-0000000a-0000511e-31abcebb058e6c326e42b197ec975603`.
The migration remains idempotent if later applied through Wrangler's ledger.

## Device verification still required

Install the signed code-11 update through the existing internal test track.
Check native Google sign-in and connect YouTube, Facebook and TikTok. Each flow
must return to the Android workspace, including cancellation; Facebook success
must still open Page selection. Keep the ordinary website flow in a browser.
Use a verified Pro tester account, open Profile, and confirm the next workspace
price is displayed and the Add button opens Google's purchase sheet. Have the
tester confirm any purchase. Confirm the server grants one additional workspace
after Google verification, then create that workspace. Verify restore and
scheduled removal separately. The published code-10 binary cannot exercise
this flow, even with updated web pages.
