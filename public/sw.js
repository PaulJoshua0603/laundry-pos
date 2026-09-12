// Bumped from v3 -> v4 so every client drops the caches written by the
// previous worker (which could still be holding stale page HTML).
const CACHE = "washhub-v4";

// Only genuinely static, non-versioned assets are pre-cached. "/" is
// deliberately NOT pre-cached any more: it is the app HTML, it changes on
// every deploy, and having a copy sitting in the cache is what let a stale
// page survive a normal reload.
const CORE_ASSETS = ["/manifest.json", "/logo.png"];

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Requests that are safe to cache-first: same-origin, truly static build
// output (hashed JS/CSS chunks, fonts, icons). Everything else — most
// importantly cross-origin data calls to Supabase (orders, counts) — must
// always hit the network, or the app silently shows stale data until the
// user force-refreshes.
function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  // Never cache Next.js dev/HMR traffic or route handlers.
  if (url.pathname.startsWith("/_next/webpack-hmr")) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/logo.png" ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Navigations are always network-first. On failure we fall back to a cached
  // copy purely so the till still opens offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Never let the service worker answer the service worker script itself —
  // that can pin a browser to an old worker indefinitely.
  if (url.pathname === "/sw.js") return;

  // Data/API calls (Supabase, etc.) — straight to the network, never cached,
  // so the app can't show orders from a stale cache.
  if (!isStaticAsset(url)) return;

  // Hashed static assets: cache-first is safe because the filename changes
  // whenever the content does.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            // Don't cache partial/opaque/error responses.
            if (!res || res.status !== 200 || res.type === "opaque") return res;
            const resClone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, resClone)).catch(() => {});
            return res;
          })
          .catch(() => cached)
    )
  );
});
