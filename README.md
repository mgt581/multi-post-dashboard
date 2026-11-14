# multi-post-dashboard

## Google Cloud & Firebase Project Reference

Everything runs in **one Google Cloud / Firebase project**: `multi-post-daefc` (project number `1099160429576`).

| Service | Where it lives |
|---------|----------------|
| Firebase Authentication | `multi-post-daefc` |
| YouTube Data API v3 + Google OAuth client | `multi-post-daefc` |
| Google Play billing service account (`multipost-play-billing@…`) | `multi-post-daefc` |

- All HTML files use `projectId: "multi-post-daefc"` in their `firebaseConfig`, and `android/app/google-services.json` points at the same project.
- The active OAuth client ID is  
  `1099160429576-38kfvgqfgahc80oc11v1abl79n1gdspm.apps.googleusercontent.com`  
  (set as `GOOGLE_CLIENT_ID` in `wrangler.toml`; its secret is the `GOOGLE_CLIENT_SECRET` Worker secret).
- The old `multipost-youtube-api` project was unused and was shut down on 14 Nov 2026.
- `.firebaserc` sets `multi-post-daefc` as the default Firebase project.

---

## Firebase Android Setup (google-services.json)

The `google-services.json` file must live in the **app module** directory. It will not work if it is placed in the project root.

### Step-by-step placement
1. In Android Studio, switch the top-left dropdown from **Android** to **Project**.
2. Expand your project name → expand the **app** folder.
3. Drag and drop your `google-services.json` directly into the `app` folder.
4. Switch back to the **Android** view.

### Verification checklist

**App-level `build.gradle.kts` (inside `/app`)** should apply the Google Services plugin:
```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    id("com.google.gms.google-services")
}
```

**Project-level `build.gradle.kts`** should declare the plugin:
```kotlin
plugins {
    // Other plugins...
    id("com.google.gms.google-services") version "4.4.1" apply false
}
```

### Common pitfalls
- **Filename**: ensure it is exactly `google-services.json` (no “(1)” suffix).
- **Syncing**: click **Sync Now** in Android Studio after moving the file or updating Gradle.
