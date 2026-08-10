import fs from 'node:fs';

function replaceExactCount(source, before, after, expected, label) {
  const parts = source.split(before);
  const count = parts.length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return parts.join(after);
}

const file = 'js/desktop-dashboard.js';
let source = fs.readFileSync(file, 'utf8');

source = replaceExactCount(
  source,
  `    cctvIndex: 0,\n    layout: null`,
  `    cctvIndex: 0,\n    routeCameras: [],\n    layout: null`,
  1,
  'desktop route camera state'
);

source = replaceExactCount(
  source,
  `    var allCameras = (window.RouteMod && RouteMod.filteredCams || []).slice();`,
  `    var allCameras = state.routeCameras.slice();`,
  1,
  'renderCctv route camera source'
);

source = replaceExactCount(
  source,
  `        state.renderer.drawCameras(RouteMod.filteredCams || []);`,
  `        state.renderer.drawCameras(state.routeCameras);`,
  2,
  'renderer route camera source'
);

source = replaceExactCount(
  source,
  `      var count = (RouteMod && RouteMod.filteredCams || []).length;`,
  `      var count = state.routeCameras.length;`,
  2,
  'desktop cctv control count'
);

source = replaceExactCount(
  source,
  `    Bus.on('route:updated', function() {\n      syncHeader();`,
  `    Bus.on('route:updated', function(event) {\n      state.routeCameras = event && Array.isArray(event.cams) ? event.cams.slice() : [];\n      syncHeader();`,
  1,
  'route updated camera payload'
);

source = replaceExactCount(
  source,
  `      state.cctvIndex = 0;\n      if (state.renderer) state.renderer.clear();`,
  `      state.cctvIndex = 0;\n      state.routeCameras = [];\n      if (state.renderer) state.renderer.clear();`,
  1,
  'route cleared camera reset'
);

source = replaceExactCount(
  source,
  `    Bus.on('filter:changed', function() { if (state.renderer) state.renderer.drawCameras(RouteMod.filteredCams || []); renderCctv(); });`,
  `    Bus.on('filter:changed', function() { if (state.renderer) state.renderer.drawCameras(state.routeCameras); renderCctv(); });`,
  1,
  'filter changed camera redraw'
);

if (source.includes('RouteMod.filteredCams')) {
  throw new Error('desktop-dashboard.js still directly reads RouteMod.filteredCams');
}

fs.writeFileSync(file, source);
console.log('desktop route camera event-state migration applied');
