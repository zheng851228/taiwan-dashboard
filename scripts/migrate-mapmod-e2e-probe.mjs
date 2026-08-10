import fs from 'node:fs';

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(before, after);
}

function replaceAllChecked(source, before, after, label, minCount = 1) {
  const count = source.split(before).length - 1;
  if (count < minCount) throw new Error(`${label}: expected at least ${minCount} matches, found ${count}`);
  return source.split(before).join(after);
}

const mainPath = 'js/main-ui.js';
let main = fs.readFileSync(mainPath, 'utf8');
main = replaceExact(
  main,
  `  var MapMod = {`,
  `  var mapTestActions = [];\n  var mapTestProbeEnabled = false;\n\n  function recordMapTestAction(action, detail) {\n    if (!mapTestProbeEnabled) return;\n    mapTestActions.push(Object.assign({ action: action }, detail || {}));\n  }\n\n  function mapTestSnapshot(MapMod) {\n    var center = MapMod.map && MapMod.map.getCenter ? MapMod.map.getCenter() : null;\n    var nearbyCenter = MapMod._nearbyMarker && MapMod._nearbyMarker.getLatLng\n      ? MapMod._nearbyMarker.getLatLng()\n      : null;\n    var incidentCues = MapMod.routeIncidentLayers\n      .filter(function(layer) { return layer && layer._roadEventLocationCue; })\n      .map(function(layer) {\n        return {\n          kind: layer._roadEventKind || null,\n          impact: layer._roadEventImpact || null,\n          status: layer._roadEventStatus || null,\n          color: layer.options && layer.options.color || null,\n          dashArray: layer.options && layer.options.dashArray || null,\n          points: layer.getLatLngs ? layer.getLatLngs().length : 0\n        };\n      });\n    var routeLayers = Array.isArray(MapMod.routeLayer)\n      ? MapMod.routeLayer\n      : (MapMod.routeLayer ? [MapMod.routeLayer] : []);\n    return {\n      ready: Boolean(MapMod.map),\n      tileUrl: MapMod.tileLayer && MapMod.tileLayer._url || null,\n      center: center ? [center.lat, center.lng] : null,\n      zoom: MapMod.map && MapMod.map.getZoom ? MapMod.map.getZoom() : null,\n      routeLayerCount: routeLayers.length,\n      routeLayerAttached: Boolean(MapMod.map) && routeLayers.length > 0\n        ? routeLayers.every(function(layer) { return MapMod.map.hasLayer(layer); })\n        : false,\n      routeSectionLayerCount: MapMod.routeSectionLayers.length,\n      routeIncidentLayerCount: MapMod.routeIncidentLayers.length,\n      routeIncidentMarkerCount: MapMod.routeIncidentMarkers.length,\n      routeWeatherMarkerCount: MapMod.routeWeatherMarkers.length,\n      startEndMarkerCount: MapMod.startEndMarkers.length,\n      nearbyMarkerCenter: nearbyCenter ? [nearbyCenter.lat, nearbyCenter.lng] : null,\n      nearbyRadius: MapMod._nearbyCircle && MapMod._nearbyCircle.getRadius\n        ? MapMod._nearbyCircle.getRadius()\n        : null,\n      nearbyCleared: MapMod._nearbyMarker === null && MapMod._nearbyCircle === null,\n      waypointStateCount: Array.isArray(AppState.waypointMapMarkers) ? AppState.waypointMapMarkers.length : 0,\n      testWaypointAttached: Boolean(\n        MapMod.map\n        && window.__mapTestWaypointMarker\n        && MapMod.map.hasLayer(window.__mapTestWaypointMarker)\n      ),\n      incidentCues: incidentCues\n    };\n  }\n\n  function installMapTestProbe(MapMod) {\n    var params = new URLSearchParams(window.location.search);\n    if (params.get('e2e') !== '1') return;\n    mapTestProbeEnabled = true;\n    window.__MapTestProbe = Object.freeze({\n      snapshot: function() { return mapTestSnapshot(MapMod); },\n      clearActions: function() { mapTestActions = []; },\n      actions: function() { return mapTestActions.map(function(item) { return Object.assign({}, item); }); },\n      createWaypointMarker: function(center) {\n        var lat = Array.isArray(center) ? Number(center[0]) : NaN;\n        var lng = Array.isArray(center) ? Number(center[1]) : NaN;\n        if (!MapMod.map || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;\n        if (window.__mapTestWaypointMarker && MapMod.map.hasLayer(window.__mapTestWaypointMarker)) {\n          MapMod.map.removeLayer(window.__mapTestWaypointMarker);\n        }\n        window.__mapTestWaypointMarker = L.marker([lat, lng]).addTo(MapMod.map);\n        AppState.waypointMapMarkers = [window.__mapTestWaypointMarker];\n        return true;\n      }\n    });\n  }\n\n  var MapMod = {`,
  'Map test probe helpers'
);

