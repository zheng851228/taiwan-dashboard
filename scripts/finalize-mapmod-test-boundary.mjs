import fs from 'node:fs';

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(before, after);
}

const mainPath = 'js/main-ui.js';
let main = fs.readFileSync(mainPath, 'utf8');
main = replaceExact(
  main,
  `  var mapTestActions = [];\n  var mapTestProbeEnabled = false;`,
  `  var mapTestActions = [];\n  var mapTestProbeEnabled = false;\n  var mapTestWaypointMarker = null;`,
  'map test waypoint state declaration'
);
main = main.replaceAll('window.__mapTestWaypointMarker', 'mapTestWaypointMarker');
if (main.includes('window.__mapTestWaypointMarker')) throw new Error('test waypoint marker global remains');
fs.writeFileSync(mainPath, main);

const checkPath = 'scripts/check.sh';
let check = fs.readFileSync(checkPath, 'utf8');
check = replaceExact(
  check,
  `grep -q 'window.__MapTestProbe = Object.freeze' js/main-ui.js\n`,
  `grep -q 'window.__MapTestProbe = Object.freeze' js/main-ui.js\ngrep -q 'var mapTestWaypointMarker = null' js/main-ui.js\n! grep -q 'window.__mapTestWaypointMarker' js/main-ui.js\n`,
  'test probe static guard'
);
fs.writeFileSync(checkPath, check);

const docsPath = 'docs/ARCHITECTURE.md';
let docs = fs.readFileSync(docsPath, 'utf8');
docs = replaceExact(
  docs,
  '`window.MapMod` remains exported only as a transitional compatibility surface for existing E2E tests that inspect Leaflet internals; migrate those tests toward Bus/DOM/visible-map outcomes before removing the final global export.',
  '`window.MapMod` has now been removed entirely. Normal runtime exposes no legacy-map global; URLs explicitly using `e2e=1` install a frozen, narrow `__MapTestProbe` for the remaining Leaflet integration assertions that cannot be observed reliably through DOM/canvas output. That probe is test-only, is absent from normal runtime, and does not serve as a production dependency surface.',
  'shared globals MapMod completion text'
);
docs = replaceExact(
  docs,
  'The focused desktop refactor suite covers layout keyboard resizing, ARIA state, persistence across reloads, bounds and reset behavior, MapLibre route source/fitted state, clickable CCTV markers, synthetic condition rendering, route-condition runtime delegation, route-search endpoint-preparation delegation, route-summary DOM copy delegation, external Google/Apple navigation target decisions, the supported browser-global surface, desktop route-camera state consumption from the `route:updated` payload, desktop vehicle state consumption from the `vehicle:changed` payload, page switching through `navigation:request` without a global `NavMod`, legacy-map view/route/condition/focus commands through `map:request`, Nearby/waypoint overlay lifecycle through the same boundary, and PWA offline route restoration without an external `MapMod` consumer.',
  'The focused desktop refactor suite covers layout keyboard resizing, ARIA state, persistence across reloads, bounds and reset behavior, MapLibre route source/fitted state, clickable CCTV markers, synthetic condition rendering, route-condition runtime delegation, route-search endpoint-preparation delegation, route-summary DOM copy delegation, external Google/Apple navigation target decisions, the supported browser-global surface with both `MapMod` and the E2E-only probe absent from normal runtime, desktop route-camera state consumption from the `route:updated` payload, desktop vehicle state consumption from the `vehicle:changed` payload, page switching through `navigation:request` without a global `NavMod`, legacy-map view/route/condition/focus commands through `map:request`, Nearby/waypoint overlay lifecycle through the same boundary, and PWA offline route restoration without an external `MapMod` consumer.',
  'validation coverage MapMod completion text'
);
fs.writeFileSync(docsPath, docs);

console.log('MapMod test boundary finalized');
