"use client";

import { useEffect } from "react";

/* ══════════════════════════════════════════════════════════════════
   Service worker registration.

   Two things here directly caused the "I have to press Ctrl+Shift+R
   to see my changes" problem:

   1. The SW was registered in development too. Once installed on
      localhost it kept serving cached /_next/static chunks, so code
      changes (and anything rendered from them) appeared stale until a
      cache-bypassing reload. In dev we now actively UNREGISTER any SW
      and delete its caches, which also cleans up installs left behind
      by earlier visits.

   2. `controllerchange` reloaded the page unconditionally. On a first
      visit there is no previous controller, so `clients.claim()` fired
      it and the page reloaded for no reason — on a slow connection
      that could loop. We now only reload when a NEW worker replaced an
      existing one, which is the case that genuinely needs it.
   ══════════════════════════════════════════════════════════════════ */

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // ── Development: make sure no service worker is in the way. ──
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => {
          if (typeof caches === "undefined") return;
          return caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
        })
        .catch(() => {
          /* nothing to clean up */
        });
      return;
    }

    // Was the page already under a worker's control when we started?
    // Only in that case does a controller change mean "a new version
    // took over" and warrant a reload.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;

    const onControllerChange = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // A new SW may already be waiting from a previous visit — activate it now.
        if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage("SKIP_WAITING");
            }
          });
        });

        // Check for a new deploy on load, and again whenever the till is
        // brought back to the foreground, so a shop that leaves the tab open
        // for days still picks up updates without a manual refresh.
        const check = () => reg.update().catch(() => {});
        check();
        const onFocus = () => {
          if (document.visibilityState === "visible") check();
        };
        document.addEventListener("visibilitychange", onFocus);
      })
      .catch(() => {
        /* ignore registration failures (e.g. running on http) */
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