const handlerReplacements = [
  [`          if (MapMod.map && MapMod.map.invalidateSize) MapMod.map.invalidateSize();\n          return;`, `          if (MapMod.map && MapMod.map.invalidateSize) MapMod.map.invalidateSize();\n          recordMapTestAction('invalidate-size');\n          return;`, 'invalidate-size action record'],
  [`          MapMod.focusRoute();\n          return;`, `          MapMod.focusRoute();\n          recordMapTestAction('focus-route');\n          return;`, 'focus-route action record'],
  [`          }).addTo(MapMod.map);\n          return;`, `          }).addTo(MapMod.map);\n          recordMapTestAction('nearby-overlay-upsert', { center: [nearbyLat, nearbyLng], radiusMeters: Number.isFinite(radiusMeters) ? Math.max(0, radiusMeters) : 0 });\n          return;`, 'nearby upsert action record'],
  [`          if (MapMod._nearbyCircle && Number.isFinite(nextRadius) && nextRadius >= 0) MapMod._nearbyCircle.setRadius(nextRadius);\n          return;`, `          if (MapMod._nearbyCircle && Number.isFinite(nextRadius) && nextRadius >= 0) {\n            MapMod._nearbyCircle.setRadius(nextRadius);\n            recordMapTestAction('nearby-overlay-radius', { radiusMeters: nextRadius });\n          }\n          return;`, 'nearby radius action record'],
  [`          MapMod._nearbyMarker = null;\n          MapMod._nearbyCircle = null;\n          return;`, `          MapMod._nearbyMarker = null;\n          MapMod._nearbyCircle = null;\n          recordMapTestAction('nearby-overlay-clear');\n          return;`, 'nearby clear action record'],
  [`          AppState.waypointMapMarkers = [];\n          return;`, `          AppState.waypointMapMarkers = [];\n          recordMapTestAction('clear-waypoint-overlays');\n          return;`, 'waypoint clear action record'],
  [`          MapMod.drawRoute(routeCoords, request && request.mode);\n          return;`, `          MapMod.drawRoute(routeCoords, request && request.mode);\n          recordMapTestAction('draw-route', { mode: request && request.mode, points: routeCoords.length });\n          return;`, 'draw-route action record'],
  [`          MapMod.drawStartEnd(request && request.points);\n          return;`, `          MapMod.drawStartEnd(request && request.points);\n          recordMapTestAction('draw-start-end');\n          return;`, 'draw-start-end action record'],
  [`          MapMod.focusCam(camera);\n          return;`, `          MapMod.focusCam(camera);\n          recordMapTestAction('focus-camera');\n          return;`, 'focus-camera action record'],
  [`          MapMod.drawConditionSections(conditionSections);\n          return;`, `          MapMod.drawConditionSections(conditionSections);\n          recordMapTestAction('draw-condition-sections', { sections: conditionSections.length });\n          return;`, 'draw-condition-sections action record'],
  [`          MapMod.focusSection(sectionOrder);\n          return;`, `          MapMod.focusSection(sectionOrder);\n          recordMapTestAction('focus-section', { order: sectionOrder });\n          return;`, 'focus-section action record'],
  [`          MapMod.map.setView([lat, lng], Number.isFinite(zoom) ? zoom : MapMod.map.getZoom());\n        }`, `          var appliedZoom = Number.isFinite(zoom) ? zoom : MapMod.map.getZoom();\n          MapMod.map.setView([lat, lng], appliedZoom);\n          recordMapTestAction('set-view', { center: [lat, lng], zoom: appliedZoom });\n        }`, 'set-view action record']
];
for (const [before, after, label] of handlerReplacements) main = replaceExact(main, before, after, label);

