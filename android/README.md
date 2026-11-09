# MultiPost Android 1.9.2 (version code 11)

Prepared 9 November 2026 to repair workspace add-on purchases. The published
code-10 bundle was inspected and does not include the workspace billing bridge.
This build includes it. Debug and unsigned release builds succeeded with JDK 17,
Gradle 8.11.1, and the existing Android Gradle Plugin 8.10.1.

Open this folder in Android Studio. In **Settings → Build, Execution,
Deployment → Build Tools → Gradle**, select JDK 17. This Mac has it installed at
`/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`.

Use **Build → Generate Signed App Bundle / APK → Android App Bundle**, select
the existing MultiPost upload keystore and alias, and enter the signing passwords
locally. Do not put passwords in chat or commit them. Upload the signed code-11
bundle to internal testing first. Test that the extra workspace price appears,
Add opens Google Play checkout, and server-verified payment permits creation of
one more workspace. See `docs/android-workspace-release-1.9.2.md` in the repository.

The generated unsigned bundle is not ready to upload to Play Console.

## Historical setup notes (superseded where different above)

This source was copied from the confirmed version 1.8 Android Studio project at
`/Users/alexb/Documents/Codex/2026-10-16/new-chat-7/MultiPost-Android`.
The original signed 1.8/code 8 bundle and source remain untouched. This branch
sets version 1.9.1/code 10 and uses Google Play Billing 9.1.0.

Package: `uk.co.multipostapp`; min SDK 24; target SDK 36. The existing WebView,
Firebase authentication, Google sign-in, document picker, and navigation remain
in place. Native Google sign-in and Billing now use AndroidX WebKit 1.15.0
origin-aware messages restricted to the trusted top-level frame. Devices whose
WebView lacks `WEB_MESSAGE_LISTENER` have no native purchase bridge; Google
sign-in displays an update message and email sign-in remains available.
No signing key or password is committed. `app/google-services.json`
is ignored. The verified 1.8 backup's Firebase configuration was copied to
this isolated clone (same package `uk.co.multipostapp` and Firebase project).
It remains ignored by Git and is not part of any commit.

The native billing bridge offers `multipost_pro` with `monthly` and `yearly`
base plans, ten distinct workspace add-on products (`multipost_workspace_01`
through `_10`) with matching monthly/yearly periods, and restores purchases.
Google Play determines eligibility for any seven-day introductory offer. The
app forwards purchase tokens to the Worker through authenticated Settings;
only the Worker can grant access. The add-on controls stay hidden if the
complete catalogue is unavailable or the device's Play region is South Korea.

Open this `android` directory in Android Studio and run
`./gradlew :app:assembleDebug :app:testDebugUnitTest` in its Terminal.
The restricted Work shell cannot start Gradle's daemon because local socket
binding is denied; Kotlin compilation has not been verified here. Do not
build a signed release until the upload keystore certificate has been verified
against the existing bundle and Play Console. Run this command locally; it
prompts for the password without placing it on the command line:

```sh
'/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool' -list -v -keystore '/Users/alexb/Desktop/multipost-upload.jks' -alias multipost
```

The required SHA-256 is
`3D:37:61:C3:F4:61:CC:82:BF:E6:86:D2:95:F0:82:3C:A2:6A:5D:01:5B:8C:31:2D:78:AF:47:23:E0:D4:BD:1A`.
The keystore alias certificate has not yet been confirmed. Check the highest
Play Console version code is below 10. After a successful debug build, native
tests, keystore match and explicit signing approval, Android Studio's
**Build → Generate Signed App Bundle / APK → Android App Bundle** can use the
existing keystore and alias. Never store the password in source or chat.
The Gradle plugin remains 8.10.1; no toolchain migration was made.
The website is loaded from `https://multipostapp.co.uk/app.html`; the branch's
Google Play controls live in `settings.html`, which has not been deployed.
