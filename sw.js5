# create sw.js
cat > sw.js <<'EOF'
const SW_VERSION = "2026-03-15-1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(fetch(event.request));
});
EOF

git add sw.js
git commit -m "Add browser service worker; bypass /api cache"
git push origin main
