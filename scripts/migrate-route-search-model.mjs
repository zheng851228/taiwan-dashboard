import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index === -1) throw new Error(`Missing migration target: ${label}`);
  if (source.indexOf(before, index + before.length) !== -1) {
    throw new Error(`Migration target is not unique: ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const mainUiFile = 'js/main-ui.js';
let mainUi = fs.readFileSync(mainUiFile, 'utf8');

mainUi = replaceOnce(
  mainUi,
  `      var startEl  = Dom.byId('js-route-start');\n      var endEl    = Dom.byId('js-route-end');\n      var startVal = startEl ? startEl.value.trim() : '';\n      var endVal   = endEl   ? endEl.value.trim()   : '';\n      if (!startVal || !endVal) { Toast.show('\\u8acb\\u5206\\u5225\\u586b\\u5165\\u8d77\\u9ede\\u548c\\u7d42\\u9ede'); return; }`,
  `      var startEl  = Dom.byId('js-route-start');\n      var endEl    = Dom.byId('js-route-end');\n      var endpointInput = window.RouteSearchModel.prepareEndpoints(\n        startEl ? startEl.value : '',\n        endEl ? endEl.value : ''\n      );\n      if (!endpointInput.ok) { Toast.show(endpointInput.message); return; }\n      var startVal = endpointInput.startValue;\n      var endVal = endpointInput.endValue;`,
  'route endpoint validation'
);

mainUi = replaceOnce(
  mainUi,
  `      var uiWaypoints = window.WaypointsMod ? WaypointsMod.getWaypoints() : (AppState.pendingWaypoints || []);\n      var displayAddrs = [startVal]\n        .concat(uiWaypoints.map(function(wp) { return String(wp || '').trim(); }))\n        .concat([endVal]);\n      var allAddrs = displayAddrs.slice();\n      if (startEl && startEl.dataset.routePoint && startEl.dataset.routePointLabel === startVal) {\n        allAddrs[0] = startEl.dataset.routePoint;\n      }\n      if (endEl && endEl.dataset.routePoint && endEl.dataset.routePointLabel === endVal) {\n        allAddrs[allAddrs.length - 1] = endEl.dataset.routePoint;\n      }\n      AppState.pendingWaypoints = [];`,
  `      var uiWaypoints = window.WaypointsMod ? WaypointsMod.getWaypoints() : (AppState.pendingWaypoints || []);\n      var addressPlan = window.RouteSearchModel.buildAddressPlan({\n        startValue: startVal,\n        endValue: endVal,\n        waypoints: uiWaypoints,\n        startRoutePoint: startEl && startEl.dataset.routePoint,\n        startRoutePointLabel: startEl && startEl.dataset.routePointLabel,\n        endRoutePoint: endEl && endEl.dataset.routePoint,\n        endRoutePointLabel: endEl && endEl.dataset.routePointLabel\n      });\n      var displayAddrs = addressPlan.displayAddrs;\n      var allAddrs = addressPlan.resolutionAddrs;\n      AppState.pendingWaypoints = [];`,
  'route address plan'
);

mainUi = replaceOnce(
  mainUi,
  `          if (failedIndex !== -1) {\n            var label = failedIndex === 0\n              ? '\\u8d77\\u9ede'\n              : (failedIndex === results.length - 1 ? '\\u7d42\\u9ede' : ('\\u7b2c ' + failedIndex + ' \\u500b\\u505c\\u9760\\u9ede'));\n            throw new Error(label + '\\u7121\\u6cd5\\u89e3\\u6790\\uff0c\\u8acb\\u6539\\u7528\\u66f4\\u5b8c\\u6574\\u5730\\u540d\\u6216\\u5ea7\\u6a19');\n          }`,
  `          if (failedIndex !== -1) {\n            throw new Error(window.RouteSearchModel.unresolvedPointMessage(failedIndex, results.length));\n          }`,
  'unresolved route point message'
);

mainUi = replaceOnce(
  mainUi,
  `          var vehicle = RouteMod.mode === 'car'\n            ? { type: 'car' }\n            : { type: 'motorcycle', plate: RouteMod.plate };`,
  `          var vehicle = window.RouteSearchModel.buildVehicle(RouteMod.mode, RouteMod.plate);`,
  'route vehicle request'
);

fs.writeFileSync(mainUiFile, mainUi);

const indexFile = 'index.html';
let indexHtml = fs.readFileSync(indexFile, 'utf8');
indexHtml = replaceOnce(
  indexHtml,
  `<script src="js/data.js?v=42"></script>\n<script src="js/main-ui.js?v=42"></script>`,
  `<script src="js/data.js?v=42"></script>\n<script src="js/route-search-model.js?v=43"></script>\n<script src="js/main-ui.js?v=42"></script>`,
  'route search model load order'
);
fs.writeFileSync(indexFile, indexHtml);

console.log('route-search model migration applied');
