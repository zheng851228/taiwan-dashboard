import fs from 'node:fs';

function replaceExactCount(source, before, after, expected, label) {
  const parts = source.split(before);
  const count = parts.length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return parts.join(after);
}

const mainFile = 'js/main-ui.js';
let main = fs.readFileSync(mainFile, 'utf8');
main = replaceExactCount(
  main,
  `    startEndMarkers: [], _canvas: null, _camData: [], _markerSignature: '',`,
  `    startEndMarkers: [], _canvas: null, _camData: [], _markerSignature: '',\n    _nearbyMarker: null, _nearbyCircle: null,`,
  1,
  'nearby overlay state'
);
main = replaceExactCount(
  main,
  `        if (action === 'set-view') {\n          var center = request && request.center;`,
  `        if (action === 'nearby-overlay-upsert') {\n          var nearbyCenter = request && request.center;\n          var nearbyLat = Array.isArray(nearbyCenter) ? Number(nearbyCenter[0]) : NaN;\n          var nearbyLng = Array.isArray(nearbyCenter) ? Number(nearbyCenter[1]) : NaN;\n          var radiusMeters = Number(request && request.radiusMeters);\n          if (!MapMod.map || !Number.isFinite(nearbyLat) || !Number.isFinite(nearbyLng)) return;\n          if (MapMod._nearbyMarker) MapMod.map.removeLayer(MapMod._nearbyMarker);\n          if (MapMod._nearbyCircle) MapMod.map.removeLayer(MapMod._nearbyCircle);\n          var nearbyIcon = L.divIcon({\n            className: '',\n            html: '<div style="position:relative;width:20px;height:20px">'\n              + '<div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.3;animation:ping 1.5s ease-in-out infinite"></div>'\n              + '<div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 8px #3b82f6"></div>'\n              + '</div>',\n            iconSize: [20,20], iconAnchor: [10,10]\n          });\n          MapMod._nearbyMarker = L.marker([nearbyLat, nearbyLng], { icon: nearbyIcon })\n            .addTo(MapMod.map).bindTooltip('📍 我的位置', { direction:'top', permanent: false });\n          MapMod._nearbyCircle = L.circle([nearbyLat, nearbyLng], {\n            radius: Number.isFinite(radiusMeters) ? Math.max(0, radiusMeters) : 0,\n            color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.05, weight: 1.5, dashArray: '6,4'\n          }).addTo(MapMod.map);\n          return;\n        }\n        if (action === 'nearby-overlay-radius') {\n          var nextRadius = Number(request && request.radiusMeters);\n          if (MapMod._nearbyCircle && Number.isFinite(nextRadius) && nextRadius >= 0) MapMod._nearbyCircle.setRadius(nextRadius);\n          return;\n        }\n        if (action === 'nearby-overlay-clear') {\n          if (MapMod.map && MapMod._nearbyMarker) MapMod.map.removeLayer(MapMod._nearbyMarker);\n          if (MapMod.map && MapMod._nearbyCircle) MapMod.map.removeLayer(MapMod._nearbyCircle);\n          MapMod._nearbyMarker = null;\n          MapMod._nearbyCircle = null;\n          return;\n        }\n        if (action === 'clear-waypoint-overlays') {\n          if (MapMod.map && Array.isArray(AppState.waypointMapMarkers)) {\n            AppState.waypointMapMarkers.forEach(function(marker) { MapMod.map.removeLayer(marker); });\n          }\n          AppState.waypointMapMarkers = [];\n          return;\n        }\n        if (action === 'set-view') {\n          var center = request && request.center;`,
  1,
  'overlay request handlers'
);
fs.writeFileSync(mainFile, main);

