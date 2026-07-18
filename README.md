# WashUp — Laundry Point of Sale

A single-shop point-of-sale app for a laundry business: take orders, track
payments, print receipts, and see daily revenue — with accounts, dark/light
mode, and per-user order history.

## Files

```
index.html      Markup for the login/register screen and the app shell
css/style.css   All styling — dark + light theme tokens, layout, components
js/auth.js      Registration, login, sessions, logout, user menu
js/app.js       POS logic: products, cart, checkout, orders, summary, theme toggle
README.md       This file
```

## Running it locally

No build step needed. Either:
- Open `index.html` directly in a browser, or
- Serve the folder locally, e.g. `python3 -m http.server`, then visit `http://localhost:8000`

## Deploying it

This is a static site — it deploys anywhere that serves plain files:
**Netlify, Vercel, GitHub Pages, Cloudflare Pages,** a plain S3 bucket, or
any web host. Upload the four files/folders above keeping the same
structure (`css/` and `js/` need to stay alongside `index.html`), point
your domain at it, done.

## How accounts work right now (read before going live)

Registration and login run **entirely in the browser** — there is no
server. When someone creates an account:

- Their name, shop name, email, and a **PBKDF2-hashed** (not plaintext)
  password are saved to `localStorage` on that device.
- Logging in re-derives the hash from the password they type and compares
  it to the stored one — again, all in the browser.
- Each account's orders are stored under their own `localStorage` key, so
  two accounts on the same browser don't see each other's data.

This is genuinely functional — you can register, log in, log out, take
orders, and reload the page without losing anything — but it has real
limits you should know about before you rely on it for a real shop:

- **Data lives on one device.** An account created on your laptop can't
  log in from your phone or from the shop's tablet — `localStorage` isn't
  shared between devices or browsers.
- **It's not secure against someone with access to the device.** Anyone
  who opens the browser's dev tools on that machine can read the stored
  (hashed) passwords and all order data.
- **Clearing browser data deletes everything** — accounts and order
  history included. There's no backup copy anywhere else.

### If you want this to be a "real" multi-device login

Swap the functions in the `DATA LAYER` section at the top of `js/auth.js`
(`getUsers`, `saveUsers`, `getSession`, `setSession`) for calls to a real
backend. Good low-effort options:
- **Supabase** or **Firebase Auth** — hosted auth + database, minimal setup
- Your own small API (Node/Express, etc.) with `bcrypt` or `argon2` for
  password hashing and a real database (Postgres, SQLite, etc.)

Once accounts and orders live server-side instead of in `localStorage`,
everything else in the app (the POS screen, cart, receipts, summary)
keeps working the same way — you'd mainly be replacing the storage calls
in `auth.js` and the `loadOrdersFromStorage` / `saveOrdersToStorage`
functions in `app.js` with `fetch()` calls to your API.

## Setting up "Continue with Google"

The login/register screen has a Google Sign-In button already wired up —
it just needs your own Google OAuth Client ID to work, since Google won't
issue tokens to a project it doesn't recognize.

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   (create a project first if you don't have one).
2. **Create Credentials → OAuth client ID → Application type: Web application.**
3. Under **Authorized JavaScript origins**, add the URL(s) you'll open the
   app from, e.g. `http://localhost:5500` while testing locally, and your
   real domain once deployed (e.g. `https://yourshop.com`).
4. Copy the generated Client ID (ends in `.apps.googleusercontent.com`).
5. Open `js/auth.js` and paste it into the `GOOGLE_CLIENT_ID` constant near
   the top of the file (look for the `GOOGLE SIGN-IN` comment block).

Until you do this, the button shows a friendly "not configured yet"
message instead of a broken Google prompt, so nothing breaks in the
meantime.

Once configured: existing users can sign in with Google if their Google
email matches an account they already made with a password, and brand
new Google users get an account created automatically on first sign-in
(no password needed — they always continue with Google after that).

## Features

- **Point of sale** — tap services (wash/dry) to build an order, adjust
  quantities, pick a payment method (Cash / GCash / Maya), checkout
- **Printable receipts** — modal receipt with an actual `window.print()` flow
- **Orders view** — searchable order history with cancel support
- **Daily summary** — revenue, order count, average order value, top
  services by revenue, payment method breakdown
- **Accounts** — register/sign in, each account has its own shop name and
  order history, sign-out from the top-right menu
- **Dark / light mode** — toggle in the top bar, remembered across visits,
  defaults to the system's preferred color scheme on first visit
- **Responsive** — full desktop layout (sidebar + cart panel), tablet
  layout, and a mobile layout with a bottom tab bar
- **Accessible basics** — visible keyboard focus states, respects
  `prefers-reduced-motion`

## Customizing

- **Services & prices** — edit the `SERVICES` array at the top of `js/app.js`
- **Currency symbol** — the app uses ₱ (Philippine peso) throughout;
  search-and-replace `₱` in `app.js` to change it
- **Colors** — edit the CSS custom properties in `:root` (dark) and
  `[data-theme="light"]` in `css/style.css`
- **Shop name shown at checkout** — set at registration ("Shop name"
  field); shown in the top bar and on printed receipts
  
## GOOGLE AUTH
- [**google** — edit the `SERVICES` array at the top of `js/app.js`](https://console.cloud.google.com/apis/credentials?authuser=1&project=laundry-shop-pos&supportedpurview=project)
