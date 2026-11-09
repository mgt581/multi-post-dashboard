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
