const SW_VERSION = "2026-10-20-preview-api-routing";
const PRODUCTION_API_ORIGIN = "https://multipost-seo-worker.alexbryant.workers.dev";
const PREVIEW_API_ORIGIN = "https://multipost-seo-worker-preview.alexbryant.workers.dev";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function directWorkerUrl(url) {
  const apiOrigin = self.location.hostname.endsWith(".pages.dev")
    ? PREVIEW_API_ORIGIN
    : PRODUCTION_API_ORIGIN;
  const target = new URL(apiOrigin);
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

  // OAuth state cookies belong to this origin. Never redirect/proxy these
  // requests: a 302 converts POST to GET and cross-host routing loses cookies.
  // Let the browser perform the original request, including Set-Cookie handling.
  if (url.pathname.startsWith("/api/auth/")) return;

  // Other API requests prefer the custom-domain route, but automatically fall
  // back to the direct Worker if that route is temporarily unavailable.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith((async () => {
      if (self.location.hostname.endsWith(".pages.dev")) {
        try {
          return await fetchDirectWorker(event.request, url);
        } catch (_) {
          return new Response(
            JSON.stringify({ error: "The preview API is temporarily unavailable. Please retry." }),
            { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
          );
        }
      }
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
