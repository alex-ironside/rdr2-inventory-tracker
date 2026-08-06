# CLAUDE.md

Project conventions and guardrails for working in this repository. Read this
before making changes and keep it up to date.

## What this is

A Svelte 5 + Vite single-page app for tracking Red Dead Redemption 2 crafting
materials (pelts, feathers, hides, etc.) across multiple playthroughs. Each
tracked cell records **delivered / required**; every column and row is
**freezable**; data is stored in **Firebase (Firestore)** or **offline
(localStorage)**; the app is an installable **PWA**. Seed data is generated from
`RDR2_Crafting_Tracker_v3.xlsx`.

## Golden rules for this repo

These were agreed for the project and must be followed for every change:

1. **TDD** — write or update a failing test first, then the implementation.
2. **SOLID, DRY, KISS** and sensible **design patterns**.
3. **100% coverage of business logic** with meaningful tests (see _Testing_).
4. **Accessibility to EU standards** — EN 301 549, which adopts **WCAG 2.1 AA**.
5. **Security to ISO standards** — ISO/IEC 27001/27002 controls (see _Security_).
6. Keep it **lint-clean and formatted** (ESLint + Prettier) and **type-clean**
   (`svelte-check`).
7. **Mobile-friendly / responsive** — the app must be fully usable on a phone,
   not just desktop (see _Responsive design_). Test every UI change at a narrow
   viewport, not only on desktop.

## Commands

| Task                    | Command             |
| ----------------------- | ------------------- |
| Dev server              | `npm run dev`       |
| Type-check              | `npm run check`     |
| Lint (ESLint+Prettier)  | `npm run lint`      |
| Auto-fix / format       | `npm run lint:fix` / `npm run format` |
| Unit + component tests  | `npm test`          |
| Coverage (gated)        | `npm run coverage`  |
| End-to-end (Playwright) | `npm run e2e`       |
| Production build        | `npm run build`     |

Run `npm run lint && npm run check && npm run coverage && npm run e2e` before
pushing. CI runs all of these.

## Architecture

Thin Svelte components over a pure, framework-free logic layer. All business
logic lives in `src/lib/*.ts` so it is unit-testable in isolation; components
wire it to the DOM.

```
src/
  lib/
    types.ts        Shared data model (types only)
    seed.ts         AUTO-GENERATED sheet template from the spreadsheet — do not hand-edit
    compute.ts      delivered/required math, row + sheet totals
    grid.ts         Grid column layout + status derivation (pure)
    cardlist.ts     Mobile card list: rows→cards, search/filter/status (pure)
    freeze.ts       Freeze-pane set logic + sticky offset math (pure)
    ids.ts          Id generation
    title.ts        Title normalisation / input sanitisation
    format.ts       Date formatting
    auth-errors.ts  Firebase auth code → friendly message
    install.ts      PWA platform detection + install eligibility (pure)
    firebase.ts     Lazy Firebase init (config from VITE_FIREBASE_* env)
    storage.ts      StorageBackend interface + LocalBackend + FirebaseBackend
    sync.ts         Local→cloud merge + conflict resolution (pure)
    import.ts       Spreadsheet → DeliveredMap mapping (pure)
    xlsx.ts         Lazy .xlsx File → grid reader (impure shell over @e965/xlsx)
    entitlement.ts  Pro entitlement from ID-token claim (pure) — cloud sync gate
    billing.ts      Stripe checkout / portal shell over the Firebase Stripe extension
    consent.ts      Analytics consent state (pure) — Google Consent Mode v2
    analytics.ts    Google Analytics (GA4) via Firebase Analytics (lazy shell)
    session.svelte.ts  Reactive session store (auth, Pro entitlement + which backend)
  components/       Svelte 5 (runes) components — thin
  App.svelte        Shell / routing between login, list and tracker views
```

### Key design patterns

- **Strategy / Dependency Inversion** — `StorageBackend` is an interface with two
  implementations (`LocalBackend`, `FirebaseBackend`). The UI depends on the
  interface, never on a concrete backend, so offline and cloud are swappable and
  the cloud path is testable with an in-memory fake.
- **Pure core, imperative shell** — deterministic logic in `src/lib/*.ts`; side
  effects (DOM, network, storage) at the edges.
- **Single source of truth for rules** — e.g. title normalisation lives only in
  `title.ts`; date formatting only in `format.ts` (DRY).

### Regenerating seed data

`src/lib/seed.ts` is generated from the spreadsheet. If the source workbook
changes, re-run the generator (see git history for the extraction script) rather
than editing `seed.ts` by hand. Only **required** amounts are seeded; a new
iteration starts with **delivered = 0** everywhere (a fresh playthrough tally).

## Data model & persistence

