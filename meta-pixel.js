/*
 * Meta Pixel for the public marketing pages, gated behind cookie consent.
 *
 * - Nothing is loaded from Meta until the visitor clicks "Accept".
 * - The choice is remembered in localStorage ("mp_ads_consent").
 * - Never runs inside the Android app wrapper.
 * - Pages fire extra events with window.mpTrack("EventName", {...});
 *   it resolves after a short delay so a redirect straight afterwards
 *   doesn't cancel the request.
 */
(function () {
  "use strict";

  var PIXEL_ID = "2351180265648862"; // Meta dataset: "MultiPost Website" (Bryant digital solutions)
  var KEY = "mp_ads_consent";

  function store(get, value) {
    try {
      if (get) return localStorage.getItem(KEY);
      localStorage.setItem(KEY, value);
    } catch (_) {}
    return null;
  }

  var params = new URLSearchParams(location.search);
  var platform = params.get("app_platform");
  try { platform = platform || localStorage.getItem("app_platform"); } catch (_) {}
  var inAndroidApp = platform === "android" || /MultiPostAndroid\//i.test(navigator.userAgent || "");

  var loaded = false;

  function loadPixel() {
    if (loaded || inAndroidApp) return;
    loaded = true;
    /* Standard Meta Pixel base code */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0";
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", PIXEL_ID);
    window.fbq("track", "PageView");
  }

  window.mpTrack = function (eventName, data) {
    if (!loaded || typeof window.fbq !== "function") return Promise.resolve(false);
    try { window.fbq("track", eventName, data || {}); } catch (_) { return Promise.resolve(false); }
    return new Promise(function (resolve) { setTimeout(function () { resolve(true); }, 400); });
  };

  // Lets the privacy page offer "change my choice".
  window.mpResetAdsConsent = function () {
    try { localStorage.removeItem(KEY); } catch (_) {}
    location.reload();
  };

  function showBanner() {
    var css = document.createElement("style");
    css.textContent =
      "#mp-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;margin:0 auto;" +
      "background:#0b1829;color:#e2e8f0;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:16px 18px;" +
      "box-shadow:0 18px 50px rgba(0,0,0,.45);font:14px/1.5 Manrope,system-ui,-apple-system,sans-serif}" +
      "#mp-consent p{margin:0 0 12px}#mp-consent a{color:#7dd3fc}" +
      "#mp-consent .row{display:flex;gap:10px;flex-wrap:wrap}" +
      "#mp-consent button{flex:1;min-width:120px;padding:11px 14px;border-radius:11px;font:inherit;font-weight:800;cursor:pointer;border:1px solid rgba(255,255,255,.14)}" +
      "#mp-consent .yes{background:linear-gradient(135deg,#7c3aed,#0ea5e9);color:#fff;border:0}" +
      "#mp-consent .no{background:rgba(255,255,255,.06);color:#fff}";
    document.head.appendChild(css);

    var box = document.createElement("div");
    box.id = "mp-consent";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Cookie choice");
    box.innerHTML =
      '<p>We\'d like to use a Meta (Facebook) cookie to measure how well our ads work. ' +
      'It only loads if you accept. <a href="privacy.html#cookies">Learn more</a></p>' +
      '<div class="row"><button type="button" class="no">Decline</button>' +
      '<button type="button" class="yes">Accept</button></div>';
    document.body.appendChild(box);

    box.querySelector(".yes").addEventListener("click", function () {
      store(false, "granted");
      box.remove();
      loadPixel();
    });
    box.querySelector(".no").addEventListener("click", function () {
      store(false, "denied");
      box.remove();
    });
  }

  if (inAndroidApp) return;

  var choice = store(true);
  if (choice === "granted") {
    loadPixel();
  } else if (choice !== "denied") {
    if (document.body) showBanner();
    else document.addEventListener("DOMContentLoaded", showBanner);
  }
})();
