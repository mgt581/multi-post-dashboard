const SW_VERSION = "2026-08-08-direct-oauth-worker";
const DIRECT_API_ORIGIN = "https://multipost-seo-worker.alexbryant.workers.dev";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function directWorkerUrl(url) {
  const target = new URL(DIRECT_API_ORIGIN);
  target.pathname = url.pathname;
  target.search = url.search;
  return target.toString();
}

async function fetchDirectWorker(request, url) {
  const init = {
    method: request.method,
    headers: new Headers(request.headers),
    redirect: "follow",
    credentials: "omit"
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.clone().arrayBuffer();
  }

  return fetch(directWorkerUrl(url), init);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Do not proxy ordinary cross-origin requests through this service worker.
  if (url.origin !== self.location.origin) {
    return;
  }

  // OAuth entry points and callbacks must be navigations. Route them directly
  // to the Cloudflare Worker so a broken custom-domain /api route cannot stop
  // YouTube, TikTok or Facebook account linking.
  if (url.pathname.startsWith("/api/auth/")) {
    event.respondWith(Response.redirect(directWorkerUrl(url), 302));
    return;
  }

  // Other API requests prefer the custom-domain route, but automatically fall
  // back to the direct Worker if that route is temporarily unavailable.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith((async () => {
      try {
        const primary = await fetch(event.request.clone());
        if (primary.status < 500) return primary;

        try {
          return await fetchDirectWorker(event.request, url);
        } catch (_) {
          return primary;
        }
      } catch (_) {
        try {
          return await fetchDirectWorker(event.request, url);
        } catch (_) {
          return new Response(
            JSON.stringify({ error: "The API is temporarily unavailable. Please retry." }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" }
            }
          );
        }
      }
    })());
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(fetch(event.request));
});