- An **iteration** = one playthrough: `{ id, title, createdAt, updatedAt,
  delivered, freeze }`.
- Only **delivered** amounts and **freeze** layout are persisted per iteration;
  required amounts come from the static seed, so documents stay small.
- `DeliveredMap` is `delivered[sheetId][rowId][colKey] = number`; zero values are
  pruned so the map stays sparse.

### Bulk check + change history (`history.ts`)

- **Check** a row/column/cell = set collected (delivered) equal to required for
  every tracked cell in that scope. Bulk checks require confirmation.
- **History** is an append-only list of `HistoryEntry` snapshots
  (`{ id, at, label, delivered }`), capped at `MAX_HISTORY`. Before every bulk
  action (and every restore) a snapshot of the _current_ state is recorded, so
  an accidental “check all” can always be rolled back to the moment before it.
- **Restore** returns the whole board (or a chosen row/column/cell scope) to a
  historical snapshot. Restoring requires confirmation and is itself recorded as
  a new checkpoint, so it too can be undone.
- All of this is pure and unit-tested in `history.ts`; `TrackerView` orchestrates
  confirmation + persistence and `HistoryPanel` renders the timeline.
- The persisted `history` field is included in the Firestore rules’ allowed keys
  and validated as a list — update `firestore.rules` if the schema changes.

### Offline ↔ cloud sync and conflict resolution (`sync.ts`)

Users can work offline (localStorage) and later sign in and press **Sync** to
push local playthroughs to the cloud. Conflict strategy is **non-destructive and
deterministic**:

- Deliveries only increase during a playthrough, so for every tracked cell we
  keep the **higher** delivered count from the two sides — no progress is ever
  lost.
- For scalar metadata that can genuinely diverge (title, freeze layout), the
  **more recently edited** copy (greater `updatedAt`) wins.
- `createdAt` keeps the earliest, `updatedAt` the latest.
- The merge is **commutative and idempotent** — syncing twice is a no-op.

### Importing an existing spreadsheet (`import.ts` / `xlsx.ts`)

Players often already track progress in the source workbook
(`RDR2_Crafting_Tracker_v3.xlsx`). **Import** lets them upload that `.xlsx` and
pull their collected amounts in instead of re-entering everything.

- The workbook holds real user progress in exactly two **source** places,
  declared explicitly in `IMPORT_SPECS`: the Inventory sheet's **"You Have"**
  column and the Reinforced Equipment **"Done?"** column. No other column is ever
  *read* as input — the recipe tabs' "Qty" cells are static *requirements* and
  must never be mistaken for progress.
- The single "You Have" total is **allocated** across a material's per-use
  tracked columns (Satchels/Camp/Clothes/Saddles) in order, capped at each
  required amount, so the row's aggregate Have/Remaining/Status matches the
  sheet. Surplus beyond what the row needs is dropped.
- Collected materials also flow **outward into the crafting recipe tabs** so the
  progress shows everywhere it applies, not only on the Inventory Tracker.
  `MATERIAL_CONSUMER_SHEET_IDS` lists those tabs in priority order — **Satchels →
  Camp → Trapper (garments/individual → saddles)**, mirroring the inventory
  column order. Each material's collected total is drawn down across them: a
  recipe cell is filled up to its required qty when the player owns that
  ingredient, and once a material runs out, lower-priority recipes for it are
  left untouched. The summary's `collectedTotal` counts the pelts once (the
  inventory pool), never double-counting the recipe cells they also fill.
- Rows are matched to the seed by their **label** values (material name; for
  reinforced, Challenge Set + Equipment), normalised case/whitespace-insensitively
  — resilient to re-saved/exported copies.
- Import is **non-destructive**: the parsed map is merged with `mergeDelivered`
  (the same keep-**higher**-per-cell rule as cloud sync), so importing twice —
  or over existing progress — never doubles or lowers anything. `TrackerView`
  records a history checkpoint first, so an import can be undone.
- **Layering:** `import.ts` is pure (grid → `DeliveredMap`) and 100%-tested;
  `xlsx.ts` is the thin impure shell that lazily loads the parser and turns an
  uploaded `File` into the grid. The parser is **`@e965/xlsx`** — a maintained,
  `npm audit`-clean SheetJS build on the npm registry (the official SheetJS CDN
  is blocked by the egress policy). It is dynamically `import()`-ed so it stays
  out of the initial bundle.

## Testing

Test-first, and **behavioural/integration over unit** wherever practical:

- **Business logic (`src/lib/**`)** — 100% statements, branches, functions and
  lines, **enforced** in `vitest.config.ts`. These test real behaviour
  (merging, totals, sanitisation, backends), not line-touching.
