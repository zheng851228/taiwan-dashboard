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
  var currentRoute = null;
  var lastRefreshAt = 0;
  var autoTimer = null;
  var requestVersion = 0;

  function setVisible(id, visible) {
    var element = Dom.byId(id);
    if (element) element.classList.toggle('hidden', !visible);
  }

  function setText(id, value) {
    var element = Dom.byId(id);
    if (element) element.textContent = value;
  }

  function sourceTime(source, observedAt, lastKnown) {
    return (source || '--') + (lastKnown ? ' \u6700\u5f8c\u8cc7\u6599' : '') + ' '
      + (observedAt ? formatUpdatedAt(observedAt) : '--:--');
  }

  function showLoading() {
    var panel = Dom.byId('route-conditions-panel');
    if (panel) {
      panel.classList.remove('hidden', 'is-collapsed');
    }
    setVisible('condition-loading', true);
    setVisible('condition-content', false);
    setVisible('condition-error', false);
    var refresh = Dom.byId('condition-refresh');
    if (refresh) refresh.classList.add('loading');
  }

  function showError(message) {
    setVisible('condition-loading', false);
    setVisible('condition-content', false);
    setVisible('condition-error', true);
    var error = Dom.query('#condition-error span');
    if (error) error.textContent = message || '\u6cbf\u9014\u72c0\u6cc1\u66ab\u6642\u7121\u6cd5\u8f09\u5165\u3002';
    var refresh = Dom.byId('condition-refresh');
    if (refresh) refresh.classList.remove('loading');
  }

  function conditionAlert(section, type, label, icon) {
    return {
      order: section.order,
      type: type,
      label: label,
      icon: icon
    };
  }

  function buildAlerts(sections) {
    var alerts = [];
    sections.forEach(function(section) {
      var traffic = section.traffic || {};
      var weather = section.weather || {};
      if (traffic.level === 'congested') {
        alerts.push(conditionAlert(
          section,
          'danger',
          section.roadRef + ' ' + section.fromKm + '-' + section.toKm + ' km \u58c5\u585e',
          'fa-car-burst'
        ));
      }
      if ((weather.condition || '').indexOf('\u96e8') !== -1 || Number(weather.rainChance) >= 60) {
        alerts.push(conditionAlert(
          section,
          'weather',
          section.roadRef + ' ' + section.fromKm + '-' + section.toKm + ' km ' + (weather.condition || '\u964d\u96e8'),
          'fa-cloud-rain'
        ));
      }
      (section.incidents || []).forEach(function(incident) {
        alerts.push(conditionAlert(
          section,
          'warning',
          section.roadRef + ' \u00b7 ' + (incident.title || '\u9053\u8def\u4e8b\u4ef6'),
          'fa-triangle-exclamation'
        ));
      });
    });
    return alerts.slice(0, 6);
  }

  function renderAlerts(sections) {
    var wrap = Dom.byId('condition-alerts');
    if (!wrap) return;
    wrap.innerHTML = '';
    var alerts = buildAlerts(sections);
    if (!alerts.length) {
      var clear = document.createElement('div');
      clear.className = 'condition-alert weather';
      clear.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>\u76ee\u524d\u5b98\u65b9\u8cc7\u6599\u672a\u986f\u793a\u660e\u986f\u58c5\u585e\u3001\u964d\u96e8\u6216\u9053\u8def\u4e8b\u4ef6\u3002</span>';
      wrap.appendChild(clear);
      return;
    }
    alerts.forEach(function(alert) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'condition-alert ' + (alert.type === 'danger' ? '' : alert.type);
      var icon = document.createElement('i');
      icon.className = 'fa-solid ' + alert.icon;
      var label = document.createElement('span');
      label.textContent = alert.label;
      button.appendChild(icon);
      button.appendChild(label);
      button.addEventListener('click', function() { focusSection(alert.order); });
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
      var item = document.createElement('article');
      item.className = 'condition-section';
      item.dataset.order = section.order;
      item.dataset.level = traffic.level || 'unknown';
      item.tabIndex = 0;

      var order = document.createElement('div');
      order.className = 'condition-order';
      order.textContent = section.order;

      var body = document.createElement('div');
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

      (section.incidents || []).forEach(function(incident) {
        meta.appendChild(createChip(
          'fa-triangle-exclamation',
          (incident.title || '\u9053\u8def\u4e8b\u4ef6') + ' \u00b7 ' + sourceTime(incident.source, incident.updatedAt, incident.lastKnown),
          false
        ));
      });

      body.appendChild(title);
      body.appendChild(meta);

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
    setText('condition-incidents', Number(overall.incidentCount || 0) + ' \u4ef6');
    setText('condition-coverage', Number(overall.coveragePercent || 0) + '%');
    setText('condition-updated', '\u66f4\u65b0 ' + formatUpdatedAt(payload.updatedAt));

    var validationText = currentRoute.validation && currentRoute.validation.rerouted
      ? '\u5df2\u907f\u958b\u7981\u884c\u8def\u6bb5\u4e26\u91cd\u65b0\u9a57\u8b49'
      : '\u5b89\u5168\u8def\u7dda \u00b7 ' + ((currentRoute.validation && currentRoute.validation.rulesVersion) || '--');
    setText('condition-validation', validationText);

    var badge = Dom.byId('condition-source-badge');
    if (badge) {
      badge.classList.toggle('demo', data.dataMode === 'fixture');
      badge.textContent = data.dataMode === 'fixture'
        ? 'DEMO \u793a\u7bc4'
        : (payload.status === 'partial' ? '\u90e8\u5206\u5373\u6642' : '\u5b98\u65b9\u5373\u6642');
    }
    var refresh = Dom.byId('condition-refresh');
    if (refresh) refresh.classList.remove('loading');

    renderAlerts(sections);
    renderTimeline(sections);
    setNavigationLinks();
    renderAppleLegs(false);
    MapMod.drawConditionSections(sections);
    MapMod.drawStartEnd(AppState.routeAllPoints);
    Bus.emit('conditions:updated', data);
  }

  function load(route, forceRefresh) {
    currentRoute = route || currentRoute;
    if (!currentRoute || !currentRoute.routeId) return;
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
    panel.classList.toggle('is-collapsed');
    var icon = Dom.query('#condition-toggle i');
    if (icon) {
      icon.className = panel.classList.contains('is-collapsed')
        ? 'fa-solid fa-chevron-up'
        : 'fa-solid fa-chevron-down';
    }
  }

  function clear() {
    requestVersion += 1;
    currentRoute = null;
    lastRefreshAt = 0;
    setNavigationLinks();
    var panel = Dom.byId('route-conditions-panel');
    if (panel) panel.classList.add('hidden');
    AppState.routeConditions = null;
  }

  function init() {
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

  window.addEventListener('load', init);
})();
