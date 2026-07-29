# Taiwan Dashboard Developer Changelog

This repository-only log records user-facing changes, verification evidence, and release caveats. It is intentionally not linked from the App UI or cached by the Service Worker.

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
