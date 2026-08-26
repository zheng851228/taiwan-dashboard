import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label} anchor count: ${count}`);
  return source.replace(oldText, newText);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const matches = source.match(new RegExp(pattern.source, flags)) || [];
  if (matches.length !== 1) throw new Error(`${label} match count: ${matches.length}`);
  return source.replace(pattern, replacement);
}

const indexPath = 'index.html';
let index = fs.readFileSync(indexPath, 'utf8');
const conditionModelScript = '<script src="js/route-condition-view-model.js?v=44"></script>';
const navigationScript = '<script src="js/route-navigation-model.js?v=44"></script>';
const routeConditionsScript = '<script src="js/route-conditions.js?v=44"></script>';
if (!index.includes(navigationScript)) {
  index = replaceOnce(
    index,
    `${conditionModelScript}\n${routeConditionsScript}`,
    `${conditionModelScript}\n${navigationScript}\n${routeConditionsScript}`,
    'index route navigation load order'
  );
  fs.writeFileSync(indexPath, index);
}

const routeConditionsPath = 'js/route-conditions.js';
let routeConditions = fs.readFileSync(routeConditionsPath, 'utf8');
if (!routeConditions.includes("var vehicleState = { mode: 'motorcycle', plate: 'white' };")) {
  routeConditions = replaceOnce(
    routeConditions,
    '  var userAdjustedCollapse = false;\n',
    "  var userAdjustedCollapse = false;\n  var vehicleState = { mode: 'motorcycle', plate: 'white' };\n",
    'vehicle state insertion'
  );
}

if (!routeConditions.includes('window.RouteNavigationModel.buildNavigation(')) {
  routeConditions = replaceRegexOnce(
    routeConditions,
    /  function routePoints\(\) \{[\s\S]*?\n  function appleUrl\(from, to\) \{[\s\S]*?\n  \}\n\n  function updateNavigationLink/,
    "  function navigationState() {\n    return window.RouteNavigationModel.buildNavigation(\n      currentRoute,\n      vehicleState.mode,\n      vehicleState.plate\n    );\n  }\n\n  function updateNavigationLink",
    'navigation state delegation'
  );

  routeConditions = replaceRegexOnce(
    routeConditions,
    /  function setNavigationLinks\(\) \{[\s\S]*?\n  \}\n\n  function renderAppleLegs/,
    "  function setNavigationLinks() {\n    var state = navigationState();\n    updateNavigationLink(Dom.byId('nav-google'), state.googleHref, state.enabled);\n    updateNavigationLink(Dom.byId('nav-apple'), state.appleHref, state.enabled);\n  }\n\n  function renderAppleLegs",
    'navigation link delegation'
  );

  routeConditions = replaceOnce(
    routeConditions,
    '    var points = routePoints();\n    wrap.innerHTML = \'\';\n    wrap.classList.toggle(\'hidden\', !reveal || points.length <= 2);\n    if (!reveal || points.length <= 2) return;\n',
    '    var state = navigationState();\n    wrap.innerHTML = \'\';\n    wrap.classList.toggle(\'hidden\', !reveal || !state.appleRequiresLegHandoff);\n    if (!reveal || !state.appleRequiresLegHandoff) return;\n',
    'apple leg state delegation'
  );

  routeConditions = replaceRegexOnce(
    routeConditions,
    /    for \(var index = 0; index < points\.length - 1; index \+= 1\) \{\n      var link = document\.createElement\('a'\);\n      link\.className = 'apple-leg-button';\n      link\.href = appleUrl\(points\[index\], points\[index \+ 1\]\);\n      link\.target = '_blank';\n      link\.rel = 'noopener noreferrer';\n      link\.textContent = '[^']+' \+ \(index \+ 1\) \+ '[^']+';\n      buttons\.appendChild\(link\);\n    \}/,
    "    state.appleLegs.forEach(function(leg) {\n      var link = document.createElement('a');\n      link.className = 'apple-leg-button';\n      link.href = leg.href;\n      link.target = '_blank';\n      link.rel = 'noopener noreferrer';\n      link.textContent = '\\u7b2c ' + leg.index + ' \\u6bb5';\n      buttons.appendChild(link);\n    });",
    'apple ordered legs delegation'
  );

  routeConditions = replaceRegexOnce(
    routeConditions,
    /  function openAppleMaps\(event\) \{[\s\S]*?\n  \}\n\n  function toggleCollapsed/,
    "  function openAppleMaps(event) {\n    var state = navigationState();\n    var intent = window.RouteNavigationModel.appleClickIntent(state.points);\n    if (intent.preventDefault) event.preventDefault();\n    if (intent.revealLegs) renderAppleLegs(true);\n    if (intent.message) Toast.show(intent.message, 4000);\n  }\n\n  function toggleCollapsed",
    'apple click intent delegation'
  );
}

if (!routeConditions.includes("Bus.on('vehicle:changed', function(event)")) {
  routeConditions = replaceOnce(
    routeConditions,
    "    Bus.on('condition:select', focusSection);\n",
    "    Bus.on('condition:select', focusSection);\n    Bus.on('vehicle:changed', function(event) {\n      vehicleState = {\n        mode: event && event.mode === 'car' ? 'car' : 'motorcycle',\n        plate: event && event.plate ? event.plate : 'white'\n      };\n      setNavigationLinks();\n      renderAppleLegs(false);\n    });\n",
    'vehicle bus listener'
  );
}
fs.writeFileSync(routeConditionsPath, routeConditions);

const swPath = 'sw.js';
let sw = fs.readFileSync(swPath, 'utf8');
const conditionModelShell = '  "./js/route-condition-view-model.js?v=44",';
const navigationShell = '  "./js/route-navigation-model.js?v=44",';
if (!sw.includes(navigationShell)) {
  sw = replaceOnce(
    sw,
    conditionModelShell,
    `${conditionModelShell}\n${navigationShell}`,
    'service worker route navigation entry'
  );
  fs.writeFileSync(swPath, sw);
}

const checkPath = 'scripts/check.sh';
let check = fs.readFileSync(checkPath, 'utf8');
if (!check.includes('route navigation model must load before route-conditions.js')) {
  const conditionModelGuard = "grep -q 'js/route-condition-view-model.js' index.html\n";
  const navigationGuards = "grep -q 'js/route-navigation-model.js' index.html\n"
    + "node -e \"const s=require('fs').readFileSync('index.html','utf8'); const model=s.indexOf('js/route-navigation-model.js'); const runtime=s.indexOf('js/route-conditions.js'); if(model<0 || runtime<0 || model>runtime) throw new Error('route navigation model must load before route-conditions.js')\"\n";
  check = replaceOnce(check, conditionModelGuard, conditionModelGuard + navigationGuards, 'check navigation load order');
}
if (!check.includes("grep -q 'js/route-navigation-model.js?v=44' sw.js")) {
  const conditionShellGuard = "grep -q 'js/route-condition-view-model.js?v=44' sw.js\n";
  check = replaceOnce(check, conditionShellGuard, "grep -q 'js/route-navigation-model.js?v=44' sw.js\n" + conditionShellGuard, 'check navigation shell entry');
}
if (!check.includes("grep -q 'RouteNavigationModel.buildNavigation' js/route-conditions.js")) {
  const servicesGuard = "grep -q '/v2/routes' js/services.js\n";
  const delegationGuards = "grep -q 'RouteNavigationModel.buildNavigation' js/route-conditions.js\n"
    + "grep -q 'RouteNavigationModel.appleClickIntent' js/route-conditions.js\n"
    + "grep -q \"Bus.on('vehicle:changed'\" js/route-conditions.js\n";
  check = replaceOnce(check, servicesGuard, delegationGuards + servicesGuard, 'check navigation delegation');
}
fs.writeFileSync(checkPath, check);

for (const token of [
  'RouteNavigationModel.buildNavigation',
  'RouteNavigationModel.appleClickIntent',
  "Bus.on('vehicle:changed'"
]) {
  if (!routeConditions.includes(token)) throw new Error(`missing runtime delegation: ${token}`);
}

for (const legacy of ['function routePoints()', 'function googleUrl(points)', 'function appleUrl(from, to)']) {
  if (routeConditions.includes(legacy)) throw new Error(`legacy navigation owner remains: ${legacy}`);
}

console.log('route-navigation runtime wiring applied');
