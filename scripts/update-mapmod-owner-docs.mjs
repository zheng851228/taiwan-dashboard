import fs from 'node:fs';

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(before, after);
}

const file = 'docs/ARCHITECTURE.md';
let source = fs.readFileSync(file, 'utf8');

source = replaceExact(
  source,
  '| `js/route-conditions.js` | Traffic/weather/event condition DOM rendering, interaction, external-navigation DOM wiring and thin model delegation |',
  '| `js/route-conditions.js` | Traffic/weather/event condition DOM rendering, interaction, external-navigation DOM wiring and thin model delegation; legacy-map rendering/focus requests cross the `map:request` boundary |',
  'route conditions responsibility'
);

source = replaceExact(
  source,
  '| `js/pwa.js` | Installation/update/offline lifecycle; offline vehicle restoration uses the route vehicle capability instead of direct mode mutation |',
  '| `js/pwa.js` | Installation/update/offline lifecycle; offline vehicle restoration uses the route vehicle capability and requests legacy-map route/start-end drawing through `map:request` |',
  'PWA responsibility'
);

source = replaceExact(
  source,
  '`MapMod` remains an intentional integration global for now primarily because offline route rendering in `pwa.js` still calls lower-level draw capabilities. Continue by narrowing that remaining PWA dependency rather than replacing `MapMod` with another mega-global.',
  'No production module outside `main-ui.js` now directly references `MapMod`: PWA offline route drawing and route-condition camera/section rendering or focus operations also flow through `map:request`. `window.MapMod` remains exported only as a transitional compatibility surface for existing E2E tests that inspect Leaflet internals; migrate those tests toward Bus/DOM/visible-map outcomes before removing the final global export.',
  'shared globals completion paragraph'
);

source = replaceExact(
  source,
  'page switching through `navigation:request` without a global `NavMod`, legacy-map `set-view`/`invalidate-size`/`focus-route` commands through `map:request`, and Nearby/waypoint overlay lifecycle through the same map request boundary.',
  'page switching through `navigation:request` without a global `NavMod`, legacy-map view/route/condition/focus commands through `map:request`, Nearby/waypoint overlay lifecycle through the same boundary, and PWA offline route restoration without an external `MapMod` consumer.',
  'focused suite coverage'
);

source = replaceExact(
  source,
  'prevent `desktop-dashboard.js`, `ride-tools.js`, and `enhancements.js` from directly referencing `MapMod`; and require Nearby/waypoint overlay operations in `enhancements.js` to use `map:request` actions.',
  source.includes('prevent `desktop-dashboard.js`, `ride-tools.js`, and `enhancements.js` from directly referencing `MapMod`; and require Nearby/waypoint overlay operations in `enhancements.js` to use `map:request` actions.')
    ? 'scan every production JavaScript module and fail if any file outside `main-ui.js` directly references `MapMod`; and require PWA, route-condition, Nearby, waypoint, view and focus operations to use `map:request` actions.'
    : '',
  'static guard description'
);

source = replaceExact(
  source,
  'GitHub Actions CI #171 passed on the map-overlay event-boundary head: static/unit checks and the focused desktop Chromium regression were both green, including Nearby marker/circle lifecycle and waypoint overlay cleanup.',
  'GitHub Actions CI #187 passed on the single-production-owner MapMod head: static/unit checks and the focused desktop Chromium regression were both green, including PWA route drawing plus route-condition camera/section rendering and focus requests.',
  'CI reference'
);

fs.writeFileSync(file, source);
console.log('MapMod production-owner architecture documentation updated');
