import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label} anchor count: ${count}`);
  return source.replace(oldText, newText);
}

const indexPath = 'index.html';
let index = fs.readFileSync(indexPath, 'utf8');
const mainScript = '<script src="js/main-ui.js?v=44"></script>';
const modelScript = '<script src="js/route-search-model.js?v=44"></script>';
if (!index.includes(modelScript)) {
  index = replaceOnce(index, mainScript, `${modelScript}\n${mainScript}`, 'index main-ui');
  fs.writeFileSync(indexPath, index);
}

const swPath = 'sw.js';
let sw = fs.readFileSync(swPath, 'utf8');
const mainShell = '  "./js/main-ui.js?v=44",';
const modelShell = '  "./js/route-search-model.js?v=44",';
if (!sw.includes(modelShell)) {
  sw = replaceOnce(sw, mainShell, `${modelShell}\n${mainShell}`, 'service worker main-ui');
  fs.writeFileSync(swPath, sw);
}

const checkPath = 'scripts/check.sh';
let check = fs.readFileSync(checkPath, 'utf8');
if (!check.includes('route search model must load before main-ui.js')) {
  const mainGuard = "grep -q 'js/main-ui.js' index.html\n";
  const searchGuards = "grep -q 'js/route-search-model.js' index.html\n"
    + "node -e \"const s=require('fs').readFileSync('index.html','utf8'); const model=s.indexOf('js/route-search-model.js'); const runtime=s.indexOf('js/main-ui.js'); if(model<0 || runtime<0 || model>runtime) throw new Error('route search model must load before main-ui.js')\"\n";
  check = replaceOnce(check, mainGuard, searchGuards + mainGuard, 'check main-ui');
}
if (!check.includes("grep -q 'js/route-search-model.js?v=44' sw.js")) {
  const conditionShell = "grep -q 'js/route-condition-view-model.js?v=44' sw.js\n";
  check = replaceOnce(check, conditionShell, "grep -q 'js/route-search-model.js?v=44' sw.js\n" + conditionShell, 'check service worker');
}
if (!check.includes("grep -q 'RouteSearchModel.prepareEndpoints' js/main-ui.js")) {
  const servicesGuard = "grep -q '/v2/routes' js/services.js\n";
  const delegationGuards = "grep -q 'RouteSearchModel.prepareEndpoints' js/main-ui.js\n"
    + "grep -q 'RouteSearchModel.buildAddressPlan' js/main-ui.js\n"
    + "grep -q 'RouteSearchModel.unresolvedPointMessage' js/main-ui.js\n"
    + "grep -q 'RouteSearchModel.buildVehicle' js/main-ui.js\n";
  check = replaceOnce(check, servicesGuard, delegationGuards + servicesGuard, 'check delegation');
}
fs.writeFileSync(checkPath, check);

console.log('route-search remaining runtime wiring applied');
