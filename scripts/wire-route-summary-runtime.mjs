import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label} anchor count: ${count}`);
  return source.replace(oldText, newText);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')) || [];
  if (matches.length !== 1) throw new Error(`${label} match count: ${matches.length}`);
  return source.replace(pattern, replacement);
}

const indexPath = 'index.html';
let index = fs.readFileSync(indexPath, 'utf8');
const routeSearchScript = '<script src="js/route-search-model.js?v=44"></script>';
const summaryScript = '<script src="js/route-summary-model.js?v=44"></script>';
const mainScript = '<script src="js/main-ui.js?v=44"></script>';
if (!index.includes(summaryScript)) {
  index = replaceOnce(index, `${routeSearchScript}\n${mainScript}`, `${routeSearchScript}\n${summaryScript}\n${mainScript}`, 'index route summary load order');
  fs.writeFileSync(indexPath, index);
}

const mainUiPath = 'js/main-ui.js';
let mainUi = fs.readFileSync(mainUiPath, 'utf8');
if (!mainUi.includes('window.RouteSummaryModel.routeUiCopy(')) {
  mainUi = replaceOnce(
    mainUi,
    "    updateRouteUi: function(cameraCount) {\n      var count = cameraCount || 0;\n",
    "    updateRouteUi: function(cameraCount) {\n      var count = cameraCount || 0;\n      var copy = window.RouteSummaryModel.routeUiCopy(count, AppState.lastRouteInfo, RouteMod.mode);\n",
    'routeUiCopy insertion'
  );
  mainUi = replaceRegexOnce(
    mainUi,
    /      if \(st\) \{\n        st\.textContent = count > 0\n[\s\S]*?\n      \}\n      setFlexVisible\(banner,/,
    "      if (st) st.textContent = copy.statusText;\n      setFlexVisible(banner,",
    'route status copy'
  );
  mainUi = replaceRegexOnce(
    mainUi,
    /      if \(cnt\) \{\n[\s\S]*?\n      \}\n      if \(summary && AppState\.lastRouteInfo\) \{\n[\s\S]*?\n        summary\.classList\.remove\('hidden'\);\n      \}/,
    "      if (cnt) cnt.textContent = copy.listCountText;\n      if (summary && copy.summaryText) {\n        summary.textContent = copy.summaryText;\n        summary.classList.remove('hidden');\n      }",
    'route count and summary copy'
  );
}

if (!mainUi.includes('window.RouteSummaryModel.normalizeRouteInfo(route)')) {
  mainUi = replaceRegexOnce(
    mainUi,
    /          AppState\.lastRouteInfo = \{\n            distance: Number\(route\.distanceKm \|\| 0\)\.toFixed\(1\),\n            duration: Math\.round\(Number\(route\.durationMinutes \|\| 0\)\)\n          \};/,
    '          AppState.lastRouteInfo = window.RouteSummaryModel.normalizeRouteInfo(route);',
    'route info normalization'
  );
}

if (!mainUi.includes('window.RouteSummaryModel.completionMessage(')) {
  mainUi = replaceRegexOnce(
    mainUi,
    /          var plateLabels = \{ white: '[^']+', yellow: '[^']+', red: '[^']+' \};\n          var modeLabel = RouteMod\.mode === 'motorcycle'\n            \? \('[^']+' \+ plateLabels\[RouteMod\.plate\]\)\n            : '[^']+';\n          var msg = info \? \(modeLabel \+ ' ' \+ info\.distance \+ 'km \/ [^']+' \+ info\.duration \+ '[^']+'\) : '[^']+';\n          if \(route\.dataMode === 'fixture'\) msg = '[^']+';/,
    '          var msg = window.RouteSummaryModel.completionMessage(route, info, RouteMod.mode, RouteMod.plate);',
    'route completion message'
  );
}
fs.writeFileSync(mainUiPath, mainUi);

const swPath = 'sw.js';
let sw = fs.readFileSync(swPath, 'utf8');
const routeSearchShell = '  "./js/route-search-model.js?v=44",';
const summaryShell = '  "./js/route-summary-model.js?v=44",';
if (!sw.includes(summaryShell)) {
  sw = replaceOnce(sw, routeSearchShell, `${routeSearchShell}\n${summaryShell}`, 'service worker route summary entry');
  fs.writeFileSync(swPath, sw);
}

const checkPath = 'scripts/check.sh';
let check = fs.readFileSync(checkPath, 'utf8');
if (!check.includes('route summary model must load before main-ui.js')) {
  const mainGuard = "grep -q 'js/main-ui.js' index.html\n";
  const summaryGuards = "grep -q 'js/route-summary-model.js' index.html\n"
    + "node -e \"const s=require('fs').readFileSync('index.html','utf8'); const model=s.indexOf('js/route-summary-model.js'); const runtime=s.indexOf('js/main-ui.js'); if(model<0 || runtime<0 || model>runtime) throw new Error('route summary model must load before main-ui.js')\"\n";
  check = replaceOnce(check, mainGuard, summaryGuards + mainGuard, 'check main-ui load order');
}
if (!check.includes("grep -q 'js/route-summary-model.js?v=44' sw.js")) {
  const conditionShell = "grep -q 'js/route-condition-view-model.js?v=44' sw.js\n";
  check = replaceOnce(check, conditionShell, "grep -q 'js/route-summary-model.js?v=44' sw.js\n" + conditionShell, 'check service worker summary entry');
}
if (!check.includes("grep -q 'RouteSummaryModel.routeUiCopy' js/main-ui.js")) {
  const servicesGuard = "grep -q '/v2/routes' js/services.js\n";
  const delegationGuards = "grep -q 'RouteSummaryModel.routeUiCopy' js/main-ui.js\n"
    + "grep -q 'RouteSummaryModel.normalizeRouteInfo' js/main-ui.js\n"
    + "grep -q 'RouteSummaryModel.completionMessage' js/main-ui.js\n";
  check = replaceOnce(check, servicesGuard, delegationGuards + servicesGuard, 'check route summary delegation');
}
fs.writeFileSync(checkPath, check);

for (const token of [
  'RouteSummaryModel.routeUiCopy',
  'RouteSummaryModel.normalizeRouteInfo',
  'RouteSummaryModel.completionMessage'
]) {
  if (!mainUi.includes(token)) throw new Error(`missing runtime delegation: ${token}`);
}

console.log('route-summary runtime wiring applied');
