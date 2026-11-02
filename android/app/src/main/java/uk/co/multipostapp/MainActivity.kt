package uk.co.multipostapp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var playBilling: PlayBillingManager
    private var filePickerCallback: ValueCallback<Array<Uri>>? = null
    private val googleSignIn = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val account = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        runCatching { account.getResult(ApiException::class.java) }
            .onSuccess { googleAccount ->
                // Forward the Google OAuth token, not a Firebase session token.
                // The page owns Firebase persistence for both sign-in methods.
                val token = googleAccount.idToken
                if (token.isNullOrBlank()) {
                    reportGoogleSignInFailure("Google did not return an ID token. Please try again.")
                } else {
                    deliverGoogleSignInResult("completeAndroidGoogleSignIn", token)
                }
            }
            .onFailure { error ->
                reportGoogleSignInFailure(error.message ?: "Google sign-in was cancelled")
            }
    }
    private val chooseFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val files = if (result.resultCode == Activity.RESULT_OK) WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data) else null
        filePickerCallback?.onReceiveValue(files)
        filePickerCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        playBilling = PlayBillingManager(this) { callback, jsonArgument ->
            runOnUiThread {
                if (isTrustedPage(webView.url)) {
                    webView.evaluateJavascript("window.$callback?.($jsonArgument)", null)
                }
            }
        }
        playBilling.start()
        CookieManager.getInstance().apply { setAcceptCookie(true); setAcceptThirdPartyCookies(webView, true) }
        webView.apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.userAgentString = settings.userAgentString + " MultiPostAndroid/1.5"
            // JavascriptInterface cannot identify the caller's frame. Both
            // native actions require a trusted main-frame message instead.
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                WebViewCompat.addWebMessageListener(
                    this, "AndroidAuth",
                    setOf("https://multipostapp.co.uk", "https://www.multipostapp.co.uk")
                ) { view, message, sourceOrigin, isMainFrame, _ ->
                    if (!isMainFrame || !isTrustedPage(sourceOrigin.toString()) ||
                        !isTrustedPage(view.url) || message.data != "requestGoogleSignIn") return@addWebMessageListener
                    runOnUiThread { if (isTrustedPage(webView.url)) launchGoogleSignIn() }
                }
                WebViewCompat.addWebMessageListener(
                    this, "AndroidBilling",
                    setOf("https://multipostapp.co.uk", "https://www.multipostapp.co.uk")
                ) { view, message, sourceOrigin, isMainFrame, _ ->
                    if (!isMainFrame || !isTrustedPage(sourceOrigin.toString()) ||
                        !isTrustedPage(view.url)) return@addWebMessageListener
                    val payload = runCatching { JSONObject(message.data ?: "") }.getOrNull()
                        ?: return@addWebMessageListener
                    runOnUiThread {
                        if (!isTrustedPage(webView.url)) return@runOnUiThread
                        when (payload.optString("action")) {
                            "queryPlans" -> playBilling.queryPlans()
                            "purchase" -> playBilling.purchase(
                                payload.optString("base_plan_id"), payload.optString("firebase_uid")
                            )
                            "changeWorkspaces" -> {
                                val ids = payload.optJSONArray("renewing_ids")
                                playBilling.changeWorkspaces(payload.optInt("target", -1),
                                    payload.optString("base_plan_id"), payload.optString("firebase_uid"),
                                    (0 until (ids?.length() ?: 0)).map { ids!!.optString(it) })
                            }
                            "restore" -> playBilling.restore()
                            "openManage" -> openOutsideApp(Uri.parse(
                                "https://play.google.com/store/account/subscriptions?package=uk.co.multipostapp"
                            ))
                        }
                    }
                }
            }
            webViewClient = MultiPostWebViewClient()
            webChromeClient = MultiPostChromeClient()
            setDownloadListener { url, _, _, _, _ -> openOutsideApp(Uri.parse(url)) }
            loadUrl(HOME_URL)
        }
        setContentView(webView)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (webView.canGoBack()) webView.goBack() else finish() }
        })
    }

    private fun openOutsideApp(uri: Uri) {
        runCatching {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        }.onFailure {
            Toast.makeText(this, "Could not open link", Toast.LENGTH_SHORT).show()
        }
    }

    private fun launchGoogleSignIn() {
        runCatching {
            val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(getString(R.string.default_web_client_id))
                .requestEmail()
                .build()
            googleSignIn.launch(GoogleSignIn.getClient(this, options).signInIntent)
        }.onFailure { reportGoogleSignInFailure(it.message ?: "Could not open Google sign-in") }
    }

    override fun onDestroy() {
        playBilling.close()
        super.onDestroy()
    }

    private fun isTrustedPage(url: String?): Boolean {
        val uri = Uri.parse(url ?: "")
        return uri.scheme == "https" && uri.host in setOf("multipostapp.co.uk", "www.multipostapp.co.uk")
    }

    private fun deliverGoogleSignInResult(callback: String, value: String) {
        runOnUiThread {
            if (isTrustedPage(webView.url)) {
                webView.evaluateJavascript("window." + callback + "?.(" + JSONObject.quote(value) + ")", null)
            }
        }
    }

    private fun reportGoogleSignInFailure(message: String) {
        deliverGoogleSignInResult("androidGoogleSignInFailed", message)
    }

    private fun isWebsiteOnlyRoute(uri: Uri): Boolean {
        val path = uri.path.orEmpty().lowercase()
        return listOf("pricing", "billing", "checkout", "subscription").any(path::contains)
    }

    private inner class MultiPostWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (uri.scheme !in setOf("http", "https")) { openOutsideApp(uri); return true }
            if (isWebsiteOnlyRoute(uri)) {
                Toast.makeText(this@MainActivity, "Billing is available on multipostapp.co.uk", Toast.LENGTH_LONG).show()
                return true
            }
            return if (uri.host == "multipostapp.co.uk" || uri.host == "www.multipostapp.co.uk") false else { openOutsideApp(uri); true }
        }

        override fun onPageFinished(view: WebView, url: String) {
            super.onPageFinished(view, url)
            if (Uri.parse(url).host in setOf("multipostapp.co.uk", "www.multipostapp.co.uk")) {
                view.evaluateJavascript(PUBLIC_ANDROID_MODE_SCRIPT, null)
            }
        }
    }

    private inner class MultiPostChromeClient : WebChromeClient() {
        override fun onShowFileChooser(view: WebView, filePathCallback: ValueCallback<Array<Uri>>, fileChooserParams: FileChooserParams): Boolean {
            filePickerCallback?.onReceiveValue(null)
            filePickerCallback = filePathCallback
            // ACTION_GET_CONTENT can be redirected through the Photo Picker.
            // Its proxy URI metadata can make Chromium reject multipart uploads
            // with ERR_UPLOAD_FILE_CHANGED. The document provider supplies a
            // stable readable URI without requiring broad media permissions.
            val intent = fileChooserParams.createIntent().apply {
                action = Intent.ACTION_OPEN_DOCUMENT
                addCategory(Intent.CATEGORY_OPENABLE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, fileChooserParams.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
                val acceptedTypes = fileChooserParams.acceptTypes.filter { it.contains("/") }
                if (acceptedTypes.size > 1) {
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, acceptedTypes.toTypedArray())
                }
            }
            runCatching { chooseFile.launch(intent) }.onFailure {
                filePickerCallback?.onReceiveValue(null)
                filePickerCallback = null
                Toast.makeText(this@MainActivity, "Could not open the file picker. Please try again.", Toast.LENGTH_LONG).show()
            }
            return true
        }
    }

    companion object {
        private const val HOME_URL = "https://multipostapp.co.uk/app.html"
        private const val PUBLIC_ANDROID_MODE_SCRIPT = """
            (() => {
              const isSignIn = /signin|sign-in/i.test(location.pathname);
              if (isSignIn) {
                let button = document.getElementById('googleButton');
                if (!button) {
                  button = document.createElement('button');
                  button.id = 'googleButton';
                  button.type = 'button';
                  button.textContent = 'Continue with Google';
                  button.style.cssText = 'width:100%;margin-top:12px;padding:13px 16px;border:0;border-radius:12px;background:#fff;color:#0f172a;font:inherit;font-weight:800;cursor:pointer;';
                  const form = document.getElementById('authForm');
                  if (form) form.insertAdjacentElement('afterend', button);
                }
                button.style.display = 'block';
                if (!button.dataset.androidBound) {
                  button.dataset.androidBound = 'true';
                  button.addEventListener('click', (event) => {
                    event.preventDefault(); event.stopImmediatePropagation();
                    if (window.AndroidAuth?.postMessage) window.AndroidAuth.postMessage('requestGoogleSignIn');
                    else window.androidGoogleSignInFailed?.('Update Android System WebView to use Google sign-in. Email sign-in remains available.');
                    return false;
                  }, true);
                }
                window.completeAndroidGoogleSignIn = window.completeAndroidGoogleSignIn || (async (idToken) => {
                  try {
                    const appModule = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
                    const authModule = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
                    const config = {apiKey:'AIzaSyDJBCJrMwyjLiMFG7QhfG09cKZa_2Y4UGM',authDomain:'multi-post-daefc.firebaseapp.com',projectId:'multi-post-daefc',storageBucket:'multi-post-daefc.appspot.com',messagingSenderId:'1099160429576',appId:'1:1099160429576:web:6c31651e46d6ad1cd35dbd'};
                    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(config);
                    const auth = authModule.getAuth(app);
                    await authModule.setPersistence(auth, authModule.browserLocalPersistence);
                    const result = await authModule.signInWithCredential(auth, authModule.GoogleAuthProvider.credential(idToken));
                    localStorage.setItem('currentUserKey', (result.user.email ? result.user.email.trim().toLowerCase() : result.user.uid));
                    location.replace('app.html');
                  } catch (error) {
                    const message = document.getElementById('message');
                    if (message) message.textContent = error?.message || 'Google sign-in failed. Please try again.';
                  }
                });
                window.androidGoogleSignInFailed = window.androidGoogleSignInFailed || ((messageText) => {
                  const message = document.getElementById('message');
                  if (message) message.textContent = messageText || 'Google sign-in failed. Please try again.';
                });
              }

              const hideBillingLinks = () => {
                const hiddenLabels = /pricing|billing|subscription|upgrade/i;
                document.querySelectorAll('a, button').forEach((element) => {
                  const href = (element.getAttribute('href') || '').toLowerCase();
                  const label = (element.innerText || element.textContent || '').trim();
                  if (element.id !== 'googleButton' && (hiddenLabels.test(label) || /pricing|billing|checkout|subscription/.test(href))) {
                    element.style.display = 'none';
                    element.setAttribute('aria-hidden', 'true');
                    element.tabIndex = -1;
                  }
                });
              };

              const injectSupportSection = () => {
                if (document.getElementById('androidContactSupportSection')) {
                  return;
                }

                let container = null;
                const selectors = [
                  '#settings', '#settingsSection', '#settings-section', '#settingsTab', '#settings-tab',
                  '#settingsContainer', '#settings-container', '#settingsPage', '#settings-page', '#settingsView', '#settings-view',
                  '[data-tab="settings"]', '[data-page="settings"]', '[data-section="settings"]', '[data-view="settings"]',
                  '.settings-section', '.settings-container', '.settings-page', '.settings-tab'
                ];

                for (let i = 0; i < selectors.length; i++) {
                  const el = document.querySelector(selectors[i]);
                  if (el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0 || window.getComputedStyle(el).display !== 'none')) {
                    container = el;
                    break;
                  }
                }

                if (!container) {
                  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, legend, .section-title, .card-title, .page-title'));
                  const settingsHeading = headings.find(h => {
                    const txt = (h.textContent || '').trim();
                    return /^settings$/i.test(txt) || /account settings/i.test(txt) || /app settings/i.test(txt);
                  });

                  if (settingsHeading) {
                    container = settingsHeading.closest('.card, .section, .panel, .tab-pane, section, main, [role="tabpanel"]') || settingsHeading.parentElement;
                  }
                }

                if (!container && (/#settings/i.test(location.hash) || /[?&](tab|page|view)=settings/i.test(location.search) || /\/settings/i.test(location.pathname))) {
                  container = document.querySelector('main, #app, #content, .main-content, .content, body');
                }

                if (container) {
                  const card = document.createElement('div');
                  card.id = 'androidContactSupportSection';

                  const computedColor = window.getComputedStyle(container).color || 'rgb(0,0,0)';
                  const rgbMatch = computedColor.match(/\d+/g);
                  let isDark = true;
                  if (rgbMatch && rgbMatch.length >= 3) {
                    const brightness = (parseInt(rgbMatch[0]) * 299 + parseInt(rgbMatch[1]) * 587 + parseInt(rgbMatch[2]) * 114) / 1000;
                    isDark = brightness > 128;
                  }

                  const cardBg = isDark ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc';
                  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0';
                  const cardTextColor = isDark ? '#f8fafc' : '#0f172a';
                  const subTextColor = isDark ? 'rgba(255, 255, 255, 0.7)' : '#64748b';
                  const emailBg = isDark ? 'rgba(255, 255, 255, 0.08)' : '#ffffff';
                  const emailBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1';

                  card.style.cssText = 'margin: 20px 0; padding: 20px; background: ' + cardBg + '; border: 1px solid ' + cardBorder + '; border-radius: 16px; color: ' + cardTextColor + '; font-family: inherit; box-sizing: border-box;';

                  card.innerHTML =
                    '<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">' +
                      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' +
                      '<h3 style="margin: 0; font-size: 18px; font-weight: 700; color: ' + cardTextColor + ';">Contact Us &amp; Support</h3>' +
                    '</div>' +
                    '<p style="margin: 0 0 16px 0; font-size: 14px; color: ' + subTextColor + '; line-height: 1.4;">Need help or have questions? Get in touch with our team directly.</p>' +
                    '<div style="display: flex; flex-direction: column; gap: 10px;">' +
                      '<a href="mailto:info@multipostapp.co.uk?subject=MultiPost%20Support" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: ' + emailBg + '; border: 1px solid ' + emailBorder + '; border-radius: 12px; color: ' + cardTextColor + '; text-decoration: none; font-weight: 600; font-size: 14px; box-sizing: border-box;">' +
                        '<div style="display: flex; align-items: center; gap: 10px;">' +
                          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>' +
                          '<span>Email Support</span>' +
                        '</div>' +
                        '<span style="font-size: 13px; color: ' + subTextColor + '; font-weight: 500;">info@multipostapp.co.uk</span>' +
                      '</a>' +
                      '<a href="https://wa.me/447843969254" target="_blank" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #25D366; border-radius: 12px; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; box-sizing: border-box;">' +
                        '<div style="display: flex; align-items: center; gap: 10px;">' +
                          '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c-.001 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662a11.87 11.87 0 005.707 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>' +
                          '<span>WhatsApp Support</span>' +
                        '</div>' +
                        '<span style="font-size: 13px; color: rgba(255,255,255,0.9); font-weight: 600;">07843969254</span>' +
                      '</a>' +
                    '</div>';

                  container.appendChild(card);
                }
              };

              hideBillingLinks();
              injectSupportSection();

              if (!window.__multipostObserver) {
                window.__multipostObserver = true;
                setInterval(() => {
                  hideBillingLinks();
                  injectSupportSection();
                }, 1000);
              }
            })();
        """
    }
}
