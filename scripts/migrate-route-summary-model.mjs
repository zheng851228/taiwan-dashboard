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
  `      var count = cameraCount || 0;\n      var st = Dom.byId('js-route-status');\n      var banner = Dom.byId('js-route-banner');\n      var info = Dom.byId('js-list-route-info');\n      var cnt = Dom.byId('js-list-route-count');\n      var summary = Dom.byId('route-summary');\n      if (st) {\n        st.textContent = count > 0\n          ? '\\u5b89\\u5168\\u9a57\\u8b49\\u5b8c\\u6210 \\u00b7 ' + count + ' \\u652f\\u6cbf\\u9014\\u73fe\\u5834\\u756b\\u9762'\n          : '\\u5b89\\u5168\\u9a57\\u8b49\\u5b8c\\u6210 \\u00b7 \\u6cbf\\u9014\\u66ab\\u7121\\u73fe\\u5834\\u756b\\u9762';\n      }\n      setFlexVisible(banner, !UiPrefsMod.isHidden('routeBannerHidden'));\n      setFlexVisible(info, true);\n      if (cnt) {\n        cnt.textContent = count > 0\n          ? '\\u8def\\u7dda\\u904e\\u6ffe\\uff1a\\u5171 ' + count + ' \\u652f'\n          : '\\u8def\\u7dda\\u904e\\u6ffe\\uff1a\\u672a\\u627e\\u5230\\u5408\\u9069\\u651d\\u5f71\\u6a5f';\n      }\n      if (summary && AppState.lastRouteInfo) {\n        summary.textContent = (RouteMod.mode === 'motorcycle' ? '\\ud83c\\udfcd' : '\\ud83d\\ude97') + ' '\n          + AppState.lastRouteInfo.distance + 'km/' + AppState.lastRouteInfo.duration + '\\u5206 \\u00b7 \\u5df2\\u9a57\\u8b49';\n        summary.classList.remove('hidden');\n      }`,
  `      var count = cameraCount || 0;\n      var copy = window.RouteSummaryModel.routeUiCopy(count, AppState.lastRouteInfo, RouteMod.mode);\n      var st = Dom.byId('js-route-status');\n      var banner = Dom.byId('js-route-banner');\n      var info = Dom.byId('js-list-route-info');\n      var cnt = Dom.byId('js-list-route-count');\n      var summary = Dom.byId('route-summary');\n      if (st) st.textContent = copy.statusText;\n      setFlexVisible(banner, !UiPrefsMod.isHidden('routeBannerHidden'));\n      setFlexVisible(info, true);\n      if (cnt) cnt.textContent = copy.listCountText;\n      if (summary && copy.summaryText) {\n        summary.textContent = copy.summaryText;\n        summary.classList.remove('hidden');\n      }`,
  'route summary UI copy'
);

mainUi = replaceOnce(
  mainUi,
  `          AppState.lastRouteInfo = {\n            distance: Number(route.distanceKm || 0).toFixed(1),\n            duration: Math.round(Number(route.durationMinutes || 0))\n          };`,
  `          AppState.lastRouteInfo = window.RouteSummaryModel.normalizeRouteInfo(route);`,
  'route info normalization'
);

mainUi = replaceOnce(
  mainUi,
  `          var info = AppState.lastRouteInfo;\n          var plateLabels = { white: '\\u767d\\u724c', yellow: '\\u9ec3\\u724c', red: '\\u7d05\\u724c' };\n          var modeLabel = RouteMod.mode === 'motorcycle'\n            ? ('\\ud83c\\udfcd\\ufe0f ' + plateLabels[RouteMod.plate])\n            : '\\ud83d\\ude97 \\u6c7d\\u8eca';\n          var msg = info ? (modeLabel + ' ' + info.distance + 'km / \\u7d04' + info.duration + '\\u5206\\u9418') : '\\u8def\\u7dda\\u89e3\\u6790\\u5b8c\\u6210';\n          if (route.dataMode === 'fixture') msg = '\\u793a\\u7bc4\\u8def\\u7dda\\u5df2\\u8f09\\u5165\\uff0c\\u4e0d\\u53ef\\u7528\\u65bc\\u5be6\\u969b\\u9a0e\\u4e58';`,
  `          var info = AppState.lastRouteInfo;\n          var msg = window.RouteSummaryModel.completionMessage(route, info, RouteMod.mode, RouteMod.plate);`,
  'route completion message'
);

fs.writeFileSync(mainUiFile, mainUi);

const indexFile = 'index.html';
let indexHtml = fs.readFileSync(indexFile, 'utf8');
indexHtml = replaceOnce(
  indexHtml,
  `<script src="js/route-search-model.js?v=43"></script>\n<script src="js/main-ui.js?v=42"></script>`,
  `<script src="js/route-search-model.js?v=43"></script>\n<script src="js/route-summary-model.js?v=43"></script>\n<script src="js/main-ui.js?v=42"></script>`,
  'route summary model load order'
);
fs.writeFileSync(indexFile, indexHtml);

console.log('route-summary model migration applied');
