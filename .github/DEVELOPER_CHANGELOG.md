# Taiwan Dashboard Developer Changelog

This repository-only log records user-facing changes, verification evidence, and release caveats. It is intentionally not linked from the App UI or cached by the Service Worker.

## 2026-07-30 — PWA v26 contrast refresh

### Changed

- Refreshed the service-worker shell and stylesheet URL so installed PWAs receive the latest contrast fixes without reinstalling.
- Increased dark-surface secondary, muted, subtle, and faint text colors and applied the ladder to route, condition, mobile summary, desktop rail, CCTV, and map attribution labels.

### Scope

- Frontend cache and text contrast only; no Worker, API, KV, secret, route rule, or endpoint change.

## 2026-07-30 — Conditions timeout fallback

### Changed

- Added a 20-second client timeout for route conditions requests.
- A stalled upstream now exits loading state with a clear retryable error and does not present stale conditions as current data.

### Verification

- Added an iPhone E2E covering the hanging-request timeout path.
- Worker endpoint, route schema, cache, secrets and production routing unchanged.

## 2026-07-30 — Desktop contrast pass

### Changed

- Raised the dark-theme secondary text ladder for route summaries, safety notes, coverage metrics, map attribution, condition timeline metadata, CCTV details and playback controls.
- Kept light-theme colors, mobile layout, route semantics and color-plus-icon event cues unchanged.

### Verification

- `git diff --check` — passed.
- `npm run check` — 146/146 passed.
- Desktop command-center E2E — 4 passed; mobile/tablet MapLibre isolation — 4 passed.
- Playwright visual check at 1536×1024 — ready state, route panels and timeline remained readable with no layout overflow.

### Scope

- CSS text contrast and developer changelog only; no Worker, API, KV, secret, route rule or endpoint change.

## 2026-07-30 — CARTO raster URL follow-up

### Changed

- Removed the unsupported `{r}` placeholder from the desktop CARTO raster tile URLs so MapLibre requests concrete `.png` tiles.

### Verification

- `npm run check` — 146/146 passed.
- Desktop command-center E2E — 4 passed; mobile/tablet MapLibre isolation — 4 passed.
- Local production-Worker smoke — desktop 1536×1024 and iPhone 390×844 reached `ready`, resolved the route, and had 0px horizontal overflow.
- Public production route audit `north-keelung-taipei` — 0 fail, 1 known data-coverage warning (25% live traffic coverage).

### Scope

- Frontend MapLibre tile URL only; no Worker, API, KV, secret, or routing change.

## 2026-07-30 — PWA v25

### Changed

- Added the desktop command-center layout at 1200px and above while preserving the mobile and tablet navigation flow.
- Added local MapLibre GL JS rendering with a 2D/3D terrain switch, Mapterhorn DEM and an automatic Leaflet fallback when WebGL or terrain is unavailable.
- Split traffic, construction, accident, control, weather and unknown-data semantics into distinct map layers and context panels.
- Added client-only terrain elevation sampling, approximate slope summary, route playback controls, and a clearly labelled simulated cursor.
- Kept all route, conditions, navigation handoff, Worker endpoints, API schemas and secrets unchanged.

### Verification

- Pending final browser visual comparison at 1536×1024, 1440×900 and 1280×800.
- Pending final mobile regression and public GitHub Pages smoke after the two focused PRs are reviewed.

### Scope

- Frontend, vendored map assets, PWA shell and developer-only documentation.
- No Worker deployment, production routing, API schema or credential change.

## 2026-07-29 — PWA v23

### Changed

- Made the completed-route view map-first on phone-sized screens.
- Automatically collapsed the route conditions timeline after a successful mobile route load; users can still expand it for full details.
- Removed the duplicate travel status card, completion message, and completion banner from the mobile ready state.
- Removed the redundant post-route loading toast that obscured the lower map after results were already available.
- Reduced the completed-route chip and collapsed conditions panel footprint.
- Renamed the ready-state route action from `輸入起終點` to `調整`.

### Verification

- Passed: `npm run check` — 146/146 tests.
- Passed: `npm run test:e2e` — 77 passed, 59 skipped.
- Passed: 360×778 Chrome mobile visual check — no horizontal overflow; completed-route chip 44px; collapsed conditions chip 50px.
- Passed: GitHub Pages run `30468414085`; public PWA cache is `twdash-shell-v23` and the App shell reloads offline.
- Passed: public 390×844 representative route smoke — `validation=safe`, `dataMode=live`, matching route IDs, 9 condition sections, 0px horizontal overflow, and conservative `未回報` event semantics.

### Scope

- Frontend and PWA shell only.
- No Worker endpoint, API schema, route rule, secret, or production Worker change.

## 2026-07-29 — PWA v22

- Added local display preferences for the top clock and completed-route banner.
- Added direct dismiss controls and restore controls under `工具 → 畫面顯示`.
- PR: [#10](https://github.com/zheng851228/taiwan-dashboard/pull/10)

## 2026-07-29 — PWA v21

- Deferred the iPhone install prompt until the first non-fixture live safe route succeeds.
- Kept the manual installation entry available under Tools.
- PR: [#9](https://github.com/zheng851228/taiwan-dashboard/pull/9)

## 2026-07-29 — PWA v20

- Added `empty / analyzing / ready` route UI states.
- Focused the first mobile screen on route planning and map visibility.
- Added actionable empty states in Tools.
- PR: [#8](https://github.com/zheng851228/taiwan-dashboard/pull/8)
