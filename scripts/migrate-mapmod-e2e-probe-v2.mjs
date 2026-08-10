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
  `  var mapTestActions = [];\n  var mapTestProbeEnabled = false;\n\n  function recordMapTestAction(action, detail) {\n    if (!mapTestProbeEnabled) return;\n    mapTestActions.push(Object.assign({ action: action }, detail || {}));\n  }\n\n  function mapTestSnapshot() {\n    var center = MapMod.map && MapMod.map.getCenter ? MapMod.map.getCenter() : null;\n    var nearbyCenter = MapMod._nearbyMarker && MapMod._nearbyMarker.getLatLng\n      ? MapMod._nearbyMarker.getLatLng()\n      : null;\n    var routeLayers = Array.isArray(MapMod.routeLayer)\n      ? MapMod.routeLayer\n      : (MapMod.routeLayer ? [MapMod.routeLayer] : []);\n    var incidentCues = MapMod.routeIncidentLayers\n      .filter(function(layer) { return layer && layer._roadEventLocationCue; })\n      .map(function(layer) {\n        return {\n          kind: layer._roadEventKind || null,\n          impact: layer._roadEventImpact || null,\n          status: layer._roadEventStatus || null,\n          color: layer.options && layer.options.color || null,\n          dashArray: layer.options && layer.options.dashArray || null,\n          points: layer.getLatLngs ? layer.getLatLngs().length : 0\n        };\n      });\n    return {\n      ready: Boolean(MapMod.map),\n      tileUrl: MapMod.tileLayer && MapMod.tileLayer._url || null,\n      center: center ? [center.lat, center.lng] : null,\n      zoom: MapMod.map && MapMod.map.getZoom ? MapMod.map.getZoom() : null,\n      routeLayerCount: routeLayers.length,\n      routeLayerAttached: Boolean(MapMod.map) && routeLayers.length > 0\n        ? routeLayers.every(function(layer) { return MapMod.map.hasLayer(layer); })\n        : false,\n      routeSectionLayerCount: MapMod.routeSectionLayers.length,\n      routeIncidentLayerCount: MapMod.routeIncidentLayers.length,\n      routeIncidentMarkerCount: MapMod.routeIncidentMarkers.length,\n      routeWeatherMarkerCount: MapMod.routeWeatherMarkers.length,\n      startEndMarkerCount: MapMod.startEndMarkers.length,\n      nearbyMarkerCenter: nearbyCenter ? [nearbyCenter.lat, nearbyCenter.lng] : null,\n      nearbyRadius: MapMod._nearbyCircle && MapMod._nearbyCircle.getRadius\n        ? MapMod._nearbyCircle.getRadius()\n        : null,\n      nearbyCleared: MapMod._nearbyMarker === null && MapMod._nearbyCircle === null,\n      waypointStateCount: Array.isArray(AppState.waypointMapMarkers) ? AppState.waypointMapMarkers.length : 0,\n      testWaypointAttached: Boolean(\n        MapMod.map\n        && window.__mapTestWaypointMarker\n        && MapMod.map.hasLayer(window.__mapTestWaypointMarker)\n      ),\n      incidentCues: incidentCues\n    };\n  }\n\n  function installMapTestProbe() {\n    var params = new URLSearchParams(window.location.search);\n    if (params.get('e2e') !== '1') return;\n    mapTestProbeEnabled = true;\n    window.__MapTestProbe = Object.freeze({\n      snapshot: mapTestSnapshot,\n      clearActions: function() { mapTestActions = []; },\n      actions: function() { return mapTestActions.map(function(item) { return Object.assign({}, item); }); },\n      createWaypointMarker: function(center) {\n        var lat = Array.isArray(center) ? Number(center[0]) : NaN;\n        var lng = Array.isArray(center) ? Number(center[1]) : NaN;\n        if (!MapMod.map || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;\n        if (window.__mapTestWaypointMarker && MapMod.map.hasLayer(window.__mapTestWaypointMarker)) {\n          MapMod.map.removeLayer(window.__mapTestWaypointMarker);\n        }\n        window.__mapTestWaypointMarker = L.marker([lat, lng]).addTo(MapMod.map);\n        AppState.waypointMapMarkers = [window.__mapTestWaypointMarker];\n        return true;\n      }\n    });\n  }\n\n  var MapMod = {`,
  'Map test probe helpers'
);

const handlerReplacements = [
  [`          if (MapMod.map && MapMod.map.invalidateSize) MapMod.map.invalidateSize();\n          return;`, `          if (MapMod.map && MapMod.map.invalidateSize) MapMod.map.invalidateSize();\n          recordMapTestAction('invalidate-size');\n          return;`, 'invalidate-size action record'],
  [`          MapMod.focusRoute();\n          return;`, `          MapMod.focusRoute();\n          recordMapTestAction('focus-route');\n          return;`, 'focus-route action record'],
  [`          MapMod.drawRoute(routeCoords, request && request.mode);\n          return;`, `          MapMod.drawRoute(routeCoords, request && request.mode);\n          recordMapTestAction('draw-route', { mode: request && request.mode, points: routeCoords.length });\n          return;`, 'draw-route action record'],
  [`          MapMod.drawStartEnd(request && request.points);\n          return;`, `          MapMod.drawStartEnd(request && request.points);\n          recordMapTestAction('draw-start-end');\n          return;`, 'draw-start-end action record'],
  [`          MapMod.focusCam(camera);\n          return;`, `          MapMod.focusCam(camera);\n          recordMapTestAction('focus-camera');\n          return;`, 'focus-camera action record'],
  [`          MapMod.drawConditionSections(conditionSections);\n          return;`, `          MapMod.drawConditionSections(conditionSections);\n          recordMapTestAction('draw-condition-sections', { sections: conditionSections.length });\n          return;`, 'draw-condition-sections action record'],
  [`          MapMod.focusSection(sectionOrder);\n          return;`, `          MapMod.focusSection(sectionOrder);\n          recordMapTestAction('focus-section', { order: sectionOrder });\n          return;`, 'focus-section action record'],
  [`          MapMod.map.setView([lat, lng], Number.isFinite(zoom) ? zoom : MapMod.map.getZoom());\n        }`, `          var appliedZoom = Number.isFinite(zoom) ? zoom : MapMod.map.getZoom();\n          MapMod.map.setView([lat, lng], appliedZoom);\n          recordMapTestAction('set-view', { center: [lat, lng], zoom: appliedZoom });\n        }`, 'set-view action record']
];
for (const [before, after, label] of handlerReplacements) main = replaceExact(main, before, after, label);
main = replaceExact(main, `  window.MapMod = MapMod;\n  window.InfoMod = InfoMod;`, `  window.InfoMod = InfoMod;`, 'remove MapMod global export');
main = replaceExact(main, `    MapMod.init();\n    if (Storage.get(THEME_KEY, 'dark') === 'light') {`, `    MapMod.init();\n    installMapTestProbe();\n    if (Storage.get(THEME_KEY, 'dark') === 'light') {`, 'install E2E map probe');
fs.writeFileSync(mainPath, main);

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

if (fs.readFileSync(mainPath, 'utf8').includes('window.MapMod')) throw new Error('window.MapMod export remains');
console.log('MapMod global removed and dashboard E2E probes migrated');