- **Components** — behavioural tests with `@testing-library/svelte`: render, act
  as a user, assert on the accessible DOM. 100% statements/lines/functions are
  enforced; branch coverage is held at a high bar. A small number of
  Svelte-compiler-generated and defensive branches (`?.` fallbacks for
  not-yet-mounted element refs, `|| !session.backend` guards that never fire in
  an authenticated view) are intentionally not chased — forcing them would mean
  deleting real safety checks, which contradicts meaningful testing.
- **Integration** (`tests/integration/`) — drive the whole `App` through a real
  user journey with the real session store and real localStorage.
- **End-to-end** (`e2e/`, Playwright) — the full flow in a real browser
  (desktop + mobile Chromium), offline mode, across a real reload.
- **Cloud end-to-end** (`e2e/cloud-sync.spec.ts`) — the Pro / cloud-sync journey
  against the real **Firebase Auth + Firestore emulators** and the real
  `firestore.rules`: Pro sign-in + cloud CRUD round-trip, offline→cloud sync,
  free-user stays local (never writes to the cloud), and GDPR account deletion.
  Run with `npm run e2e:cloud` (needs Java for the Firestore emulator; the script
  wraps Playwright in `firebase emulators:exec`). The build is wired to the
  emulators via `--mode emulator` (config in `e2e/emulator-env/`, throwaway demo
  values), and users are seeded with a real `stripeRole` claim through the Admin
  SDK so the Pro gate is exercised, not bypassed. The default `npm run e2e` never
  touches the emulators. (Running locally, prefix `CI=1` so Playwright uses its
  managed Chromium instead of the Linux `executablePath`.)

Do **not** write tests that only exist to raise coverage. If a line can't be
covered by a meaningful test, it usually shouldn't exist.

## Accessibility (EN 301 549 / WCAG 2.1 AA)

- Semantic HTML: the tracker is a real `<table>` with `<caption>`, `<th
  scope="col|row|colgroup">`, and `<thead>`.
- Every control has an accessible name (`aria-label`), freeze toggles expose
  `aria-pressed`, form fields have `<label>`s.
- **Never rely on colour alone** (WCAG 1.4.1): status is always conveyed as text
  (“Complete”, “N to go”, “Need more”) as well as colour.
- Live status uses `role="alert"` for errors.
- Colour contrast meets AA on the dark theme.
- `prefers-reduced-motion` disables non-essential animation.
- Keyboard operable throughout; the scrollable grid region is focusable.

When adding UI, keep these invariants. `eslint-plugin-svelte` a11y rules are on;
don't blanket-disable them — justify any `svelte-ignore` inline.

## Responsive design (mobile-first)

The app is used on phones as much as desktop, so **mobile must be a
first-class target, never an afterthought.** Keep these invariants:

- **Card view on phones, grid on desktop** — below `640px` the tracker renders
  a purpose-built **card list** (`SheetCards` + `SheetCard`, logic in
  `cardlist.ts`) instead of the wide grid: a search box, status filter chips
  (All / To collect / In progress / Done) and one tap-to-expand card per row
  whose per-use amounts are edited with the same `CellInput` steppers. Sheets
  are switched from a **bottom-sheet picker** (`SheetPicker`), not the
  horizontal tab strip. `TrackerView` chooses the view via a
  `matchMedia('(max-width: 640px)')` watcher; both call the same
  check/reset/history/save paths. This means the grid's sticky panes are a
  **desktop-only** concern — the iOS sticky invariants below still guard the
  grid, but phones sidestep them entirely by not rendering it.
- **Real viewport units** — the app shell uses `100dvh` (with a `100vh`
  fallback) so it isn't clipped behind mobile browser chrome. Don't reintroduce
  bare `100vh` for full-height layout.
- **No horizontal page scroll** — the body must never scroll sideways. Wide
  content (the tracker table) scrolls inside its own `.scroll` region, which is
  focusable/keyboard-scrollable; the page around it stays put (`body`/`#app`
  both `overflow-x: hidden`, and the tracker flex columns carry `min-width: 0`
  so the wide grid shrinks rather than widening the page).
- **iOS sticky panes** — the frozen material column, sticky header and pinned
  rows/columns use `position: sticky`. **Never put
  `-webkit-overflow-scrolling: touch` on the `.scroll` grid or the `.tabs`
  strip:** on iOS Safari it swaps in a legacy scroller that breaks `sticky`, so
  the material column freezes over the data and the un-clipped table pushes the
  page past 100vw. Momentum scrolling is native on modern iOS; use
  `overscroll-behavior` to contain the scroll instead. Guarded by
  `tests/ios-sticky.test.ts`.
- **Touch targets** — interactive controls get finger-sized hit areas on touch
  devices via `@media (pointer: coarse)` (steppers, freeze pins, check/reset
  buttons, checkboxes, `.btn`/`.btn-ghost`). Don't ship desktop-only ~20px tap
  targets.
