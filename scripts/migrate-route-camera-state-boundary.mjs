import fs from 'node:fs';

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(before, after);
}

const desktopPath = 'js/desktop-dashboard.js';
let desktop = fs.readFileSync(desktopPath, 'utf8');
desktop = replaceExact(
  desktop,
  '    basemap: Storage.get(BASEMAP_PREF_KEY, \'satellite\') === \'satellite\' ? \'satellite\' : \'dark\',\n    cctvIndex: 0,',
  '    basemap: Storage.get(BASEMAP_PREF_KEY, \'satellite\') === \'satellite\' ? \'satellite\' : \'dark\',\n    routeCameras: [],\n    cctvIndex: 0,',
  'desktop route camera state'
);
desktop = replaceExact(
  desktop,
  '    var globalRouteCameras = (window.RouteMod && RouteMod.filteredCams || []).slice();',
  '    var globalRouteCameras = state.routeCameras.slice();',
  'desktop filtered camera read'
);
desktop = replaceExact(
  desktop,
  "    Bus.on('route:updated', function() {\n      syncHeader();",
  "    Bus.on('route:updated', function(payload) {\n      state.routeCameras = (payload && payload.cams || []).slice();\n      syncHeader();",
  'desktop route updated camera snapshot'
);
desktop = replaceExact(
  desktop,
  "    Bus.on('route:cleared', function() {\n      state.sections = [];",
  "    Bus.on('route:cleared', function() {\n      state.routeCameras = [];\n      state.sections = [];",
  'desktop route cleared camera reset'
);
fs.writeFileSync(desktopPath, desktop);

const enhancementsPath = 'js/enhancements.js';
let enhancements = fs.readFileSync(enhancementsPath, 'utf8');
enhancements = replaceExact(
  enhancements,
  'var RouteStripMod = {\n  show: function(cams) {',
  'var RouteStripMod = {\n  routeCameras: [],\n  show: function(cams) {',
  'route strip camera state'
);
enhancements = replaceExact(
  enhancements,
  '      RouteStripMod.show(RouteMod.filteredCams);',
  '      RouteStripMod.show(RouteStripMod.routeCameras);',
  'route strip filtered camera read'
);
enhancements = replaceExact(
  enhancements,
  "  }\n};\n\n// ===== 地名建議模組 =====",
  "  }\n};\n\nBus.on('route:updated', function(payload) {\n  RouteStripMod.routeCameras = (payload && payload.cams || []).slice();\n});\nBus.on('route:cleared', function() {\n  RouteStripMod.routeCameras = [];\n});\n\n// ===== 地名建議模組 =====",
  'route strip route event snapshots'
);
fs.writeFileSync(enhancementsPath, enhancements);

const checkPath = 'scripts/check.sh';
let check = fs.readFileSync(checkPath, 'utf8');
check = replaceExact(
  check,
  "! grep -q 'RouteMod.active' js/ride-tools.js\ngrep -q 'AppState.activeRoute' js/desktop-dashboard.js",
  `! grep -q 'RouteMod.active' js/ride-tools.js
! grep -q 'RouteMod.filteredCams' js/desktop-dashboard.js
! grep -q 'RouteMod.filteredCams' js/enhancements.js
grep -q 'state.routeCameras = (payload && payload.cams || \[\]).slice();' js/desktop-dashboard.js
grep -q 'RouteStripMod.routeCameras = (payload && payload.cams || \[\]).slice();' js/enhancements.js
grep -q 'state.routeCameras = \[\];' js/desktop-dashboard.js
grep -q 'RouteStripMod.routeCameras = \[\];' js/enhancements.js
grep -q 'cams: RouteMod.filteredCams.slice()' js/main-ui.js
grep -q 'RouteMod.filteredCams = \[\];' js/pwa.js
grep -q 'AppState.activeRoute' js/desktop-dashboard.js`,
  'route camera state static guards'
);
fs.writeFileSync(checkPath, check);

for (const [path, source] of [[desktopPath, desktop], [enhancementsPath, enhancements]]) {
  if (source.includes('RouteMod.filteredCams')) {
    throw new Error(`${path} still directly reads RouteMod.filteredCams`);
  }
}

for (const token of [
  "state.routeCameras = (payload && payload.cams || []).slice();",
  'state.routeCameras = [];'
]) {
  if (!desktop.includes(token)) throw new Error(`missing desktop camera snapshot token: ${token}`);
}
for (const token of [
  "RouteStripMod.routeCameras = (payload && payload.cams || []).slice();",
  'RouteStripMod.routeCameras = [];'
]) {
  if (!enhancements.includes(token)) throw new Error(`missing route strip camera snapshot token: ${token}`);
}

const main = fs.readFileSync('js/main-ui.js', 'utf8');
if (!main.includes('cams: RouteMod.filteredCams.slice()')) {
  throw new Error('route:updated camera payload moved unexpectedly');
}
const pwa = fs.readFileSync('js/pwa.js', 'utf8');
if (!pwa.includes('RouteMod.filteredCams = [];')) {
  throw new Error('PWA filtered camera reset moved unexpectedly');
}
for (const token of ['RouteMod.mode', 'RouteMod.plate']) {
  if (!desktop.includes(token) && !enhancements.includes(token)) {
    throw new Error(`expected vehicle state coupling to remain: ${token}`);
  }
}

console.log('route camera state boundary applied');
