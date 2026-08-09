// Shadow-compare the extracted route-condition view model against the legacy
// presentation helpers before route-conditions.js delegates to the new module.
(function() {
  'use strict';

  function normalize(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function comparePresentation(incident) {
    if (!window.RouteConditionViewModel || typeof window.getRoadEventPresentation !== 'function') return null;
    var legacy = normalize(window.getRoadEventPresentation(incident));
    var extracted = normalize(window.RouteConditionViewModel.roadEventPresentation(incident));
    return {
      equal: JSON.stringify(legacy) === JSON.stringify(extracted),
      legacy: legacy,
      extracted: extracted,
      incident: incident
    };
  }

  function comparePrimary(incidents) {
    if (!window.RouteConditionViewModel || typeof window.getPrimaryRoadEvent !== 'function') return null;
    var legacy = normalize(window.getPrimaryRoadEvent(incidents));
    var extracted = normalize(window.RouteConditionViewModel.primaryRoadEvent(incidents));
    return {
      equal: JSON.stringify(legacy) === JSON.stringify(extracted),
      legacy: legacy,
      extracted: extracted
    };
  }

  function auditSections(sections) {
    var mismatches = [];
    var checked = 0;
    (sections || []).forEach(function(section) {
      var incidents = section.incidents || [];
      incidents.forEach(function(incident) {
        var result = comparePresentation(incident);
        if (!result) return;
        checked += 1;
        if (!result.equal) mismatches.push({ type: 'presentation', sectionOrder: section.order, detail: result });
      });
      var located = incidents.filter(function(incident) {
        return !window.RouteConditionViewModel.roadEventLocationIsApproximate(incident);
      });
      var primary = comparePrimary(located);
      if (primary) {
        checked += 1;
        if (!primary.equal) mismatches.push({ type: 'primary', sectionOrder: section.order, detail: primary });
      }
    });
    var result = { checked: checked, mismatches: mismatches, ok: mismatches.length === 0 };
    window.__routeConditionViewModelParity = result;
    if (mismatches.length && window.console && console.warn) {
      console.warn('[route-condition-view-model] parity mismatch', mismatches);
    }
    return result;
  }

  if (window.Bus && typeof window.Bus.on === 'function') {
    window.Bus.on('conditions:updated', function(data) {
      auditSections(data && data.sections || []);
    });
  }

  window.RouteConditionParity = {
    comparePresentation: comparePresentation,
    comparePrimary: comparePrimary,
    auditSections: auditSections
  };
})();
