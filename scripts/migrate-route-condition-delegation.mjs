import fs from 'node:fs';

const file = 'js/route-conditions.js';
let source = fs.readFileSync(file, 'utf8');

function replaceFunction(name, nextName, body) {
  const start = `  function ${name}(`;
  const next = `\n  function ${nextName}(`;
  const startIndex = source.indexOf(start);
  if (startIndex === -1) throw new Error(`Missing function: ${name}`);
  const nextIndex = source.indexOf(next, startIndex);
  if (nextIndex === -1) throw new Error(`Missing next function after ${name}: ${nextName}`);
  const headerEnd = source.indexOf('{', startIndex);
  if (headerEnd === -1 || headerEnd > nextIndex) throw new Error(`Malformed function: ${name}`);
  const header = source.slice(startIndex, headerEnd + 1);
  source = source.slice(0, startIndex) + header + '\n' + body + '\n  }' + source.slice(nextIndex);
}

replaceFunction(
  'roadEventPresentation',
  'primaryRoadEvent',
  `    if (window.RouteConditionViewModel && RouteConditionViewModel.roadEventPresentation) {\n      return RouteConditionViewModel.roadEventPresentation(incident);\n    }\n    incident = incident || {};\n    var kind = inferRoadEventKind(incident);\n    var impact = inferRoadEventImpact(incident);\n    var kindMeta = ROAD_EVENT_KINDS[kind] || ROAD_EVENT_KINDS.other;\n    var impactMeta = ROAD_EVENT_IMPACTS[impact] || ROAD_EVENT_IMPACTS.unknown;\n    var status = incident.lastKnown ? 'last_known' : (incident.status || 'unknown');\n    var prefix = status === 'scheduled' ? '\\u9810\\u544a' : '';\n    var label = (prefix ? prefix + '\\u00b7' : '') + kindMeta.label;\n    if (impact !== 'unknown') label += ' \\u00b7 ' + impactMeta.label;\n    return {\n      kind: kind,\n      impact: impact,\n      status: status,\n      label: label,\n      icon: impact === 'full_closure' ? 'fa-ban' : kindMeta.icon,\n      mapColor: ROAD_EVENT_IMPACT_MAP_COLORS[impact]\n        || ROAD_EVENT_MAP_COLORS[kind]\n        || ROAD_EVENT_MAP_COLORS.other,\n      priority: kindMeta.priority + impactMeta.priority - (status === 'scheduled' ? 5 : 0)\n    };`
);

replaceFunction(
  'primaryRoadEvent',
  'roadEventLocationIsApproximate',
  `    if (window.RouteConditionViewModel && RouteConditionViewModel.primaryRoadEvent) {\n      return RouteConditionViewModel.primaryRoadEvent(incidents);\n    }\n    return (incidents || []).map(function(incident) {\n      return { incident: incident, presentation: roadEventPresentation(incident) };\n    }).sort(function(a, b) {\n      return b.presentation.priority - a.presentation.priority;\n    })[0] || null;`
);

replaceFunction(
  'summarizeRoadEvents',
  'roadEventCoverageText',
  `    if (window.RouteConditionViewModel && RouteConditionViewModel.summarizeRoadEvents) {\n      return RouteConditionViewModel.summarizeRoadEvents(sections);\n    }\n    var unique = new Map();\n    var affectedSections = 0;\n    (sections || []).forEach(function(section) {\n      var events = section.incidents || [];\n      if (events.some(function(incident) { return !roadEventLocationIsApproximate(incident); })) {\n        affectedSections += 1;\n      }\n      events.forEach(function(incident) {\n        var identity = incident.canonicalId || incident.id\n          || [incident.title, incident.roadRef, incident.effectiveAt || incident.updatedAt || ''].join(':');\n        if (!unique.has(identity)) unique.set(identity, incident);\n      });\n    });\n    var summary = {\n      incidentCount: 0,\n      affectedSections: affectedSections,\n      roadLevelIncidentCount: 0,\n      activeFullClosureCount: 0,\n      scheduledFullClosureCount: 0,\n      unknownFullClosureCount: 0\n    };\n    unique.forEach(function(incident) {\n      var presentation = roadEventPresentation(incident);\n      summary.incidentCount += 1;\n      if (roadEventLocationIsApproximate(incident)) summary.roadLevelIncidentCount += 1;\n      if (presentation.impact !== 'full_closure') return;\n      if (presentation.status === 'active') summary.activeFullClosureCount += 1;\n      else if (presentation.status === 'scheduled') summary.scheduledFullClosureCount += 1;\n      else summary.unknownFullClosureCount += 1;\n    });\n    return summary;`
);

replaceFunction(
  'buildAlerts',
  'renderAlerts',
  `    if (window.RouteConditionViewModel && RouteConditionViewModel.buildAlerts) {\n      return RouteConditionViewModel.buildAlerts(sections);\n    }\n    var alerts = [];\n    sections.forEach(function(section) {\n      var traffic = section.traffic || {};\n      var weather = section.weather || {};\n      if (traffic.level === 'congested') {\n        alerts.push(conditionAlert(\n          section,\n          'danger',\n          section.roadRef + ' ' + section.fromKm + '-' + section.toKm + ' km \\u58c5\\u585e',\n          'fa-car-burst',\n          { priority: 55 }\n        ));\n      }\n      if ((weather.condition || '').indexOf('\\u96e8') !== -1 || Number(weather.rainChance) >= 60) {\n        alerts.push(conditionAlert(\n          section,\n          'weather',\n          section.roadRef + ' ' + section.fromKm + '-' + section.toKm + ' km ' + (weather.condition || '\\u964d\\u96e8'),\n          'fa-cloud-rain',\n          { priority: 35 }\n        ));\n      }\n      (section.incidents || []).forEach(function(incident) {\n        var presentation = roadEventPresentation(incident);\n        var approximate = roadEventLocationIsApproximate(incident);\n        alerts.push(conditionAlert(\n          section,\n          'road-event',\n          section.roadRef\n            + (approximate\n              ? ' \\u00b7 \\u4f4d\\u7f6e\\u672a\\u63d0\\u4f9b \\u00b7 '\n              : ' ' + section.fromKm + '-' + section.toKm + ' km \\u00b7 ')\n            + presentation.label,\n          presentation.icon,\n          { priority: presentation.priority, event: presentation, approximate: approximate }\n        ));\n      });\n    });\n    return alerts.sort(function(a, b) {\n      return b.priority - a.priority || Number(a.order) - Number(b.order);\n    }).slice(0, 6);`
);

fs.writeFileSync(file, source);
console.log('route-conditions delegation migration applied');
