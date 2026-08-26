import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label} anchor count: ${count}`);
  return source.replace(oldText, newText);
}

const mainPath = 'js/main-ui.js';
let main = fs.readFileSync(mainPath, 'utf8');
main = main.replaceAll('if (window.ListMod) ListMod.visibleLimit = ListMod.PAGE_SIZE;', 'ListMod.visibleLimit = ListMod.PAGE_SIZE;');
for (const assignment of [
  '  window.ThemeMod = ThemeMod;\n',
  '  window.ListMod = ListMod;\n',
  '  window.ModalMod = ModalMod;\n'
]) {
  if (main.includes(assignment)) main = main.replace(assignment, '');
}
for (const required of [
  '  window.NavMod = NavMod;',
  '  window.MapMod = MapMod;',
  '  window.InfoMod = InfoMod;',
  '  window.RouteMod = RouteMod;'
]) {
  if (!main.includes(required)) throw new Error(`supported global missing: ${required}`);
}
for (const removed of ['window.ThemeMod =', 'window.ListMod =', 'window.ModalMod =', 'if (window.ListMod)']) {
  if (main.includes(removed)) throw new Error(`internal global remains in main-ui: ${removed}`);
}
fs.writeFileSync(mainPath, main);

const desktopPath = 'js/desktop-dashboard.js';
let desktop = fs.readFileSync(desktopPath, 'utf8');
desktop = desktop.replaceAll('if (window.DesktopElevationMod) DesktopElevationMod.refresh();', 'DesktopElevationMod.refresh();');
desktop = desktop.replaceAll('if (window.DesktopElevationMod) DesktopElevationMod.clear();', 'DesktopElevationMod.clear();');
if (desktop.includes('  window.DesktopElevationMod = DesktopElevationMod;\n')) {
  desktop = desktop.replace('  window.DesktopElevationMod = DesktopElevationMod;\n', '');
}
for (const removed of ['window.DesktopElevationMod', 'if (window.DesktopElevationMod)']) {
  if (desktop.includes(removed)) throw new Error(`desktop internal global remains: ${removed}`);
}
fs.writeFileSync(desktopPath, desktop);

console.log('internal browser globals removed');
