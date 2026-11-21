/*
 * Free plan strip shown at the top of the main pages.
 * Pages call window.mpFreePosts.render(billing) with the /api/billing/status
 * "billing" object. The strip appears only for accounts without a plan
 * (billing.free_posts is set) and hides itself for trial, paid and owner accounts.
 */
(function () {
  "use strict";

  var STYLE = [
    "#mpFreePosts{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 12px;",
    "padding:10px 16px;background:linear-gradient(90deg,#16a34a,#0ea5e9);color:#fff;font:600 14px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.25)}",
    "#mpFreePosts.used{background:linear-gradient(90deg,#7c3aed,#0ea5e9)}",
    "#mpFreePosts a{color:#fff;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:4px 12px;text-decoration:none;white-space:nowrap}",
    "#mpFreePosts b{font-weight:800}"
  ].join("");

  function n(value) { return Math.max(0, Number(value) || 0); }

  function strip() {
    var el = document.getElementById("mpFreePosts");
    if (el) return el;
    if (!document.getElementById("mpFreePostsStyle")) {
      var style = document.createElement("style");
      style.id = "mpFreePostsStyle";
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    el = document.createElement("div");
    el.id = "mpFreePosts";
    el.setAttribute("role", "status");
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  function render(billing) {
    var existing = document.getElementById("mpFreePosts");
    var left = billing && billing.free_posts;
    if (!billing || billing.access || billing.owner_mode || !left) {
      if (existing) existing.remove();
      return;
    }
    var yt = n(left.youtube), tt = n(left.tiktok), fb = n(left.facebook);
    var lapsed = billing.status === "canceled" || billing.status === "expired";
    var el = strip();
    el.className = yt + tt + fb > 0 ? "" : "used";
    if (lapsed) {
      el.innerHTML = "<span>Your workspace and connected accounts are saved.</span>" +
        "<a href=\"pricing.html\">Choose a plan to post again</a>";
    } else if (yt + tt + fb > 0) {
      el.innerHTML = "<span>🎁 <b>Free plan:</b> " + yt + " YouTube · " + tt + " TikTok · " + fb +
        " Facebook posts left.</span><span>No card needed. Your accounts stay connected, then a 7-day free trial.</span>";
    } else {
      el.innerHTML = "<span>You've used your free posts. Your setup is saved.</span>" +
        "<a href=\"pricing.html\">Start your 7-day free trial</a>";
    }
  }

  window.mpFreePosts = { render: render };
})();
