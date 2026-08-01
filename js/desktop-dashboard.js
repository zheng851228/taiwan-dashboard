// Desktop command-center layout, renderer switching, context panels, and
// client-only terrain elevation/playback. No Worker or route response changes.
(function() {
  'use strict';

  var DESKTOP_BREAKPOINT = '(min-width: 1200px)';
  var MAP_PREF_KEY = 'tw_desktop_map_renderer_v1';
  var CAMERA_PREF_KEY = 'tw_desktop_camera_preset_v1';
  var ELEVATION_CACHE_KEY = 'tw_route_elevation_cache_v1';
  var ELEVATION_SOURCE_VERSION = 'mapterhorn-v1';
  var state = {
    desktop: false,
    renderer: null,
    sections: [],
    selectedOrder: null,
    resizeTimer: null,
    playback: { playing: false, distance: 0, lastTime: 0, raf: null, speed: 1 },
    elevation: null,
    pendingTerrainMode: null,
    cameraPreset: Storage.get(CAMERA_PREF_KEY, 'solid')
  };

  var TRAFFIC_LABELS = {
    clear: '順暢',
    slow: '車多',
    congested: '壅塞',
    unknown: '資料不足'
  };

  function isDesktop() {
    return Boolean(window.matchMedia && window.matchMedia(DESKTOP_BREAKPOINT).matches);
  }

  function setVisible(id, visible) {
    var element = Dom.byId(id);
    if (element) element.classList.toggle('hidden', !visible);
  }

  function text(id, value) {
    var element = Dom.byId(id);
    if (element) element.textContent = value === undefined || value === null ? '' : String(value);
  }

  function routeCoordinates() {
    var geometry = AppState.activeRoute && AppState.activeRoute.geometry;
    if (!geometry || !Array.isArray(geometry.coordinates)) return [];
    return geometry.coordinates.map(function(point) { return [Number(point[1]), Number(point[0])]; })
      .filter(function(point) { return Number.isFinite(point[0]) && Number.isFinite(point[1]); });
  }

  function routeLabel() {
    var values = AppState.routeInputValues || [];
    if (values.length >= 2) return values[0] + ' → ' + values[values.length - 1];
    return '尚未規劃路線';
  }

  function syncHeader() {
    text('desktop-route-label', routeLabel());
    var info = AppState.lastRouteInfo;
    text('desktop-route-meta', info ? ('約 ' + info.distance + ' km · 預估 ' + info.duration + ' 分') : '建立路線後顯示距離與預估時間');
    Dom.queryAll('.desktop-vehicle-tab').forEach(function(button) {
      var active = button.dataset.desktopMode === (RouteMod && RouteMod.mode)
        && (button.dataset.desktopMode === 'car' || button.dataset.desktopPlate === (RouteMod && RouteMod.plate));
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function reportConditions(data) {
    var overall = data && data.overall || {};
    var report = AppState.routeReport;
    var route = AppState.activeRoute;
    text('desktop-validation-summary', route && route.validation && route.validation.status === 'safe'
      ? ('安全路線已驗證 · ' + (route.dataMode === 'fixture' ? '示範資料' : 'live'))
      : '尚未完成安全驗證');
    var attention = Dom.byId('desktop-attention-list');
    if (attention) {
      var notes = report && report.riskNotes ? report.riskNotes.slice(0, 4) : [];
      attention.innerHTML = notes.length
        ? notes.map(function(note) { return '<div><i class="fa-solid fa-triangle-exclamation"></i><span>' + escapeHtml(note) + '</span></div>'; }).join('')
        : '<span class="desktop-muted">建立路線後顯示施工、壅塞、降雨與資料不足。</span>';
    }
    text('desktop-section-count', data && data.sections ? data.sections.length + ' 段' : '--');
    text('desktop-camera-count', report ? report.cameraCount + ' 支' : '--');
    text('desktop-traffic-coverage', Number.isFinite(Number(overall.coveragePercent)) ? Number(overall.coveragePercent) + '%' : '--');
    text('desktop-weather-coverage', Number.isFinite(Number(overall.weatherCoveragePercent)) ? Number(overall.weatherCoveragePercent) + '%' : '--');
    text('desktop-source-note', data && data.dataMode === 'fixture'
      ? '示範資料僅供介面測試，不代表即時路況。'
      : '資料來源：TDX、THB、CWA、各縣市 CCTV。灰色資料不足，不代表順暢。');
    text('desktop-support-updated', data && data.updatedAt ? formatUpdatedAt(data.updatedAt) : '--:--:--');
  }

  function eventLabel(incident) {
    return incident && (incident.title || incident.kind || '道路狀況') || '道路狀況';
  }

  function renderContext() {
    var section = state.sections.find(function(item) { return Number(item.order) === Number(state.selectedOrder); });
    if (!section) section = state.sections[0];
    var empty = Dom.byId('desktop-context-empty');
    var content = Dom.byId('desktop-context-content');
    if (!section) {
      if (empty) empty.classList.remove('hidden');
      if (content) content.classList.add('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    var traffic = section.traffic || {};
    var weather = section.weather || {};
    var incidents = section.incidents || [];
    var cameras = section.cameras || [];
    text('desktop-context-road', section.roadRef || section.roadName || '沿途路段');
    text('desktop-context-distance', (section.fromKm || '--') + '–' + (section.toKm || '--') + ' km');
    text('desktop-context-traffic', TRAFFIC_LABELS[traffic.level] || '資料不足');
    text('desktop-context-weather', (weather.condition || '未知') + (weather.temp !== undefined && weather.temp !== null ? ' · ' + weather.temp + '°C' : ''));
    text('desktop-context-events', incidents.length ? incidents.length + ' 件' : '未回報');
    text('desktop-context-cameras', cameras.length ? cameras.length + ' 支' : '未知');
    var alerts = Dom.byId('desktop-context-alerts');
    if (alerts) {
      alerts.innerHTML = incidents.slice(0, 3).map(function(incident) {
        var approximate = incident.locationApproximate || !Number.isFinite(Number(incident.lat)) || !Number.isFinite(Number(incident.lng));
        return '<div class="desktop-context-alert"><i class="fa-solid fa-triangle-exclamation"></i><span>'
          + escapeHtml(eventLabel(incident)) + (approximate ? ' · 位置未提供' : '') + '</span></div>';
      }).join('') || '<div class="desktop-context-ok"><i class="fa-solid fa-circle-info"></i><span>目前選取路段沒有可定位道路事件</span></div>';
    }
    if (state.renderer) state.renderer.focusSection(Number(section.order));
  }

  function renderCctv() {
    var cameras = (window.RouteMod && RouteMod.filteredCams || []).slice();
    var camera = cameras[0];
    var media = Dom.byId('desktop-cctv-media');
    var open = Dom.byId('desktop-cctv-open');
    if (!camera) {
      if (media) media.innerHTML = '<i class="fa-solid fa-camera"></i><span>目前沒有可用的沿線影像</span>';
      text('desktop-cctv-status', '未知');
      text('desktop-cctv-name', '--');
      if (open) open.disabled = true;
      return;
    }
    var safeUrl = safeHttpUrl(camera.url);
    if (media) {
      if (safeUrl) {
        media.innerHTML = '<img alt="' + escapeHtml(camera.name || '沿途 CCTV') + '" src="' + escapeHtml(safeUrl + (safeUrl.indexOf('?') !== -1 ? '&' : '?') + 't=' + Math.floor(Date.now() / 60000)) + '"><span class="desktop-cctv-placeholder">載入影像中</span>';
        var image = media.querySelector('img');
        if (image) {
          image.referrerPolicy = 'no-referrer';
          image.addEventListener('error', function() { media.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>影像暫時無法載入</span>'; });
        }
      } else {
        media.innerHTML = '<i class="fa-solid fa-camera"></i><span>此攝影機沒有影像來源</span>';
      }
    }
    text('desktop-cctv-status', camera.status === 'offline' ? '離線' : '沿線影像');
    text('desktop-cctv-name', camera.name || '沿途攝影機');
    if (open) open.disabled = false;
  }

  function updateDesktopView(data) {
    syncHeader();
    if (data) {
      state.sections = data.sections || [];
      if (state.selectedOrder === null && state.sections.length) state.selectedOrder = state.sections[0].order;
      reportConditions(data);
      renderContext();
      renderCctv();
      if (state.renderer) {
        state.renderer.drawConditionSections(state.sections);
        state.renderer.drawCameras(RouteMod.filteredCams || []);
        state.renderer.drawStartEnd(AppState.routeAllPoints || []);
      }
      if (window.DesktopElevationMod) DesktopElevationMod.refresh();
    }
  }

  function showLegacyMap(legacy) {
    document.body.classList.toggle('desktop-legacy-map', Boolean(legacy));
    setVisible('desktop-map', !legacy && state.desktop);
    var legacyMap = Dom.byId('map');
    if (legacyMap) legacyMap.style.display = legacy || !state.desktop ? 'block' : 'none';
    if (legacy && MapMod.map && MapMod.map.invalidateSize) window.setTimeout(function() { MapMod.map.invalidateSize(); }, 80);
    var setting = Dom.byId('desktop-map-mode-state');
    if (setting) setting.textContent = legacy ? '傳統地圖' : '3D 地形';
    syncCameraControls();
  }

  function cameraLabel(preset) {
    return ({ birdseye: '鳥瞰', solid: '立體', along: '沿路', reset: '重置', custom: '自訂' })[preset] || '視角';
  }

  function syncCameraControls() {
    var button = Dom.byId('desktop-camera-toggle');
    var popover = Dom.byId('desktop-camera-popover');
    var enabled = Boolean(state.renderer && state.renderer.mode === '3d' && !document.body.classList.contains('desktop-legacy-map'));
    if (button) {
      button.disabled = !enabled;
      button.setAttribute('aria-disabled', String(!enabled));
      button.textContent = enabled ? '視角' : '視角（不可用）';
    }
    if (!enabled && popover) {
      popover.classList.add('hidden');
      if (button) button.setAttribute('aria-expanded', 'false');
    }
    var stateEl = Dom.byId('desktop-camera-state');
    if (stateEl) stateEl.textContent = cameraLabel(state.cameraPreset);
    Dom.queryAll('.desktop-camera-preset').forEach(function(item) {
      var active = item.dataset.cameraPreset === state.cameraPreset;
      item.classList.toggle('active', active);
      item.setAttribute('aria-checked', String(active));
    });
  }

  function toggleCameraPopover() {
    var button = Dom.byId('desktop-camera-toggle');
    var popover = Dom.byId('desktop-camera-popover');
    if (!button || !popover || button.disabled) return;
    var next = popover.classList.contains('hidden');
    popover.classList.toggle('hidden', !next);
    button.setAttribute('aria-expanded', String(next));
  }

  function setCameraPreset(preset) {
    if (!state.renderer || state.renderer.mode !== '3d') return;
    var allowedPresets = { birdseye: true, solid: true, along: true, reset: true };
    var selectedPreset = allowedPresets[preset]
      ? preset
      : (Storage.get(CAMERA_PREF_KEY, 'solid') || 'solid');
    var sectionOrder = state.selectedOrder;
    if (state.renderer.setCameraPreset(selectedPreset, { sectionOrder: sectionOrder })) {
      state.cameraPreset = selectedPreset;
      Storage.set(CAMERA_PREF_KEY, selectedPreset);
      syncCameraControls();
    }
    var popover = Dom.byId('desktop-camera-popover');
    var button = Dom.byId('desktop-camera-toggle');
    if (popover) popover.classList.add('hidden');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function destroyRenderer() {
    if (state.renderer) state.renderer.destroy();
    state.renderer = null;
  }

  function enableRenderer() {
    if (!state.desktop) return;
    var preference = Storage.get(MAP_PREF_KEY, 'auto');
    if (preference === 'legacy' || !window.MapRenderer) {
      destroyRenderer();
      showLegacyMap(true);
      return;
    }
    if (state.renderer) {
      showLegacyMap(false);
      state.renderer.resize();
      return;
    }
    showLegacyMap(false);
    var renderer = MapRenderer.create({
      container: 'desktop-map',
      onReady: function(instance) {
        state.renderer = instance;
        state.renderer.setTerrainMode(state.pendingTerrainMode || '3d');
        state.pendingTerrainMode = null;
        var route = routeCoordinates();
        if (route.length) state.renderer.drawRoute(route, RouteMod.mode);
        updateDesktopView(AppState.routeConditions);
        DesktopElevationMod.refresh();
        syncCameraControls();
        if (state.renderer.mode === '3d') state.renderer.setCameraPreset(state.cameraPreset, { duration: 0, sectionOrder: state.selectedOrder });
      },
      onStatus: function(status) {
        if (status === 'terrain-unavailable') {
          var note = Dom.byId('desktop-source-note');
          if (note) note.textContent = '3D 地形暫時無法載入，已切換 2D；路況資料仍可使用。';
          var modeState = Dom.byId('desktop-map-mode-state');
          if (modeState) modeState.textContent = '2D 地圖';
          syncCameraControls();
        }
      },
      onFallback: function() {
        destroyRenderer();
        showLegacyMap(true);
        Toast.show('3D 地圖暫時無法載入，已切換傳統地圖', 4000);
      },
      onCameraState: function(camera) {
        if (!camera || camera.preset === 'custom') {
          state.cameraPreset = 'custom';
        } else {
          state.cameraPreset = camera.preset;
        }
        syncCameraControls();
      }
    });
    renderer.init().catch(function() {});
  }

  function syncViewport() {
    var next = isDesktop();
    if (next === state.desktop) {
      if (next && state.renderer) state.renderer.resize();
      return;
    }
    state.desktop = next;
    if (!next) {
      destroyRenderer();
      document.body.classList.remove('desktop-legacy-map');
      var map = Dom.byId('map');
      if (map) map.style.display = 'block';
      setVisible('desktop-map', false);
      return;
    }
    enableRenderer();
  }

  function toggleSettings() {
    var panel = Dom.byId('desktop-settings-popover');
    var button = Dom.byId('desktop-settings-toggle');
    if (!panel) return;
    var next = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !next);
    if (button) button.setAttribute('aria-expanded', String(next));
  }

  function syncSettings() {
    var clockHidden = UiPrefsMod && UiPrefsMod.isHidden('clockHidden');
    var bannerHidden = UiPrefsMod && UiPrefsMod.isHidden('routeBannerHidden');
    text('desktop-clock-setting-state', clockHidden ? '已隱藏' : '顯示中');
    text('desktop-banner-setting-state', bannerHidden ? '已隱藏' : '顯示中');
    var clockButton = Dom.byId('desktop-clock-setting');
    var bannerButton = Dom.byId('desktop-banner-setting');
    if (clockButton) clockButton.setAttribute('aria-pressed', String(Boolean(clockHidden)));
    if (bannerButton) bannerButton.setAttribute('aria-pressed', String(Boolean(bannerHidden)));
    text('desktop-map-mode-state', Storage.get(MAP_PREF_KEY, 'auto') === 'legacy' ? '傳統地圖' : '3D 地形');
  }

  function bindControls() {
    Dom.onId('desktop-settings-toggle', 'click', toggleSettings);
    Dom.onId('desktop-camera-toggle', 'click', toggleCameraPopover);
    Dom.onAll('.desktop-camera-preset', 'click', function(button) {
      setCameraPreset(button.dataset.cameraPreset);
    });
    Dom.onId('desktop-favorites-toggle', 'click', function() {
      var button = Dom.byId('js-open-favorites');
      if (button) button.click();
    });
    Dom.onId('desktop-open-list', 'click', function() { toggleSettings(); NavMod.go('list'); });
    Dom.onId('desktop-open-tools', 'click', function() { toggleSettings(); NavMod.go('tools'); });
    Dom.onId('desktop-context-open-list', 'click', function() {
      NavMod.go('list');
      window.setTimeout(function() { var search = Dom.byId('js-search'); if (search) search.focus(); }, 80);
    });
    Dom.onId('desktop-cctv-open', 'click', function() {
      NavMod.go('list');
      window.setTimeout(function() { var search = Dom.byId('js-search'); if (search) search.focus(); }, 80);
    });
    Dom.onId('desktop-clock-setting', 'click', function() {
      UiPrefsMod.setHidden('clockHidden', !UiPrefsMod.isHidden('clockHidden'));
      syncSettings();
    });
    Dom.onId('desktop-banner-setting', 'click', function() {
      UiPrefsMod.setHidden('routeBannerHidden', !UiPrefsMod.isHidden('routeBannerHidden'));
      syncSettings();
    });
    Dom.onId('desktop-map-mode-setting', 'click', function() {
      var legacy = Storage.get(MAP_PREF_KEY, 'auto') === 'legacy';
      Storage.set(MAP_PREF_KEY, legacy ? 'auto' : 'legacy');
      syncSettings();
      if (state.desktop) {
        destroyRenderer();
        enableRenderer();
      }
    });
    Dom.onId('desktop-map-2d', 'click', function() {
      state.pendingTerrainMode = '2d';
      if (!state.renderer) {
        Storage.set(MAP_PREF_KEY, 'auto');
        enableRenderer();
      } else {
        state.renderer.setTerrainMode('2d');
        state.pendingTerrainMode = null;
      }
      syncCameraControls();
      Dom.byId('desktop-map-2d').classList.add('active');
      Dom.byId('desktop-map-3d').classList.remove('active');
      text('desktop-map-mode-state', '2D 地圖');
      if (window.DesktopElevationMod) DesktopElevationMod.refresh();
    });
    Dom.onId('desktop-map-3d', 'click', function() {
      state.pendingTerrainMode = '3d';
      if (!state.renderer) {
        Storage.set(MAP_PREF_KEY, 'auto');
        enableRenderer();
      } else {
        state.renderer.setTerrainMode('3d');
        state.pendingTerrainMode = null;
        setCameraPreset(state.cameraPreset || 'solid');
      }
      syncCameraControls();
      Dom.byId('desktop-map-3d').classList.add('active');
      Dom.byId('desktop-map-2d').classList.remove('active');
      text('desktop-map-mode-state', '3D 地形');
      if (window.DesktopElevationMod) DesktopElevationMod.refresh();
    });
    Dom.onId('desktop-map-legacy', 'click', function() {
      Storage.set(MAP_PREF_KEY, 'legacy');
      destroyRenderer();
      showLegacyMap(true);
      syncSettings();
    });
    Dom.onAll('.desktop-vehicle-tab', 'click', function(button) {
      if (RouteMod && RouteMod.setVehicle) RouteMod.setVehicle(button.dataset.desktopMode, button.dataset.desktopPlate || 'white');
    });
    Dom.on(document, 'click', function(event) {
      var panel = Dom.byId('desktop-settings-popover');
      var toggle = Dom.byId('desktop-settings-toggle');
      if (panel && toggle && !panel.contains(event.target) && !toggle.contains(event.target)) {
        panel.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
      }
      var cameraPopover = Dom.byId('desktop-camera-popover');
      var cameraToggle = Dom.byId('desktop-camera-toggle');
      if (cameraPopover && cameraToggle && !cameraPopover.contains(event.target) && !cameraToggle.contains(event.target)) {
        cameraPopover.classList.add('hidden');
        cameraToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function init() {
    bindControls();
    syncSettings();
    state.desktop = isDesktop();
    if (state.desktop) enableRenderer();
    window.addEventListener('resize', function() {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = window.setTimeout(syncViewport, 180);
    });
    Bus.on('route-ui:state', function() { syncHeader(); });
    Bus.on('vehicle:changed', syncHeader);
    Bus.on('route:updated', function() {
      syncHeader();
      if (state.renderer) {
        var route = routeCoordinates();
        state.renderer.drawRoute(route, RouteMod.mode);
        state.renderer.drawCameras(RouteMod.filteredCams || []);
        state.renderer.drawStartEnd(AppState.routeAllPoints || []);
      }
      renderCctv();
      if (window.DesktopElevationMod) DesktopElevationMod.refresh();
    });
    Bus.on('conditions:updated', function(data) { updateDesktopView(data); });
    Bus.on('condition:select', function(order) { state.selectedOrder = Number(order); renderContext(); });
    Bus.on('route:cleared', function() {
      state.sections = [];
      state.selectedOrder = null;
      if (state.renderer) state.renderer.clear();
      reportConditions(null);
      renderContext();
      renderCctv();
      if (window.DesktopElevationMod) DesktopElevationMod.clear();
    });
    Bus.on('filter:changed', function() { if (state.renderer) state.renderer.drawCameras(RouteMod.filteredCams || []); renderCctv(); });
    Bus.on('camera:selected', function(camera) {
      if (camera && state.renderer) state.renderer.focusPoint(camera.lat, camera.lng, 13);
    });
    Bus.on('route-ui:state', syncCameraControls);
    syncHeader();
    syncCameraControls();
  }

  function goHome() {
    if (window.NavMod) NavMod.go('map');
    ['desktop-settings-popover', 'favorites-panel', 'info-panel', 'modal', 'nearby-panel', 'route-camera-strip', 'desktop-camera-popover'].forEach(function(id) {
      var element = Dom.byId(id);
      if (element) {
        element.classList.add('hidden');
        if (id === 'route-camera-strip') element.style.display = 'none';
      }
    });
    var settingsButton = Dom.byId('desktop-settings-toggle');
    var cameraButton = Dom.byId('desktop-camera-toggle');
    if (settingsButton) settingsButton.setAttribute('aria-expanded', 'false');
    if (cameraButton) cameraButton.setAttribute('aria-expanded', 'false');
    if (state.renderer) {
      if (AppState.activeRoute) state.renderer.focusRoute();
      else state.renderer.resetView();
    } else if (window.MapMod && MapMod.focusRoute) {
      MapMod.focusRoute();
    }
  }

  function haversineKm(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad;
    var dLng = (b[1] - a[1]) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function routeCumulative(points) {
    var cumulative = [0];
    for (var i = 1; i < points.length; i += 1) cumulative.push(cumulative[i - 1] + haversineKm(points[i - 1], points[i]));
    return cumulative;
  }

  function pointAtDistance(points, cumulative, distance) {
    if (!points.length) return null;
    if (distance <= 0) return points[0].slice();
    var total = cumulative[cumulative.length - 1];
    if (distance >= total) return points[points.length - 1].slice();
    for (var i = 0; i < cumulative.length - 1; i += 1) {
      if (distance > cumulative[i + 1]) continue;
      var span = cumulative[i + 1] - cumulative[i];
      var ratio = span ? (distance - cumulative[i]) / span : 0;
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * ratio,
        points[i][1] + (points[i + 1][1] - points[i][1]) * ratio
      ];
    }
    return points[points.length - 1].slice();
  }

  function elevationCacheRead(key) {
    var cache = Storage.getJson(ELEVATION_CACHE_KEY, []);
    var hit = cache.find(function(item) { return item.key === key; });
    return hit ? hit.samples : null;
  }

  function elevationCacheWrite(key, samples) {
    var cache = Storage.getJson(ELEVATION_CACHE_KEY, []).filter(function(item) { return item.key !== key; });
    cache.unshift({ key: key, samples: samples, savedAt: Date.now() });
    Storage.setJson(ELEVATION_CACHE_KEY, cache.slice(0, 10));
  }

  function sampleElevation(points, renderer) {
    var cumulative = routeCumulative(points);
    var total = cumulative[cumulative.length - 1];
    var interval = Math.max(0.5, total / 199);
    var samples = [];
    for (var distance = 0; distance <= total + 0.001; distance += interval) {
      samples.push({ distance: Math.min(total, distance), point: pointAtDistance(points, cumulative, distance), elevation: null });
    }
    if (samples[samples.length - 1].distance < total) samples.push({ distance: total, point: points[points.length - 1].slice(), elevation: null });
    if (!renderer || !renderer.map || renderer.mode !== '3d' || typeof renderer.map.queryTerrainElevation !== 'function') return Promise.resolve(samples);
    return Promise.resolve().then(function() {
      samples.forEach(function(sample) {
        var point = sample.point;
        var elevation = renderer.map.queryTerrainElevation([point[1], point[0]]);
        sample.elevation = Number.isFinite(Number(elevation)) ? Number(elevation) : null;
      });
      return samples;
    });
  }

  function renderElevation(samples) {
    var chart = Dom.byId('desktop-elevation-chart');
    var summary = Dom.byId('desktop-elevation-summary');
    if (!chart || !summary) return;
    var valid = samples.filter(function(sample) { return Number.isFinite(sample.elevation); });
    if (valid.length < 2) {
      chart.innerHTML = '<text x="400" y="82" text-anchor="middle" class="desktop-chart-empty">3D 地形資料不足，暫無海拔曲線</text>';
      summary.textContent = '地形資料不足；不將未知高度補成 0。';
      setVisible('desktop-elevation-panel', false);
      return;
    }
    setVisible('desktop-elevation-panel', true);
    var min = Math.min.apply(null, valid.map(function(sample) { return sample.elevation; }));
    var max = Math.max.apply(null, valid.map(function(sample) { return sample.elevation; }));
    var range = Math.max(1, max - min);
    var total = samples[samples.length - 1].distance || 1;
    var polylines = [];
    var current = [];
    samples.forEach(function(sample) {
      if (!Number.isFinite(sample.elevation)) {
        if (current.length > 1) polylines.push(current);
        current = [];
        return;
      }
      current.push((sample.distance / total * 780 + 10).toFixed(1) + ',' + (138 - ((sample.elevation - min) / range * 112)).toFixed(1));
    });
    if (current.length > 1) polylines.push(current);
    var markup = '<defs><linearGradient id="desktop-elevation-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f59e0b" stop-opacity=".36"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></linearGradient></defs>'
      + '<line x1="10" y1="138" x2="790" y2="138" class="desktop-chart-axis" />';
    polylines.forEach(function(line, index) {
      markup += '<polyline points="' + line.join(' ') + '" class="desktop-elevation-line"' + (index === 0 ? '' : ' opacity=".78"') + ' />';
    });
    chart.innerHTML = markup;
    var maxSlope = 0;
    var windowKm = 1;
    samples.forEach(function(sample, index) {
      var prior = index;
      while (prior > 0 && sample.distance - samples[prior].distance < windowKm) prior -= 1;
      if (prior >= 0 && Number.isFinite(sample.elevation) && Number.isFinite(samples[prior].elevation)) {
        var km = sample.distance - samples[prior].distance;
        if (km > 0) maxSlope = Math.max(maxSlope, Math.abs((sample.elevation - samples[prior].elevation) / (km * 1000) * 100));
      }
    });
    summary.textContent = '最低 ' + Math.round(min) + ' m · 最高 ' + Math.round(max) + ' m · 最大估算坡度 ' + maxSlope.toFixed(1) + '%';
  }

  var DesktopElevationMod = {
    refresh: function() {
      var routeId = AppState.activeRoute && AppState.activeRoute.routeId;
      var points = routeCoordinates();
      if (!routeId || points.length < 2 || !state.desktop) { this.clear(); return; }
      var key = routeId + ':' + ELEVATION_SOURCE_VERSION;
      var cached = elevationCacheRead(key);
      if (cached) {
        state.elevation = cached;
        renderElevation(cached);
        return;
      }
      sampleElevation(points, state.renderer).then(function(samples) {
        if (!AppState.activeRoute || AppState.activeRoute.routeId !== routeId) return;
        state.elevation = samples;
        if (samples.some(function(sample) { return Number.isFinite(sample.elevation); })) elevationCacheWrite(key, samples);
        renderElevation(samples);
      });
    },
    clear: function() {
      state.elevation = null;
      setVisible('desktop-elevation-panel', false);
      text('desktop-elevation-summary', '等待地形資料');
      var chart = Dom.byId('desktop-elevation-chart');
      if (chart) chart.innerHTML = '';
      this.stop();
    },
    stop: function() {
      state.playback.playing = false;
      if (state.playback.raf) window.cancelAnimationFrame(state.playback.raf);
      state.playback.raf = null;
      var toggle = Dom.byId('desktop-playback-toggle');
      if (toggle) toggle.innerHTML = '<i class="fa-solid fa-play"></i>';
    },
    setDistance: function(distance) {
      var points = routeCoordinates();
      var cumulative = routeCumulative(points);
      var total = cumulative[cumulative.length - 1] || 0;
      state.playback.distance = Math.max(0, Math.min(total, Number(distance) || 0));
      var ratio = total ? state.playback.distance / total : 0;
      var range = Dom.byId('desktop-playback-range');
      if (range) range.value = String(Math.round(ratio * 1000));
      text('desktop-playback-distance', state.playback.distance.toFixed(1) + ' km / ' + total.toFixed(1) + ' km');
      var point = pointAtDistance(points, cumulative, state.playback.distance);
      if (point && state.renderer) state.renderer.setCursor(point);
      var section = state.sections.find(function(item) {
        var start = Number(item.fromKm);
        var end = Number(item.toKm);
        return Number.isFinite(start) && Number.isFinite(end) && state.playback.distance >= start && state.playback.distance <= end;
      });
      if (section && Number(section.order) !== Number(state.selectedOrder)) {
        state.selectedOrder = Number(section.order);
        renderContext();
      }
    },
    toggle: function() {
      if (state.playback.playing) { this.stop(); return; }
      if (!state.elevation) return;
      state.playback.playing = true;
      state.playback.lastTime = performance.now();
      var toggle = Dom.byId('desktop-playback-toggle');
      if (toggle) toggle.innerHTML = '<i class="fa-solid fa-pause"></i>';
      var self = this;
      function frame(now) {
        if (!state.playback.playing) return;
        var deltaSeconds = Math.min(0.2, Math.max(0, now - state.playback.lastTime) / 1000);
        state.playback.lastTime = now;
        var total = state.elevation[state.elevation.length - 1].distance || 0;
        self.setDistance(state.playback.distance + deltaSeconds * 12 * state.playback.speed);
        if (state.playback.distance >= total) { self.setDistance(total); self.stop(); return; }
        state.playback.raf = window.requestAnimationFrame(frame);
      }
      state.playback.raf = window.requestAnimationFrame(frame);
    }
  };
  window.DesktopElevationMod = DesktopElevationMod;

  function bindPlayback() {
    Dom.onId('desktop-playback-toggle', 'click', function() { DesktopElevationMod.toggle(); });
    Dom.onId('desktop-playback-range', 'input', function(input) {
      var points = routeCoordinates();
      var cumulative = routeCumulative(points);
      DesktopElevationMod.setDistance((Number(input.value) / 1000) * (cumulative[cumulative.length - 1] || 0));
    });
    Dom.onId('desktop-playback-speed', 'change', function(select) { state.playback.speed = Number(select.value) || 1; });
    document.addEventListener('visibilitychange', function() { if (document.visibilityState !== 'visible') DesktopElevationMod.stop(); });
    if (window.matchMedia) {
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (reduced.matches) DesktopElevationMod.stop();
      reduced.addEventListener && reduced.addEventListener('change', function(event) { if (event.matches) DesktopElevationMod.stop(); });
    }
  }

  window.DesktopDashboardMod = {
    state: state,
    init: init,
    getRenderer: function() { return state.renderer; },
    goHome: goHome
  };
  window.addEventListener('load', function() { bindPlayback(); init(); });
})();
