"use client";

/* ══════════════════════════════════════════════════════════
   Emoji rendering — intentionally a no-op component now.

   This used to run twemoji over `document.body` behind a
   MutationObserver, swapping every emoji character for an <img>.
   Two problems with that:

     1. twemoji.parse() mutates the DOM, which re-triggers the
        observer, which parses again — an endless parse loop
        running on every animation frame for the life of the tab.

     2. More seriously, it rewrote nodes that React owns. React's
        virtual DOM still believed the original text nodes were
        there, so subsequent updates either silently no-ops'd or
        threw "Failed to execute 'removeChild' on 'Node'". That is
        why new orders and edits often didn't show up until a hard
        refresh (Ctrl+Shift+R) — React was updating a tree that no
        longer matched the real document.

   The original motivation was real: some emoji used in the app
   (🫧 especially) postdate the Segoe UI Emoji build shipped with
   many Windows 10 installs and render as a blank box. That is now
   handled the safe way — "Noto Color Emoji" is loaded as a webfont
   in app/layout.tsx and sits in the global font stack in
   globals.css, so the glyphs come from the font instead of from
   DOM surgery.

   Kept as a component so the import in layout.tsx stays valid.
   ══════════════════════════════════════════════════════════ */

export default function EmojiParser() {
  return null;
}
