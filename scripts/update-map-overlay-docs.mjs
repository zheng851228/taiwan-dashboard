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
  '| `js/enhancements.js` | Cross-cutting interaction enhancements; requests page changes and map view/resize commands through Bus boundaries while retaining low-level Leaflet overlay ownership for nearby markers/circles |',
  '| `js/enhancements.js` | Cross-cutting interaction enhancements; requests page changes, map view/resize commands, Nearby overlay lifecycle, and waypoint overlay cleanup through Bus boundaries without directly consuming `MapMod` |',
  'enhancements responsibility'
);

source = replaceExact(
  source,
  'Map view commands are now following the same dependency direction: `desktop-dashboard.js` and `ride-tools.js` no longer reference `MapMod` at all, and `enhancements.js` routes `setView`/`invalidateSize` behavior through `map:request`. `MapMod` remains an intentional integration global for now because nearby overlays in `enhancements.js` and offline route rendering in `pwa.js` still require lower-level map/rendering capabilities. Continue by narrowing those remaining capabilities rather than replacing `MapMod` with another mega-global.',
  'Map capabilities are now following the same dependency direction: `desktop-dashboard.js`, `ride-tools.js`, and `enhancements.js` no longer reference `MapMod` at all. View commands plus Nearby marker/circle lifecycle and waypoint overlay cleanup flow through `map:request`, leaving the legacy-map implementation as the single owner of those Leaflet details. `MapMod` remains an intentional integration global for now primarily because offline route rendering in `pwa.js` still calls lower-level draw capabilities. Continue by narrowing that remaining PWA dependency rather than replacing `MapMod` with another mega-global.',
  'shared globals map paragraph'
);

source = replaceExact(
  source,
  'page switching through `navigation:request` without a global `NavMod`, and legacy-map `set-view`/`invalidate-size`/`focus-route` commands through `map:request`.',
  'page switching through `navigation:request` without a global `NavMod`, legacy-map `set-view`/`invalidate-size`/`focus-route` commands through `map:request`, and Nearby/waypoint overlay lifecycle through the same map request boundary.',
  'focused suite coverage'
);

source = replaceExact(
  source,
  'prevent `desktop-dashboard.js` and `ride-tools.js` from directly referencing `MapMod`; and prevent `enhancements.js` from directly issuing `MapMod.map.setView()` or `invalidateSize()` commands.',
  'prevent `desktop-dashboard.js`, `ride-tools.js`, and `enhancements.js` from directly referencing `MapMod`; and require Nearby/waypoint overlay operations in `enhancements.js` to use `map:request` actions.',
  'static guard description'
);

source = replaceExact(
  source,
  'GitHub Actions CI #162 passed on the final documented map-view event-boundary head: static/unit checks and the focused desktop Chromium regression were both green.',
  'GitHub Actions CI #171 passed on the map-overlay event-boundary head: static/unit checks and the focused desktop Chromium regression were both green, including Nearby marker/circle lifecycle and waypoint overlay cleanup.',
  'ci reference'
);

fs.writeFileSync(file, source);
console.log('map overlay architecture documentation updated');
