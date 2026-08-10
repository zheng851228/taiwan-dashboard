import fs from 'node:fs';
import path from 'node:path';

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(before, after);
}

const mainPath = 'js/main-ui.js';
let main = fs.readFileSync(mainPath, 'utf8');
main = replaceExact(
  main,
  `        if (action === 'set-view') {\n          var center = request && request.center;`,
  `        if (action === 'draw-route') {\n          var routeCoords = request && request.coords;\n          if (!Array.isArray(routeCoords) || routeCoords.length < 2) return;\n          MapMod.drawRoute(routeCoords, request && request.mode);\n          return;\n        }\n        if (action === 'draw-start-end') {\n          MapMod.drawStartEnd(request && request.points);\n          return;\n        }\n        if (action === 'focus-camera') {\n          var camera = request && request.camera;\n          if (!camera) return;\n          MapMod.focusCam(camera);\n          return;\n        }\n        if (action === 'draw-condition-sections') {\n          var conditionSections = request && request.sections;\n          if (!Array.isArray(conditionSections)) return;\n          MapMod.drawConditionSections(conditionSections);\n          return;\n        }\n        if (action === 'focus-section') {\n          var sectionOrder = Number(request && request.order);\n          if (!Number.isFinite(sectionOrder)) return;\n          MapMod.focusSection(sectionOrder);\n          return;\n        }\n        if (action === 'set-view') {\n          var center = request && request.center;`,
  'map request rendering/focus actions'
);
fs.writeFileSync(mainPath, main);

const pwaPath = 'js/pwa.js';
let pwa = fs.readFileSync(pwaPath, 'utf8');
pwa = replaceExact(
  pwa,
  `    MapMod.drawRoute(mapCoordinates, restoredMode);\n    MapMod.drawStartEnd(AppState.routeAllPoints);`,
  `    Bus.emit('map:request', { action: 'draw-route', coords: mapCoordinates, mode: restoredMode });\n    Bus.emit('map:request', { action: 'draw-start-end', points: AppState.routeAllPoints });`,
  'PWA offline map restore requests'
);
fs.writeFileSync(pwaPath, pwa);

const conditionsPath = 'js/route-conditions.js';
let conditions = fs.readFileSync(conditionsPath, 'utf8');
conditions = replaceExact(
  conditions,
  `    MapMod.focusCam(normalized);`,
  `    Bus.emit('map:request', { action: 'focus-camera', camera: normalized });`,
  'route condition camera focus request'
);
conditions = replaceExact(
  conditions,
  `    MapMod.drawConditionSections(sections);\n    MapMod.drawStartEnd(AppState.routeAllPoints);`,
  `    Bus.emit('map:request', { action: 'draw-condition-sections', sections: sections });\n    Bus.emit('map:request', { action: 'draw-start-end', points: AppState.routeAllPoints });`,
  'route condition render requests'
);
conditions = replaceExact(
  conditions,
  `    MapMod.focusSection(order);`,
  `    Bus.emit('map:request', { action: 'focus-section', order: order });`,
  'route condition section focus request'
);
fs.writeFileSync(conditionsPath, conditions);

const offenders = [];
for (const name of fs.readdirSync('js')) {
  if (!name.endsWith('.js') || name === 'main-ui.js') continue;
  const file = path.join('js', name);
  const text = fs.readFileSync(file, 'utf8');
  text.split('\n').forEach((line, index) => {
    if (line.includes('MapMod')) offenders.push(`${file}:${index + 1}:${line.trim()}`);
  });
}
if (offenders.length) throw new Error(`production MapMod consumers remain outside main-ui.js:\n${offenders.join('\n')}`);

console.log('MapMod production consumers migrated behind map:request');
