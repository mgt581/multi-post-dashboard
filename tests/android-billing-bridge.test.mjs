import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('native purchase messages require a trusted main-frame origin and have no JavaScriptInterface fallback', async () => {
  const native = await readFile(new URL('../android/app/src/main/java/uk/co/multipostapp/MainActivity.kt', import.meta.url), 'utf8');
  assert.match(native, /WebViewFeature\.isFeatureSupported\(WebViewFeature\.WEB_MESSAGE_LISTENER\)/);
  assert.match(native, /WebViewCompat\.addWebMessageListener\(/);
  assert.match(native, /!isMainFrame \|\| !isTrustedPage\(sourceOrigin\.toString\(\)\)/);
  assert.match(native, /setOf\("https:\/\/multipostapp\.co\.uk", "https:\/\/www\.multipostapp\.co\.uk"\)/);
  assert.doesNotMatch(native, /addJavascriptInterface\(/);
  assert.match(native, /"AndroidAuth"[\s\S]*?message\.data != "requestGoogleSignIn"/);
});

test('settings posts purchase actions only through the origin-aware bridge on Android', async () => {
  const [settings, native, app] = await Promise.all([
    readFile(new URL('../settings.html', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/uk/co/multipostapp/MainActivity.kt', import.meta.url), 'utf8'),
    readFile(new URL('../app.html', import.meta.url), 'utf8')
  ]);
  assert.match(settings, /window\.AndroidBilling\.postMessage\(JSON\.stringify/);
  assert.match(settings, /playControls" class="billing-actions" hidden/);
  assert.match(settings, /window\.AndroidBilling && isAndroidWrapper\(\)/);
  assert.match(native, /private const val HOME_URL = "https:\/\/multipostapp\.co\.uk\/app\.html"/);
  assert.match(settings, /owned_ids: currentBilling\.workspace_product_ids/);
  assert.match(native, /payload\.optJSONArray\("owned_ids"\)/);
  assert.match(app, /href=['"]settings\.html['"]|location\.href=['"]settings\.html['"]/);
});

test('Android 1.9.8 buys extra workspaces as standalone subscriptions, not Pro add-on lines', async () => {
  const { readFile } = await import('node:fs/promises');
  const billing = await readFile(new URL('../android/app/src/main/java/uk/co/multipostapp/PlayBillingManager.kt', import.meta.url), 'utf8');
  const main = await readFile(new URL('../android/app/src/main/java/uk/co/multipostapp/MainActivity.kt', import.meta.url), 'utf8');
  const gradle = await readFile(new URL('../android/app/build.gradle.kts', import.meta.url), 'utf8');
  const buy = billing.slice(billing.indexOf('fun buyWorkspace('), billing.indexOf('fun restore()'));
  assert.ok(buy.length > 0);
  assert.doesNotMatch(buy, /SubscriptionUpdateParams|setSubscriptionProductReplacementParams|setOldPurchaseToken/);
  assert.match(buy, /setObfuscatedAccountId\(accountHash\)/);
  assert.match(buy, /take\(9\)/);
  assert.match(billing, /onMultiPostWorkspacePurchase/);
  assert.match(main, /"buyWorkspace" ->/);
  assert.match(main, /"manageWorkspace" ->/);
  assert.match(gradle, /versionCode = 16/);
  assert.match(gradle, /versionName = "1\.9\.8"/);
});
