"use client";

import { useEffect } from "react";
import twemoji from "twemoji";

/* ══════════════════════════════════════════════════════════
   Some emoji used across the app (🫧 bubbles especially) were
   added to Unicode after Windows 10's bundled Segoe UI Emoji
   font was last updated, so they render as a blank box on many
   Windows 10 builds. Twemoji swaps every emoji character in the
   DOM for a small SVG image, so the icons look identical on any
   device/OS instead of depending on the local emoji font.
   ══════════════════════════════════════════════════════════ */

let scheduled = false;

function parseNow() {
  if (typeof document === "undefined") return;
  twemoji.parse(document.body, {
    folder: "svg",
    ext: ".svg",
    className: "emoji",
  });
}

export default function EmojiParser() {
  useEffect(() => {
    parseNow();

    // React re-renders constantly (new orders, cart changes, view
    // switches) which introduces fresh emoji text nodes, so watch
    // the DOM and re-parse whenever it changes, debounced to avoid
    // doing this on every keystroke.
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        parseNow();
        scheduled = false;
      });
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
