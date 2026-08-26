// Route condition overview, ordered timeline, refresh, and navigation handoff.

(function() {
  'use strict';

  var AUTO_REFRESH_MS = 5 * 60 * 1000;
  var TRAFFIC_LABELS = {
    clear: '\u9806\u66a2',
    slow: '\u8eca\u591a',
    congested: '\u58c5\u585e',
    unknown: '\u8cc7\u6599\u4e0d\u8db3'
  };
  var ROAD_EVENT_KINDS = {
    accident: { label: '\u4e8b\u6545', icon: 'fa-car-burst', priority: 9 },
    construction: { label: '\u65bd\u5de5', icon: 'fa-person-digging', priority: 6 },
    congestion: { label: '\u58c5\u585e\u901a\u5831', icon: 'fa-car-side', priority: 4 },
    control: { label: '\u7279\u6b8a\u7ba1\u5236', icon: 'fa-road-barrier', priority: 7 },
    weather: { label: '\u5929\u5019\u8b66\u793a', icon: 'fa-cloud-bolt', priority: 5 },
    disaster: { label: '\u9053\u8def\u707d\u5bb3', icon: 'fa-house-crack', priority: 8 },
    activity: { label: '\u6cbf\u7dda\u6d3b\u52d5', icon: 'fa-calendar-days', priority: 3 },
    hazard: { label: '\u9053\u8def\u969c\u7919', icon: 'fa-triangle-exclamation', priority: 7 },
    other: { label: '\u5176\u4ed6\u72c0\u6cc1', icon: 'fa-circle-exclamation', priority: 2 }
  };
  var ROAD_EVENT_IMPACTS = {
    full_closure: { label: '\u5168\u7dda\u5c01\u9589', priority: 60 },
    lane_closure: { label: '\u8eca\u9053\u5c01\u9589', priority: 50 },
    controlled: { label: '\u4ea4\u901a\u7ba1\u5236', priority: 40 },
    shoulder: { label: '\u8def\u80a9\u4f5c\u696d', priority: 30 },
    no_impact: { label: '\u4e0d\u5f71\u97ff\u901a\u884c', priority: 10 },
    unknown: { label: '\u6ce8\u610f\u73fe\u5834', priority: 20 }
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
  var currentRoute = null;
  var lastRefreshAt = 0;
  var autoTimer = null;
  var requestVersion = 0;
  var userAdjustedCollapse = false;

  function setVisible(id, visible) {
    var element = Dom.byId(id);
    if (element) element.classList.toggle('hidden', !visible);
  }

  function setText(id, value) {
    var element = Dom.byId(id);
    if (element) element.textContent = value;
  }

  function setCollapsed(collapsed) {
    var panel = Dom.byId('route-conditions-panel');
    if (!panel) return;
    panel.classList.toggle('is-collapsed', !!collapsed);
    var icon = Dom.query('#condition-toggle i');
    if (icon) {
      icon.className = collapsed
        ? 'fa-solid fa-chevron-up'
        : 'fa-solid fa-chevron-down';
    }
    var button = Dom.byId('condition-toggle');
    if (button) {
      button.setAttribute('aria-expanded', String(!collapsed));
      button.setAttribute('aria-label', collapsed ? '\u5c55\u958b\u6cbf\u9014\u72c0\u6cc1' : '\u6536\u5408\u6cbf\u9014\u72c0\u6cc1');
    }
  }

  function shouldUseMobileReadyLayout() {
    return Boolean(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
  }

  function sourceTime(source, observedAt, lastKnown) {
    return (source || '--') + (lastKnown ? ' \u6700\u5f8c\u8cc7\u6599' : '') + ' '
      + (observedAt ? formatUpdatedAt(observedAt) : '--:--');
  }

  function inferRoadEventKind(incident) {
    if (ROAD_EVENT_KINDS[incident.kind]) return incident.kind;
    var text = String((incident.title || '') + ' ' + (incident.description || ''));
    if (/\u4e8b\u6545|\u8eca\u798d|\u8ffd\u649e|\u7ffb\u8986/.test(text)) return 'accident';
    if (/\u65bd\u5de5|\u5de5\u7a0b|\u990a\u8b77|\u4fee\u7e55|\u958b\u6316|\u5272\u8349|\u6e05\u6383/.test(text)) return 'construction';
    if (/\u58c5\u585e|\u8eca\u591a|\u56de\u5835/.test(text)) return 'congestion';
    if (/\u7ba1\u5236|\u5c01\u9589|\u6539\u9053|\u758f\u904b/.test(text)) return 'control';
    if (/\u6fc3\u9727|\u8c6a\u96e8|\u5f37\u98a8|\u98b1\u98a8|\u5929\u6c23/.test(text)) return 'weather';
    if (/\u843d\u77f3|\u574d\u65b9|\u6df9\u6c34|\u571f\u77f3\u6d41|\u707d\u5bb3/.test(text)) return 'disaster';
    if (/\u6d3b\u52d5|\u904a\u884c|\u8def\u8dd1|\u7bc0\u6176|\u9032\u9999/.test(text)) return 'activity';
    if (/\u6563\u843d\u7269|\u6389\u843d\u7269|\u7570\u7269|\u5751\u6d1e|\u6545\u969c\u8eca|\u9006\u884c|\u8aa4\u95d6|\u7570\u5e38/.test(text)) {
      return 'hazard';
    }
    return 'other';
  }

  function inferRoadEventImpact(incident) {
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
    if (
      severityCode === 1
      || regulationCodes.indexOf(2) !== -1
      || hasBlockedLaneImpact(incident.blockedLanes)
    ) {
      return 'lane_closure';
    }
    if (/(?:\u5168\u7dda|\u96d9\u5411|\u9053\u8def|\u8def\u6bb5).{0,8}(?:\u5c01\u9589|\u4e2d\u65b7|\u963b\u65b7)|(?:\u7981\u6b62|\u7121\u6cd5|\u66ab\u505c)\u901a\u884c/.test(text)) {
      return 'full_closure';
    }
    if (
      !/(?:\u7121|\u672a)(?:\u5360\u7528|\u5c01\u9589|\u963b\u65b7|\u5f71\u97ff).{0,8}(?:\u8eca\u9053|\u9053\u8def)|\u4e0d\u5f71\u97ff(?:\u9053\u8def)?\u901a\u884c|\u7121\u5f71\u97ff/.test(text)
      && /(?:\u5c01\u9589|\u5360\u7528).{0,8}\u8eca\u9053|\u8eca\u9053.{0,4}(?:\u5c01\u9589|\u7e2e\u6e1b)/.test(text)
    ) {
      return 'lane_closure';
    }
    if (/\u55ae\u7dda\u96d9\u5411|\u6a5f\u52d5\u7ba1\u5236|\u4ea4\u901a\u7ba1\u5236|\u4ea4\u7ba1|\u6539\u9053|\u7ba1\u5236\u901a\u884c/.test(text)) {
      return 'controlled';
    }
    if (/\u8def\u80a9/.test(text)) return 'shoulder';
    if (severityCode === 0 || /\u4e0d\u5f71\u97ff(?:\u9053\u8def)?\u901a\u884c|\u7121\u5f71\u97ff/.test(text)) {
      return 'no_impact';
    }
    return 'unknown';
  }

  function hasBlockedLaneImpact(value) {
    var text = String(value || '').trim().replace(/\s+/g, '');
    if (!text) return false;
    if (/^(?:-99|0|254|255|none|unknown|null|n\/a|\u672a\u77e5|\u672a\u63d0\u4f9b|\u4f86\u6e90\u672a\u63d0\u4f9b|\u4e0d\u9069\u7528)$/i.test(text)) {
      return false;
    }
    return !/^\u7121(?:(?:\u5360\u7528|\u5c01\u9589|\u963b\u65b7|\u5f71\u97ff)(?:\u4efb\u4f55)?(?:\u8eca\u9053|\u9053\u8def))?$/.test(text);
  }

  function eventDateTime(value) {
    var date = value ? new Date(value) : null;
    if (!date || isNaN(date.getTime())) return '--';
    return (date.getMonth() + 1) + '/' + date.getDate() + ' '
      + String(date.getHours()).padStart(2, '0') + ':'
      + String(date.getMinutes()).padStart(2, '0');
  }

  function roadEventPresentation(incident) {
    if (window.RouteConditionViewModel && RouteConditionViewModel.roadEventPresentation) {
      return RouteConditionViewModel.roadEventPresentation(incident);
    }
    incident = incident || {};
    var kind = inferRoadEventKind(incident);
    var impact = inferRoadEventImpact(incident);
    var kindMeta = ROAD_EVENT_KINDS[kind] || ROAD_EVENT_KINDS.other;
    var impactMeta = ROAD_EVENT_IMPACTS[impact] || ROAD_EVENT_IMPACTS.unknown;
    var status = incident.lastKnown ? 'last_known' : (incident.status || 'unknown');
    var prefix = status === 'scheduled' ? '\u9810\u544a' : '';
    var label = (prefix ? prefix + '\u00b7' : '') + kindMeta.label;
    if (impact !== 'unknown') label += ' \u00b7 ' + impactMeta.label;
    return {
      kind: kind,
      impact: impact,
      status: status,
      label: label,
      icon: impact === 'full_closure' ? 'fa-ban' : kindMeta.icon,
      mapColor: ROAD_EVENT_IMPACT_MAP_COLORS[impact]
        || ROAD_EVENT_MAP_COLORS[kind]
        || ROAD_EVENT_MAP_COLORS.other,
      priority: kindMeta.priority + impactMeta.priority - (status === 'scheduled' ? 5 : 0)
    };
  }

  function primaryRoadEvent(incidents) {
    if (window.RouteConditionViewModel && RouteConditionViewModel.primaryRoadEvent) {
      return RouteConditionViewModel.primaryRoadEvent(incidents);
    }
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
    if (window.RouteConditionViewModel && RouteConditionViewModel.summarizeRoadEvents) {
      return RouteConditionViewModel.summarizeRoadEvents(sections);
    }
    var unique = new Map();
    var affectedSections = 0;
    (sections || []).forEach(function(section) {
      var events = section.incidents || [];
      if (events.some(function(incident) { return !roadEventLocationIsApproximate(incident); })) {
        affectedSections += 1;
      }
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

  function roadEventCoverageText(coverage) {
    if (!coverage || !Array.isArray(coverage.requestedScopes)) {
      return '\u9053\u8def\u4e8b\u4ef6\u4f86\u6e90\u672a\u56de\u5831\u6db5\u84cb\u7bc4\u570d\uff1b\u672a\u5c07\u7f3a\u5c11\u8cc7\u6599\u8996\u70ba\u300c\u6cbf\u9014\u7121\u4e8b\u4ef6\u300d\u3002';
    }
    var labels = {
      'highway:live': '\u7701\u9053\u5373\u6642',
      'highway:scheduled': '\u7701\u9053\u9810\u544a',
      'freeway:live': '\u9ad8\u901f\u516c\u8def\u5373\u6642'
    };
    var ready = (coverage.readyScopes || []).map(function(scope) {
      return labels[scope] || scope;
    });
    var failed = (coverage.failedScopes || []).map(function(scope) {
      return labels[scope] || scope;
    });
    var text = ready.length
      ? '\u5df2\u67e5\u8a62 ' + ready.join('\u3001') + '\u4e8b\u4ef6\u3002'
      : '\u9053\u8def\u4e8b\u4ef6\u4f86\u6e90\u76ee\u524d\u7121\u6cd5\u53d6\u5f97\u3002';
    if (failed.length) {
      text += failed.join('\u3001') + '\u66ab\u6642\u5931\u6548\uff0c\u672a\u8996\u70ba\u300c\u7121\u4e8b\u4ef6\u300d\u3002';
    }
    return text + '\u5e02\u5340\u9053\u8def\u5c1a\u672a\u7d0d\u5165\uff1b\u9ad8\u901f\u516c\u8def\u7121\u5b98\u65b9\u9810\u544a\u4e8b\u4ef6\u4f86\u6e90\u3002';
  }

  function emptyRoadEventSummary(coverage) {
    var readyCount = Array.isArray(coverage && coverage.readyScopes)
      ? coverage.readyScopes.length
      : 0;
    var failedCount = Array.isArray(coverage && coverage.failedScopes)
      ? coverage.failedScopes.length
      : 0;
    if (readyCount && !failedCount) return '\u6cbf\u9014\u672a\u767c\u73fe\u72c0\u6cc1';
    if (readyCount && failedCount) return '\u90e8\u5206\u4e8b\u4ef6\u4f86\u6e90\u672a\u56de\u5831';
    return '\u4e8b\u4ef6\u4f86\u6e90\u672a\u56de\u5831';
  }

  function showLoading() {
    var panel = Dom.byId('route-conditions-panel');
    if (panel) {
      panel.classList.remove('hidden');
    }
    setVisible('condition-loading', true);
    setVisible('condition-content', false);
    setVisible('condition-error', false);
    var refresh = Dom.byId('condition-refresh');
    if (refresh) refresh.classList.add('loading');
  }

  function showError(message) {
    var panel = Dom.byId('route-conditions-panel');
    if (panel) panel.classList.remove('is-collapsed');
    setVisible('condition-loading', false);
    setVisible('condition-content', false);
    setVisible('condition-error', true);
    var error = Dom.query('#condition-error span');
    if (error) error.textContent = message || '\u6cbf\u9014\u72c0\u6cc1\u66ab\u6642\u7121\u6cd5\u8f09\u5165\u3002';
    var summary = Dom.byId('condition-collapsed-summary');
    if (summary) {
      summary.textContent = '\u66f4\u65b0\u5931\u6557';
      summary.classList.add('danger');
    }
    var badge = Dom.byId('condition-source-badge');
    if (badge) {
      badge.textContent = '\u66f4\u65b0\u5931\u6557';
      badge.classList.remove('demo');
      badge.classList.add('error');
    }
    setText('condition-event-status', '\u6cbf\u9014\u72c0\u6cc1\u66f4\u65b0\u5931\u6557\uff0c\u76ee\u524d\u4e0d\u662f\u5373\u6642\u8cc7\u6599');
    var toggle = Dom.byId('condition-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', '\u6536\u5408\u6cbf\u9014\u72c0\u6cc1');
    }
    var toggleIcon = Dom.query('#condition-toggle i');
    if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-down';
    var refresh = Dom.byId('condition-refresh');
    if (refresh) refresh.classList.remove('loading');
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
    if (window.RouteConditionViewModel && RouteConditionViewModel.buildAlerts) {
      return RouteConditionViewModel.buildAlerts(sections);
    }
    var alerts = [];
    sections.forEach(function(section) {
      var traffic = section.traffic || {};
      var weather = section.weather || {};
      if (traffic.level === 'congested') {
        alerts.push(conditionAlert(
          section,
          'danger',
          section.roadRef + ' ' + section.fromKm + '-' + section.toKm + ' km \u58c5\u585e',
          'fa-car-burst',
          { priority: 55 }
        ));
      }
      if ((weather.condition || '').indexOf('\u96e8') !== -1 || Number(weather.rainChance) >= 60) {
        alerts.push(conditionAlert(
          section,
          'weather',
          section.roadRef + ' ' + section.fromKm + '-' + section.toKm + ' km ' + (weather.condition || '\u964d\u96e8'),
          'fa-cloud-rain',
          { priority: 35 }
        ));
      }
      (section.incidents || []).forEach(function(incident) {
        var presentation = roadEventPresentation(incident);
        var approximate = roadEventLocationIsApproximate(incident);
        alerts.push(conditionAlert(
          section,
          'road-event',
          section.roadRef
            + (approximate
              ? ' \u00b7 \u4f4d\u7f6e\u672a\u63d0\u4f9b \u00b7 '
              : ' ' + section.fromKm + '-' + section.toKm + ' km \u00b7 ')
            + presentation.label,
          presentation.icon,
          { priority: presentation.priority, event: presentation, approximate: approximate }
        ));
      });
    });
    return alerts.sort(function(a, b) {
      return b.priority - a.priority || Number(a.order) - Number(b.order);
    }).slice(0, 6);
  }

  function renderAlerts(sections) {
    var wrap = Dom.byId('condition-alerts');
    if (!wrap) return;
    wrap.innerHTML = '';
    var alerts = buildAlerts(sections);
    if (!alerts.length) {
      var clear = document.createElement('div');
      clear.className = 'condition-alert weather';
      clear.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>\u76ee\u524d\u6240\u5f97\u7701\u9053\u5373\u6642\u8207\u9810\u544a\u8cc7\u6599\u672a\u986f\u793a\u660e\u986f\u58c5\u585e\u3001\u964d\u96e8\u6216\u9053\u8def\u4e8b\u4ef6\uff1b\u5e02\u5340\u9053\u8def\u53ef\u80fd\u672a\u6db5\u84cb\u3002</span>';
      wrap.appendChild(clear);
      return;
    }
    alerts.forEach(function(alert) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'condition-alert ' + (alert.type === 'danger' ? '' : alert.type);
      if (alert.event) {
        button.classList.add(
          'road-event-' + alert.event.kind,
          'road-impact-' + alert.event.impact
        );
        if (alert.event.status === 'scheduled') button.classList.add('is-scheduled');
        if (alert.approximate) button.classList.add('is-approximate');
        button.dataset.eventKind = alert.event.kind;
        button.dataset.eventImpact = alert.event.impact;
        button.dataset.eventLocation = alert.approximate ? 'approximate' : 'located';
      }
      var icon = document.createElement('i');
      icon.className = 'fa-solid ' + alert.icon;
      var label = document.createElement('span');
      label.textContent = alert.label;
      button.appendChild(icon);
      button.appendChild(label);
      button.addEventListener('click', function() {
        if (alert.approximate) {
          Toast.show('\u5b98\u65b9\u4e8b\u4ef6\u672a\u63d0\u4f9b\u7cbe\u78ba\u5ea7\u6a19\uff0c\u50c5\u986f\u793a\u9053\u8def\u5c64\u7d1a\u8b66\u793a');
          return;
        }
        focusSection(alert.order);
      });
      wrap.appendChild(button);
    });
  }

  function createChip(iconName, text, isUnknown) {
    var chip = document.createElement('span');
    chip.className = 'condition-data-chip' + (isUnknown ? ' unknown' : '');
    var icon = document.createElement('i');
    icon.className = 'fa-solid ' + iconName;
    var label = document.createElement('span');
    label.textContent = text;
    chip.appendChild(icon);
    chip.appendChild(label);
    return chip;
  }

  function renderTimeline(sections) {
    var wrap = Dom.byId('condition-timeline');
    if (!wrap) return;
    wrap.innerHTML = '';
    sections.forEach(function(section) {
      var traffic = section.traffic || {};
      var weather = section.weather || {};
      var roadEvents = section.incidents || [];
      var locatedRoadEvents = roadEvents.filter(function(incident) {
        return !roadEventLocationIsApproximate(incident);
      });
      var primaryEvent = primaryRoadEvent(locatedRoadEvents);
      var item = document.createElement('article');
      item.className = 'condition-section';
      item.dataset.order = section.order;
      item.dataset.level = traffic.level || 'unknown';
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', (section.roadRef || section.roadName || '\u4e00\u822c\u9053\u8def')
        + ' ' + section.fromKm + '-' + section.toKm + ' km'
        + (primaryEvent ? '\uff0c' + primaryEvent.presentation.label : ''));
      if (primaryEvent) {
        item.classList.add(
          'has-road-event',
          'road-event-' + primaryEvent.presentation.kind,
          'road-impact-' + primaryEvent.presentation.impact
        );
        if (primaryEvent.presentation.status === 'scheduled') item.classList.add('has-scheduled-event');
        item.dataset.eventKind = primaryEvent.presentation.kind;
        item.dataset.eventImpact = primaryEvent.presentation.impact;
        item.dataset.eventStatus = primaryEvent.presentation.status;
      }

      var order = document.createElement('div');
      order.className = 'condition-order';
      order.textContent = section.order;

      var body = document.createElement('div');
      body.className = 'condition-section-body';
      var title = document.createElement('div');
      title.className = 'condition-section-title';
      var road = document.createElement('span');
      road.textContent = section.roadRef || section.roadName || '\u4e00\u822c\u9053\u8def';
      var km = document.createElement('span');
      km.className = 'condition-section-km';
      km.textContent = section.fromKm + '-' + section.toKm + ' km';
      title.appendChild(road);
      title.appendChild(km);

      var meta = document.createElement('div');
      meta.className = 'condition-section-meta';
      var trafficText = TRAFFIC_LABELS[traffic.level] || TRAFFIC_LABELS.unknown;
      if (Number.isFinite(Number(traffic.speedKph))) trafficText += ' ' + Math.round(Number(traffic.speedKph)) + ' km/h';
      meta.appendChild(createChip(
        'fa-gauge-high',
        trafficText + ' \u00b7 ' + sourceTime(traffic.source, traffic.observedAt, traffic.lastKnown),
        traffic.level === 'unknown'
      ));

      var weatherText = weather.condition || '\u672a\u77e5';
      if (Number.isFinite(Number(weather.temperatureC))) weatherText += ' ' + Math.round(Number(weather.temperatureC)) + '\u00b0C';
      if (Number.isFinite(Number(weather.rainChance))) weatherText += ' \u964d\u96e8' + Math.round(Number(weather.rainChance)) + '%';
      meta.appendChild(createChip(
        (weather.condition || '').indexOf('\u96e8') !== -1 ? 'fa-cloud-rain' : 'fa-cloud-sun',
        weatherText + ' \u00b7 ' + sourceTime(weather.source, weather.observedAt, weather.lastKnown),
        weather.condition === '\u672a\u77e5'
      ));

      body.appendChild(title);
      body.appendChild(meta);

      if (roadEvents.length) {
        var eventWrap = document.createElement('div');
        eventWrap.className = 'condition-road-events';
        roadEvents.slice(0, 3).forEach(function(incident) {
          var presentation = roadEventPresentation(incident);
          var eventRow = document.createElement('div');
          eventRow.className = 'condition-road-event road-event-' + presentation.kind
            + ' road-impact-' + presentation.impact
            + (presentation.status === 'scheduled' ? ' is-scheduled' : '')
            + (roadEventLocationIsApproximate(incident) ? ' is-approximate' : '');
          eventRow.dataset.eventKind = presentation.kind;
          eventRow.dataset.eventImpact = presentation.impact;
          eventRow.dataset.eventStatus = presentation.status;
          eventRow.dataset.eventLocation = roadEventLocationIsApproximate(incident) ? 'approximate' : 'located';

          var eventIcon = document.createElement('span');
          eventIcon.className = 'condition-road-event-icon';
          eventIcon.innerHTML = '<i class="fa-solid ' + presentation.icon + '"></i>';

          var eventBody = document.createElement('span');
          eventBody.className = 'condition-road-event-body';
          var eventTitle = document.createElement('strong');
          eventTitle.textContent = presentation.label;
          var eventDescription = document.createElement('span');
          eventDescription.className = 'condition-road-event-description';
          eventDescription.textContent = incident.description || incident.title || '\u8acb\u6ce8\u610f\u73fe\u5834\u8def\u6cc1';
          var eventMeta = document.createElement('span');
          eventMeta.className = 'condition-road-event-meta';
          var timing = presentation.status === 'scheduled'
            ? '\u9810\u5b9a ' + eventDateTime(incident.effectiveAt)
            : (presentation.status === 'active' ? '\u9032\u884c\u4e2d' : '\u6642\u9593\u672a\u660e');
          if (presentation.status === 'last_known') timing = '\u6700\u5f8c\u6210\u529f\u8cc7\u6599';
          eventMeta.textContent = (roadEventLocationIsApproximate(incident) ? '\u4f4d\u7f6e\u672a\u63d0\u4f9b \u00b7 ' : '')
            + timing + ' \u00b7 '
            + sourceTime(incident.source, incident.updatedAt, incident.lastKnown);

          eventBody.appendChild(eventTitle);
          eventBody.appendChild(eventDescription);
          eventBody.appendChild(eventMeta);
          eventRow.appendChild(eventIcon);
          eventRow.appendChild(eventBody);
          eventWrap.appendChild(eventRow);
        });
        if (roadEvents.length > 3) {
          var more = document.createElement('div');
          more.className = 'condition-road-event-more';
          more.textContent = '\u9084\u6709 ' + (roadEvents.length - 3) + ' \u4ef6\u540c\u8def\u6bb5\u72c0\u6cc1';
          eventWrap.appendChild(more);
        }
        body.appendChild(eventWrap);
      }

      if ((section.cameras || []).length) {
        var cameraRow = document.createElement('div');
        cameraRow.className = 'condition-camera-row';
        section.cameras.forEach(function(camera) {
          var cameraButton = document.createElement('button');
          cameraButton.type = 'button';
          cameraButton.className = 'condition-camera-button';
          cameraButton.textContent = '\u73fe\u5834\u756b\u9762 \u00b7 ' + camera.name + (camera.status === 'offline' ? ' (\u7121\u6cd5\u78ba\u8a8d)' : '');
          cameraButton.addEventListener('click', function(event) {
            event.stopPropagation();
            openCamera(camera);
          });
          cameraRow.appendChild(cameraButton);
        });
        body.appendChild(cameraRow);
      }

      item.appendChild(order);
      item.appendChild(body);
      item.addEventListener('click', function() { focusSection(section.order); });
      item.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          focusSection(section.order);
        }
      });
      wrap.appendChild(item);
    });
  }

  function openCamera(camera) {
    var url = safeHttpUrl(camera.imageUrl || camera.url || '');
    var normalized = {
      id: camera.id,
      name: camera.name,
      lat: Number(camera.lat),
      lng: Number(camera.lng),
      url: url,
      type: 'cctv',
      county: '\u6cbf\u9014\u8def\u6bb5',
      status: camera.status || 'unknown',
      source: camera.source || 'CCTV'
    };
    if (camera.status === 'offline') Toast.show('\u93e1\u982d\u72c0\u614b\u7570\u5e38\uff0c\u7121\u6cd5\u7528\u756b\u9762\u78ba\u8a8d\u73fe\u5834');
    MapMod.focusCam(normalized);
  }

  function render(payload) {
    var data = payload.data || {};
    var overall = data.overall || {};
    var sections = data.sections || [];
    var incidentCoverageReported = Boolean(
      data.incidentCoverage && Array.isArray(data.incidentCoverage.requestedScopes)
    );
    var readyIncidentScopes = Array.isArray(data.incidentCoverage && data.incidentCoverage.readyScopes)
      ? data.incidentCoverage.readyScopes
      : [];
    var upstreamIssues = Array.isArray(data.issues) ? data.issues : [];
    var failedIncidentScopes = Array.isArray(data.incidentCoverage && data.incidentCoverage.failedScopes)
      ? data.incidentCoverage.failedScopes
      : [];
    var effectivePartial = payload.status === 'partial'
      || upstreamIssues.length > 0
      || failedIncidentScopes.length > 0
      || !incidentCoverageReported
      || readyIncidentScopes.length === 0;
    AppState.routeConditions = data;
    AppState.updatedAt.conditions = payload.updatedAt;
    lastRefreshAt = Date.now();

    setVisible('condition-loading', false);
    setVisible('condition-content', true);
    setVisible('condition-error', false);
    setVisible('condition-demo-warning', data.dataMode === 'fixture');
    setText('condition-duration', Math.round(Number(currentRoute.durationMinutes || 0)) + ' \u5206');
    setText('condition-rain', Number(overall.rainSections || 0) + ' \u6bb5');
    setText('condition-congestion', Number(overall.congestedSections || 0) + ' \u6bb5');
    var eventSummary = summarizeRoadEvents(sections);
    var incidentCount = eventSummary.incidentCount;
    var affectedIncidentSections = eventSummary.affectedSections;
    setText(
      'condition-incidents',
      affectedIncidentSections
        ? affectedIncidentSections + '\u8655\u00b7' + incidentCount + '\u4ef6'
        : (incidentCount
          ? '\u672a\u5b9a\u4f4d\u00b7' + incidentCount + '\u4ef6'
          : (!readyIncidentScopes.length
            ? '\u672a\u56de\u5831'
            : (failedIncidentScopes.length ? '\u90e8\u5206\u672a\u77e5' : '0 \u8655')))
    );
    setText('condition-coverage', Number(overall.coveragePercent || 0) + '%');
    setText('condition-updated', '\u66f4\u65b0 ' + formatUpdatedAt(payload.updatedAt));
    setText('condition-event-coverage', roadEventCoverageText(data.incidentCoverage));

    var validationText = currentRoute.validation && currentRoute.validation.rerouted
      ? '\u5df2\u907f\u958b\u7981\u884c\u8def\u6bb5\u4e26\u91cd\u65b0\u9a57\u8b49'
      : '\u5b89\u5168\u8def\u7dda \u00b7 ' + ((currentRoute.validation && currentRoute.validation.rulesVersion) || '--');
    setText('condition-validation', validationText);
    var collapsedSummary = Dom.byId('condition-collapsed-summary');
    if (collapsedSummary) {
      collapsedSummary.textContent = eventSummary.activeFullClosureCount
        ? '\u5c01\u9589 ' + eventSummary.activeFullClosureCount
        : (eventSummary.scheduledFullClosureCount
          ? '\u9810\u544a\u5c01\u9589 ' + eventSummary.scheduledFullClosureCount
          : (eventSummary.unknownFullClosureCount
            ? '\u5c01\u9589\u72c0\u6cc1 ' + eventSummary.unknownFullClosureCount
            : (affectedIncidentSections
              ? '\u72c0\u6cc1 ' + affectedIncidentSections + '\u8655'
              : (incidentCount
                ? '\u672a\u5b9a\u4f4d ' + eventSummary.roadLevelIncidentCount + '\u4ef6'
                : emptyRoadEventSummary(data.incidentCoverage)))));
      collapsedSummary.classList.toggle('danger', eventSummary.activeFullClosureCount > 0);
    }
    setText(
      'condition-event-status',
      incidentCount
        ? '\u6cbf\u9014 ' + incidentCount + ' \u4ef6\u9053\u8def\u72c0\u6cc1\uff0c\u5f71\u97ff '
          + affectedIncidentSections + ' \u500b\u5df2\u5b9a\u4f4d\u4e8b\u4ef6\u9ede'
          + (eventSummary.roadLevelIncidentCount
            ? '\uff0c\u53e6\u6709 ' + eventSummary.roadLevelIncidentCount + ' \u4ef6\u4f4d\u7f6e\u672a\u63d0\u4f9b'
            : '')
          + (eventSummary.activeFullClosureCount
            ? '\uff0c\u5176\u4e2d ' + eventSummary.activeFullClosureCount + ' \u4ef6\u6b63\u5728\u5168\u7dda\u5c01\u9589'
            : '')
          + (eventSummary.scheduledFullClosureCount
            ? '\uff0c\u53e6\u6709 ' + eventSummary.scheduledFullClosureCount + ' \u4ef6\u9810\u544a\u5168\u7dda\u5c01\u9589'
            : '')
          + (eventSummary.unknownFullClosureCount
            ? '\uff0c\u53e6\u6709 ' + eventSummary.unknownFullClosureCount + ' \u4ef6\u5168\u7dda\u5c01\u9589\u6642\u9593\u672a\u660e'
            : '')
        : (readyIncidentScopes.length
          ? roadEventCoverageText(data.incidentCoverage) + '\u5728\u5df2\u56de\u5831\u4f86\u6e90\u4e2d\uff0c\u6cbf\u9014\u672a\u914d\u5c0d\u5230\u9053\u8def\u4e8b\u4ef6'
          : roadEventCoverageText(data.incidentCoverage))
    );
    setText(
      'map-legend-event-count',
      incidentCount ? '\u72c0\u6cc1 ' + incidentCount : '\u5f69\u8272\u77ed\u7dda\u00b7\u65bd\u5de5\uff0f\u4e8b\u4ef6'
    );
    var legendEventItem = Dom.byId('map-legend-event-item');
    if (legendEventItem) legendEventItem.classList.toggle('has-events', incidentCount > 0);

    var badge = Dom.byId('condition-source-badge');
    if (badge) {
      badge.classList.toggle('demo', data.dataMode === 'fixture');
      badge.classList.remove('error');
      badge.textContent = data.dataMode === 'fixture'
        ? 'DEMO \u793a\u7bc4'
        : (effectivePartial ? '\u90e8\u5206\u5373\u6642' : '\u5b98\u65b9\u5373\u6642');
    }
    var refresh = Dom.byId('condition-refresh');
    if (refresh) refresh.classList.remove('loading');

    renderAlerts(sections);
    renderTimeline(sections);
    setNavigationLinks();
    renderAppleLegs(false);
    MapMod.drawConditionSections(sections);
    MapMod.drawStartEnd(AppState.routeAllPoints);
    if (shouldUseMobileReadyLayout() && !userAdjustedCollapse) setCollapsed(true);
    Bus.emit('conditions:updated', data);
  }

  function load(route, forceRefresh) {
    var previousRouteId = currentRoute && currentRoute.routeId;
    currentRoute = route || currentRoute;
    if (!currentRoute || !currentRoute.routeId) return;
    if (currentRoute.routeId !== previousRouteId) {
      userAdjustedCollapse = false;
      if (shouldUseMobileReadyLayout()) {
        setText('condition-collapsed-summary', '\u6574\u7406\u6cbf\u9014\u8def\u6cc1\u2026');
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    }
    var routeForRequest = currentRoute;
    var thisRequestVersion = ++requestVersion;
    setNavigationLinks();
    renderAppleLegs(false);
    if (window.RouteStripMod) RouteStripMod.hide();
    showLoading();
    AppServices.loadRouteConditions(currentRoute.routeId, !!forceRefresh)
      .then(function(payload) {
        if (thisRequestVersion !== requestVersion || currentRoute !== routeForRequest) return;
        render(payload);
      })
      .catch(function(error) {
        if (thisRequestVersion !== requestVersion || currentRoute !== routeForRequest) return;
        showError(error && error.message ? error.message : '\u6cbf\u9014\u72c0\u6cc1\u66ab\u6642\u7121\u6cd5\u8f09\u5165\u3002');
      });
  }

  function refresh() {
    if (!currentRoute) return;
    load(currentRoute, true);
  }

  function focusSection(order) {
    MapMod.focusSection(order);
    Dom.queryAll('.condition-section').forEach(function(item) {
      item.classList.toggle('active', Number(item.dataset.order) === Number(order));
    });
    var selected = Dom.query('.condition-section[data-order="' + Number(order) + '"]');
    if (selected) selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function routePoints() {
    return (currentRoute && currentRoute.locations || []).map(function(location) {
      return Number(location.lat).toFixed(6) + ',' + Number(location.lng).toFixed(6);
    });
  }

  function googleUrl(points) {
    var params = new URLSearchParams({
      api: '1',
      origin: points[0],
      destination: points[points.length - 1],
      travelmode: RouteMod.mode === 'car' ? 'driving' : 'two-wheeler',
      dir_action: 'navigate'
    });
    if (points.length > 2) params.set('waypoints', points.slice(1, -1).join('|'));
    if (RouteMod.mode === 'motorcycle' && RouteMod.plate === 'white') params.set('avoid', 'highways,tolls');
    return 'https://www.google.com/maps/dir/?' + params.toString();
  }

  function appleUrl(from, to) {
    var params = new URLSearchParams({ saddr: from, daddr: to, dirflg: 'd' });
    return 'https://maps.apple.com/?' + params.toString();
  }

  function updateNavigationLink(link, href, enabled) {
    if (!link) return;
    link.href = enabled ? href : '#';
    link.setAttribute('aria-disabled', String(!enabled));
    link.classList.toggle('is-disabled', !enabled);
  }

  function setNavigationLinks() {
    var points = routePoints();
    var enabled = points.length >= 2;
    updateNavigationLink(
      Dom.byId('nav-google'),
      enabled ? googleUrl(points) : '#',
      enabled
    );
    updateNavigationLink(
      Dom.byId('nav-apple'),
      enabled ? appleUrl(points[0], points[1]) : '#',
      enabled
    );
  }

  function renderAppleLegs(reveal) {
    var wrap = Dom.byId('apple-leg-links');
    if (!wrap) return;
    var points = routePoints();
    wrap.innerHTML = '';
    wrap.classList.toggle('hidden', !reveal || points.length <= 2);
    if (!reveal || points.length <= 2) return;
    var note = document.createElement('div');
    note.textContent = 'Apple Maps Map Links \u4e0d\u652f\u63f4\u4e00\u6b21\u4ea4\u63a5\u591a\u505c\u9760\u9ede\uff0c\u8acb\u4f9d\u539f\u59cb\u9806\u5e8f\u958b\u555f\u5404\u6bb5\uff1a';
    var buttons = document.createElement('div');
    buttons.className = 'apple-leg-buttons';
    for (var index = 0; index < points.length - 1; index += 1) {
      var link = document.createElement('a');
      link.className = 'apple-leg-button';
      link.href = appleUrl(points[index], points[index + 1]);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '\u7b2c ' + (index + 1) + ' \u6bb5';
      buttons.appendChild(link);
    }
    wrap.appendChild(note);
    wrap.appendChild(buttons);
  }

  function guardNavigationLink(event) {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
    }
  }

  function openAppleMaps(event) {
    var points = routePoints();
    if (points.length < 2) {
      event.preventDefault();
      return;
    }
    if (points.length === 2) return;
    event.preventDefault();
    renderAppleLegs(true);
    Toast.show('Apple Maps \u8acb\u4f9d\u9806\u5e8f\u958b\u555f\u5404\u6bb5\u8def\u7dda', 4000);
  }

  function toggleCollapsed() {
    var panel = Dom.byId('route-conditions-panel');
    if (!panel) return;
    userAdjustedCollapse = true;
    setCollapsed(!panel.classList.contains('is-collapsed'));
  }

  function clear() {
    requestVersion += 1;
    currentRoute = null;
    lastRefreshAt = 0;
    userAdjustedCollapse = false;
    setNavigationLinks();
    var panel = Dom.byId('route-conditions-panel');
    if (panel) {
      panel.classList.add('hidden');
      setCollapsed(false);
    }
    AppState.routeConditions = null;
    setText('map-legend-event-count', '\u5f69\u8272\u77ed\u7dda\u00b7\u65bd\u5de5\uff0f\u4e8b\u4ef6');
    var legendEventItem = Dom.byId('map-legend-event-item');
    if (legendEventItem) legendEventItem.classList.remove('has-events');
  }

  function init() {
    Dom.onId('condition-clear', 'click', function() {
      if (window.RouteMod) RouteMod.clear();
    });
    Dom.onId('condition-refresh', 'click', refresh);
    Dom.onId('condition-retry', 'click', refresh);
    Dom.onId('condition-toggle', 'click', toggleCollapsed);
    Dom.onId('nav-google', 'click', guardNavigationLink);
    Dom.onId('nav-apple', 'click', openAppleMaps);
    Bus.on('condition:select', focusSection);
    autoTimer = window.setInterval(function() {
      if (!currentRoute || document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshAt >= AUTO_REFRESH_MS) refresh();
    }, 60000);
  }

  window.RouteConditionsMod = {
    init: init,
    load: load,
    refresh: refresh,
    clear: clear,
    focusSection: focusSection
  };
  window.getRoadEventPresentation = roadEventPresentation;
  window.getPrimaryRoadEvent = primaryRoadEvent;

  window.addEventListener('load', init);
})();
