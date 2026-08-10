import fs from 'node:fs';
import path from 'node:path';

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
  `  var NavMod = {\n    init: function() {\n      ['map','list','tools'].forEach(function(k) {`,
  `  var NavMod = {\n    init: function() {\n      Bus.on('navigation:request', function(request) {\n        var page = request && request.page;\n        if (['map','list','tools'].indexOf(page) !== -1) NavMod.go(page);\n      });\n      ['map','list','tools'].forEach(function(k) {`,
  1,
  'navigation request listener'
);

const desktopFile = 'js/desktop-dashboard.js';
let desktop = fs.readFileSync(desktopFile, 'utf8');
desktop = replaceExactCount(desktop, `NavMod.go('list');`, `Bus.emit('navigation:request', { page: 'list' });`, 3, 'desktop list navigation');
desktop = replaceExactCount(desktop, `NavMod.go('tools');`, `Bus.emit('navigation:request', { page: 'tools' });`, 1, 'desktop tools navigation');
desktop = replaceExactCount(desktop, `if (window.NavMod) NavMod.go('map');`, `Bus.emit('navigation:request', { page: 'map' });`, 1, 'desktop home navigation');
fs.writeFileSync(desktopFile, desktop);

const enhancementsFile = 'js/enhancements.js';
let enhancements = fs.readFileSync(enhancementsFile, 'utf8');
enhancements = replaceExactCount(enhancements, `NavMod.go('map');`, `Bus.emit('navigation:request', { page: 'map' });`, 1, 'weather-card navigation');
fs.writeFileSync(enhancementsFile, enhancements);

const rideToolsFile = 'js/ride-tools.js';
let rideTools = fs.readFileSync(rideToolsFile, 'utf8');
rideTools = replaceExactCount(rideTools, `NavMod.go('list');`, `Bus.emit('navigation:request', { page: 'list' });`, 1, 'ride-tools list navigation');
rideTools = replaceExactCount(rideTools, `NavMod.go('map');`, `Bus.emit('navigation:request', { page: 'map' });`, 2, 'ride-tools map navigation');
fs.writeFileSync(rideToolsFile, rideTools);

function walkJs(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, output);
    else if (entry.isFile() && full.endsWith('.js')) output.push(full);
  }
  return output;
}

const unexpected = [];
for (const file of walkJs('js')) {
  if (file === mainFile) continue;
  if (fs.readFileSync(file, 'utf8').includes('NavMod')) unexpected.push(file);
}
if (fs.readFileSync('index.html', 'utf8').includes('NavMod')) unexpected.push('index.html');
if (unexpected.length) {
  throw new Error(`unexpected production NavMod consumers remain: ${unexpected.join(', ')}`);
}

main = replaceExactCount(main, `  window.NavMod = NavMod;\n`, ``, 1, 'NavMod global export');
if (main.includes('window.NavMod')) throw new Error('main-ui.js still exports NavMod');
fs.writeFileSync(mainFile, main);

console.log('navigation request bus migration applied; NavMod is now closure-local');
