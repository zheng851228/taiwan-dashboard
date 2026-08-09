import fs from 'node:fs';

const file = 'js/route-conditions.js';
let source = fs.readFileSync(file, 'utf8');

function removeRange(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`Missing end marker: ${endMarker}`);
  source = source.slice(0, start) + source.slice(end);
}

function replaceFunction(name, nextName, body) {
  const startMarker = `  function ${name}(`;
  const nextMarker = `\n  function ${nextName}(`;
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing function: ${name}`);
  const next = source.indexOf(nextMarker, start);
  if (next === -1) throw new Error(`Missing next function after ${name}: ${nextName}`);
  const headerEnd = source.indexOf('{', start);
  if (headerEnd === -1 || headerEnd > next) throw new Error(`Malformed function: ${name}`);
  const header = source.slice(start, headerEnd + 1);
  source = source.slice(0, start) + header + '\n' + body + '\n  }' + source.slice(next);
}

// Presentation metadata now has a single owner in route-condition-view-model.js.
removeRange('  var ROAD_EVENT_KINDS = {', '  var currentRoute = null;');

// Classification and blocked-lane inference now live only in the view model.
removeRange('  function inferRoadEventKind(', '  function eventDateTime(');

replaceFunction(
  'roadEventPresentation',
  'primaryRoadEvent',
  '    return window.RouteConditionViewModel.roadEventPresentation(incident);'
);

replaceFunction(
  'primaryRoadEvent',
  'roadEventLocationIsApproximate',
  '    return window.RouteConditionViewModel.primaryRoadEvent(incidents);'
);

replaceFunction(
  'roadEventLocationIsApproximate',
  'summarizeRoadEvents',
  '    return window.RouteConditionViewModel.roadEventLocationIsApproximate(incident);'
);

replaceFunction(
  'summarizeRoadEvents',
  'roadEventCoverageText',
  '    return window.RouteConditionViewModel.summarizeRoadEvents(sections);'
);

// conditionAlert existed only to support the legacy buildAlerts fallback.
removeRange('  function conditionAlert(', '  function buildAlerts(');

replaceFunction(
  'buildAlerts',
  'renderAlerts',
  '    return window.RouteConditionViewModel.buildAlerts(sections);'
);

fs.writeFileSync(file, source);
console.log('route-condition fallback cleanup applied');
