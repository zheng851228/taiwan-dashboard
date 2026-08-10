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
  `      MapMod.addPlaceLabels();\n    },\n    addPlaceLabels: function() {`,
  `      MapMod.addPlaceLabels();\n      Bus.on('map:request', function(request) {\n        var action = request && request.action;\n        if (action === 'invalidate-size') {\n          if (MapMod.map && MapMod.map.invalidateSize) MapMod.map.invalidateSize();\n          return;\n        }\n        if (action === 'focus-route') {\n          MapMod.focusRoute();\n          return;\n        }\n        if (action === 'set-view') {\n          var center = request && request.center;\n          var lat = Array.isArray(center) ? Number(center[0]) : NaN;\n          var lng = Array.isArray(center) ? Number(center[1]) : NaN;\n          var zoom = Number(request && request.zoom);\n          if (!MapMod.map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;\n          MapMod.map.setView([lat, lng], Number.isFinite(zoom) ? zoom : MapMod.map.getZoom());\n        }\n      });\n    },\n    addPlaceLabels: function() {`,
  1,
  'map request listener'
);
fs.writeFileSync(mainFile, main);

const desktopFile = 'js/desktop-dashboard.js';
let desktop = fs.readFileSync(desktopFile, 'utf8');
desktop = replaceExactCount(
  desktop,
  `    if (legacy && MapMod.map && MapMod.map.invalidateSize) window.setTimeout(function() { MapMod.map.invalidateSize(); }, 80);`,
  `    if (legacy) window.setTimeout(function() { Bus.emit('map:request', { action: 'invalidate-size' }); }, 80);`,
  1,
  'desktop legacy map resize request'
);
desktop = replaceExactCount(
  desktop,
  `    } else if (window.MapMod && MapMod.focusRoute) {\n      MapMod.focusRoute();\n    }`,
  `    } else {\n      Bus.emit('map:request', { action: 'focus-route' });\n    }`,
  1,
  'desktop home focus-route request'
);
if (desktop.includes('MapMod')) throw new Error('desktop-dashboard.js still directly references MapMod');
fs.writeFileSync(desktopFile, desktop);

const rideToolsFile = 'js/ride-tools.js';
let rideTools = fs.readFileSync(rideToolsFile, 'utf8');
rideTools = replaceExactCount(rideTools, `          if (!item || !MapMod.map) return;`, `          if (!item) return;`, 1, 'favorite map availability guard');
rideTools = replaceExactCount(
  rideTools,
  `          MapMod.map.setView([item.lat, item.lng], 14);`,
  `          Bus.emit('map:request', { action: 'set-view', center: [item.lat, item.lng], zoom: 14 });`,
  1,
  'favorite set-view request'
);
if (rideTools.includes('MapMod')) throw new Error('ride-tools.js still directly references MapMod');
fs.writeFileSync(rideToolsFile, rideTools);

const enhancementsFile = 'js/enhancements.js';
let enhancements = fs.readFileSync(enhancementsFile, 'utf8');
enhancements = replaceExactCount(enhancements, `        if (center && MapMod.map) {`, `        if (center) {`, 1, 'weather map guard');
enhancements = replaceExactCount(
  enhancements,
  `          MapMod.map.setView(center, 11);`,
  `          Bus.emit('map:request', { action: 'set-view', center: center, zoom: 11 });`,
  1,
  'weather set-view request'
);
enhancements = replaceExactCount(
  enhancements,
  `        setTimeout(function(){MapMod.map&&MapMod.map.invalidateSize();},100);`,
  `        setTimeout(function(){ Bus.emit('map:request', { action: 'invalidate-size' }); },100);`,
  1,
  'fullscreen map resize request'
);
enhancements = replaceExactCount(
  enhancements,
  `    MapMod.map.setView([NearbyMod.userLat, NearbyMod.userLng], 12);`,
  `    Bus.emit('map:request', { action: 'set-view', center: [NearbyMod.userLat, NearbyMod.userLng], zoom: 12 });`,
  1,
  'nearby location set-view request'
);
enhancements = replaceExactCount(
  enhancements,
  `        if (cam) { InfoMod.open(cam); MapMod.map.setView([cam.lat, cam.lng], 14); }`,
  `        if (cam) { InfoMod.open(cam); Bus.emit('map:request', { action: 'set-view', center: [cam.lat, cam.lng], zoom: 14 }); }`,
  1,
  'nearby camera set-view request'
);
enhancements = replaceExactCount(
  enhancements,
  `        MapMod.map.setView([found.lat, found.lng], 13);`,
  `        Bus.emit('map:request', { action: 'set-view', center: [found.lat, found.lng], zoom: 13 });`,
  1,
  'camera strip set-view request'
);
if (enhancements.includes('MapMod.map.setView') || enhancements.includes('MapMod.map.invalidateSize')) {
  throw new Error('enhancements.js still directly issues map view/resize commands');
}
fs.writeFileSync(enhancementsFile, enhancements);

console.log('map request bus migration applied');
