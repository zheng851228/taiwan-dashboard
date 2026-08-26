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
  "    init: function() {\n      Dom.onId('info-close', 'click', function() { InfoMod.close(); });",
  "    init: function() {\n      Bus.on('camera:open', function(cam) { if (cam) InfoMod.open(cam); });\n      Dom.onId('info-close', 'click', function() { InfoMod.close(); });",
  'camera open boundary'
);
main = replaceExact(
  main,
  "      InfoMod.current = null;\n    }\n  };",
  "      InfoMod.current = null;\n      Bus.emit('camera:closed');\n    }\n  };",
  'camera close boundary'
);
main = replaceExact(
  main,
  "  window.MapMod = MapMod;\n  window.InfoMod = InfoMod;\n  window.RouteMod = RouteMod;",
  "  window.MapMod = MapMod;\n  window.RouteMod = RouteMod;",
  'InfoMod global export'
);
fs.writeFileSync(mainPath, main);

const enhancementsPath = 'js/enhancements.js';
let enhancements = fs.readFileSync(enhancementsPath, 'utf8');
enhancements = replaceExact(
  enhancements,
  "        if (cam) { InfoMod.open(cam); Bus.emit('map:request', { action: 'set-view', center: [cam.lat, cam.lng], zoom: 14 }); }",
  "        if (cam) { Bus.emit('camera:open', cam); Bus.emit('map:request', { action: 'set-view', center: [cam.lat, cam.lng], zoom: 14 }); }",
  'nearby camera open'
);
enhancements = replaceExact(
  enhancements,
  "        InfoMod.open(found);\n        Bus.emit('map:request', { action: 'set-view', center: [found.lat, found.lng], zoom: 13 });",
  "        Bus.emit('camera:open', found);\n        Bus.emit('map:request', { action: 'set-view', center: [found.lat, found.lng], zoom: 13 });",
  'route strip camera open'
);
if (enhancements.includes('InfoMod')) throw new Error('enhancements.js still directly references InfoMod');
fs.writeFileSync(enhancementsPath, enhancements);

const ridePath = 'js/ride-tools.js';
let ride = fs.readFileSync(ridePath, 'utf8');
ride = replaceExact(
  ride,
  "  var FAVORITES_KEY = 'tw_favorites_v2';\n",
  "  var FAVORITES_KEY = 'tw_favorites_v2';\n  var selectedCamera = null;\n",
  'favorite selected camera state'
);
ride = replaceExact(ride, '      var selected = InfoMod.current;', '      var selected = selectedCamera;', 'favorite selected camera read');
ride = replaceExact(ride, '          if (match) InfoMod.open(match);', "          if (match) Bus.emit('camera:open', match);", 'favorite camera open');
ride = replaceExact(ride, '        FavoritesMod.toggle(InfoMod.current);', '        FavoritesMod.toggle(selectedCamera);', 'favorite info toggle');
ride = replaceExact(
  ride,
  "      Bus.on('camera:selected', function() {\n        FavoritesMod.syncButtons();\n      });",
  "      Bus.on('camera:selected', function(cam) {\n        selectedCamera = cam || null;\n        FavoritesMod.syncButtons();\n      });\n      Bus.on('camera:closed', function() {\n        selectedCamera = null;\n        FavoritesMod.syncButtons();\n      });",
  'favorite camera selection events'
);
if (ride.includes('InfoMod')) throw new Error('ride-tools.js still directly references InfoMod');
fs.writeFileSync(ridePath, ride);

for (const token of ["Bus.on('camera:open'", "Bus.emit('camera:closed')"]) {
  if (!main.includes(token)) throw new Error(`missing camera boundary token: ${token}`);
}
if (main.includes('window.InfoMod = InfoMod')) throw new Error('InfoMod global export still present');
for (const source of [enhancements, ride]) {
  if (!source.includes("Bus.emit('camera:open'")) throw new Error('camera open consumer boundary missing');
}

console.log('info camera boundary applied');
