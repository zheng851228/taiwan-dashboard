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
  "        if (action === 'draw-start-end') {\n          MapMod.drawStartEnd(request && request.points);\n          return;\n        }",
  "        if (action === 'draw-route') {\n          var routeCoords = request && request.coords;\n          if (!Array.isArray(routeCoords) || routeCoords.length < 2) return;\n          MapMod.drawRoute(routeCoords, request && request.mode);\n          return;\n        }\n        if (action === 'draw-start-end') {\n          MapMod.drawStartEnd(request && request.points);\n          return;\n        }",
  'draw-route map request owner'
);
fs.writeFileSync(mainPath, main);

const pwaPath = 'js/pwa.js';
let pwa = fs.readFileSync(pwaPath, 'utf8');
pwa = replaceExact(
  pwa,
  "    MapMod.drawRoute(mapCoordinates, RouteMod.mode);\n    MapMod.drawStartEnd(AppState.routeAllPoints);",
  "    Bus.emit('map:request', { action: 'draw-route', coords: mapCoordinates, mode: RouteMod.mode });\n    Bus.emit('map:request', { action: 'draw-start-end', points: AppState.routeAllPoints });",
  'offline route map commands'
);
if (pwa.includes('MapMod')) throw new Error('pwa.js still directly references MapMod');
for (const token of [
  'RouteMod.active = true;',
  "RouteMod.mode = route.vehicle && route.vehicle.type === 'car' ? 'car' : 'motorcycle';",
  'RouteMod.routeCoords = mapCoordinates;',
  'RouteMod.filteredCams = [];'
]) {
  if (!pwa.includes(token)) throw new Error(`RouteMod state moved unexpectedly: ${token}`);
}
fs.writeFileSync(pwaPath, pwa);

const testPath = 'tests/e2e/desktop-map-request.spec.js';
let test = fs.readFileSync(testPath, 'utf8');
test = replaceExact(
  test,
  "});\n\ntest('route-condition map commands flow through map:request bus events'",
  `});

test('PWA route drawing command flows through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus && window.MapMod && window.MapMod.map
  ))).toBe(true);

  const calls = await page.evaluate(() => {
    const originalDrawRoute = window.MapMod.drawRoute;
    const observed = [];
    window.MapMod.drawRoute = function(coords, mode) {
      observed.push([coords, mode]);
    };

    window.Bus.emit('map:request', {
      action: 'draw-route',
      coords: [[24.1, 120.6], [24.2, 120.7]],
      mode: 'motorcycle'
    });
    window.Bus.emit('map:request', { action: 'draw-route', coords: [[24.1, 120.6]], mode: 'car' });
    window.Bus.emit('map:request', { action: 'draw-route', coords: null, mode: 'car' });

    window.MapMod.drawRoute = originalDrawRoute;
    return observed;
  });

  expect(calls).toEqual([
    [[[24.1, 120.6], [24.2, 120.7]], 'motorcycle']
  ]);
});

test('route-condition map commands flow through map:request bus events'`,
  'draw-route browser regression'
);
fs.writeFileSync(testPath, test);

const checkPath = 'scripts/check.sh';
let check = fs.readFileSync(checkPath, 'utf8');
check = replaceExact(
  check,
  "grep -q \"action === 'draw-start-end'\" js/main-ui.js",
  "grep -q \"action === 'draw-route'\" js/main-ui.js\ngrep -q \"action === 'draw-start-end'\" js/main-ui.js",
  'draw-route owner static guard'
);
check = replaceExact(
  check,
  "! grep -q 'MapMod' js/route-conditions.js",
  "! grep -q 'MapMod' js/route-conditions.js\n! grep -q 'MapMod' js/pwa.js",
  'PWA MapMod static guard'
);
check = replaceExact(
  check,
  "grep -q \"action: 'focus-section'\" js/route-conditions.js",
  "grep -q \"action: 'focus-section'\" js/route-conditions.js\ngrep -q \"action: 'draw-route'\" js/pwa.js\ngrep -q \"action: 'draw-start-end'\" js/pwa.js",
  'PWA map request consumer guards'
);
fs.writeFileSync(checkPath, check);

for (const token of ["action === 'draw-route'", "MapMod.drawRoute(routeCoords, request && request.mode)"]) {
  if (!main.includes(token)) throw new Error(`missing draw-route owner token: ${token}`);
}
for (const token of ["action: 'draw-route'", "action: 'draw-start-end'"]) {
  if (!pwa.includes(token)) throw new Error(`missing PWA map request token: ${token}`);
}

console.log('PWA map command boundary applied');