main = replaceExact(main, `  window.MapMod = MapMod;\n  window.InfoMod = InfoMod;`, `  window.InfoMod = InfoMod;`, 'remove MapMod global export');
main = replaceExact(main, `    MapMod.init();\n    if (Storage.get(THEME_KEY, 'dark') === 'light') {`, `    MapMod.init();\n    installMapTestProbe(MapMod);\n    if (Storage.get(THEME_KEY, 'dark') === 'light') {`, 'install E2E map probe');
fs.writeFileSync(mainPath, main);

const requestPath = 'tests/e2e/desktop-map-request.spec.js';
let requestSpec = fs.readFileSync(requestPath, 'utf8');
requestSpec = requestSpec.replace(`const WORKER = '/?worker=http://127.0.0.1:8787';`, `const WORKER = '/?worker=http://127.0.0.1:8787&e2e=1';`);
requestSpec = replaceExact(
  requestSpec,
  `  await expect.poll(() => page.evaluate(() => Boolean(window.Bus && window.MapMod && window.MapMod.map))).toBe(true);\n\n  const result = await page.evaluate(() => {\n    const calls = [];\n    const map = window.MapMod.map;\n    const originalSetView = map.setView;\n    const originalInvalidateSize = map.invalidateSize;\n    const originalFocusRoute = window.MapMod.focusRoute;\n\n    map.setView = function(center, zoom) { calls.push({ action: 'set-view', center: center.slice(), zoom }); return map; };\n    map.invalidateSize = function() { calls.push({ action: 'invalidate-size' }); return map; };\n    window.MapMod.focusRoute = function() { calls.push({ action: 'focus-route' }); };\n\n    window.Bus.emit('map:request', { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 });\n    window.Bus.emit('map:request', { action: 'invalidate-size' });\n    window.Bus.emit('map:request', { action: 'focus-route' });\n    window.Bus.emit('map:request', { action: 'set-view', center: ['bad', 120], zoom: 9 });\n    window.Bus.emit('map:request', { action: 'unknown' });\n\n    map.setView = originalSetView;\n    map.invalidateSize = originalInvalidateSize;\n    window.MapMod.focusRoute = originalFocusRoute;\n    return calls;\n  });\n\n  expect(result).toEqual([\n    { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 },\n    { action: 'invalidate-size' },\n    { action: 'focus-route' }\n  ]);`,
  `  await expect.poll(() => page.evaluate(() => Boolean(window.Bus && window.__MapTestProbe && window.__MapTestProbe.snapshot().ready))).toBe(true);\n\n  const result = await page.evaluate(() => {\n    window.__MapTestProbe.clearActions();\n    window.Bus.emit('map:request', { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 });\n    window.Bus.emit('map:request', { action: 'invalidate-size' });\n    window.Bus.emit('map:request', { action: 'focus-route' });\n    window.Bus.emit('map:request', { action: 'set-view', center: ['bad', 120], zoom: 9 });\n    window.Bus.emit('map:request', { action: 'unknown' });\n    return { actions: window.__MapTestProbe.actions(), snapshot: window.__MapTestProbe.snapshot() };\n  });\n\n  expect(result.actions).toEqual([\n    { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 },\n    { action: 'invalidate-size' },\n    { action: 'focus-route' }\n  ]);\n  expect(result.snapshot.center[0]).toBeCloseTo(24.1477, 4);\n  expect(result.snapshot.center[1]).toBeCloseTo(120.6736, 4);\n  expect(result.snapshot.zoom).toBe(11);`,
  'desktop map request spec'
);
fs.writeFileSync(requestPath, requestSpec);

