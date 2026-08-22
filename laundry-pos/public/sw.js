const CACHE = "washhub-v2";
const CORE_ASSETS = ["/", "/manifest.json", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Requests that are safe to cache-first: same-origin, truly static build
// output (hashed JS/CSS chunks, fonts, icons). Everything else — most
// importantly cross-origin data calls to Supabase (order counts, etc.) —
// must always hit the network, or the app silently shows stale data
// (e.g. an old order count) until the user force-refreshes.
function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/logo.png" ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  );
}

// Network-first for navigation, cache-first only for static assets,
// network-only (never cached) for everything else — API/data calls.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  const url = new URL(req.url);
  if (!isStaticAsset(url)) {
    // Data/API calls (Supabase, etc.) — always go to the network so the
    // app never shows counts/records from a stale cache.
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            const resClone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, resClone));
            return res;
          })
          .catch(() => cached)
    )
  );
});
