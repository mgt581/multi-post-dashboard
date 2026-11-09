# Android 1.9.3 / version code 12

The version-code-11 bundle built from the existing Android Studio project still
omitted `changeWorkspaces`, the workspace catalogue callback, and the Android
social connection bridge. Changing the version number did not bring the current
repository's native fixes into that older checkout.

The existing Studio project's native activity, billing manager, manifest, app
build configuration and ignored Firebase config were updated from the verified
source. Other project files, signing setup, toolchain settings and pre-existing
website/Worker changes were preserved. The affected old files were backed up.

Version code 11 is already on internal testing, so the corrected build uses
1.9.3/code 12. The actual Studio project successfully ran `assembleDebug`,
`bundleRelease`, and `testDebugUnitTest` with its existing Gradle 9.6/JDK 25
toolchain. There are no native unit test source files. The resulting debug APK
reports `uk.co.multipostapp`, version 1.9.3/code 12. Release AAB inspection confirms
all workspace purchase and Android return hooks. The previous 148 JavaScript
tests cover the unchanged shared-page/server implementation.

Generate a new signed release AAB in that same Studio project. The Play upload
must show 1.9.3/code 12. Use internal testing first; verify the phone updates to
1.9.3, Google sign-in works, social connection returns to the app, and the next
workspace shows its Play price and opens the add-on purchase sheet. A completed
real-device purchase has not yet been verified.