- **No iOS focus-zoom** — form fields are ≥16px on touch devices so focusing an
  input doesn't trigger Safari's auto-zoom.
- **Narrow-screen layout** — headers/toolbars wrap or drop redundant info
  (e.g. the tracker hides the "Updated …" timestamp on `max-width: 640px`,
  since the save pill and mode pill already convey state); multi-control forms
  stack instead of squeezing. Breakpoint convention: `@media (max-width: 640px)`
  for layout, `@media (pointer: coarse)` for touch ergonomics.
- **Testing** — the desktop `chromium` Playwright project runs the full suite
  (the grid journeys in `offline-flow`/`import`); the `mobile-chrome` (Pixel 5)
  project runs `e2e/mobile.spec.ts`, which drives the phone card view (searchable
  list, bottom-sheet sheet switcher, tap-to-expand steppers) and asserts the
  mobile invariants (no horizontal page scroll, finger-sized tap targets). Keep
  both green.

## Security (ISO/IEC 27001 / 27002)

- **Access control / least privilege (A.9)** — Firestore rules
  (`firestore.rules`) require authentication, scope every read/write to the
  owning user (`ownerUid == request.auth.uid`), make the owner immutable,
  schema-validate writes, and end with a default-deny. **Public sign-up is
  enabled** (users self-register in the app; the registration screen discloses
  that cloud sync is a paid Pro feature before sign-up). Cloud **writes** are
  gated on the Pro entitlement (`request.auth.token.stripeRole == 'pro'`); reads
  and deletes stay open to the owner so a downgrade never loses or locks out
  existing data, and **account deletion** (GDPR erasure) removes the user's cloud
  data + auth user. The Stripe extension's `customers/*` (own) and `products/*`
  (signed-in read) collections are scoped in the same rules.
- **Monetisation / Pro (cloud sync)** — cloud sync is a paid **Pro** subscription;
  offline/local mode is free. Entitlement rides on the Stripe extension's
  `stripeRole` ID-token claim — one source of truth in `entitlement.ts`, applied
  in `session.svelte.ts` (backend selection) and enforced in `firestore.rules`.
  `billing.ts` drives Stripe Checkout/portal through the "Run Payments with
  Stripe" extension (needs the Firebase **Blaze** plan; `VITE_DEV_FORCE_PRO=1`
  forces the Pro path in dev builds only). `VITE_STRIPE_PRICE_ID` sets the Pro
  price.
- **Secrets management** — no secrets in the repo. Firebase _web_ config
  (`VITE_FIREBASE_*`) is public by design (protected by rules, not obscurity) and
  injected at build time. `.env*`, service-account JSON and Firebase debug logs
  are git-ignored. CI uses least-privilege tokens and repository secrets.
- **Input validation** — user input (titles) is normalised and stripped of
  control characters in one place (`title.ts`); delivered values are clamped to
  non-negative integers.
- **Transport / headers** — hosting sets `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy` and a restrictive
  `Permissions-Policy` (`firebase.json`). GitHub Pages serves over HTTPS.
- **Supply chain** — keep `npm audit` clean; pin dev tooling; CI installs with
  `npm ci`.

## Deployment

- **GitHub Pages (primary)** — `.github/workflows/deploy-pages.yml` builds and
  deploys on push to `main`. `BASE_PATH=/<repo>/` sets the sub-path so assets and
  the PWA scope resolve; `404.html`/`.nojekyll` fallbacks are added. Enable Pages
  → “GitHub Actions” in repo settings. Add `VITE_FIREBASE_*` repo secrets to ship
  a Firebase-enabled build (otherwise it deploys offline-only).
- **Firestore rules** — `.github/workflows/deploy-firestore.yml` deploys
  `firestore.rules` + indexes (needs `FIREBASE_PROJECT_ID` and
  `FIREBASE_SERVICE_ACCOUNT` secrets). Also run locally with the Firebase CLI.
- **Firebase Hosting (optional)** — `firebase.json` is configured if you prefer
  Firebase Hosting to Pages.

## PWA / install

- Manifest + service worker via `vite-plugin-pwa` (offline app shell).
- Install CTA is platform-aware (`install.ts` + `InstallPrompt.svelte`):
  Android/desktop Chromium uses the `beforeinstallprompt` event; **iOS** has no
  such API, so we show manual “Add to Home Screen” instructions. Already-installed
  (standalone) sessions show nothing.

## Gotchas

- `src/lib/seed.ts` is generated — don't hand-edit; it's excluded from lint,
  formatting and coverage.
- `*.svelte.ts` are rune modules (plain TS), parsed with the TS ESLint parser.
- The main inventory sheet renders ~800 cell components; component tests carry a
  generous timeout because of this.