const enhancementsFile = 'js/enhancements.js';
let enhancements = fs.readFileSync(enhancementsFile, 'utf8');
enhancements = replaceExactCount(
  enhancements,
  `var NearbyMod = {\n  userLat: null, userLng: null, radius: 5, marker: null, circle: null,`,
  `var NearbyMod = {\n  userLat: null, userLng: null, radius: 5,`,
  1,
  'nearby overlay local state removal'
);
enhancements = replaceExactCount(
  enhancements,
  `  showOnMap: function() {\n    if (!NearbyMod.userLat) return;\n    if (NearbyMod.marker) MapMod.map.removeLayer(NearbyMod.marker);\n    var icon = L.divIcon({\n      className: '',\n      html: '<div style="position:relative;width:20px;height:20px">' +\n            '<div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.3;animation:ping 1.5s ease-in-out infinite"></div>' +\n            '<div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 8px #3b82f6"></div>' +\n            '</div>',\n      iconSize: [20,20], iconAnchor: [10,10]\n    });\n    NearbyMod.marker = L.marker([NearbyMod.userLat, NearbyMod.userLng], { icon: icon })\n      .addTo(MapMod.map).bindTooltip('\\u{1F4CD} \\u6211\\u7684\\u4f4d\\u7f6e', { direction:'top', permanent: false });\n    if (NearbyMod.circle) MapMod.map.removeLayer(NearbyMod.circle);\n    NearbyMod.circle = L.circle([NearbyMod.userLat, NearbyMod.userLng], {\n      radius: NearbyMod.radius * 1000, color: '#3b82f6', fillColor: '#3b82f6',\n      fillOpacity: 0.05, weight: 1.5, dashArray: '6,4'\n    }).addTo(MapMod.map);\n    Bus.emit('map:request', { action: 'set-view', center: [NearbyMod.userLat, NearbyMod.userLng], zoom: 12 });\n  },`,
  `  showOnMap: function() {\n    if (NearbyMod.userLat === null || NearbyMod.userLng === null) return;\n    Bus.emit('map:request', {\n      action: 'nearby-overlay-upsert',\n      center: [NearbyMod.userLat, NearbyMod.userLng],\n      radiusMeters: NearbyMod.radius * 1000\n    });\n    Bus.emit('map:request', { action: 'set-view', center: [NearbyMod.userLat, NearbyMod.userLng], zoom: 12 });\n  },`,
  1,
  'nearby overlay upsert request'
);
enhancements = replaceExactCount(
  enhancements,
  `    if (NearbyMod.circle) NearbyMod.circle.setRadius(NearbyMod.radius * 1000);`,
  `    if (NearbyMod.userLat !== null) Bus.emit('map:request', { action: 'nearby-overlay-radius', radiusMeters: NearbyMod.radius * 1000 });`,
  1,
  'nearby radius request'
);
enhancements = replaceExactCount(
  enhancements,
  `    if (NearbyMod.marker) { MapMod.map.removeLayer(NearbyMod.marker); NearbyMod.marker = null; }\n    if (NearbyMod.circle) { MapMod.map.removeLayer(NearbyMod.circle); NearbyMod.circle = null; }`,
  `    Bus.emit('map:request', { action: 'nearby-overlay-clear' });`,
  1,
  'nearby clear request'
);
enhancements = replaceExactCount(
  enhancements,
  `  clearMarkers: function() {\n    if (AppState.waypointMapMarkers) {\n      AppState.waypointMapMarkers.forEach(function(m) { MapMod.map.removeLayer(m); });\n      AppState.waypointMapMarkers = [];\n    }\n  }`,
  `  clearMarkers: function() {\n    Bus.emit('map:request', { action: 'clear-waypoint-overlays' });\n  }`,
  1,
  'waypoint overlay clear request'
);
if (enhancements.includes('MapMod')) {
  const lines = enhancements.split('\n').map((line, index) => ({ line, number: index + 1 }))
    .filter((entry) => entry.line.includes('MapMod'))
    .map((entry) => `${entry.number}: ${entry.line.trim()}`)
    .join('\n');
  throw new Error(`enhancements.js still directly references MapMod:\n${lines}`);
}
fs.writeFileSync(enhancementsFile, enhancements);

console.log('map overlay boundary migration applied');
