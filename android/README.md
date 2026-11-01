# MultiPost Android (Stage 2 branch)

This source was copied from the confirmed version 1.8 Android Studio project at
`/Users/alexb/Documents/Codex/2026-10-16/new-chat-7/MultiPost-Android`.
The original signed 1.8/code 8 bundle and source remain untouched. This branch
sets version 1.9/code 9 and adds Google Play Billing 9.1.0.

Package: `uk.co.multipostapp`; min SDK 24; target SDK 36. The existing WebView,
Firebase sign-in bridge, Google sign-in, document picker, and navigation remain
in place. No signing key or password is committed. `app/google-services.json`
is ignored; copy the existing file into this local working copy to build.

The native billing bridge offers `multipost_pro` with `monthly` and `yearly`
base plans, and restores purchases. Google Play determines eligibility for any
seven-day introductory offer. The app forwards purchase tokens to the Worker
through the authenticated Settings page; only the Worker can grant access.

Build the unsigned debug variant locally with `./gradlew :app:assembleDebug
:app:testDebugUnitTest`. Do not build a signed release until the upload keystore
certificate has been verified against the existing bundle and Play Console.
The Gradle plugin remains 8.10.1; no toolchain migration was made.
