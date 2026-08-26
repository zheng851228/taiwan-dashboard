import fs from 'node:fs';

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(before, after);
}

function replaceCount(source, before, after, expected, label) {
  const count = source.split(before).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return source.split(before).join(after);
}

const mainPath = 'js/main-ui.js';
let main = fs.readFileSync(mainPath, 'utf8');
main = replaceExact(
  main,
  "    init: function() {\n      Dom.onAll('.route-mode-btn', 'click', function(btn) {\n          RouteMod.setVehicle(btn.dataset.mode, btn.dataset.plate || RouteMod.plate);\n      });",
  `    init: function() {
      Bus.on('route:request', function(request) {
        var action = request && request.action;
        if (action === 'set-vehicle') {
          RouteMod.setVehicle(request && request.mode, request && request.plate);
          return;
        }
        if (action === 'analyze') {
          RouteMod.analyze();
          return;
        }
        if (action === 'clear') RouteMod.clear();
      });
      Dom.onAll('.route-mode-btn', 'click', function(btn) {
          RouteMod.setVehicle(btn.dataset.mode, btn.dataset.plate || RouteMod.plate);
      });`,
  'RouteMod route:request owner'
);
fs.writeFileSync(mainPath, main);

const desktopPath = 'js/desktop-dashboard.js';
let desktop = fs.readFileSync(desktopPath, 'utf8');
desktop = replaceExact(
  desktop,
  "    Dom.onAll('.desktop-vehicle-tab', 'click', function(button) {\n      if (RouteMod && RouteMod.setVehicle) RouteMod.setVehicle(button.dataset.desktopMode, button.dataset.desktopPlate || 'white');\n    });",
  "    Dom.onAll('.desktop-vehicle-tab', 'click', function(button) {\n      Bus.emit('route:request', { action: 'set-vehicle', mode: button.dataset.desktopMode, plate: button.dataset.desktopPlate || 'white' });\n    });",
  'desktop setVehicle command'
);
fs.writeFileSync(desktopPath, desktop);

const enhancementsPath = 'js/enhancements.js';
let enhancements = fs.readFileSync(enhancementsPath, 'utf8');
enhancements = replaceExact(
  enhancements,
  "      if (RouteMod) RouteMod.clear();",
  "      Bus.emit('route:request', { action: 'clear' });",
  'enhancements clear command'
);
enhancements = replaceCount(
  enhancements,
  'RouteMod.analyze();',
  "Bus.emit('route:request', { action: 'analyze' });",
  4,
  'enhancements analyze commands'
);
fs.writeFileSync(enhancementsPath, enhancements);

const conditionsPath = 'js/route-conditions.js';
let conditions = fs.readFileSync(conditionsPath, 'utf8');
conditions = replaceExact(
  conditions,
  "    Dom.onId('condition-clear', 'click', function() {\n      if (window.RouteMod) RouteMod.clear();\n    });",
  "    Dom.onId('condition-clear', 'click', function() {\n      Bus.emit('route:request', { action: 'clear' });\n    });",
  'route conditions clear command'
);
if (conditions.includes('RouteMod')) throw new Error('route-conditions.js still directly references RouteMod');
fs.writeFileSync(conditionsPath, conditions);

const checkPath = 'scripts/check.sh';
let check = fs.readFileSync(checkPath, 'utf8');
check = replaceExact(
  check,
  "grep -q \"Bus.on('camera:open'\" js/main-ui.js",
  `grep -q "Bus.on('camera:open'" js/main-ui.js
grep -q "Bus.on('route:request'" js/main-ui.js
grep -q "action === 'set-vehicle'" js/main-ui.js
grep -q "action === 'analyze'" js/main-ui.js
grep -q "action === 'clear'" js/main-ui.js`,
  'route request owner static guards'
);
check = replaceExact(
  check,
  "! grep -q 'MapMod' js/route-conditions.js",
  `! grep -q 'MapMod' js/route-conditions.js
! grep -q 'RouteMod' js/route-conditions.js
! grep -q 'RouteMod.setVehicle' js/desktop-dashboard.js
! grep -q 'RouteMod.analyze' js/enhancements.js
! grep -q 'RouteMod.clear' js/enhancements.js`,
  'external RouteMod command static guards'
);
check = replaceExact(
  check,
  "grep -q \"action: 'draw-start-end'\" js/pwa.js",
  `grep -q "action: 'draw-start-end'" js/pwa.js
grep -q "action: 'set-vehicle'" js/desktop-dashboard.js
grep -q "action: 'analyze'" js/enhancements.js
grep -q "action: 'clear'" js/enhancements.js
grep -q "action: 'clear'" js/route-conditions.js`,
  'external route request consumer guards'
);
fs.writeFileSync(checkPath, check);

const ciPath = '.github/workflows/ci.yml';
let ci = fs.readFileSync(ciPath, 'utf8');
ci = replaceExact(
  ci,
  'tests/e2e/desktop-map-overlay-request.spec.js --project=desktop-chromium',
  'tests/e2e/desktop-map-overlay-request.spec.js tests/e2e/route-command-boundary.spec.js --project=desktop-chromium',
  'route command E2E CI inclusion'
);
fs.writeFileSync(ciPath, ci);

for (const token of [
  "Bus.on('route:request'",
  "action === 'set-vehicle'",
  "action === 'analyze'",
  "action === 'clear'"
]) {
  if (!main.includes(token)) throw new Error(`missing route command owner token: ${token}`);
}
for (const token of [
  'RouteMod.active',
  'RouteMod.mode',
  'RouteMod.plate',
  'RouteMod.filteredCams'
]) {
  if (!desktop.includes(token) && !enhancements.includes(token)) {
    throw new Error(`expected RouteMod state read to remain: ${token}`);
  }
}
for (const token of [
  'RouteMod.active = true;',
  'RouteMod.routeCoords = mapCoordinates;',
  'RouteMod.filteredCams = [];'
]) {
  const pwa = fs.readFileSync('js/pwa.js', 'utf8');
  if (!pwa.includes(token)) throw new Error(`expected PWA RouteMod state write to remain: ${token}`);
}

console.log('route command boundary applied');
