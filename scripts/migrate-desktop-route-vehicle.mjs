import fs from 'node:fs';

function replaceExactCount(source, before, after, expected, label) {
  const parts = source.split(before);
  const count = parts.length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return parts.join(after);
}

const desktopFile = 'js/desktop-dashboard.js';
let desktop = fs.readFileSync(desktopFile, 'utf8');

desktop = replaceExactCount(
  desktop,
  `    routeCameras: [],\n    layout: null`,
  `    routeCameras: [],\n    vehicle: { mode: 'motorcycle', plate: 'white' },\n    layout: null`,
  1,
  'desktop vehicle state'
);

desktop = replaceExactCount(desktop, 'RouteMod.mode', 'state.vehicle.mode', 4, 'desktop RouteMod.mode reads');
desktop = replaceExactCount(desktop, 'RouteMod.plate', 'state.vehicle.plate', 1, 'desktop RouteMod.plate reads');

desktop = replaceExactCount(
  desktop,
  `    Bus.on('vehicle:changed', syncHeader);`,
  `    Bus.on('vehicle:changed', function(event) {\n      state.vehicle = {\n        mode: event && event.mode === 'car' ? 'car' : 'motorcycle',\n        plate: event && event.plate ? event.plate : 'white'\n      };\n      syncHeader();\n    });`,
  1,
  'desktop vehicle event listener'
);

if (desktop.includes('RouteMod.mode') || desktop.includes('RouteMod.plate')) {
  throw new Error('desktop-dashboard.js still directly reads RouteMod mode/plate');
}
fs.writeFileSync(desktopFile, desktop);

const pwaFile = 'js/pwa.js';
let pwa = fs.readFileSync(pwaFile, 'utf8');
pwa = replaceExactCount(
  pwa,
  `    RouteMod.mode = route.vehicle && route.vehicle.type === 'car' ? 'car' : 'motorcycle';\n    RouteMod.routeCoords = mapCoordinates;`,
  `    var restoredMode = route.vehicle && route.vehicle.type === 'car' ? 'car' : 'motorcycle';\n    var restoredPlate = route.vehicle && route.vehicle.plate ? route.vehicle.plate : 'white';\n    RouteMod.setVehicle(restoredMode, restoredPlate);\n    RouteMod.routeCoords = mapCoordinates;`,
  1,
  'PWA restored vehicle capability'
);
pwa = replaceExactCount(
  pwa,
  `    MapMod.drawRoute(mapCoordinates, RouteMod.mode);`,
  `    MapMod.drawRoute(mapCoordinates, restoredMode);`,
  1,
  'PWA restored route renderer mode'
);
if (pwa.includes('RouteMod.mode')) throw new Error('pwa.js still directly accesses RouteMod.mode');
fs.writeFileSync(pwaFile, pwa);

console.log('desktop route vehicle event-state migration applied');
