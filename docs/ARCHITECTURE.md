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
| `js/maplibre-renderer.js` | MapLibre rendering and route overlays |
| `js/desktop-dashboard.js` | Desktop command-center behavior |
| `js/desktop-layout.js` | Desktop rail sizing, resize controls, keyboard resizing, reset and persisted layout state |
| `js/pwa.js` | Installation/update/offline lifecycle |

Several of these modules are now large enough that new features should not automatically be appended to them.

### Desktop layout migration seam

The first extraction step is now in place through `js/desktop-layout.js`. It loads after `desktop-dashboard.js`, replaces the resize controls to detach the legacy listeners, and writes the normalized layout back to `DesktopDashboardMod.state.layout`.

This is intentionally a compatibility seam rather than a large rewrite. Existing viewport synchronization can continue using the shared layout state while the old in-file layout implementation is removed in a later cleanup pass. Route rules, Worker contracts, traffic/weather interpretation, and map rendering are not part of this extraction.

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
│   ├── incident-layer.js
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

1. **Desktop layout utilities** — migration seam established in PR #35; remove the legacy in-file implementation after browser regression coverage confirms parity.
2. **Map layers** — split incident/camera/route overlay concerns from the renderer while preserving a stable renderer facade.
3. **Route condition presentation** — separate formatting/view-model helpers from DOM rendering.
4. **Main route UI** — split input/search state, route summary, and navigation handoff after the lower-level seams are stable.
5. **Shared globals** — only then reduce global state and tighten module dependencies.

## Validation gates

Every structural refactor should keep these gates green:

```bash
npm run check
npm run test:e2e
```

For routing/provider changes, also run the relevant fixture and live route audits before production deployment.

## Framework migration

React or another framework is not currently a prerequisite. A migration should only be considered when it solves a demonstrated problem such as component lifecycle complexity, state synchronization cost, or development velocity that cannot be addressed cleanly through modular JavaScript.
