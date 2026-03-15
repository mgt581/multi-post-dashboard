// /sw.js  (BROWSER SERVICE WORKER)
const SW_VERSION = "2026-03-15-1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ✅ Never cache or intercept API calls (prevents stale SEO / prompt echo)
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  // ✅ Navigation: network-first (keeps app fresh)
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  // ✅ Everything else: pass-through
  event.respondWith(fetch(event.request));
});
