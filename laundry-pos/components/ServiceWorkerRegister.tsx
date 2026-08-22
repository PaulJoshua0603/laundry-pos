"use client";

import { useEffect } from "react";

// Registers the SW and forces it to take over immediately when a new
// version deploys, so users see fresh data (order counts, etc.) on the
// next normal load instead of needing a manual hard refresh.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

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

        // Also proactively check for an update right away.
        reg.update().catch(() => {});
      })
      .catch(() => {
        /* ignore registration failures (e.g. running on http in dev) */
      });
  }, []);
  return null;
}
