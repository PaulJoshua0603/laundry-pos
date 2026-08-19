# WashHub POS — Next.js

A Next.js 14 (App Router + TypeScript) rebuild of the original static WashHub
POS: take orders, track payments, print receipts on a PR21 58mm thermal
printer, and see daily/weekly/monthly revenue — with accounts, dark/light
mode, and per-user order history. Installable as a mobile app on Android and
iOS (Add to Home Screen) via the included PWA manifest + service worker.

## Run it in VS Code

```bash
npm install
npm run dev
```

Open http://localhost:3000. For the PR21 Bluetooth print path and the PWA
install prompt to work on a phone, serve over HTTPS (or use `npm run build &&
npm run start` behind a tunnel like `ngrok`, or deploy to Vercel) — both
Web Bluetooth and service workers require a secure context except on
`localhost`.

## Printing to your PR21 58mm printer

Two ways to print, both wired up already:

1. **Direct Bluetooth (Android Chrome / desktop Chrome & Edge)** — Go to
   **Payment Methods → Thermal Printer**, tap **Pair PR21 printer**, and pick
   it from the Bluetooth device list. After that, the **🖨️ Print to PR21**
   button on any receipt sends raw ESC/POS bytes straight to the printer —
   no PDF app needed. See `lib/printer.ts`.
2. **iOS Safari (no Web Bluetooth support)** — the same **🖨️ Print to PR21**
   button instead builds a paper-exact PDF and opens the iOS share sheet;
   pick your PR21's companion app (e.g. "Bluetooth Print") from there. You
   can also tap **📄 Save PDF** to download it and print manually.

The paper width selector (58mm / 80mm / 48mm) on the receipt and in Payment
Methods controls both paths.

## Accounts

Registration/login still run entirely in the browser (localStorage +
PBKDF2-hashed passwords) — same trade-offs as the original static app: an
account only exists on the device that created it. See `lib/auth.ts` if you
want to swap this for Supabase/Firebase/your own API later; everything else
(orders, receipts, settings) already reads/writes through `lib/storage.ts`,
so only the auth module needs to change.

## Installing on a phone (Android / iOS)

- **Android (Chrome)**: open the deployed URL → menu → **Install app** /
  **Add to Home screen**.
- **iOS (Safari)**: open the deployed URL → Share button → **Add to Home
  Screen**.

Both give you a full-screen app icon with no browser chrome, backed by
`public/manifest.json` and `public/sw.js`.

## Project layout

```
app/                Next.js App Router entry (layout, page, globals.css)
components/          UI: auth screen, topbar, sidebar, cart, views, receipt modal
context/AppContext.tsx  All app state (session, cart, orders, settings)
lib/
  auth.ts            Client-side account data layer + PBKDF2 hashing
  storage.ts         Per-user localStorage persistence
  types.ts           Shared types + services/status catalog
  printer.ts         Web Bluetooth ESC/POS driver for the PR21
  receiptPdf.ts       jsPDF receipt/basket-tag builder
  format.ts          Small formatting helpers
public/
  manifest.json, sw.js, icons/   PWA assets
```

## Customizing

- **Services & prices** — edit `SERVICES` in `lib/types.ts`.
- **Colors / theme** — edit the CSS custom properties in `app/globals.css`.
- **Business hours** — edit `BUSINESS_HOURS` in `lib/types.ts`.
