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
  '    var hasRoute = Boolean(AppState.activeRoute || (window.RouteMod && RouteMod.active));',
  '    var hasRoute = Boolean(AppState.activeRoute);',
  'desktop active route read'
);
fs.writeFileSync(desktopPath, desktop);

const enhancementsPath = 'js/enhancements.js';
let enhancements = fs.readFileSync(enhancementsPath, 'utf8');
enhancements = replaceExact(
  enhancements,
  '      if (RouteMod && RouteMod.active) {',
  '      if (AppState.activeRoute) {',
  'enhancements active route read'
);
fs.writeFileSync(enhancementsPath, enhancements);

const rideToolsPath = 'js/ride-tools.js';
let rideTools = fs.readFileSync(rideToolsPath, 'utf8');
rideTools = replaceExact(
  rideTools,
  '      if (!RouteMod.active || !AppState.lastRouteInfo || !conditions || !conditions.sections) {',
  '      if (!AppState.activeRoute || !AppState.lastRouteInfo || !conditions || !conditions.sections) {',
  'ride insights active route read'
);
fs.writeFileSync(rideToolsPath, rideTools);

const checkPath = 'scripts/check.sh';
let check = fs.readFileSync(checkPath, 'utf8');
check = replaceExact(
  check,
  "! grep -q 'RouteMod.clear' js/enhancements.js\n! grep -q 'MapMod' js/pwa.js",
  `! grep -q 'RouteMod.clear' js/enhancements.js
! grep -q 'RouteMod.active' js/desktop-dashboard.js
! grep -q 'RouteMod.active' js/enhancements.js
! grep -q 'RouteMod.active' js/ride-tools.js
grep -q 'AppState.activeRoute' js/desktop-dashboard.js
grep -q 'AppState.activeRoute' js/enhancements.js
grep -q 'AppState.activeRoute' js/ride-tools.js
grep -q 'RouteMod.active = true;' js/pwa.js
grep -q 'RouteMod.active = true;' js/main-ui.js
grep -q 'RouteMod.active = false;' js/main-ui.js
! grep -q 'MapMod' js/pwa.js`,
  'active state boundary static guards'
);
fs.writeFileSync(checkPath, check);

for (const [path, source] of [
  [desktopPath, desktop],
  [enhancementsPath, enhancements],
  [rideToolsPath, rideTools]
]) {
  if (source.includes('RouteMod.active')) {
    throw new Error(`${path} still directly reads RouteMod.active`);
  }
  if (!source.includes('AppState.activeRoute')) {
    throw new Error(`${path} does not read AppState.activeRoute`);
  }
}

const pwa = fs.readFileSync('js/pwa.js', 'utf8');
if (!pwa.includes('RouteMod.active = true;')) {
  throw new Error('PWA RouteMod.active restore write moved unexpectedly');
}

const main = fs.readFileSync('js/main-ui.js', 'utf8');
for (const token of [
  'RouteMod.active = true;',
  'RouteMod.active = false;',
  'window.RouteMod = RouteMod'
]) {
  if (!main.includes(token)) throw new Error(`main-ui route owner token moved unexpectedly: ${token}`);
}

for (const token of ['RouteMod.mode', 'RouteMod.plate', 'RouteMod.filteredCams']) {
  if (!desktop.includes(token) && !enhancements.includes(token) && !rideTools.includes(token)) {
    throw new Error(`expected remaining RouteMod state coupling to stay in place: ${token}`);
  }
}

console.log('route active state boundary applied');
