/*
 * One-time tip for iPhone/iPad Safari: add MultiPost to the Home Screen.
 * Hidden in the Android app, when already opened from the Home Screen,
 * and after the visitor closes it.
 */
(function () {
  "use strict";
  var KEY = "mp_ios_install_tip_closed";
  var ua = navigator.userAgent || "";
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/i.test(ua);
  var standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  if (!isIOS || !isSafari || standalone || /MultiPostAndroid\//i.test(ua)) return;
  try { if (localStorage.getItem(KEY) === "1") return; } catch (_) {}

  function show() {
    var tip = document.createElement("div");
    tip.id = "mpIosInstallTip";
    tip.setAttribute("role", "dialog");
    tip.setAttribute("aria-label", "Add MultiPost to your Home Screen");
    tip.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:60;" +
      "display:flex;gap:12px;align-items:center;padding:14px 14px 14px 16px;border-radius:16px;" +
      "background:#13253e;border:1px solid rgba(125,211,252,.45);color:#e2e8f0;box-shadow:0 12px 30px rgba(0,0,0,.45);" +
      "font:500 14px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
    tip.innerHTML = '<img src="apple-touch-icon.png?v=20260424" alt="" width="40" height="40" style="border-radius:10px;flex:none">' +
      '<div style="flex:1"><b style="display:block;color:#fff">Get the MultiPost app on your iPhone</b>' +
      'Tap <span aria-label="Share">Share ⬆︎</span>, then <b>Add to Home Screen</b>.</div>' +
      '<button type="button" aria-label="Close" style="flex:none;background:none;border:0;color:#94a3b8;font-size:22px;line-height:1;padding:4px 6px;cursor:pointer">×</button>';
    tip.querySelector("button").addEventListener("click", function () {
      try { localStorage.setItem(KEY, "1"); } catch (_) {}
      tip.remove();
    });
    document.body.appendChild(tip);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
})();
