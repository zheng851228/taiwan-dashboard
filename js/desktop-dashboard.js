// Desktop command-center renderer switching, context panels, and
// client-only terrain elevation/playback. No Worker or route response changes.
(function() {
  'use strict';

  var DESKTOP_BREAKPOINT = '(min-width: 1200px)';
  var MAP_PREF_KEY = 'tw_desktop_map_renderer_v1';
  var TERRAIN_PREF_KEY = 'tw_desktop_terrain_mode_v1';
  var BASEMAP_PREF_KEY = 'tw_desktop_basemap_v1';
  var CAMERA_PREF_KEY = 'tw_desktop_camera_preset_v1';
  var LAYOUT_PREF_KEY = 'tw_desktop_layout_v1';
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
    terrainMode: Storage.get(TERRAIN_PREF_KEY, '2d') === '3d' ? '3d' : '2d',
    cameraPreset: Storage.get(CAMERA_PREF_KEY, 'solid'),
    basemap: Storage.get(BASEMAP_PREF_KEY, 'satellite') === 'satellite' ? 'satellite' : 'dark',
    routeCameras: [],
    cctvIndex: 0,
    layout: null
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
    var route = AppState.activeRoute;
    if (route && route.dataMode === 'fixture') return '示範路線';
    if (values.length >= 2) {
      var coordinateOnly = values.slice(0, 2).every(function(value) { return /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(String(value)); });
      return coordinateOnly ? '座標路線' : values[0] + ' → ' + values[values.length - 1];
    }
    if (route && route.geometry && Array.isArray(route.geometry.coordinates)) return '座標路線';
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
    syncCameraCount();
    text('desktop-traffic-coverage', Number.isFinite(Number(overall.coveragePercent)) ? Number(overall.coveragePercent) + '%' : '--');
    text('desktop-weather-coverage', Number.isFinite(Number(overall.weatherCoveragePercent)) ? Number(overall.weatherCoveragePercent) + '%' : '--');
    text('desktop-source-note', data && data.dataMode === 'fixture'
      ? '示範資料僅供介面測試，不代表即時路況。'
      : '資料來源：TDX、THB、CWA、各縣市 CCTV。灰色資料不足，不代表順暢。');
    text('desktop-support-updated', data && data.updatedAt ? formatUpdatedAt(data.updatedAt) : '--:--:--');
    syncDesktopNavigation();
  }

  function syncDesktopNavigation() {
    [['desktop-nav-google', 'nav-google'], ['desktop-nav-apple', 'nav-apple']].forEach(function(pair) {
      var button = Dom.byId(pair[0]);
      var link = Dom.byId(pair[1]);
      if (!button || !link) return;
      button.disabled = link.getAttribute('aria-disabled') === 'true';
    });
  }

  function openDesktopNavigation(linkId) {
    syncDesktopNavigation();
    var link = Dom.byId(linkId);
    if (!link || link.getAttribute('aria-disabled') === 'true') return;
    link.click();
  }

  function timelineSections(sections, limit) {
    var source = Array.isArray(sections) ? sections : [];
    var maximum = Math.max(2, Number(limit) || 6);
    if (source.length <= maximum) return source.slice();
    var selected = [];
    for (var index = 0; index < maximum; index += 1) {
      var sourceIndex = Math.round((index / (maximum - 1)) * (source.length - 1));
      if (selected.indexOf(source[sourceIndex]) === -1) selected.push(source[sourceIndex]);
    }
    return selected;
  }

  function timelinePlaceLabel(value, fallback) {
    var label = String(value || '').trim();
    if (!label || /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(label)) return fallback;
    return label.length > 9 ? label.slice(0, 9) + '…' : label;
  }

  function timelineStopLabel(section, index, total) {
    var inputs = AppState.routeInputValues || [];
    var route = AppState.activeRoute;
    if (index === 0) return timelinePlaceLabel(inputs[0], route && route.dataMode === 'fixture' ? '示範起點' : '起點');
    if (index === total - 1) return timelinePlaceLabel(inputs[inputs.length - 1], route && route.dataMode === 'fixture' ? '示範終點' : '終點');
    return section.roadRef || section.roadName || ('路段 ' + (index + 1));
  }

  function timelineClock(minutesFromNow) {
    var time = new Date(Date.now() + Math.max(0, Number(minutesFromNow) || 0) * 60000);
    return String(time.getHours()).padStart(2, '0') + ':' + String(time.getMinutes()).padStart(2, '0');
  }

  function weatherPresentation(weather) {
    var value = weather || {};
    var condition = String(value.condition || '未知');
    var temperature = Number(value.temperatureC !== undefined ? value.temperatureC : value.temp);
    var rainChance = Number(value.rainChance);
    var rainy = /雨|雷|陣雨/.test(condition) || (Number.isFinite(rainChance) && rainChance >= 40);
    var sunny = /晴/.test(condition) && !rainy;
    var icon = rainy ? 'fa-cloud-rain' : (sunny ? 'fa-sun' : 'fa-cloud');
    var className = rainy ? 'is-rainy' : (sunny ? 'is-sunny' : 'is-cloudy');
    var label = Number.isFinite(temperature) ? Math.round(temperature) + '°C' : condition;
    if (rainy && Number.isFinite(rainChance)) label += ' · ' + Math.round(rainChance) + '%';
    var title = condition + (Number.isFinite(rainChance) ? ' · 降雨 ' + Math.round(rainChance) + '%' : '');
    return { icon: icon, className: className, label: label, title: title };
  }

  function renderRouteIntelligence(data) {
    var panel = Dom.byId('desktop-route-intelligence');
    var stops = Dom.byId('desktop-route-stops');
    var band = Dom.byId('desktop-traffic-band');
    var weatherTrack = Dom.byId('desktop-weather-track');
    var sections = data && data.sections || [];
    if (!panel || !stops || !band || !weatherTrack) return;
    if (!sections.length) {
      panel.classList.add('hidden');
      stops.innerHTML = band.innerHTML = weatherTrack.innerHTML = '';
      return;
    }
    panel.classList.remove('hidden');
    var visible = timelineSections(sections, 6);
    var totalKm = sections.reduce(function(maximum, section) {
      return Math.max(maximum, Number(section.toKm) || 0);
    }, 0);
    var totalMinutes = Number(AppState.lastRouteInfo && AppState.lastRouteInfo.duration)
      || Number(AppState.activeRoute && AppState.activeRoute.durationMinutes)
      || 0;
    stops.style.setProperty('--desktop-stop-count', String(Math.max(1, visible.length)));
    weatherTrack.style.setProperty('--desktop-stop-count', String(Math.max(1, visible.length)));
    stops.innerHTML = visible.map(function(section, index) {
      var road = timelineStopLabel(section, index, visible.length);
      var sectionKm = index === 0 ? 0 : Number(section.toKm);
      var distance = Number.isFinite(sectionKm) ? Math.round(sectionKm) + ' km' : '--';
      var ratio = totalKm > 0 && Number.isFinite(sectionKm) ? sectionKm / totalKm : 0;
      var active = Number(section.order) === Number(state.selectedOrder) ? ' active' : '';
      return '<button type="button" class="desktop-route-stop' + active + '" data-section-order="' + Number(section.order) + '"><strong>'
        + escapeHtml(road) + '</strong><span class="desktop-stop-time">' + escapeHtml(timelineClock(totalMinutes * ratio))
        + '</span><span class="desktop-stop-distance">' + escapeHtml(distance) + '</span></button>';
    }).join('');
    band.innerHTML = sections.map(function(section) {
      var level = section.traffic && section.traffic.level || 'unknown';
      var from = Number(section.fromKm);
      var to = Number(section.toKm);
      var width = Number.isFinite(from) && Number.isFinite(to) && to > from ? Math.max(4, to - from) : 1;
      return '<span class="desktop-traffic-segment is-' + escapeHtml(level) + '" style="flex:' + width.toFixed(2) + '" title="' + escapeHtml(TRAFFIC_LABELS[level] || '資料不足') + '"></span>';
    }).join('');
    weatherTrack.innerHTML = visible.map(function(section) {
      var weather = weatherPresentation(section.weather);
      return '<span class="' + weather.className + '" title="' + escapeHtml(weather.title) + '"><i class="fa-solid '
        + weather.icon + '"></i>' + escapeHtml(weather.label) + '</span>';
    }).join('');
    Dom.queryAll('.desktop-route-stop').forEach(function(button) {
      button.addEventListener('click', function() { state.selectedOrder = Number(button.dataset.sectionOrder); renderContext(); renderRouteIntelligence(data); });
    });
  }

  function eventLabel(incident) {
    return incident && (incident.title || incident.kind || '道路狀況') || '道路狀況';
  }

  function renderContext(focusMap) {
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
    state.cctvIndex = 0;
    if (focusMap !== false && state.renderer) state.renderer.focusSection(Number(section.order));
    renderCctv();
  }

  function normalizeCamera(camera) {
    if (!camera) return null;
    return Object.assign({}, camera, {
      id: String(camera.id || (camera.lat + ':' + camera.lng + ':' + (camera.imageUrl || camera.cam_url || camera.url || ''))),
      url: camera.url || camera.imageUrl || camera.cam_url || '',
      type: camera.type || 'cctv'
    });
  }

  function uniqueCameras(cameras) {
    var seen = {};
    return (cameras || []).map(normalizeCamera).filter(function(camera) {
      if (!camera || seen[camera.id]) return false;
      seen[camera.id] = true;
      return true;
    });
  }

  function routeCameras() {
    var globalRouteCameras = state.routeCameras.slice();
    var conditionCameras = state.sections.reduce(function(result, section) {
      return result.concat(section.cameras || []);
    }, []);
    return uniqueCameras(conditionCameras.concat(globalRouteCameras));
  }

  function syncCameraCount() {
    var hasRoute = Boolean(AppState.activeRoute);
    var count = hasRoute ? routeCameras().length : 0;
    text('desktop-camera-count', hasRoute ? count + ' 支' : '--');
    var routeStatus = Dom.byId('js-route-status');
    if (hasRoute && routeStatus && /^安全驗證完成/.test(routeStatus.textContent || '')) {
      routeStatus.textContent = count > 0
        ? '安全驗證完成 · ' + count + ' 支沿途現場畫面'
        : '安全驗證完成 · 沿途暫無現場畫面';
    }
    return count;
  }

  function renderCctv() {
    var allCameras = routeCameras();
    var selected = state.sections.find(function(item) { return Number(item.order) === Number(state.selectedOrder); });
    var preferred = selected && selected.cameras || [];
    var cameras = uniqueCameras(preferred.concat(allCameras));
    if (state.cctvIndex >= cameras.length) state.cctvIndex = 0;
    var camera = cameras[state.cctvIndex];
    var media = Dom.byId('desktop-cctv-media');
    var open = Dom.byId('desktop-cctv-open');
    var prev = Dom.byId('desktop-cctv-prev');
    var next = Dom.byId('desktop-cctv-next');
    if (!camera) {
      if (media) media.innerHTML = '<i class="fa-solid fa-camera"></i><span>目前沒有可用的沿線影像</span>';
      text('desktop-cctv-status', '未知');
      text('desktop-cctv-name', '--');
      if (open) open.disabled = true;
      if (prev) prev.disabled = true;
      if (next) next.disabled = true;
      return;
    }
    var safeUrl = safeHttpUrl(camera.url || camera.imageUrl || camera.cam_url);
    if (media) {
      if (safeUrl) {
        media.innerHTML = '<img alt="' + escapeHtml(camera.name || '沿途 CCTV') + '" referrerpolicy="no-referrer" src="' + escapeHtml(safeUrl + (safeUrl.indexOf('?') !== -1 ? '&' : '?') + 't=' + Math.floor(Date.now() / 60000)) + '"><span class="desktop-cctv-placeholder">載入影像中</span>';
        var image = media.querySelector('img');
        if (image) {
          var markReady = function() {
            if (!media.contains(image)) return;
            var placeholder = media.querySelector('.desktop-cctv-placeholder');
            if (placeholder) placeholder.remove();
          };
          image.addEventListener('load', markReady, { once: true });
          image.addEventListener('error', function() {
            if (media.contains(image)) media.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>影像暫時無法載入</span>';
          }, { once: true });
          if (image.complete && image.naturalWidth > 0) markReady();
        }
      } else {
        media.innerHTML = '<i class="fa-solid fa-camera"></i><span>此攝影機沒有影像來源</span>';
      }
    }
    text('desktop-cctv-status', camera.status === 'offline' ? '離線' : '沿線影像');
    text('desktop-cctv-name', (camera.name || '沿途攝影機') + ' · ' + (state.cctvIndex + 1) + '/' + cameras.length);
    if (open) open.disabled = false;
    if (prev) prev.disabled = cameras.length < 2;
    if (next) next.disabled = cameras.length < 2;
  }

  function updateDesktopView(data) {
    syncHeader();
    if (data) {
      state.sections = data.sections || [];
      if (state.selectedOrder === null && state.sections.length) state.selectedOrder = state.sections[0].order;
      reportConditions(data);
      renderRouteIntelligence(data);
      renderContext(false);
      renderCctv();
      if (state.renderer) {
        state.renderer.resize();
        var route = routeCoordinates();
        if (route.length) state.renderer.drawRoute(route, RouteMod.mode);
        state.renderer.drawConditionSections(state.sections);
        state.renderer.drawCameras(routeCameras());
        state.renderer.drawStartEnd(AppState.routeAllPoints || []);
      }
      DesktopElevationMod.refresh();
    }
  }

  function showLegacyMap(legacy) {
    document.body.classList.toggle('desktop-legacy-map', Boolean(legacy));
    setVisible('desktop-map', !legacy && state.desktop);
    var legacyMap = Dom.byId('map');
    if (legacyMap) legacyMap.style.display = legacy || !state.desktop ? 'block' : 'none';
    if (legacy) window.setTimeout(function() { Bus.emit('map:request', { action: 'invalidate-size' }); }, 80);
    var setting = Dom.byId('desktop-map-mode-state');
    if (setting) setting.textContent = legacy ? '傳統地圖' : (state.terrainMode === '3d' ? '3D 地形' : '2D 地圖');
    syncCameraControls();
  }

  function syncTerrainControls() {
    var mode = state.renderer && state.renderer.mode || state.pendingTerrainMode || state.terrainMode;
    var twoD = Dom.byId('desktop-map-2d');
    var threeD = Dom.byId('desktop-map-3d');
    if (twoD) {
      twoD.classList.toggle('active', mode === '2d');
      twoD.setAttribute('aria-pressed', String(mode === '2d'));
    }
    if (threeD) {
      threeD.classList.toggle('active', mode === '3d');
      threeD.setAttribute('aria-pressed', String(mode === '3d'));
    }
    if (Storage.get(MAP_PREF_KEY, 'auto') !== 'legacy') text('desktop-map-mode-state', mode === '3d' ? '3D 地形' : '2D 地圖');
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
      basemap: state.basemap,
      terrainMode: state.pendingTerrainMode || state.terrainMode,
      onReady: function(instance) {
        state.renderer = instance;
        state.terrainMode = state.pendingTerrainMode || state.terrainMode;
        state.renderer.setTerrainMode(state.terrainMode);
        Storage.set(TERRAIN_PREF_KEY, state.terrainMode);
        state.pendingTerrainMode = null;
        var route = routeCoordinates();
        if (route.length) state.renderer.drawRoute(route, RouteMod.mode);
        state.renderer.drawCameras(routeCameras());
        state.renderer.drawStartEnd(AppState.routeAllPoints || []);
        state.basemap = state.renderer.getBasemap();
        Storage.set(BASEMAP_PREF_KEY, state.basemap);
        updateDesktopView(AppState.routeConditions);
        DesktopElevationMod.refresh();
        syncTerrainControls();
        syncCameraControls();
        if (state.renderer.mode === '3d') state.renderer.setCameraPreset(state.cameraPreset, { duration: 0, sectionOrder: state.selectedOrder });
      },
      onStatus: function(status) {
        if (status === 'terrain-unavailable') {
          state.terrainMode = '2d';
          Storage.set(TERRAIN_PREF_KEY, '2d');
          var note = Dom.byId('desktop-source-note');
          if (note) note.textContent = '3D 地形暫時無法載入，已切換 2D；路況資料仍可使用。';
          syncTerrainControls();
          syncCameraControls();
        }
        if (status === 'basemap-unavailable') {
          state.basemap = 'dark';
          Storage.set(BASEMAP_PREF_KEY, 'dark');
          syncSettings();
          Toast.show('衛星底圖暫時無法載入，已切回深色地圖', 3000);
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
    text('desktop-map-mode-state', Storage.get(MAP_PREF_KEY, 'auto') === 'legacy' ? '傳統地圖' : (state.terrainMode === '3d' ? '3D 地形' : '2D 地圖'));
    text('desktop-basemap-setting-state', state.basemap === 'satellite' ? '衛星底圖' : '深色地圖');
    text('desktop-layout-setting-state', Storage.getJson(LAYOUT_PREF_KEY, null) ? '已自訂' : '可拖曳調整');
  }

  function toggleBasemap() {
    var next = state.basemap === 'satellite' ? 'dark' : 'satellite';
    state.basemap = next;
    Storage.set(BASEMAP_PREF_KEY, next);
    if (state.renderer) {
      var actual = state.renderer.setBasemap(next);
      if (actual !== next) {
        state.basemap = actual;
        Storage.set(BASEMAP_PREF_KEY, actual);
        Toast.show('衛星底圖目前不可用，已使用深色地圖', 3000);
      }
    }
    syncSettings();
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
    Dom.onId('desktop-open-list', 'click', function() { toggleSettings(); Bus.emit('navigation:request', { page: 'list' }); });
    Dom.onId('desktop-open-tools', 'click', function() { toggleSettings(); Bus.emit('navigation:request', { page: 'tools' }); });
    Dom.onId('desktop-context-open-list', 'click', function() {
      Bus.emit('navigation:request', { page: 'list' });
      window.setTimeout(function() { var search = Dom.byId('js-search'); if (search) search.focus(); }, 80);
    });
    Dom.onId('desktop-cctv-open', 'click', function() {
      Bus.emit('navigation:request', { page: 'list' });
      window.setTimeout(function() { var search = Dom.byId('js-search'); if (search) search.focus(); }, 80);
    });
    Dom.onId('desktop-cctv-prev', 'click', function() {
      var count = routeCameras().length;
      if (count < 2) return;
      state.cctvIndex = (state.cctvIndex - 1 + count) % count;
      renderCctv();
    });
    Dom.onId('desktop-cctv-next', 'click', function() {
      var count = routeCameras().length;
      if (count < 2) return;
      state.cctvIndex = (state.cctvIndex + 1) % count;
      renderCctv();
    });
    Dom.onId('desktop-condition-info-toggle', 'click', function(event) {
      var popover = Dom.byId('desktop-condition-info-popover');
      if (!popover) return;
      var open = popover.classList.contains('hidden');
      if (open) syncDesktopNavigation();
      popover.classList.toggle('hidden', !open);
      if (!open) {
        var appleLegs = Dom.byId('apple-leg-links');
        if (appleLegs) appleLegs.classList.add('hidden');
      }
      event.currentTarget.setAttribute('aria-expanded', String(open));
    });
    Dom.onId('desktop-nav-google', 'click', function() { openDesktopNavigation('nav-google'); });
    Dom.onId('desktop-nav-apple', 'click', function() { openDesktopNavigation('nav-apple'); });
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
    Dom.onId('desktop-basemap-setting', 'click', toggleBasemap);
    Dom.onId('desktop-map-basemap', 'click', toggleBasemap);
    Dom.onId('desktop-map-2d', 'click', function() {
      state.terrainMode = '2d';
      Storage.set(TERRAIN_PREF_KEY, '2d');
      state.pendingTerrainMode = '2d';
      if (!state.renderer) {
        Storage.set(MAP_PREF_KEY, 'auto');
        enableRenderer();
      } else {
        state.renderer.setTerrainMode('2d');
        state.pendingTerrainMode = null;
      }
      syncTerrainControls();
      syncCameraControls();
      DesktopElevationMod.refresh();
    });
    Dom.onId('desktop-map-3d', 'click', function() {
      state.terrainMode = '3d';
      Storage.set(TERRAIN_PREF_KEY, '3d');
      state.pendingTerrainMode = '3d';
      if (!state.renderer) {
        Storage.set(MAP_PREF_KEY, 'auto');
        enableRenderer();
      } else {
        state.renderer.setTerrainMode('3d');
        state.pendingTerrainMode = null;
        setCameraPreset(state.cameraPreset || 'solid');
      }
      syncTerrainControls();
      syncCameraControls();
      DesktopElevationMod.refresh();
    });
    Dom.onId('desktop-map-legacy', 'click', function() {
      Storage.set(MAP_PREF_KEY, 'legacy');
      destroyRenderer();
      showLegacyMap(true);
      syncSettings();
    });
    Dom.onAll('.desktop-vehicle-tab', 'click', function(button) {
      Bus.emit('route:request', { action: 'set-vehicle', mode: button.dataset.desktopMode, plate: button.dataset.desktopPlate || 'white' });
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
    Bus.on('route:updated', function(payload) {
      state.routeCameras = (payload && payload.cams || []).slice();
      syncHeader();
      state.cctvIndex = 0;
      syncCameraCount();
      if (state.renderer) {
        var route = routeCoordinates();
        state.renderer.drawRoute(route, RouteMod.mode);
        state.renderer.drawCameras(routeCameras());
        state.renderer.drawStartEnd(AppState.routeAllPoints || []);
      }
      renderCctv();
      DesktopElevationMod.refresh();
    });
    Bus.on('conditions:updated', function(data) { updateDesktopView(data); });
    Bus.on('condition:select', function(order) {
      state.selectedOrder = Number(order);
      renderContext();
      renderRouteIntelligence(AppState.routeConditions);
    });
    Bus.on('route:cleared', function() {
      state.routeCameras = [];
      state.sections = [];
      state.selectedOrder = null;
      state.cctvIndex = 0;
      if (state.renderer) state.renderer.clear();
      reportConditions(null);
      renderContext();
      renderCctv();
      DesktopElevationMod.clear();
    });
    Bus.on('filter:changed', function() {
      syncCameraCount();
      if (state.renderer) state.renderer.drawCameras(routeCameras());
      renderCctv();
    });
    Bus.on('camera:selected', function(camera) {
      if (camera && state.renderer) state.renderer.focusPoint(camera.lat, camera.lng, 13);
    });
    Bus.on('route-cursor:change', function(event) {
      if (event && event.sectionOrder !== null && Number(event.sectionOrder) !== Number(state.selectedOrder)) {
        state.selectedOrder = Number(event.sectionOrder);
        renderRouteIntelligence(AppState.routeConditions);
        renderCctv();
      }
    });
    Bus.on('route-ui:state', syncCameraControls);
    syncHeader();
    syncTerrainControls();
    syncCameraControls();
  }

  function goHome() {
    Bus.emit('navigation:request', { page: 'map' });
    ['desktop-settings-popover', 'desktop-condition-info-popover', 'favorites-panel', 'info-panel', 'modal', 'nearby-panel', 'route-camera-strip', 'desktop-camera-popover'].forEach(function(id) {
      var element = Dom.byId(id);
      if (element) {
        element.classList.add('hidden');
        if (id === 'route-camera-strip') element.style.display = 'none';
      }
    });
    var settingsButton = Dom.byId('desktop-settings-toggle');
    var cameraButton = Dom.byId('desktop-camera-toggle');
    var conditionInfoButton = Dom.byId('desktop-condition-info-toggle');
    if (settingsButton) settingsButton.setAttribute('aria-expanded', 'false');
    if (cameraButton) cameraButton.setAttribute('aria-expanded', 'false');
    if (conditionInfoButton) conditionInfoButton.setAttribute('aria-expanded', 'false');
    if (state.renderer) {
      if (AppState.activeRoute) state.renderer.focusRoute();
      else state.renderer.resetView();
    } else {
      Bus.emit('map:request', { action: 'focus-route' });
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
      setVisible('desktop-elevation-panel', true);
      return;
    }
    setVisible('desktop-elevation-panel', true);
    var min = Math.min.apply(null, valid.map(function(sample) { return sample.elevation; }));
    var max = Math.max.apply(null, valid.map(function(sample) { return sample.elevation; }));
    var range = Math.max(1, max - min);
    var total = samples[samples.length - 1].distance || 1;
    var chartLeft = 60;
    var chartRight = 790;
    var chartTop = 18;
    var chartBottom = 136;
    var chartWidth = chartRight - chartLeft;
    var chartHeight = chartBottom - chartTop;
    var polylines = [];
    var current = [];
    samples.forEach(function(sample) {
      if (!Number.isFinite(sample.elevation)) {
        if (current.length > 1) polylines.push(current);
        current = [];
        return;
      }
      current.push((sample.distance / total * chartWidth + chartLeft).toFixed(1) + ','
        + (chartBottom - ((sample.elevation - min) / range * chartHeight)).toFixed(1));
    });
    if (current.length > 1) polylines.push(current);
    var markup = '<defs>'
      + '<linearGradient id="desktop-elevation-stroke" x1="0" x2="1" y1="0" y2="0">'
      + '<stop offset="0" stop-color="#52b788"/><stop offset=".34" stop-color="#facc15"/>'
      + '<stop offset=".58" stop-color="#ef5350"/><stop offset=".78" stop-color="#f59e0b"/>'
      + '<stop offset="1" stop-color="#52b788"/></linearGradient>'
      + '<linearGradient id="desktop-elevation-fill" x1="0" x2="0" y1="0" y2="1">'
      + '<stop offset="0" stop-color="#f97316" stop-opacity=".28"/><stop offset="1" stop-color="#f97316" stop-opacity="0"/>'
      + '</linearGradient></defs>';
    [0, .33, .66, 1].forEach(function(position) {
      var y = chartTop + chartHeight * position;
      var value = max - range * position;
      markup += '<line x1="' + chartLeft + '" y1="' + y.toFixed(1) + '" x2="' + chartRight + '" y2="' + y.toFixed(1) + '" class="desktop-chart-axis" />'
        + '<text x="52" y="' + (y + 3).toFixed(1) + '" text-anchor="end" class="desktop-chart-label">' + Math.round(value).toLocaleString() + '</text>';
    });
    polylines.forEach(function(line, index) {
      var firstX = line[0].split(',')[0];
      var lastX = line[line.length - 1].split(',')[0];
      markup += '<polygon points="' + firstX + ',' + chartBottom + ' ' + line.join(' ') + ' ' + lastX + ',' + chartBottom + '" class="desktop-elevation-area"' + (index === 0 ? '' : ' opacity=".7"') + ' />';
      markup += '<polyline points="' + line.join(' ') + '" class="desktop-elevation-line"' + (index === 0 ? '' : ' opacity=".78"') + ' />';
    });
    var peak = valid.reduce(function(best, sample) { return sample.elevation > best.elevation ? sample : best; }, valid[0]);
    var peakX = peak.distance / total * chartWidth + chartLeft;
    var peakY = chartBottom - ((peak.elevation - min) / range * chartHeight);
    markup += '<circle cx="' + peakX.toFixed(1) + '" cy="' + peakY.toFixed(1) + '" r="4" class="desktop-chart-peak" />'
      + '<text x="' + peakX.toFixed(1) + '" y="' + Math.max(11, peakY - 8).toFixed(1) + '" text-anchor="middle" class="desktop-chart-peak-label">' + Math.round(peak.elevation).toLocaleString() + ' m</text>';
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
      Bus.emit('route-cursor:change', {
        distanceKm: state.playback.distance,
        ratio: ratio,
        point: point,
        sectionOrder: section ? Number(section.order) : null
      });
      var stops = Dom.byId('desktop-route-stops');
      if (stops) Dom.queryAll('.desktop-route-stop').forEach(function(stop) { stop.classList.toggle('active', Number(stop.dataset.sectionOrder) === Number(state.selectedOrder)); });
    },
    toggle: function() {
      if (state.playback.playing) { this.stop(); return; }
      var points = routeCoordinates();
      if (points.length < 2) return;
      state.playback.playing = true;
      state.playback.lastTime = performance.now();
      var toggle = Dom.byId('desktop-playback-toggle');
      if (toggle) toggle.innerHTML = '<i class="fa-solid fa-pause"></i>';
      var self = this;
      function frame(now) {
        if (!state.playback.playing) return;
        var deltaSeconds = Math.min(0.2, Math.max(0, now - state.playback.lastTime) / 1000);
        state.playback.lastTime = now;
        var currentPoints = routeCoordinates();
        var currentTotal = routeCumulative(currentPoints);
        var total = currentTotal[currentTotal.length - 1] || 0;
        self.setDistance(state.playback.distance + deltaSeconds * 12 * state.playback.speed);
        if (state.playback.distance >= total) { self.setDistance(total); self.stop(); return; }
        state.playback.raf = window.requestAnimationFrame(frame);
      }
      state.playback.raf = window.requestAnimationFrame(frame);
    }
  };

  function bindPlayback() {
    Dom.onId('desktop-playback-toggle', 'click', function() { DesktopElevationMod.toggle(); });
    Dom.onId('desktop-playback-range', 'input', function(event) {
      var points = routeCoordinates();
      var cumulative = routeCumulative(points);
      DesktopElevationMod.setDistance((Number(event.currentTarget.value) / 1000) * (cumulative[cumulative.length - 1] || 0));
    });
    Dom.onId('desktop-playback-speed', 'change', function(event) { state.playback.speed = Number(event.currentTarget.value) || 1; });
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
    getLayout: function() {
      if (window.DesktopLayoutMod && DesktopLayoutMod.getLayout) return DesktopLayoutMod.getLayout();
      return state.layout ? { left: state.layout.left, right: state.layout.right, bottom: state.layout.bottom } : null;
    },
    resetLayout: function() { if (window.DesktopLayoutMod) DesktopLayoutMod.reset(); },
    goHome: goHome
  };
  function bootDesktopDashboard() {
    bindPlayback();
    init();
  }
  if (document.readyState === 'loading') window.addEventListener('load', bootDesktopDashboard);
  else bootDesktopDashboard();
})();
