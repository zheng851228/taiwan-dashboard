# Architecture and Maintainability Guide

This document defines the current boundaries of Taiwan Dashboard and the preferred direction for incremental refactoring.

## Design goals

1. Preserve route correctness and conservative failure behavior.
2. Keep provider credentials and normalization logic outside the browser.
3. Make stale or missing data explicit instead of silently degrading to a positive status.
4. Keep desktop, mobile, PWA, map rendering, and provider logic independently testable.
5. Refactor incrementally; avoid a framework rewrite unless there is a measurable product or maintenance benefit.

## Runtime boundaries

```text
Browser
  |
  | /v2 API
  v
Cloudflare Worker
  |-- routing / road eligibility
  |-- provider normalization
  |-- freshness policy
  |-- route cache / provider snapshots
  v
Official and routing providers
```

### Browser responsibilities

The browser owns interaction state, presentation, map rendering, PWA lifecycle, favorites, and navigation handoff. It should not own provider credentials or duplicate authoritative provider normalization rules.

### Worker responsibilities

The Worker owns routing orchestration, motorcycle eligibility validation, provider access, normalization, freshness decisions, caching, and API compatibility.

## Current frontend modules

| Module | Primary responsibility |
| --- | --- |
| `js/core.js` | Shared state, storage, DOM and common helpers |
| `js/services.js` | Browser-to-Worker API boundary |
| `js/data.js` | Client-side data helpers |
| `js/main-ui.js` | Primary route-search and route-result UI |
| `js/enhancements.js` | Cross-cutting interaction enhancements |
| `js/route-conditions.js` | Traffic/weather/event condition presentation |
| `js/ride-tools.js` | Rider utility features |
| `js/maplibre-renderer.js` | MapLibre map lifecycle, terrain/basemap orchestration and remaining overlay facade |
| `js/maplibre-route-layer.js` | Route GeoJSON, route coordinate state and fitBounds compatibility seam |
| `js/maplibre-camera-layer.js` | CCTV GeoJSON, marker lifecycle and camera interaction compatibility seam |
| `js/maplibre-condition-layer.js` | Traffic section GeoJSON, incident cues/markers, rainy-weather points and condition fallback fitting |
| `js/desktop-dashboard.js` | Desktop command-center orchestration |
| `js/desktop-layout.js` | Desktop rail sizing, resizing, persistence and reset behavior |
| `js/pwa.js` | Installation/update/offline lifecycle |

Several of these modules are now large enough that new features should not automatically be appended to them.

## Incremental refactor target

The target is feature-oriented modules with explicit boundaries:

```text
js/
├── core/
│   ├── state.js
│   ├── storage.js
│   └── dom.js
├── services/
│   ├── routes.js
│   ├── conditions.js
│   ├── weather.js
│   └── cameras.js
├── features/
│   ├── route-search/
│   ├── route-summary/
│   ├── traffic/
│   ├── weather/
│   ├── incidents/
│   ├── cameras/
│   └── favorites/
├── map/
│   ├── renderer.js
│   ├── route-layer.js
│   ├── condition-layer.js
│   └── camera-layer.js
├── desktop/
│   ├── layout.js
│   ├── panels.js
│   └── playback.js
└── pwa/
    └── lifecycle.js
```

This is a direction, not a requirement to move every file at once.

## Refactoring rules

### 1. Extract before rewriting

When changing a large module, first identify a cohesive responsibility that can be moved without changing behavior. Add or retain tests around that seam, then extract it.

### 2. Keep API calls behind services

Feature and renderer modules should consume normalized service functions rather than constructing Worker URLs or interpreting raw provider payloads themselves.

### 3. Keep rendering separate from domain decisions

A renderer may decide how to display `unknown`, but it should not decide whether an observation is fresh enough to be `unknown`. Freshness belongs to the Worker/domain layer.

### 4. Prefer dependency direction over globals

New modules should receive the state or service functions they need where practical. Avoid introducing new cross-module globals. Existing globals can be migrated gradually.

### 5. Protect route correctness first

Changes involving license rules, restricted roads, route geometry, shape indices, event matching, or freshness must have focused tests before structural refactoring.

## Suggested migration order

1. **Desktop layout utilities — complete.** `js/desktop-layout.js` is now the single implementation for rail sizing, normalization, pointer/keyboard resizing, persistence, reset, CSS variables, and ARIA separator state. The duplicate implementation was removed from `desktop-dashboard.js` after the focused Chromium regression gate passed.
2. **Map layers — in progress.** `js/maplibre-camera-layer.js` owns CCTV marker/GeoJSON behavior, `js/maplibre-route-layer.js` owns route GeoJSON plus fitBounds behavior, and `js/maplibre-condition-layer.js` now owns section/event/weather rendering plus event marker selection behind the same public renderer API. Focused Vitest and Chromium regressions protect all three seams. Legacy implementations may remain temporarily inside `maplibre-renderer.js` until the compatibility layer has been proven stable enough for deletion.
3. **Route condition presentation.** Separate formatting/view-model helpers from DOM rendering.
4. **Main route UI.** Split input/search state, route summary, and navigation handoff after the lower-level seams are stable.
5. **Shared globals.** Only then reduce global state and tighten module dependencies.

## Validation gates

Every structural refactor should keep these gates green:

```bash
npm run check
npm run test:e2e:desktop-refactor
npm run test:e2e
```

The focused desktop refactor suite covers layout keyboard resizing, ARIA state, persistence across reloads, bounds and reset behavior, MapLibre route source/fitted state, clickable CCTV markers, and synthetic condition rendering for traffic sections, incident cues/markers, rainy-weather points, condition selection, and fallback route fitting. Existing command-center coverage continues to exercise pointer resizing and broader desktop behavior. The full E2E suite remains the broader interaction gate.

For routing/provider changes, also run the relevant fixture and live route audits before production deployment.

## Framework migration

React or another framework is not currently a prerequisite. A migration should only be considered when it solves a demonstrated problem such as component lifecycle complexity, state synchronization cost, or development velocity that cannot be addressed cleanly through modular JavaScript.