const overlayPath = 'tests/e2e/desktop-map-overlay-request.spec.js';
let overlaySpec = fs.readFileSync(overlayPath, 'utf8');
overlaySpec = overlaySpec.replace(`const WORKER = '/?worker=http://127.0.0.1:8787';`, `const WORKER = '/?worker=http://127.0.0.1:8787&e2e=1';`);
overlaySpec = replaceExact(
  overlaySpec,
  `  await expect.poll(() => page.evaluate(() => Boolean(window.Bus && window.MapMod && window.MapMod.map && window.L))).toBe(true);\n\n  const result = await page.evaluate(() => {\n    const map = window.MapMod.map;\n    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });\n\n    window.Bus.emit('map:request', {\n      action: 'nearby-overlay-upsert',\n      center: [24.1477, 120.6736],\n      radiusMeters: 5000\n    });\n\n    const marker = window.MapMod._nearbyMarker;\n    const circle = window.MapMod._nearbyCircle;\n    const markerLatLng = marker && marker.getLatLng();\n    const firstRadius = circle && circle.getRadius();\n\n    window.Bus.emit('map:request', { action: 'nearby-overlay-radius', radiusMeters: 8000 });\n    const secondRadius = window.MapMod._nearbyCircle && window.MapMod._nearbyCircle.getRadius();\n\n    const waypoint = window.L.marker([24.2, 120.7]).addTo(map);\n    window.AppState.waypointMapMarkers = [waypoint];\n    const waypointBeforeClear = map.hasLayer(waypoint);\n    window.Bus.emit('map:request', { action: 'clear-waypoint-overlays' });\n    const waypointAfterClear = map.hasLayer(waypoint);\n    const waypointStateCount = window.AppState.waypointMapMarkers.length;\n\n    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });\n    const cleared = window.MapMod._nearbyMarker === null && window.MapMod._nearbyCircle === null;\n\n    window.Bus.emit('map:request', {\n      action: 'nearby-overlay-upsert',\n      center: ['bad', 120.6736],\n      radiusMeters: 3000\n    });\n    const invalidIgnored = window.MapMod._nearbyMarker === null && window.MapMod._nearbyCircle === null;\n\n    return {\n      markerCenter: markerLatLng ? [markerLatLng.lat, markerLatLng.lng] : null,\n      firstRadius,\n      secondRadius,\n      waypointBeforeClear,\n      waypointAfterClear,\n      waypointStateCount,\n      cleared,\n      invalidIgnored\n    };\n  });`,
  `  await expect.poll(() => page.evaluate(() => Boolean(window.Bus && window.__MapTestProbe && window.__MapTestProbe.snapshot().ready))).toBe(true);\n\n  const result = await page.evaluate(() => {\n    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });\n    window.Bus.emit('map:request', {\n      action: 'nearby-overlay-upsert',\n      center: [24.1477, 120.6736],\n      radiusMeters: 5000\n    });\n    const first = window.__MapTestProbe.snapshot();\n\n    window.Bus.emit('map:request', { action: 'nearby-overlay-radius', radiusMeters: 8000 });\n    const second = window.__MapTestProbe.snapshot();\n\n    window.__MapTestProbe.createWaypointMarker([24.2, 120.7]);\n    const waypointBefore = window.__MapTestProbe.snapshot();\n    window.Bus.emit('map:request', { action: 'clear-waypoint-overlays' });\n    const waypointAfter = window.__MapTestProbe.snapshot();\n\n    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });\n    const cleared = window.__MapTestProbe.snapshot();\n\n    window.Bus.emit('map:request', {\n      action: 'nearby-overlay-upsert',\n      center: ['bad', 120.6736],\n      radiusMeters: 3000\n    });\n    const invalid = window.__MapTestProbe.snapshot();\n\n    return { first, second, waypointBefore, waypointAfter, cleared, invalid };\n  });\n\n  result.markerCenter = result.first.nearbyMarkerCenter;\n  result.firstRadius = result.first.nearbyRadius;\n  result.secondRadius = result.second.nearbyRadius;\n  result.waypointBeforeClear = result.waypointBefore.testWaypointAttached;\n  result.waypointAfterClear = result.waypointAfter.testWaypointAttached;\n  result.waypointStateCount = result.waypointAfter.waypointStateCount;\n  result.clearedState = result.cleared.nearbyCleared;\n  result.invalidIgnored = result.invalid.nearbyCleared;`,
  'desktop map overlay spec'
);
overlaySpec = overlaySpec.replace(`  expect(result.cleared).toBe(true);`, `  expect(result.clearedState).toBe(true);`);
fs.writeFileSync(overlayPath, overlaySpec);

