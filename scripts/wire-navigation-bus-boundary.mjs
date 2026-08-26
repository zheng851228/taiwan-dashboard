import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label} anchor count: ${count}`);
  return source.replace(oldText, newText);
}

const mainPath = 'js/main-ui.js';
let main = fs.readFileSync(mainPath, 'utf8');
if (!main.includes("Bus.on('navigation:request'")) {
  main = replaceOnce(
    main,
    "  var NavMod = {\n    init: function() {\n      ['map','list','tools'].forEach(function(k) {",
    "  var NavMod = {\n    init: function() {\n      Bus.on('navigation:request', function(request) {\n        var page = request && request.page;\n        if (['map','list','tools'].indexOf(page) !== -1) NavMod.go(page);\n      });\n      ['map','list','tools'].forEach(function(k) {",
    'navigation bus handler'
  );
}
if (main.includes('  window.NavMod = NavMod;\n')) {
  main = main.replace('  window.NavMod = NavMod;\n', '');
}
if (main.includes('window.NavMod = NavMod')) throw new Error('NavMod global export remains');
fs.writeFileSync(mainPath, main);

const desktopPath = 'js/desktop-dashboard.js';
let desktop = fs.readFileSync(desktopPath, 'utf8');
const desktopReplacements = [
  ["Dom.onId('desktop-open-list', 'click', function() { toggleSettings(); NavMod.go('list'); });", "Dom.onId('desktop-open-list', 'click', function() { toggleSettings(); Bus.emit('navigation:request', { page: 'list' }); });"],
  ["Dom.onId('desktop-open-tools', 'click', function() { toggleSettings(); NavMod.go('tools'); });", "Dom.onId('desktop-open-tools', 'click', function() { toggleSettings(); Bus.emit('navigation:request', { page: 'tools' }); });"],
  ["      NavMod.go('list');", "      Bus.emit('navigation:request', { page: 'list' });"],
  ["    if (window.NavMod) NavMod.go('map');", "    Bus.emit('navigation:request', { page: 'map' });"]
];
for (const [oldText, newText] of desktopReplacements) {
  if (oldText === "      NavMod.go('list');") {
    const count = desktop.split(oldText).length - 1;
    if (count !== 2) throw new Error(`desktop list navigation count: ${count}`);
    desktop = desktop.replaceAll(oldText, newText);
  } else {
    desktop = replaceOnce(desktop, oldText, newText, `desktop navigation ${oldText}`);
  }
}
if (desktop.includes('NavMod')) throw new Error('desktop NavMod consumer remains');
fs.writeFileSync(desktopPath, desktop);

const enhancementsPath = 'js/enhancements.js';
let enhancements = fs.readFileSync(enhancementsPath, 'utf8');
enhancements = replaceOnce(
  enhancements,
  "          NavMod.go('map');",
  "          Bus.emit('navigation:request', { page: 'map' });",
  'enhancements navigation request'
);
if (enhancements.includes('NavMod')) throw new Error('enhancements NavMod consumer remains');
fs.writeFileSync(enhancementsPath, enhancements);

const ridePath = 'js/ride-tools.js';
let ride = fs.readFileSync(ridePath, 'utf8');
ride = replaceOnce(ride, "          NavMod.go('map');", "          Bus.emit('navigation:request', { page: 'map' });", 'favorite navigation request');
ride = replaceOnce(ride, "          NavMod.go('list');", "          Bus.emit('navigation:request', { page: 'list' });", 'camera navigation request');
ride = replaceOnce(ride, "        NavMod.go('map');", "        Bus.emit('navigation:request', { page: 'map' });", 'route action navigation request');
if (ride.includes('NavMod')) throw new Error('ride-tools NavMod consumer remains');
fs.writeFileSync(ridePath, ride);

console.log('navigation bus boundary applied');
