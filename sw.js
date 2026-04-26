const SW_VERSION = "2026-04-26-google-owner-alias-2";
 
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request.clone()));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(fetch(event.request));
});
