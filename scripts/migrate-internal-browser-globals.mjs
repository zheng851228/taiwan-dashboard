import fs from 'node:fs';

function replaceExactCount(source, before, after, expected, label) {
  const parts = source.split(before);
  const count = parts.length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return parts.join(after);
}

const mainUiFile = 'js/main-ui.js';
let mainUi = fs.readFileSync(mainUiFile, 'utf8');
mainUi = replaceExactCount(
  mainUi,
  `      if (window.ListMod) ListMod.visibleLimit = ListMod.PAGE_SIZE;`,
  `      ListMod.visibleLimit = ListMod.PAGE_SIZE;`,
  2,
  'internal ListMod guards'
);
mainUi = replaceExactCount(mainUi, `  window.ThemeMod = ThemeMod;\n`, '', 1, 'ThemeMod global export');
mainUi = replaceExactCount(mainUi, `  window.ListMod = ListMod;\n`, '', 1, 'ListMod global export');
mainUi = replaceExactCount(mainUi, `  window.ModalMod = ModalMod;\n`, '', 1, 'ModalMod global export');
fs.writeFileSync(mainUiFile, mainUi);

const desktopFile = 'js/desktop-dashboard.js';
let desktop = fs.readFileSync(desktopFile, 'utf8');
desktop = replaceExactCount(
  desktop,
  `if (window.DesktopElevationMod) DesktopElevationMod.refresh();`,
  `DesktopElevationMod.refresh();`,
  4,
  'DesktopElevationMod refresh guards'
);
desktop = replaceExactCount(
  desktop,
  `if (window.DesktopElevationMod) DesktopElevationMod.clear();`,
  `DesktopElevationMod.clear();`,
  1,
  'DesktopElevationMod clear guard'
);
desktop = replaceExactCount(desktop, `  window.DesktopElevationMod = DesktopElevationMod;\n`, '', 1, 'DesktopElevationMod global export');
fs.writeFileSync(desktopFile, desktop);

console.log('internal browser global cleanup applied');
