// Remembers where a visitor came from (e.g. ?src=card from the business card QR code),
// counts the visit once per browser session, and lets the app send the source with
// billing status so the sign-up is tagged. First source wins for 30 days.
(function () {
  var KEY = "mp_signup_source";
  var MAX_AGE = 30 * 24 * 60 * 60 * 1000;

  function clean(value) {
    var s = String(value || "").trim().toLowerCase();
    return /^[a-z0-9-]{1,30}$/.test(s) ? s : "";
  }

  function apiBase() {
    var host = window.location.hostname;
    if (host === "multipostapp.co.uk" || host === "www.multipostapp.co.uk") return "/api";
    if (host.endsWith(".pages.dev")) return "https://multipost-seo-worker-preview.alexbryant.workers.dev/api";
    return "https://multipost-seo-worker.alexbryant.workers.dev/api";
  }

  function read() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && clean(saved.src) && Date.now() - Number(saved.at || 0) < MAX_AGE) return saved.src;
    } catch (_) {}
    return "";
  }

  var src = "";
  try { src = clean(new URLSearchParams(window.location.search).get("src")); } catch (_) {}
  if (src) {
    if (!read()) {
      try { localStorage.setItem(KEY, JSON.stringify({ src: src, at: Date.now() })); } catch (_) {}
    }
    var seenKey = "mp_src_counted_" + src;
    var seen = false;
    try { seen = sessionStorage.getItem(seenKey) === "1"; sessionStorage.setItem(seenKey, "1"); } catch (_) {}
    if (!seen) {
      try { fetch(apiBase() + "/visit?src=" + encodeURIComponent(src), { method: "POST", keepalive: true, mode: "no-cors" }).catch(function () {}); } catch (_) {}
    }
  }

  window.mpSignupSource = read;
})();
