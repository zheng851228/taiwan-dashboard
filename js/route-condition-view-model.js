// Pure presentation model for route-condition UI.
// This module intentionally contains no DOM access or map side effects.
(function() {
  'use strict';

  var ROAD_EVENT_KINDS = {
    accident: { label: '事故', icon: 'fa-car-burst', priority: 9 },
    construction: { label: '施工', icon: 'fa-person-digging', priority: 6 },
    congestion: { label: '壅塞通報', icon: 'fa-car-side', priority: 4 },
    control: { label: '特殊管制', icon: 'fa-road-barrier', priority: 7 },
    weather: { label: '天候警示', icon: 'fa-cloud-bolt', priority: 5 },
    disaster: { label: '道路災害', icon: 'fa-house-crack', priority: 8 },
    activity: { label: '沿線活動', icon: 'fa-calendar-days', priority: 3 },
    hazard: { label: '道路障礙', icon: 'fa-triangle-exclamation', priority: 7 },
    other: { label: '其他狀況', icon: 'fa-circle-exclamation', priority: 2 }
  };

  var ROAD_EVENT_IMPACTS = {
    full_closure: { label: '全線封閉', priority: 60 },
    lane_closure: { label: '車道封閉', priority: 50 },
    controlled: { label: '交通管制', priority: 40 },
    shoulder: { label: '路肩作業', priority: 30 },
    no_impact: { label: '不影響通行', priority: 10 },
    unknown: { label: '注意現場', priority: 20 }
  };

  var ROAD_EVENT_MAP_COLORS = {
    accident: '#f43f5e',
    construction: '#f59e0b',
    congestion: '#ef4444',
    control: '#8b5cf6',
    weather: '#0ea5e9',
    disaster: '#be123c',
    activity: '#06b6d4',
    hazard: '#f97316',
    other: '#64748b'
  };

  var ROAD_EVENT_IMPACT_MAP_COLORS = {
    full_closure: '#dc2626',
    lane_closure: '#e11d48',
    controlled: '#8b5cf6',
    shoulder: '#ca8a04',
    no_impact: '#16a34a'
  };

  function hasBlockedLaneImpact(value) {
    var text = String(value || '').trim().replace(/\s+/g, '');
    if (!text) return false;
    if (/^(?:-99|0|254|255|none|unknown|null|n\/a|未知|未提供|來源未提供|不適用)$/i.test(text)) return false;
    return !/^無(?:(?:占用|封閉|阻斷|影響)(?:任何)?(?:車道|道路))?$/.test(text);
  }

  function inferRoadEventKind(incident) {
    incident = incident || {};
    if (ROAD_EVENT_KINDS[incident.kind]) return incident.kind;
    var text = String((incident.title || '') + ' ' + (incident.description || ''));
    if (/事故|車禍|追撞|翻覆/.test(text)) return 'accident';
    if (/施工|工程|養護|修繕|開挖|割草|清掃/.test(text)) return 'construction';
    if (/壅塞|車多|回堵/.test(text)) return 'congestion';
    if (/管制|封閉|改道|疏運/.test(text)) return 'control';
    if (/濃霧|豪雨|強風|颱風|天氣/.test(text)) return 'weather';
    if (/落石|坍方|淹水|土石流|災害/.test(text)) return 'disaster';
    if (/活動|遊行|路跑|節慶|進香/.test(text)) return 'activity';
    if (/散落物|掉落物|異物|坑洞|故障車|逆行|誤闖|異常/.test(text)) return 'hazard';
    return 'other';
  }

  function inferRoadEventImpact(incident) {
    incident = incident || {};
    if (ROAD_EVENT_IMPACTS[incident.impact]) return incident.impact;
    var text = String((incident.title || '') + ' ' + (incident.description || ''));
    var severityCode = Number(
      incident.severityCode !== null && incident.severityCode !== undefined
        ? incident.severityCode
        : incident.severity
    );
    var regulationCodes = Array.isArray(incident.regulationCodes)
      ? incident.regulationCodes.map(Number)
      : [];
    if (severityCode === 2 || regulationCodes.indexOf(1) !== -1) return 'full_closure';
    if (severityCode === 1 || regulationCodes.indexOf(2) !== -1 || hasBlockedLaneImpact(incident.blockedLanes)) {
      return 'lane_closure';
    }
    if (/(?:全線|雙向|道路|路段).{0,8}(?:封閉|中斷|阻斷)|(?:禁止|無法|暫停)通行/.test(text)) return 'full_closure';
    if (!/(?:無|未)(?:占用|封閉|阻斷|影響).{0,8}(?:車道|道路)|不影響(?:道路)?通行|無影響/.test(text)
      && /(?:封閉|占用).{0,8}車道|車道.{0,4}(?:封閉|縮減)/.test(text)) {
      return 'lane_closure';
    }
    if (/單線雙向|機動管制|交通管制|交管|改道|管制通行/.test(text)) return 'controlled';
    if (/路肩/.test(text)) return 'shoulder';
    if (severityCode === 0 || /不影響(?:道路)?通行|無影響/.test(text)) return 'no_impact';
    return 'unknown';
  }

  function roadEventPresentation(incident) {
    incident = incident || {};
    var kind = inferRoadEventKind(incident);
    var impact = inferRoadEventImpact(incident);
    var kindMeta = ROAD_EVENT_KINDS[kind] || ROAD_EVENT_KINDS.other;
    var impactMeta = ROAD_EVENT_IMPACTS[impact] || ROAD_EVENT_IMPACTS.unknown;
    var status = incident.lastKnown ? 'last_known' : (incident.status || 'unknown');
    var prefix = status === 'scheduled' ? '預告' : '';
    var label = (prefix ? prefix + '·' : '') + kindMeta.label;
    if (impact !== 'unknown') label += ' · ' + impactMeta.label;
    return {
      kind: kind,
      impact: impact,
      status: status,
      label: label,
      icon: impact === 'full_closure' ? 'fa-ban' : kindMeta.icon,
      mapColor: ROAD_EVENT_IMPACT_MAP_COLORS[impact] || ROAD_EVENT_MAP_COLORS[kind] || ROAD_EVENT_MAP_COLORS.other,
      priority: kindMeta.priority + impactMeta.priority - (status === 'scheduled' ? 5 : 0)
    };
  }

  function primaryRoadEvent(incidents) {
    return (incidents || []).map(function(incident) {
      return { incident: incident, presentation: roadEventPresentation(incident) };
    }).sort(function(a, b) {
      return b.presentation.priority - a.presentation.priority;
    })[0] || null;
  }

  function roadEventLocationIsApproximate(incident) {
    return Boolean(incident && incident.locationApproximate)
      || !incident
      || incident.lat === null || incident.lat === undefined || incident.lat === ''
      || incident.lng === null || incident.lng === undefined || incident.lng === ''
      || !Number.isFinite(Number(incident.lat))
      || !Number.isFinite(Number(incident.lng));
  }

  function summarizeRoadEvents(sections) {
    var unique = new Map();
    var affectedSections = 0;
    (sections || []).forEach(function(section) {
      var events = section.incidents || [];
      if (events.some(function(incident) { return !roadEventLocationIsApproximate(incident); })) affectedSections += 1;
      events.forEach(function(incident) {
        var identity = incident.canonicalId || incident.id
          || [incident.title, incident.roadRef, incident.effectiveAt || incident.updatedAt || ''].join(':');
        if (!unique.has(identity)) unique.set(identity, incident);
      });
    });
    var summary = {
      incidentCount: 0,
      affectedSections: affectedSections,
      roadLevelIncidentCount: 0,
      activeFullClosureCount: 0,
      scheduledFullClosureCount: 0,
      unknownFullClosureCount: 0
    };
    unique.forEach(function(incident) {
      var presentation = roadEventPresentation(incident);
      summary.incidentCount += 1;
      if (roadEventLocationIsApproximate(incident)) summary.roadLevelIncidentCount += 1;
      if (presentation.impact !== 'full_closure') return;
      if (presentation.status === 'active') summary.activeFullClosureCount += 1;
      else if (presentation.status === 'scheduled') summary.scheduledFullClosureCount += 1;
      else summary.unknownFullClosureCount += 1;
    });
    return summary;
  }

  function conditionAlert(section, type, label, icon, options) {
    return {
      order: section.order,
      type: type,
      label: label,
      icon: icon,
      priority: options && options.priority || 0,
      event: options && options.event || null,
      approximate: Boolean(options && options.approximate)
    };
  }

  function buildAlerts(sections) {
    var alerts = [];
    (sections || []).forEach(function(section) {
      var traffic = section.traffic || {};
      var weather = section.weather || {};
      if (traffic.level === 'congested') {
        alerts.push(conditionAlert(section, 'danger', section.roadRef + ' ' + section.fromKm + '-' + section.toKm + ' km 壅塞', 'fa-car-burst', { priority: 55 }));
      }
      if ((weather.condition || '').indexOf('雨') !== -1 || Number(weather.rainChance) >= 60) {
        alerts.push(conditionAlert(section, 'weather', section.roadRef + ' ' + section.fromKm + '-' + section.toKm + ' km ' + (weather.condition || '降雨'), 'fa-cloud-rain', { priority: 35 }));
      }
      (section.incidents || []).forEach(function(incident) {
        var presentation = roadEventPresentation(incident);
        var approximate = roadEventLocationIsApproximate(incident);
        alerts.push(conditionAlert(
          section,
          'road-event',
          section.roadRef + (approximate ? ' · 位置未提供 · ' : ' ' + section.fromKm + '-' + section.toKm + ' km · ') + presentation.label,
          presentation.icon,
          { priority: presentation.priority, event: presentation, approximate: approximate }
        ));
      });
    });
    return alerts.sort(function(a, b) {
      return b.priority - a.priority || Number(a.order) - Number(b.order);
    }).slice(0, 6);
  }

  window.RouteConditionViewModel = {
    inferRoadEventKind: inferRoadEventKind,
    inferRoadEventImpact: inferRoadEventImpact,
    hasBlockedLaneImpact: hasBlockedLaneImpact,
    roadEventPresentation: roadEventPresentation,
    primaryRoadEvent: primaryRoadEvent,
    roadEventLocationIsApproximate: roadEventLocationIsApproximate,
    summarizeRoadEvents: summarizeRoadEvents,
    buildAlerts: buildAlerts
  };
})();
