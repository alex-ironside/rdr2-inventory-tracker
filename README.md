# 🤠 RDR2 Crafting Tracker

A fast, installable web app for tracking Red Dead Redemption 2 crafting
materials — pelts, hides, feathers, carcasses and legendary pelts — across
multiple playthroughs. Every cell tracks **delivered / required**, every row and
column can be **frozen**, and your data lives in **Firebase** or **entirely
offline** on your device.

Built with Svelte 5 + Vite. Ships as a **PWA** you can install on Android, iOS
and desktop.

## Features

- **Delivered / required per cell** with live totals, remaining counts and
  per-material status.
- **Freeze any row or column** (spreadsheet-style sticky panes) to keep headers
  and key materials in view.
- **Check a whole row or column** (set collected = required) with a confirmation,
  a full **change history**, and one-click **restore** to any earlier point —
  so an accidental “check all” is never permanent.
- **Multiple playthroughs (“iterations”)** — each has a title you set plus
  created / last-updated timestamps. Start a fresh tally per save file.
- **Seven sheets** faithful to the source spreadsheet: Inventory Tracker,
  Satchels, Camp Improvements, Trapper garment sets, individual clothing, saddles
  and reinforced equipment.
- **Firebase backend** with secure, owner-scoped Firestore rules and offline
  persistence — **or** a fully **offline mode** (localStorage) that needs no
  account.
- **Sync offline data to the cloud** after signing in, with non-destructive merge
  (your highest progress per material always wins).
- **Login only** — no public sign-up. One user, created by you in the Firebase
  console.
- **Installable PWA**, accessible (WCAG 2.1 AA / EN 301 549), works offline.

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL. With no Firebase config the app runs in **offline mode** —
click **Continue offline** and start tracking. Your data is saved in the
browser.

## Enabling Firebase (optional)

The app works with zero backend. To sync across devices, add Firebase:

1. Create a Firebase project and a **Web app** in the
   [Firebase console](https://console.firebase.google.com/).
2. Enable **Authentication → Email/Password**, then **create your single user**
   under Authentication → Users. (There is intentionally no in-app sign-up.)
3. Enable **Cloud Firestore**.
4. Copy the web config into a local env file:
   ```bash
   cp .env.example .env.local
   # fill in the VITE_FIREBASE_* values
   ```
   These values are **not secrets** — they identify the project and are shipped
   to every browser. Access is protected by Firebase Auth + the Firestore
   security rules, not by hiding them.
5. Deploy the security rules (see below) before using the cloud backend.

Restart `npm run dev`; the login form now appears.

## Testing & quality

```bash
npm run check      # type-check (svelte-check)
npm run lint       # ESLint + Prettier
npm run coverage   # unit + component tests with coverage gate
npm run e2e        # Playwright end-to-end (builds + previews, real browser)
```

- Business logic (`src/lib`) is covered **100%** (statements, branches,
  functions, lines) with meaningful tests.
- Components have behavioural tests; the whole app is exercised end-to-end.

## Deployment

### GitHub Pages (default, on merge to `main`)

1. In repo **Settings → Pages**, set **Source: GitHub Actions**.
2. (Optional) Add `VITE_FIREBASE_*` as **repository secrets** to ship a
   Firebase-enabled build. Without them, the deployed site is offline-only.
3. Push/merge to `main` — `.github/workflows/deploy-pages.yml` builds with the
   correct `/<repo>/` base path and deploys.

### Firestore security rules

Deploy `firestore.rules` + `firestore.indexes.json` whenever they change:

- **CI:** run the **Deploy Firestore rules** workflow (needs `FIREBASE_PROJECT_ID`
  and `FIREBASE_SERVICE_ACCOUNT` repository secrets), or
- **Locally:**
  ```bash
  npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <your-project-id>
  ```

### Firebase Hosting (alternative to Pages)

`firebase.json` is preconfigured:

```bash
npm run build
npx firebase-tools deploy --only hosting --project <your-project-id>
```

## Installing the app (PWA)

- **Android / desktop Chrome/Edge:** an **Install** button appears in-app; or use
  the browser’s install icon in the address bar.
- **iOS Safari:** tap **Share → Add to Home Screen** (the app shows these steps).

## Documentation

Project conventions, architecture, the conflict-resolution strategy, accessibility
and security notes live in [`CLAUDE.md`](./CLAUDE.md).

## Tech stack

Svelte 5 · Vite 6 · TypeScript · Firebase (Auth + Firestore) · vite-plugin-pwa ·
Vitest + Testing Library · Playwright · ESLint + Prettier · GitHub Actions.
