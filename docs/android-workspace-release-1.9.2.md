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
artifact inspection are the native checks. The JavaScript suite has 142 passing
tests, including partial catalogue and unsupported-region purchase gating.

The generated release AAB contains all four workspace markers missing from
the published version. The debug APK reports `uk.co.multipostapp`, version
`1.9.2`, code `11`. The generated release AAB is unsigned and must be signed
with the existing Play upload key before uploading.

## Device verification still required

Install the signed code-11 update through the existing internal test track.
Use a verified Pro tester account, open Profile, and confirm the next workspace
price is displayed and the Add button opens Google's purchase sheet. Have the
tester confirm any purchase. Confirm the server grants one additional workspace
after Google verification, then create that workspace. Verify restore and
scheduled removal separately. The published code-10 binary cannot exercise
this flow, even with updated web pages.
