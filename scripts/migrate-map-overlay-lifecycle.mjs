import fs from 'node:fs';

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(before, after);
}

function replaceSection(source, start, end, replacement, label) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`${label}: start anchor not found`);
  if (source.indexOf(start, startIndex + 1) >= 0) throw new Error(`${label}: start anchor is not unique`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`${label}: end anchor not found`);
  return source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

const mainPath = 'js/main-ui.js';
let main = fs.readFileSync(mainPath, 'utf8');
main = replaceExact(
  main,
  "    startEndMarkers: [], _canvas: null, _camData: [], _markerSignature: '',\n",
  "    startEndMarkers: [], _canvas: null, _camData: [], _markerSignature: '',\n    _nearbyMarker: null, _nearbyCircle: null,\n",
  'map overlay state'
);
main = replaceExact(
  main,
  "        if (action === 'focus-route') {\n          MapMod.focusRoute();\n          return;\n        }\n        if (action === 'set-view') {",
  `        if (action === 'focus-route') {
          MapMod.focusRoute();
          return;
        }
        if (action === 'nearby-overlay-upsert') {
          var nearbyCenter = request && request.center;
          var nearbyLat = Array.isArray(nearbyCenter) ? Number(nearbyCenter[0]) : NaN;
          var nearbyLng = Array.isArray(nearbyCenter) ? Number(nearbyCenter[1]) : NaN;
          var radiusMeters = Number(request && request.radiusMeters);
          if (!MapMod.map || !Number.isFinite(nearbyLat) || !Number.isFinite(nearbyLng)) return;
          if (MapMod._nearbyMarker) MapMod.map.removeLayer(MapMod._nearbyMarker);
          if (MapMod._nearbyCircle) MapMod.map.removeLayer(MapMod._nearbyCircle);
          var nearbyIcon = L.divIcon({
            className: '',
            html: '<div style="position:relative;width:20px;height:20px">'
              + '<div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.3;animation:ping 1.5s ease-in-out infinite"></div>'
              + '<div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 8px #3b82f6"></div>'
              + '</div>',
            iconSize: [20,20], iconAnchor: [10,10]
          });
          MapMod._nearbyMarker = L.marker([nearbyLat, nearbyLng], { icon: nearbyIcon })
            .addTo(MapMod.map).bindTooltip('📍 我的位置', { direction:'top', permanent: false });
          MapMod._nearbyCircle = L.circle([nearbyLat, nearbyLng], {
            radius: Number.isFinite(radiusMeters) ? Math.max(0, radiusMeters) : 0,
            color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.05, weight: 1.5, dashArray: '6,4'
          }).addTo(MapMod.map);
          return;
        }
        if (action === 'nearby-overlay-radius') {
          var nextRadius = Number(request && request.radiusMeters);
          if (MapMod._nearbyCircle && Number.isFinite(nextRadius) && nextRadius >= 0) MapMod._nearbyCircle.setRadius(nextRadius);
          return;
        }
        if (action === 'nearby-overlay-clear') {
          if (MapMod.map && MapMod._nearbyMarker) MapMod.map.removeLayer(MapMod._nearbyMarker);
          if (MapMod.map && MapMod._nearbyCircle) MapMod.map.removeLayer(MapMod._nearbyCircle);
          MapMod._nearbyMarker = null;
          MapMod._nearbyCircle = null;
          return;
        }
        if (action === 'clear-waypoint-overlays') {
          if (MapMod.map && Array.isArray(AppState.waypointMapMarkers)) {
            AppState.waypointMapMarkers.forEach(function(marker) { MapMod.map.removeLayer(marker); });
          }
          AppState.waypointMapMarkers = [];
          return;
        }
        if (action === 'set-view') {`,
  'map overlay request actions'
);
fs.writeFileSync(mainPath, main);

const enhancementsPath = 'js/enhancements.js';
let enhancements = fs.readFileSync(enhancementsPath, 'utf8');
enhancements = replaceExact(
  enhancements,
  "  userLat: null, userLng: null, radius: 5, marker: null, circle: null,",
  "  userLat: null, userLng: null, radius: 5,",
  'nearby local overlay state'
);
enhancements = replaceSection(
  enhancements,
  "  showOnMap: function() {\n",
  "  getNearby: function() {",
  `  showOnMap: function() {
    if (NearbyMod.userLat === null || NearbyMod.userLng === null) return;
    Bus.emit('map:request', {
      action: 'nearby-overlay-upsert',
      center: [NearbyMod.userLat, NearbyMod.userLng],
      radiusMeters: NearbyMod.radius * 1000
    });
    Bus.emit('map:request', { action: 'set-view', center: [NearbyMod.userLat, NearbyMod.userLng], zoom: 12 });
  },
`,
  'nearby showOnMap'
);
enhancements = replaceExact(
  enhancements,
  "    if (NearbyMod.circle) NearbyMod.circle.setRadius(NearbyMod.radius * 1000);",
  "    if (NearbyMod.userLat !== null) Bus.emit('map:request', { action: 'nearby-overlay-radius', radiusMeters: NearbyMod.radius * 1000 });",
  'nearby radius lifecycle'
);
enhancements = replaceExact(
  enhancements,
  "    if (NearbyMod.marker) { MapMod.map.removeLayer(NearbyMod.marker); NearbyMod.marker = null; }\n    if (NearbyMod.circle) { MapMod.map.removeLayer(NearbyMod.circle); NearbyMod.circle = null; }",
  "    Bus.emit('map:request', { action: 'nearby-overlay-clear' });",
  'nearby clear lifecycle'
);
enhancements = replaceExact(
  enhancements,
  "  clearMarkers: function() {\n    if (AppState.waypointMapMarkers) {\n      AppState.waypointMapMarkers.forEach(function(m) { MapMod.map.removeLayer(m); });\n      AppState.waypointMapMarkers = [];\n    }\n  }",
  "  clearMarkers: function() {\n    Bus.emit('map:request', { action: 'clear-waypoint-overlays' });\n  }",
  'waypoint overlay clear'
);
if (enhancements.includes('MapMod')) throw new Error('enhancements.js still directly references MapMod after overlay migration');
fs.writeFileSync(enhancementsPath, enhancements);

for (const token of [
  "action === 'nearby-overlay-upsert'",
  "action === 'nearby-overlay-radius'",
  "action === 'nearby-overlay-clear'",
  "action === 'clear-waypoint-overlays'"
]) {
  if (!main.includes(token)) throw new Error(`missing overlay request boundary token: ${token}`);
}
for (const token of [
  "action: 'nearby-overlay-upsert'",
  "action: 'nearby-overlay-radius'",
  "action: 'nearby-overlay-clear'",
  "action: 'clear-waypoint-overlays'"
]) {
  if (!enhancements.includes(token)) throw new Error(`missing overlay request consumer token: ${token}`);
}

console.log('map overlay lifecycle boundary applied');
