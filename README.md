# multi-post-dashboard

## Google Cloud & Firebase Project Reference

The app uses **two separate Google Cloud projects**:

| Service | GCP Project Name | GCP Project Number / Firebase Project ID | Purpose |
|---------|-----------------|------------------------------------------|---------|
| Firebase Authentication + Hosting | `multi-post-daefc` | `1099160429576` | User auth, web hosting |
| YouTube / Google OAuth API | `multipost-youtube-api` | `72559136598` | YouTube Data API v3, OAuth 2.0 credentials |

### Firebase (Authentication & Hosting)

- **Firebase project ID**: `multi-post-daefc`
- Configured in `.firebaserc` as the default project.
- All HTML files use `projectId: "multi-post-daefc"` in their `firebaseConfig`.
- Deploy to Firebase Hosting with: `firebase deploy`

### Google Cloud — YouTube API

- **GCP project**: `multipost-youtube-api` (project number `72559136598`)
- Hosts the **YouTube Data API v3** and the **OAuth 2.0 client** used for YouTube account linking.
- The active OAuth client ID and secret are stored as Cloudflare Worker secrets
  (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`). Set them via:
  ```bash
  wrangler secret put GOOGLE_CLIENT_ID
  wrangler secret put GOOGLE_CLIENT_SECRET
  ```
- **Do not use the `multi-post-daefc` Firebase project** for YouTube API credentials — keep them on the dedicated `multipost-youtube-api` GCP project.

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