const globalPath = 'tests/e2e/desktop-browser-global-surface.spec.js';
let globalSpec = fs.readFileSync(globalPath, 'utf8');
globalSpec = replaceExact(globalSpec, `      && window.MapMod\n`, ``, 'remove MapMod readiness global');
globalSpec = replaceExact(globalSpec, `      MapMod: typeof window.MapMod === 'object',\n`, `      MapMod: Object.prototype.hasOwnProperty.call(window, 'MapMod'),\n      MapTestProbe: Object.prototype.hasOwnProperty.call(window, '__MapTestProbe'),\n`, 'global surface MapMod assertion');
globalSpec = replaceExact(globalSpec, `    MapMod: true,\n    RouteConditionsMod: true,`, `    MapMod: false,\n    MapTestProbe: false,\n    RouteConditionsMod: true,`, 'expected global surface');
fs.writeFileSync(globalPath, globalSpec);

const dashboardPath = 'tests/e2e/dashboard.spec.js';
let dashboard = fs.readFileSync(dashboardPath, 'utf8');
dashboard = replaceAllChecked(dashboard, `/?worker=http://127.0.0.1:8787`, `/?worker=http://127.0.0.1:8787&e2e=1`, 'dashboard E2E probe URLs', 10);
dashboard = replaceExact(dashboard, `  await page.evaluate(() => NavMod.go('map'));`, `  await page.evaluate(() => Bus.emit('navigation:request', { page: 'map' }));`, 'dashboard navigation helper');
dashboard = replaceExact(dashboard, `    MapMod.routeSectionLayers.length === AppState.routeConditions.sections.length * 2`, `    window.__MapTestProbe.snapshot().routeSectionLayerCount === AppState.routeConditions.sections.length * 2`, 'route section layer count');
dashboard = replaceExact(
  dashboard,
  `    const cue = MapMod.routeIncidentLayers.find((layer) => layer._roadEventLocationCue);\n    return {\n      layers: MapMod.routeIncidentLayers.length,\n      kind: cue?._roadEventKind,\n      impact: cue?._roadEventImpact,\n      color: cue?.options?.color,\n      dashArray: cue?.options?.dashArray || null,\n      points: cue?.getLatLngs?.().length || 0\n    };`,
  `    const snapshot = window.__MapTestProbe.snapshot();\n    const cue = snapshot.incidentCues[0];\n    return {\n      layers: snapshot.routeIncidentLayerCount,\n      kind: cue?.kind,\n      impact: cue?.impact,\n      color: cue?.color,\n      dashArray: cue?.dashArray || null,\n      points: cue?.points || 0\n    };`,
  'incident cue snapshot'
);
dashboard = replaceExact(dashboard, `    MapMod.routeIncidentLayers.find((layer) => layer._roadEventLocationCue).getLatLngs().length`, `    window.__MapTestProbe.snapshot().incidentCues[0].points`, 'incident cue points');
dashboard = replaceExact(dashboard, `    eventLayers: MapMod.routeIncidentLayers.length,\n    eventMarkers: MapMod.routeIncidentMarkers.length`, `    eventLayers: window.__MapTestProbe.snapshot().routeIncidentLayerCount,\n    eventMarkers: window.__MapTestProbe.snapshot().routeIncidentMarkerCount`, 'cleared incident state');
dashboard = replaceExact(dashboard, `expect(await page.evaluate(() => MapMod.routeIncidentLayers.length)).toBe(0);`, `expect(await page.evaluate(() => window.__MapTestProbe.snapshot().routeIncidentLayerCount)).toBe(0);`, 'coordinate-free incident layer state');
dashboard = replaceExact(dashboard, `    MapMod.routeIncidentLayers.filter((layer) => layer._roadEventLocationCue).length`, `    window.__MapTestProbe.snapshot().incidentCues.length`, 'multi-location cue count');
dashboard = replaceExact(
  dashboard,
  `    MapMod.routeIncidentLayers\n      .filter((layer) => layer._roadEventLocationCue)\n      .map((layer) => ({\n        kind: layer._roadEventKind,\n        status: layer._roadEventStatus,\n        dashArray: layer.options.dashArray || null\n      }))`,
  `    window.__MapTestProbe.snapshot().incidentCues.map((cue) => ({\n      kind: cue.kind,\n      status: cue.status,\n      dashArray: cue.dashArray || null\n    }))`,
  'multi-location cue details'
);
dashboard = replaceExact(dashboard, `expect(await page.evaluate(() => MapMod.routeIncidentLayers.length)).toBeGreaterThan(0);`, `expect(await page.evaluate(() => window.__MapTestProbe.snapshot().routeIncidentLayerCount)).toBeGreaterThan(0);`, 'old event layer presence');
dashboard = replaceExact(
  dashboard,
  `    MapMod.drawRoute([\n      [25.0478, 121.5170],\n      [25.0350, 121.5400]\n    ], 'motorcycle');\n    return {\n      routeLayers: Array.isArray(MapMod.routeLayer) ? MapMod.routeLayer.length : 0,\n      eventLayers: MapMod.routeIncidentLayers.length,\n      eventMarkers: MapMod.routeIncidentMarkers.length,\n      weatherMarkers: MapMod.routeWeatherMarkers.length\n    };`,
  `    Bus.emit('map:request', {\n      action: 'draw-route',\n      coords: [[25.0478, 121.5170], [25.0350, 121.5400]],\n      mode: 'motorcycle'\n    });\n    const snapshot = window.__MapTestProbe.snapshot();\n    return {\n      routeLayers: snapshot.routeLayerCount,\n      eventLayers: snapshot.routeIncidentLayerCount,\n      eventMarkers: snapshot.routeIncidentMarkerCount,\n      weatherMarkers: snapshot.routeWeatherMarkerCount\n    };`,
  'replacement route draw via Bus'
);
dashboard = replaceAllChecked(dashboard, `page.evaluate(() => MapMod.tileLayer && MapMod.tileLayer._url)`, `page.evaluate(() => window.__MapTestProbe.snapshot().tileUrl)`, 'theme tile URL probe', 2);
dashboard = replaceExact(dashboard, `    startEndMarkers: MapMod.startEndMarkers.length`, `    startEndMarkers: window.__MapTestProbe.snapshot().startEndMarkerCount`, 'cleared start/end markers');
dashboard = replaceExact(dashboard, `    routeLayer: Boolean(MapMod.routeLayer)`, `    routeLayer: window.__MapTestProbe.snapshot().routeLayerCount > 0`, 'cleared route layer state');
dashboard = replaceExact(
  dashboard,
  `    Array.isArray(MapMod.routeLayer)\n      && MapMod.routeLayer.length === 3\n      && MapMod.routeLayer.every((layer) => MapMod.map.hasLayer(layer))`,
  `    window.__MapTestProbe.snapshot().routeLayerCount === 3\n      && window.__MapTestProbe.snapshot().routeLayerAttached`,
  'offline route layer state'
);
if (dashboard.includes('MapMod')) throw new Error('dashboard.spec.js still contains MapMod references');
fs.writeFileSync(dashboardPath, dashboard);

