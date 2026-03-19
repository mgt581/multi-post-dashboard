# multi-post-dashboard 

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
