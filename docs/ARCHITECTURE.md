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
| `js/route-search-model.js` | Pure route endpoint normalization, address-resolution planning, vehicle request shaping and unresolved-point messages |
| `js/main-ui.js` | Primary route-search orchestration, route-result UI, map/list UI and navigation handoff |
| `js/enhancements.js` | Cross-cutting interaction enhancements |
| `js/route-conditions.js` | Traffic/weather/event condition DOM rendering, interaction and thin view-model delegation |
| `js/route-condition-view-model.js` | Pure road-event classification, impact, presentation, summaries and alert ordering |
| `js/ride-tools.js` | Rider utility features |
| `js/maplibre-renderer.js` | MapLibre lifecycle, shared layer/source setup, terrain/basemap and camera orchestration |
| `js/maplibre-route-layer.js` | Route GeoJSON, route coordinate state and fitBounds behavior |
| `js/maplibre-camera-layer.js` | CCTV GeoJSON, marker lifecycle and camera interaction |
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
2. **Map layers — complete for the first extraction pass.** `js/maplibre-camera-layer.js` owns CCTV marker/GeoJSON behavior, `js/maplibre-route-layer.js` owns route GeoJSON plus fitBounds behavior, and `js/maplibre-condition-layer.js` owns section/event/weather rendering plus event marker selection. The duplicate route/camera/condition implementations were removed from `maplibre-renderer.js` after focused Vitest and Chromium gates passed.
3. **Route condition presentation — complete for the pure-data extraction pass.** `js/route-condition-view-model.js` is the single owner for road-event classification, impact, presentation, location approximation, primary-event selection, summary and alert ordering. `js/route-conditions.js` delegates those decisions and retains DOM rendering, loading/error state, timeline interaction and navigation handoff. The transitional parity module and duplicated fallback implementations were removed after runtime delegation and Chromium regression gates passed.
4. **Route-search input/request preparation — complete for the first extraction pass.** `js/route-search-model.js` owns endpoint normalization/validation, waypoint-address planning, cached route-point reuse, vehicle request shaping, and unresolved-point messages. `RouteMod.analyze()` retains async geocoding, Worker route creation, state transitions, and result orchestration while delegating the pure preparation decisions to the model.
5. **Route summary and navigation handoff — next.** Extract route-summary presentation and navigation handoff from `main-ui.js` behind focused runtime seams without changing route creation or provider behavior.
6. **Shared globals.** Only then reduce global state and tighten module dependencies.

## Validation gates

Every structural refactor should keep these gates green:

```bash
npm run check
npm run test:e2e:desktop-refactor
npm run test:e2e
```

The focused desktop refactor suite covers layout keyboard resizing, ARIA state, persistence across reloads, bounds and reset behavior, MapLibre route source/fitted state, clickable CCTV markers, synthetic condition rendering, route-condition runtime delegation, and route-search endpoint-preparation delegation to the extracted model. Existing command-center coverage continues to exercise pointer resizing and broader desktop behavior. The full E2E suite remains the broader interaction gate.

The route-condition runtime integration fixture deliberately uses unambiguous lane-closure wording (`施工，占用外側車道`) so it tests delegation rather than overlapping text-classification heuristics.

For routing/provider changes, also run the relevant fixture and live route audits before production deployment.

## Framework migration

React or another framework is not currently a prerequisite. A migration should only be considered when it solves a demonstrated problem such as component lifecycle complexity, state synchronization cost, or development velocity that cannot be addressed cleanly through modular JavaScript.
