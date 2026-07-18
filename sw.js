const SW_VERSION = "2026-07-18-bypass-cross-origin-uploads";
 
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Do not proxy cross-origin requests through this service worker. In
  // particular, streaming video uploads can fail while being re-dispatched
  // from a service worker even though the same request succeeds in the page.
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request.clone()).catch(() => new Response(
        JSON.stringify({ error: "The API is temporarily unavailable. Please retry." }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" }
        }
      ))
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(fetch(event.request));
});
