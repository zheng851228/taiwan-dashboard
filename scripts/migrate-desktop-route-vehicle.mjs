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
  `(RouteMod && state.vehicle.mode)`,
  `state.vehicle.mode`,
  1,
  'desktop vehicle mode guard cleanup'
);
desktop = replaceExactCount(
  desktop,
  `(RouteMod && state.vehicle.plate)`,
  `state.vehicle.plate`,
  1,
  'desktop vehicle plate guard cleanup'
);
if (desktop.includes('RouteMod.mode') || desktop.includes('RouteMod.plate') || desktop.includes('RouteMod && state.vehicle')) {
  throw new Error('desktop-dashboard.js still has direct or vestigial RouteMod vehicle reads');
}
fs.writeFileSync(desktopFile, desktop);

const pwaFile = 'js/pwa.js';
const pwa = fs.readFileSync(pwaFile, 'utf8');
if (!pwa.includes('RouteMod.setVehicle(restoredMode, restoredPlate)')) {
  throw new Error('pwa.js must restore vehicle state through RouteMod.setVehicle');
}
if (pwa.includes('RouteMod.mode')) throw new Error('pwa.js still directly accesses RouteMod.mode');

console.log('desktop route vehicle guard cleanup applied');
