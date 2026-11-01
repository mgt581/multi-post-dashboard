# MultiPost Android (Stage 2 branch)

This source was copied from the confirmed version 1.8 Android Studio project at
`/Users/alexb/Documents/Codex/2026-10-16/new-chat-7/MultiPost-Android`.
The original signed 1.8/code 8 bundle and source remain untouched. This branch
sets version 1.9/code 9 and adds Google Play Billing 9.1.0.

Package: `uk.co.multipostapp`; min SDK 24; target SDK 36. The existing WebView,
Firebase authentication, Google sign-in, document picker, and navigation remain
in place. Native Google sign-in and Billing now use AndroidX WebKit 1.15.0
origin-aware messages restricted to the trusted top-level frame. Devices whose
WebView lacks `WEB_MESSAGE_LISTENER` have no native purchase bridge; Google
sign-in displays an update message and email sign-in remains available.
No signing key or password is committed. `app/google-services.json`
is ignored; copy the existing file into this local working copy to build.

The native billing bridge offers `multipost_pro` with `monthly` and `yearly`
base plans, and restores purchases. Google Play determines eligibility for any
seven-day introductory offer. The app forwards purchase tokens to the Worker
through the authenticated Settings page; only the Worker can grant access.

Build the unsigned debug variant locally with `./gradlew :app:assembleDebug
:app:testDebugUnitTest`. Do not build a signed release until the upload keystore
certificate has been verified against the existing bundle and Play Console.
The Gradle plugin remains 8.10.1; no toolchain migration was made.
The website is loaded from `https://multipostapp.co.uk/app.html`; the branch's
Google Play controls live in `settings.html`, which has not been deployed.
