import fs from 'node:fs';
import path from 'node:path';

const roots = ['js'];
const names = [
  'RouteUiMod', 'UiPrefsMod', 'ThemeMod', 'NavMod', 'MapMod', 'InfoMod', 'RouteMod', 'ListMod', 'ModalMod',
  'DesktopElevationMod', 'DesktopDashboardMod', 'DesktopLayoutMod', 'RouteConditionsMod',
  'RouteSearchModel', 'RouteSummaryModel', 'RouteNavigationModel', 'RouteConditionViewModel', 'MapRenderer'
];

const files = [];
for (const root of roots) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(path.join(root, entry.name));
  }
}

for (const name of names) {
  const hits = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (new RegExp(`\\b${name}\\b`).test(line)) {
        hits.push(`${file}:${index + 1}:${line.trim()}`);
      }
    });
  }
  console.log(`\n=== ${name} (${hits.length}) ===`);
  hits.forEach((hit) => console.log(hit));
}
