import fs from 'node:fs';

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(before, after);
}

const mainPath = 'js/main-ui.js';
let main = fs.readFileSync(mainPath, 'utf8');
if (!main.includes("Bus.on('map:request'")) {
  main = replaceExact(
    main,
    "      MapMod.addPlaceLabels();\n    },\n    addPlaceLabels: function() {",
    "      MapMod.addPlaceLabels();\n      Bus.on('map:request', function(request) {\n        var action = request && request.action;\n        if (action === 'invalidate-size') {\n          if (MapMod.map && MapMod.map.invalidateSize) MapMod.map.invalidateSize();\n          return;\n        }\n        if (action === 'focus-route') {\n          MapMod.focusRoute();\n          return;\n        }\n        if (action === 'set-view') {\n          var center = request && request.center;\n          var lat = Array.isArray(center) ? Number(center[0]) : NaN;\n          var lng = Array.isArray(center) ? Number(center[1]) : NaN;\n          var zoom = Number(request && request.zoom);\n          if (!MapMod.map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;\n          MapMod.map.setView([lat, lng], Number.isFinite(zoom) ? zoom : MapMod.map.getZoom());\n        }\n      });\n    },\n    addPlaceLabels: function() {",
    'map request listener'
  );
}
fs.writeFileSync(mainPath, main);

const desktopPath = 'js/desktop-dashboard.js';
let desktop = fs.readFileSync(desktopPath, 'utf8');
desktop = replaceExact(
  desktop,
  "    if (legacy && MapMod.map && MapMod.map.invalidateSize) window.setTimeout(function() { MapMod.map.invalidateSize(); }, 80);",
  "    if (legacy) window.setTimeout(function() { Bus.emit('map:request', { action: 'invalidate-size' }); }, 80);",
  'desktop legacy resize request'
);
desktop = replaceExact(
  desktop,
  "    } else if (window.MapMod && MapMod.focusRoute) {\n      MapMod.focusRoute();\n    }",
  "    } else {\n      Bus.emit('map:request', { action: 'focus-route' });\n    }",
  'desktop home focus request'
);
if (desktop.includes('MapMod')) throw new Error('desktop-dashboard.js still directly references MapMod');
fs.writeFileSync(desktopPath, desktop);

const ridePath = 'js/ride-tools.js';
let ride = fs.readFileSync(ridePath, 'utf8');
ride = replaceExact(ride, "          if (!item || !MapMod.map) return;", "          if (!item) return;", 'favorite map guard');
ride = replaceExact(
  ride,
  "          MapMod.map.setView([item.lat, item.lng], 14);",
  "          Bus.emit('map:request', { action: 'set-view', center: [item.lat, item.lng], zoom: 14 });",
  'favorite set-view request'
);
if (ride.includes('MapMod')) throw new Error('ride-tools.js still directly references MapMod');
fs.writeFileSync(ridePath, ride);

const enhancementsPath = 'js/enhancements.js';
let enhancements = fs.readFileSync(enhancementsPath, 'utf8');
enhancements = replaceExact(enhancements, "        if (center && MapMod.map) {", "        if (center) {", 'weather map guard');
enhancements = replaceExact(
  enhancements,
  "          MapMod.map.setView(center, 11);",
  "          Bus.emit('map:request', { action: 'set-view', center: center, zoom: 11 });",
  'weather set-view request'
);
enhancements = replaceExact(
  enhancements,
  "        setTimeout(function(){MapMod.map&&MapMod.map.invalidateSize();},100);",
  "        setTimeout(function(){ Bus.emit('map:request', { action: 'invalidate-size' }); },100);",
  'fullscreen invalidate-size request'
);
enhancements = replaceExact(
  enhancements,
  "    MapMod.map.setView([NearbyMod.userLat, NearbyMod.userLng], 12);",
  "    Bus.emit('map:request', { action: 'set-view', center: [NearbyMod.userLat, NearbyMod.userLng], zoom: 12 });",
  'nearby location set-view request'
);
enhancements = replaceExact(
  enhancements,
  "        if (cam) { InfoMod.open(cam); MapMod.map.setView([cam.lat, cam.lng], 14); }",
  "        if (cam) { InfoMod.open(cam); Bus.emit('map:request', { action: 'set-view', center: [cam.lat, cam.lng], zoom: 14 }); }",
  'nearby camera set-view request'
);
enhancements = replaceExact(
  enhancements,
  "        MapMod.map.setView([found.lat, found.lng], 13);",
  "        Bus.emit('map:request', { action: 'set-view', center: [found.lat, found.lng], zoom: 13 });",
  'route strip set-view request'
);
if (enhancements.includes('MapMod.map.setView') || enhancements.includes('MapMod.map.invalidateSize')) {
  throw new Error('enhancements.js still directly issues map view/resize commands');
}
fs.writeFileSync(enhancementsPath, enhancements);

for (const token of [
  "Bus.on('map:request'",
  "action === 'invalidate-size'",
  "action === 'focus-route'",
  "action === 'set-view'"
]) {
  if (!main.includes(token)) throw new Error(`missing map request boundary token: ${token}`);
}

console.log('map view command boundary applied');