const checkPath = 'scripts/check.sh';
let check = fs.readFileSync(checkPath, 'utf8');
check = replaceExact(check, `! grep -q 'window.NavMod' js/main-ui.js\n`, `! grep -q 'window.NavMod' js/main-ui.js\n! grep -q 'window.MapMod' js/main-ui.js\ngrep -q "params.get('e2e') !== '1'" js/main-ui.js\ngrep -q 'window.__MapTestProbe = Object.freeze' js/main-ui.js\n`, 'MapMod export and probe static checks');
check = replaceExact(
  check,
  `! grep -q 'MapMod' js/enhancements.js\n`,
  `! grep -q 'MapMod' js/enhancements.js\nfor file in js/*.js; do\n  [ "$file" = "js/main-ui.js" ] || ! grep -q 'MapMod' "$file"\ndone\n! grep -R -q 'MapMod' tests/e2e\n`,
  'repo MapMod test guard'
);
fs.writeFileSync(checkPath, check);

for (const file of [requestPath, overlayPath, globalPath, dashboardPath]) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('MapMod')) throw new Error(`${file} still contains MapMod`);
}
if (fs.readFileSync(mainPath, 'utf8').includes('window.MapMod')) throw new Error('window.MapMod export remains');
console.log('MapMod E2E compatibility migrated to e2e-only probe');
