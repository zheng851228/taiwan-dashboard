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
  "        if (action === 'clear-waypoint-overlays') {\n          if (MapMod.map && Array.isArray(AppState.waypointMapMarkers)) {\n            AppState.waypointMapMarkers.forEach(function(marker) { MapMod.map.removeLayer(marker); });\n          }\n          AppState.waypointMapMarkers = [];\n          return;\n        }\n        if (action === 'set-view') {",
  `        if (action === 'clear-waypoint-overlays') {
          if (MapMod.map && Array.isArray(AppState.waypointMapMarkers)) {
            AppState.waypointMapMarkers.forEach(function(marker) { MapMod.map.removeLayer(marker); });
          }
          AppState.waypointMapMarkers = [];
          return;
        }
        if (action === 'draw-start-end') {
          MapMod.drawStartEnd(request && request.points);
          return;
        }
        if (action === 'focus-camera') {
          var camera = request && request.camera;
          if (!camera) return;
          MapMod.focusCam(camera);
          return;
        }
        if (action === 'draw-condition-sections') {
          var conditionSections = request && request.sections;
          if (!Array.isArray(conditionSections)) return;
          MapMod.drawConditionSections(conditionSections);
          return;
        }
        if (action === 'focus-section') {
          var sectionOrder = Number(request && request.order);
          if (!Number.isFinite(sectionOrder)) return;
          MapMod.focusSection(sectionOrder);
          return;
        }
        if (action === 'set-view') {`,
  'route-condition map request actions'
);
fs.writeFileSync(mainPath, main);

const conditionsPath = 'js/route-conditions.js';
let conditions = fs.readFileSync(conditionsPath, 'utf8');
conditions = replaceExact(
  conditions,
  '    MapMod.focusCam(normalized);',
  "    Bus.emit('map:request', { action: 'focus-camera', camera: normalized });",
  'condition camera focus'
);
conditions = replaceExact(
  conditions,
  '    MapMod.drawConditionSections(sections);\n    MapMod.drawStartEnd(AppState.routeAllPoints);',
  "    Bus.emit('map:request', { action: 'draw-condition-sections', sections: sections });\n    Bus.emit('map:request', { action: 'draw-start-end', points: AppState.routeAllPoints });",
  'condition render map commands'
);
conditions = replaceExact(
  conditions,
  '    MapMod.focusSection(order);',
  "    Bus.emit('map:request', { action: 'focus-section', order: order });",
  'condition section focus'
);
if (conditions.includes('MapMod')) throw new Error('route-conditions.js still directly references MapMod');
fs.writeFileSync(conditionsPath, conditions);

for (const token of [
  "action === 'draw-start-end'",
  "action === 'focus-camera'",
  "action === 'draw-condition-sections'",
  "action === 'focus-section'"
]) {
  if (!main.includes(token)) throw new Error(`missing map request owner token: ${token}`);
}
for (const token of [
  "action: 'draw-start-end'",
  "action: 'focus-camera'",
  "action: 'draw-condition-sections'",
  "action: 'focus-section'"
]) {
  if (!conditions.includes(token)) throw new Error(`missing route-condition map request consumer token: ${token}`);
}

console.log('route-condition map command boundary applied');
