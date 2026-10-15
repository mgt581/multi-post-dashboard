const SW_VERSION = "2026-08-08-oauth-single-shot-nostore";
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
    credentials: "omit",
    cache: "no-store"
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

  // OAuth entry points and callbacks are one-shot navigations. Send them
  // directly to the Cloudflare Worker and explicitly prevent caching/replay.
  // This is critical for TikTok because authorization codes can be exchanged
  // only once and expire quickly.
  if (url.pathname.startsWith("/api/auth/")) {
    event.respondWith(new Response(null, {
      status: 302,
      headers: {
        "Location": directWorkerUrl(url),
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    }));
    return;
  }

  // Other API requests prefer the custom-domain route, but automatically fall
  // back to the direct Worker if that route is temporarily unavailable.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith((async () => {
      try {
        const primary = await fetch(event.request.clone(), { cache: "no-store" });
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
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
            }
          );
        }
      }
    })());
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(fetch(event.request));
});
