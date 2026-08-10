// Main UI modules for map, route, list, modal, and app boot.

(function() {
  'use strict';

  var THEME_KEY = 'tw_theme';
  var ROUTE_BTN_IDLE_TEXT = '\u{1F50D} \u5efa\u7acb\u5b89\u5168\u8def\u7dda';
  var REGION_LABELS = {
    north: '\u5317\u90e8',
    central: '\u4e2d\u90e8',
    south: '\u5357\u90e8',
    east: '\u6771\u90e8',
    island: '\u96e2\u5cf6'
  };
  var SEARCH_HINTS = {
    all: ['北宜', '西濱', '蘇花', '南迴', '台3線', '台61線'],
    north: ['北宜', '台7線', '台7乙', '淡金', '北海岸', '雪隧'],
    central: ['台3線', '台14甲', '清境', '日月潭', '139縣道', '中橫'],
    south: ['台1線', '182縣道', '阿里山', '墾丁', '南橫', '台26線'],
    east: ['花蓮', '台東', '太魯閣', '蘇花', '台11線', '南迴'],
    island: ['澎湖', '金門', '馬祖', '機場', '港', '車站']
  };
  var RIDE_ROUTE_CHIPS = [
    '北宜公路', '台61線', '蘇花公路', '南迴公路', '台14甲', '北橫公路', '182縣道', '淡金公路'
  ];
  var UI_PREF_KEYS = {
    clockHidden: 'tw_ui_clock_hidden_v1',
    routeBannerHidden: 'tw_ui_route_banner_hidden_v1'
  };
  function setFlexVisible(el, isVisible) {
    if (!el) return;
    el.classList.toggle('hidden', !isVisible);
    el.classList.toggle('flex', !!isVisible);
  }

  var RouteUiMod = {
    state: 'empty',
    setState: function(nextState) {
      var allowed = { empty: true, analyzing: true, ready: true };
      var next = allowed[nextState] ? nextState : 'empty';
      RouteUiMod.state = next;
      if (document.body) document.body.dataset.routeState = next;
      var routeToggle = Dom.byId('route-toggle');
      if (routeToggle) routeToggle.textContent = next === 'ready' ? '\u8abf\u6574' : '\u8f38\u5165\u8d77\u7d42\u9ede';
      Bus.emit('route-ui:state', next);
    },
    getState: function() {
      return RouteUiMod.state;
    }
  };
  window.RouteUiMod = RouteUiMod;

  var UiPrefsMod = {
    isHidden: function(kind) {
      return Storage.get(UI_PREF_KEYS[kind], '0') === '1';
    },
    setHidden: function(kind, isHidden) {
      Storage.set(UI_PREF_KEYS[kind], isHidden ? '1' : '0');
      UiPrefsMod.sync();
    },
    syncSettingButton: function(id, stateId, isHidden) {
      var button = Dom.byId(id);
      var state = Dom.byId(stateId);
      if (button) button.setAttribute('aria-pressed', String(isHidden));
      if (state) state.textContent = isHidden ? '已隱藏' : '顯示中';
    },
    sync: function() {
      var clockHidden = UiPrefsMod.isHidden('clockHidden');
      var routeBannerHidden = UiPrefsMod.isHidden('routeBannerHidden');
      if (document.body) {
        document.body.classList.toggle('ui-clock-hidden', clockHidden);
        document.body.classList.toggle('ui-route-banner-hidden', routeBannerHidden);
      }
      UiPrefsMod.syncSettingButton('js-clock-setting', 'js-clock-setting-state', clockHidden);
      UiPrefsMod.syncSettingButton('js-route-banner-setting', 'js-route-banner-setting-state', routeBannerHidden);
    },
    init: function() {
      Dom.onId('js-clock-hide', 'click', function() { UiPrefsMod.setHidden('clockHidden', true); });
      Dom.onId('js-rb-hide', 'click', function() { UiPrefsMod.setHidden('routeBannerHidden', true); });
      Dom.onId('js-clock-setting', 'click', function() {
        UiPrefsMod.setHidden('clockHidden', !UiPrefsMod.isHidden('clockHidden'));
      });
      Dom.onId('js-route-banner-setting', 'click', function() {
        UiPrefsMod.setHidden('routeBannerHidden', !UiPrefsMod.isHidden('routeBannerHidden'));
      });
      UiPrefsMod.sync();
    }
  };
  window.UiPrefsMod = UiPrefsMod;

  var ThemeMod = {
    dark: Storage.get(THEME_KEY, 'dark') !== 'light',
    init: function() {
      Dom.onId('js-theme', 'click', function() { ThemeMod.toggle(); });
    },
    toggle: function() {
      ThemeMod.dark = !ThemeMod.dark;
      var btn = Dom.byId('js-theme');
      if (ThemeMod.dark) {
        document.body.classList.remove('light');
        if (btn) btn.textContent = '\u{1F319}';
        MapMod.setTile(Config.TILE_DARK);
        Storage.set(THEME_KEY, 'dark');
      } else {
        document.body.classList.add('light');
        if (btn) btn.textContent = '\u2600\uFE0F';
        MapMod.setTile(Config.TILE_LIGHT);
        Storage.set(THEME_KEY, 'light');
      }
    }
  };

  var ClockMod = {
    init: function() {
      var clk = Dom.byId('js-clk');
      function tick() {
        var n = new Date();
        var h = String(n.getHours()).padStart(2,'0');
        var m = String(n.getMinutes()).padStart(2,'0');
        var s = String(n.getSeconds()).padStart(2,'0');
        var desktopClock = window.matchMedia && window.matchMedia('(min-width: 1200px)').matches;
        if (clk) clk.textContent = desktopClock ? h+':'+m : h+':'+m+':'+s;
      }
      tick(); setInterval(tick, 1000);
    }
  };

  var NavMod = {
    init: function() {
      Bus.on('navigation:request', function(request) {
        var page = request && request.page;
        if (['map','list','tools'].indexOf(page) !== -1) NavMod.go(page);
      });
      ['map','list','tools'].forEach(function(k) {
        Dom.onId('nav-' + k, 'click', function() { NavMod.go(k); });
      });
    },
    go: function(key) {
      ['map','list','tools'].forEach(function(k) {
        var pg  = Dom.byId('pg-'+k);
        var btn = Dom.byId('nav-'+k);
        if (pg)  pg.classList.toggle('active', k === key);
        if (btn) {
          btn.classList.toggle('active', k === key);
          btn.classList.toggle('text-slate-500', k !== key);
        }
      });
      if (key === 'map') setTimeout(function() { MapMod.map && MapMod.map.invalidateSize(); }, 50);
    }
  };

  var ROUTE_EVENT_CUE_HALF_METERS = 300;
  var ROUTE_EVENT_CUE_MAX_OFFSET_METERS = 750;

  function routeDistanceMeters(start, end) {
    var referenceLat = ((Number(start[0]) + Number(end[0])) / 2) * Math.PI / 180;
    var deltaX = (Number(end[1]) - Number(start[1])) * 111320 * Math.cos(referenceLat);
    var deltaY = (Number(end[0]) - Number(start[0])) * 110540;
    return Math.hypot(deltaX, deltaY);
  }

  function routePointAtDistance(latlngs, cumulative, distance) {
    if (distance <= 0) return latlngs[0].slice();
    var total = cumulative[cumulative.length - 1];
    if (distance >= total) return latlngs[latlngs.length - 1].slice();
    for (var index = 0; index < cumulative.length - 1; index += 1) {
      if (distance > cumulative[index + 1]) continue;
      var span = cumulative[index + 1] - cumulative[index];
      var ratio = span > 0 ? (distance - cumulative[index]) / span : 0;
      return [
        latlngs[index][0] + (latlngs[index + 1][0] - latlngs[index][0]) * ratio,
        latlngs[index][1] + (latlngs[index + 1][1] - latlngs[index][1]) * ratio
      ];
    }
    return latlngs[latlngs.length - 1].slice();
  }

  function projectEventOntoRoute(latlngs, eventPoint) {
    var referenceLat = Number(eventPoint[0]) * Math.PI / 180;
    var scaleX = 111320 * Math.cos(referenceLat);
    var scaleY = 110540;
    var cumulative = [0];
    var best = null;
    for (var index = 0; index < latlngs.length - 1; index += 1) {
      var start = latlngs[index];
      var end = latlngs[index + 1];
      var segmentMeters = routeDistanceMeters(start, end);
      cumulative.push(cumulative[cumulative.length - 1] + segmentMeters);
      if (!segmentMeters) continue;
      var startX = (start[1] - eventPoint[1]) * scaleX;
      var startY = (start[0] - eventPoint[0]) * scaleY;
      var endX = (end[1] - eventPoint[1]) * scaleX;
      var endY = (end[0] - eventPoint[0]) * scaleY;
      var deltaX = endX - startX;
      var deltaY = endY - startY;
      var squaredLength = deltaX * deltaX + deltaY * deltaY;
      var ratio = squaredLength
        ? Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / squaredLength))
        : 0;
      var projectedX = startX + ratio * deltaX;
      var projectedY = startY + ratio * deltaY;
      var offsetMeters = Math.hypot(projectedX, projectedY);
      if (!best || offsetMeters < best.offsetMeters) {
        best = {
          offsetMeters: offsetMeters,
          distanceAlong: cumulative[index] + segmentMeters * ratio
        };
      }
    }
    if (best) best.cumulative = cumulative;
    return best;
  }

  function routeEventCueGeometry(latlngs, eventPoint) {
    var projection = projectEventOntoRoute(latlngs, eventPoint);
    if (!projection || projection.offsetMeters > ROUTE_EVENT_CUE_MAX_OFFSET_METERS) return [];
    var total = projection.cumulative[projection.cumulative.length - 1];
    if (!Number.isFinite(total) || total <= 0) return [];
    var startDistance = Math.max(0, projection.distanceAlong - ROUTE_EVENT_CUE_HALF_METERS);
    var endDistance = Math.min(total, projection.distanceAlong + ROUTE_EVENT_CUE_HALF_METERS);
    var cue = [routePointAtDistance(latlngs, projection.cumulative, startDistance)];
    for (var index = 1; index < latlngs.length - 1; index += 1) {
      if (projection.cumulative[index] > startDistance && projection.cumulative[index] < endDistance) {
        cue.push(latlngs[index].slice());
      }
    }
    cue.push(routePointAtDistance(latlngs, projection.cumulative, endDistance));
    return cue;
  }

  var mapTestActions = [];
  var mapTestProbeEnabled = false;

  function recordMapTestAction(action, detail) {
    if (!mapTestProbeEnabled) return;
    mapTestActions.push(Object.assign({ action: action }, detail || {}));
  }

  function mapTestSnapshot() {
    var center = MapMod.map && MapMod.map.getCenter ? MapMod.map.getCenter() : null;
    var nearbyCenter = MapMod._nearbyMarker && MapMod._nearbyMarker.getLatLng
      ? MapMod._nearbyMarker.getLatLng()
      : null;
    var routeLayers = Array.isArray(MapMod.routeLayer)
      ? MapMod.routeLayer
      : (MapMod.routeLayer ? [MapMod.routeLayer] : []);
    var incidentCues = MapMod.routeIncidentLayers
      .filter(function(layer) { return layer && layer._roadEventLocationCue; })
      .map(function(layer) {
        return {
          kind: layer._roadEventKind || null,
          impact: layer._roadEventImpact || null,
          status: layer._roadEventStatus || null,
          color: layer.options && layer.options.color || null,
          dashArray: layer.options && layer.options.dashArray || null,
          points: layer.getLatLngs ? layer.getLatLngs().length : 0
        };
      });
    return {
      ready: Boolean(MapMod.map),
      tileUrl: MapMod.tileLayer && MapMod.tileLayer._url || null,
      center: center ? [center.lat, center.lng] : null,
      zoom: MapMod.map && MapMod.map.getZoom ? MapMod.map.getZoom() : null,
      routeLayerCount: routeLayers.length,
      routeLayerAttached: Boolean(MapMod.map) && routeLayers.length > 0
        ? routeLayers.every(function(layer) { return MapMod.map.hasLayer(layer); })
        : false,
      routeSectionLayerCount: MapMod.routeSectionLayers.length,
      routeIncidentLayerCount: MapMod.routeIncidentLayers.length,
      routeIncidentMarkerCount: MapMod.routeIncidentMarkers.length,
      routeWeatherMarkerCount: MapMod.routeWeatherMarkers.length,
      startEndMarkerCount: MapMod.startEndMarkers.length,
      nearbyMarkerCenter: nearbyCenter ? [nearbyCenter.lat, nearbyCenter.lng] : null,
      nearbyRadius: MapMod._nearbyCircle && MapMod._nearbyCircle.getRadius
        ? MapMod._nearbyCircle.getRadius()
        : null,
      nearbyCleared: MapMod._nearbyMarker === null && MapMod._nearbyCircle === null,
      waypointStateCount: Array.isArray(AppState.waypointMapMarkers) ? AppState.waypointMapMarkers.length : 0,
      testWaypointAttached: Boolean(
        MapMod.map
        && window.__mapTestWaypointMarker
        && MapMod.map.hasLayer(window.__mapTestWaypointMarker)
      ),
      incidentCues: incidentCues
    };
  }

  function installMapTestProbe() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('e2e') !== '1') return;
    mapTestProbeEnabled = true;
    window.__MapTestProbe = Object.freeze({
      snapshot: mapTestSnapshot,
      clearActions: function() { mapTestActions = []; },
      actions: function() { return mapTestActions.map(function(item) { return Object.assign({}, item); }); },
      createWaypointMarker: function(center) {
        var lat = Array.isArray(center) ? Number(center[0]) : NaN;
        var lng = Array.isArray(center) ? Number(center[1]) : NaN;
        if (!MapMod.map || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        if (window.__mapTestWaypointMarker && MapMod.map.hasLayer(window.__mapTestWaypointMarker)) {
          MapMod.map.removeLayer(window.__mapTestWaypointMarker);
        }
        window.__mapTestWaypointMarker = L.marker([lat, lng]).addTo(MapMod.map);
        AppState.waypointMapMarkers = [window.__mapTestWaypointMarker];
        return true;
      }
    });
  }

  var MapMod = {
    map: null, tileLayer: null, markers: [], placeLabelMarkers: [], routeLayer: null,
    routeSectionLayers: [], routeWeatherMarkers: [], routeIncidentMarkers: [], routeIncidentLayers: [],
    startEndMarkers: [], _canvas: null, _camData: [], _markerSignature: '',
    _nearbyMarker: null, _nearbyCircle: null,
    init: function() {
      MapMod.map = L.map('map', {
        center: Config.MAP_CENTER, zoom: Config.MAP_ZOOM,
        zoomControl: false,
        preferCanvas: true   // 強制 canvas 渲染，iOS 效能大幅提升
      });
      MapMod._canvas = L.canvas({ padding: 0.5 });
      MapMod.tileLayer = L.tileLayer(Config.TILE_DARK, { attribution: Config.TILE_ATTR, maxZoom: 19 }).addTo(MapMod.map);
      MapMod.addPlaceLabels();
      Bus.on('map:request', function(request) {
        var action = request && request.action;
        if (action === 'invalidate-size') {
          if (MapMod.map && MapMod.map.invalidateSize) MapMod.map.invalidateSize();
          recordMapTestAction('invalidate-size');
          return;
        }
        if (action === 'focus-route') {
          MapMod.focusRoute();
          recordMapTestAction('focus-route');
          return;
        }
        if (action === 'nearby-overlay-upsert') {
          var nearbyCenter = request && request.center;
          var nearbyLat = Array.isArray(nearbyCenter) ? Number(nearbyCenter[0]) : NaN;
          var nearbyLng = Array.isArray(nearbyCenter) ? Number(nearbyCenter[1]) : NaN;
          var radiusMeters = Number(request && request.radiusMeters);
          if (!MapMod.map || !Number.isFinite(nearbyLat) || !Number.isFinite(nearbyLng)) return;
          if (MapMod._nearbyMarker) MapMod.map.removeLayer(MapMod._nearbyMarker);
          if (MapMod._nearbyCircle) MapMod.map.removeLayer(MapMod._nearbyCircle);
          var nearbyIcon = L.divIcon({
            className: '',
            html: '<div style="position:relative;width:20px;height:20px">'
              + '<div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.3;animation:ping 1.5s ease-in-out infinite"></div>'
              + '<div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 8px #3b82f6"></div>'
              + '</div>',
            iconSize: [20,20], iconAnchor: [10,10]
          });
          MapMod._nearbyMarker = L.marker([nearbyLat, nearbyLng], { icon: nearbyIcon })
            .addTo(MapMod.map).bindTooltip('📍 我的位置', { direction:'top', permanent: false });
          MapMod._nearbyCircle = L.circle([nearbyLat, nearbyLng], {
            radius: Number.isFinite(radiusMeters) ? Math.max(0, radiusMeters) : 0,
            color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.05, weight: 1.5, dashArray: '6,4'
          }).addTo(MapMod.map);
          return;
        }
        if (action === 'nearby-overlay-radius') {
          var nextRadius = Number(request && request.radiusMeters);
          if (MapMod._nearbyCircle && Number.isFinite(nextRadius) && nextRadius >= 0) MapMod._nearbyCircle.setRadius(nextRadius);
          return;
        }
        if (action === 'nearby-overlay-clear') {
          if (MapMod.map && MapMod._nearbyMarker) MapMod.map.removeLayer(MapMod._nearbyMarker);
          if (MapMod.map && MapMod._nearbyCircle) MapMod.map.removeLayer(MapMod._nearbyCircle);
          MapMod._nearbyMarker = null;
          MapMod._nearbyCircle = null;
          return;
        }
        if (action === 'clear-waypoint-overlays') {
          if (MapMod.map && Array.isArray(AppState.waypointMapMarkers)) {
            AppState.waypointMapMarkers.forEach(function(marker) { MapMod.map.removeLayer(marker); });
          }
          AppState.waypointMapMarkers = [];
          return;
        }
        if (action === 'draw-route') {
          var routeCoords = request && request.coords;
          if (!Array.isArray(routeCoords) || routeCoords.length < 2) return;
          MapMod.drawRoute(routeCoords, request && request.mode);
          recordMapTestAction('draw-route', { mode: request && request.mode, points: routeCoords.length });
          return;
        }
        if (action === 'draw-start-end') {
          MapMod.drawStartEnd(request && request.points);
          recordMapTestAction('draw-start-end');
          return;
        }
        if (action === 'focus-camera') {
          var camera = request && request.camera;
          if (!camera) return;
          MapMod.focusCam(camera);
          recordMapTestAction('focus-camera');
          return;
        }
        if (action === 'draw-condition-sections') {
          var conditionSections = request && request.sections;
          if (!Array.isArray(conditionSections)) return;
          MapMod.drawConditionSections(conditionSections);
          recordMapTestAction('draw-condition-sections', { sections: conditionSections.length });
          return;
        }
        if (action === 'focus-section') {
          var sectionOrder = Number(request && request.order);
          if (!Number.isFinite(sectionOrder)) return;
          MapMod.focusSection(sectionOrder);
          recordMapTestAction('focus-section', { order: sectionOrder });
          return;
        }
        if (action === 'set-view') {
          var center = request && request.center;
          var lat = Array.isArray(center) ? Number(center[0]) : NaN;
          var lng = Array.isArray(center) ? Number(center[1]) : NaN;
          var zoom = Number(request && request.zoom);
          if (!MapMod.map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
          var appliedZoom = Number.isFinite(zoom) ? zoom : MapMod.map.getZoom();
          MapMod.map.setView([lat, lng], appliedZoom);
          recordMapTestAction('set-view', { center: [lat, lng], zoom: appliedZoom });
        }
      });
    },
    addPlaceLabels: function() {
      if (!MapMod.map || !Array.isArray(Config.MAP_LABELS)) return;
      var pane = MapMod.map.getPane('place-labels') || MapMod.map.createPane('place-labels');
      pane.style.zIndex = 350;
      MapMod.placeLabelMarkers.forEach(function(marker) { MapMod.map.removeLayer(marker); });
      MapMod.placeLabelMarkers = Config.MAP_LABELS.map(function(item) {
        var icon = L.divIcon({
          className: 'local-map-place-label',
          html: '<span>' + escapeHtml(item[0]) + '</span>',
          iconSize: [48, 24],
          iconAnchor: [24, 12]
        });
        return L.marker([item[1], item[2]], {
          icon: icon,
          pane: 'place-labels',
          interactive: false,
          keyboard: false
        }).addTo(MapMod.map);
      });
    },
    setTile: function(url) { if (MapMod.tileLayer) MapMod.tileLayer.setUrl(url); },
    clearMarkers: function() {
      MapMod.markers.forEach(function(m) { MapMod.map.removeLayer(m); });
      MapMod.markers = [];
      MapMod._camData = [];
      MapMod._markerSignature = '';
      setTimeout(function() { MapMod.redrawStartEnd(); }, 0);
    },
    addMarker: function(cam) {
      var color, radius;
      if (cam.type === 'youtube') {
        color = '#ff0000'; radius = 8;
      } else {
        radius = 6;
        var cat = cam.cat || (cam.id && cam.id.charAt(0) === 'n' ? 'highway' : 'provincial');
        if (cat === 'highway')         color = '#3b82f6';
        else if (cat === 'expressway') color = '#a855f7';
        else if (cat === 'scenic')     color = '#22c55e';
        else if (cat === 'city')       color = '#f59e0b';
        else                           color = '#f97316';
      }
      var marker = L.circleMarker([cam.lat, cam.lng], {
        renderer:    MapMod._canvas,
        radius:      radius,
        color:       'rgba(255,255,255,0.6)',
        weight:      1.5,
        fillColor:   color,
        fillOpacity: 0.95
      }).addTo(MapMod.map);
      marker.on('click', function() { InfoMod.open(cam); });
      // tooltip 只在縮放夠大時顯示（避免大量 DOM）
      if (MapMod.map.getZoom() >= 12) {
        marker.bindTooltip(escapeHtml(cam.name), { direction:'top', offset:[0,-6] });
      }
      MapMod.markers.push(marker);
      MapMod._camData.push(cam);
    },
    focusCam: function(cam) {
      if (!cam || !MapMod.map) return;
      MapMod.map.setView([Number(cam.lat), Number(cam.lng)], 14);
      InfoMod.open(cam);
    },
    drawRoute: function(coords, mode) {
      MapMod.clearRoute();
      if (!coords || coords.length < 2) return;
      var latlngs = coords.map(function(c) { return [c[0], c[1]]; });
      var isMoto = (mode !== 'car');
      // 主色：機車橘漸層感 / 汽車藍
      var mainColor  = isMoto ? '#f97316' : '#3b82f6';
      var glowColor  = isMoto ? '#fb923c' : '#60a5fa';
      var coreColor  = isMoto ? '#fff7ed' : '#eff6ff';

      // 三層：底層（光暈）→ 中層（主色）→ 頂層（亮芯）
      var glow = L.polyline(latlngs, {
        color: glowColor, weight: 10, opacity: 0.18, lineCap: 'round', lineJoin: 'round'
      }).addTo(MapMod.map);
      var main = L.polyline(latlngs, {
        color: mainColor, weight: 5, opacity: 1.0, lineCap: 'round', lineJoin: 'round'
      }).addTo(MapMod.map);
      var core = L.polyline(latlngs, {
        color: coreColor, weight: 1.5, opacity: 0.55, lineCap: 'round', lineJoin: 'round'
      }).addTo(MapMod.map);

      MapMod.routeLayer = [glow, main, core];
      var bounds = main.getBounds();
      MapMod.map.fitBounds(bounds, { padding: [40, 40] });
    },
    drawConditionSections: function(sections) {
      MapMod.clearRoute();
      if (!sections || !sections.length) return;
      var colors = {
        clear: '#22c55e',
        slow: '#facc15',
        congested: '#ef4444',
        unknown: '#94a3b8'
      };
      var bounds = [];
      sections.forEach(function(section) {
        var latlngs = (section.geometry || []).map(function(point) {
          return [Number(point[0]), Number(point[1])];
        }).filter(function(point) { return isFinite(point[0]) && isFinite(point[1]); });
        if (latlngs.length < 2) return;
        bounds = bounds.concat(latlngs);
        var level = section.traffic && section.traffic.level ? section.traffic.level : 'unknown';
        var color = colors[level] || colors.unknown;
        var glow = L.polyline(latlngs, {
          color: color, weight: 11, opacity: 0.18, lineCap: 'round', lineJoin: 'round', interactive: false
        }).addTo(MapMod.map);
        var line = L.polyline(latlngs, {
          color: color, weight: 6, opacity: 0.96, lineCap: 'round', lineJoin: 'round'
        }).addTo(MapMod.map);
        line._conditionOrder = section.order;
        line.on('click', function() { Bus.emit('condition:select', section.order); });
        MapMod.routeSectionLayers.push(glow, line);

        var locatedIncidents = (section.incidents || []).filter(function(incident) {
          return !incident.locationApproximate
            && incident.lat !== null && incident.lat !== undefined && incident.lat !== ''
            && incident.lng !== null && incident.lng !== undefined && incident.lng !== ''
            && Number.isFinite(Number(incident.lat)) && Number.isFinite(Number(incident.lng));
        });
        var incidentGroups = [];
        var incidentGroupsByPoint = new Map();
        locatedIncidents.forEach(function(incident) {
          var pointKey = Number(incident.lat).toFixed(5) + ':' + Number(incident.lng).toFixed(5);
          if (!incidentGroupsByPoint.has(pointKey)) {
            var group = { incidents: [], lat: Number(incident.lat), lng: Number(incident.lng) };
            incidentGroupsByPoint.set(pointKey, group);
            incidentGroups.push(group);
          }
          incidentGroupsByPoint.get(pointKey).incidents.push(incident);
        });
        incidentGroups.slice(0, 3).forEach(function(group, groupIndex) {
          var primaryEvent = window.getPrimaryRoadEvent
            ? window.getPrimaryRoadEvent(group.incidents)
            : null;
          if (!primaryEvent) return;
          var eventView = primaryEvent.presentation;
          var incidentPoint = [group.lat, group.lng];
          var hiddenLocationCount = groupIndex === 0 ? Math.max(0, incidentGroups.length - 3) : 0;
          var markerBadge = group.incidents.length > 1
            ? String(group.incidents.length)
            : (hiddenLocationCount ? '+' + hiddenLocationCount : '');
          var eventLabel = (section.roadRef || section.roadName || '沿途路段') + ' ' + eventView.label
            + (group.incidents.length > 1 ? '，同位置 ' + group.incidents.length + ' 件' : '')
            + (hiddenLocationCount ? '，另有 ' + hiddenLocationCount + ' 個事件位置' : '');
          if (eventView.impact !== 'no_impact') {
            var cueLatLngs = routeEventCueGeometry(latlngs, incidentPoint);
            if (cueLatLngs.length >= 2) {
              var cueDashArray = eventView.status === 'scheduled'
                ? '10 8'
                : (eventView.status === 'last_known' ? '2 7' : null);
              var cueOpacity = eventView.status === 'last_known' ? 0.62 : 0.96;
              var cueOutline = L.polyline(cueLatLngs, {
                color: '#0f172a',
                weight: 12,
                opacity: 0.78,
                dashArray: cueDashArray,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false
              }).addTo(MapMod.map);
              var cueLine = L.polyline(cueLatLngs, {
                color: eventView.mapColor || '#f59e0b',
                weight: 8,
                opacity: cueOpacity,
                dashArray: cueDashArray,
                lineCap: 'round',
                lineJoin: 'round'
              }).addTo(MapMod.map);
              cueOutline._conditionOrder = section.order;
              cueOutline._roadEventOutline = true;
              cueLine._conditionOrder = section.order;
              cueLine._roadEventKind = eventView.kind;
              cueLine._roadEventImpact = eventView.impact;
              cueLine._roadEventStatus = eventView.status;
              cueLine._roadEventLocationCue = true;
              cueLine.on('click', function() { Bus.emit('condition:select', section.order); });
              cueLine.bindTooltip(
                escapeHtml(eventLabel + '；彩色短線為事件位置提示，不代表官方影響範圍'),
                { direction: 'top', sticky: true }
              );
              MapMod.routeIncidentLayers.push(cueOutline, cueLine);
            }
          }
          var eventIcon = L.divIcon({
            className: 'route-incident-marker',
            html: '<div class="route-incident-pin road-event-' + eventView.kind
              + ' road-impact-' + eventView.impact
              + (eventView.status === 'scheduled' ? ' is-scheduled' : '')
              + '" aria-label="' + escapeHtml(eventLabel) + '"><i class="fa-solid '
              + eventView.icon + '"></i>' + (markerBadge ? '<span>' + markerBadge + '</span>' : '') + '</div>',
            iconSize: [markerBadge ? 42 : 30, 30],
            iconAnchor: [markerBadge ? 21 : 15, 15]
          });
          var eventMarker = L.marker(incidentPoint, {
            icon: eventIcon,
            zIndexOffset: 7600,
            title: eventLabel,
            alt: eventLabel,
            keyboard: true
          }).addTo(MapMod.map);
          eventMarker.on('click', function() { Bus.emit('condition:select', section.order); });
          eventMarker.bindTooltip(escapeHtml(eventLabel), { direction: 'top', offset: [0, -16] });
          MapMod.routeIncidentMarkers.push(eventMarker);
        });

        var weather = section.weather || {};
        if ((weather.condition || '').indexOf('雨') !== -1 || Number(weather.rainChance) >= 60) {
          var middle = latlngs[Math.floor(latlngs.length * 0.62)];
          var icon = L.divIcon({
            className: 'route-weather-marker',
            html: '<div class="route-weather-pin" aria-label="降雨提醒"><i class="fa-solid fa-cloud-rain"></i></div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          MapMod.routeWeatherMarkers.push(L.marker(middle, { icon: icon, zIndexOffset: 7000 }).addTo(MapMod.map));
        }
      });
      MapMod.routeLayer = MapMod.routeSectionLayers;
      if (bounds.length) MapMod.map.fitBounds(bounds, { padding: [42, 42] });
    },
    focusSection: function(order) {
      var layer = MapMod.routeSectionLayers.find(function(candidate) {
        return candidate._conditionOrder === Number(order);
      });
      if (!layer || !layer.getBounds) return;
      MapMod.map.fitBounds(layer.getBounds(), { padding: [70, 70], maxZoom: 14 });
    },
    focusRoute: function() {
      if (!MapMod.map) return;
      var points = (RouteMod.routeCoords || []).filter(function(point) {
        return point && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
      });
      if (points.length >= 2) {
        MapMod.map.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 11 });
      } else {
        MapMod.map.setView(Config.MAP_CENTER, Config.MAP_ZOOM);
      }
    },
    clearRoute: function() {
      if (MapMod.routeLayer) {
        if (Array.isArray(MapMod.routeLayer)) {
          MapMod.routeLayer.forEach(function(l) { MapMod.map.removeLayer(l); });
        } else {
          MapMod.map.removeLayer(MapMod.routeLayer);
        }
        MapMod.routeLayer = null;
      }
      MapMod.routeSectionLayers = [];
      MapMod.routeWeatherMarkers.forEach(function(marker) { MapMod.map.removeLayer(marker); });
      MapMod.routeWeatherMarkers = [];
      MapMod.routeIncidentLayers.forEach(function(layer) { MapMod.map.removeLayer(layer); });
      MapMod.routeIncidentLayers = [];
      MapMod.routeIncidentMarkers.forEach(function(marker) { MapMod.map.removeLayer(marker); });
      MapMod.routeIncidentMarkers = [];
    },
    drawStartEnd: function(pts) {
      MapMod.startEndMarkers.forEach(function(m) { MapMod.map.removeLayer(m); });
      MapMod.startEndMarkers = [];
      if (!pts || pts.length < 2) return;
      pts.forEach(function(pt, i) {
        var isFirst = (i === 0);
        var isLast  = (i === pts.length - 1);
        if (!isFirst && !isLast) return;
        var bg    = isFirst ? '#22c55e' : '#ef4444';
        var label = isFirst ? '起' : '終';
        var sz    = 20;
        var html  = '<div style="text-align:center;pointer-events:none;">'
          + '<div style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;background:' + bg + ';border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.7);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#fff;font-family:sans-serif;">' + label + '</div>'
          + '</div>';
        var icon = L.divIcon({
          className: '',
          html: html,
          iconSize:   [sz, sz],
          iconAnchor: [sz/2, sz/2]
        });
        var m = L.marker([pt[0], pt[1]], { icon: icon, zIndexOffset: 9000 }).addTo(MapMod.map);
        MapMod.startEndMarkers.push(m);
      });
    },
    redrawStartEnd: function() {
      var pts = AppState.routeAllPoints;
      if (pts && pts.length >= 2) {
        MapMod.drawStartEnd(pts);
      }
    }
  };

  var InfoMod = {
    current: null,
    init: function() {
      Dom.onId('info-close', 'click', function() { InfoMod.close(); });
      Dom.onId('info-play', 'click', function() {
        if (InfoMod.current) ModalMod.open(InfoMod.current);
      });
    },
    open: function(cam) {
      InfoMod.current = cam;
      var panel     = Dom.byId('info-panel');
      var nameEl    = Dom.byId('info-name');
      var countyEl  = Dom.byId('info-county');
      var typeEl    = Dom.byId('info-type');
      var weatherEl = Dom.byId('info-weather');
      var thumbEl   = Dom.byId('info-thumb');
      var playBtn   = Dom.byId('info-play');
      if (!panel) return;
      if (nameEl)   nameEl.textContent   = cam.name;
      if (countyEl) countyEl.textContent = '\u{1F4CD} ' + cam.county;
      if (typeEl)   typeEl.textContent   = cam.type === 'youtube' ? '\u{1F534} YouTube \u76f4\u64ad' : '\u{1F4F7} CCTV \u651d\u5f71\u6a5f';
      var w = Data.weather[cam.county];
      if (weatherEl) {
        if (w) {
          var _wIcon = '';
          if (w.weather) {
            if (w.weather.indexOf('\u96e8')!==-1) _wIcon='\ud83c\udf27\ufe0f';
            else if (w.weather.indexOf('\u6674')!==-1) _wIcon='\u2600\ufe0f';
            else if (w.weather.indexOf('\u96f2')!==-1) _wIcon='\u26c5';
            else _wIcon='\ud83c\udf21\ufe0f';
          }
          var tempStr = (w.temp !== undefined && w.temp !== null && w.temp !== '--') ? (w.temp + '\u00B0C') : '--';
          weatherEl.textContent = _wIcon + ' ' + tempStr + '  ' + (w.weather||'');
        } else {
          if (Data.weatherState === 'error') {
            weatherEl.textContent = '\u26a0\ufe0f \u5929\u6c23\u8cc7\u6599\u66ab\u6642\u7121\u6cd5\u8f09\u5165';
          } else if (Data.weatherState === 'empty') {
            weatherEl.textContent = '\ud83c\udf21\ufe0f \u66ab\u7121\u5929\u6c23\u8cc7\u6599';
          } else {
            weatherEl.textContent = '\ud83d\udca8 \u5929\u6c23\u8cc7\u6599\u8f09\u5165\u4e2d...';
          }
        }
      }
      // 縮圖預覽
      if (thumbEl) {
        thumbEl.classList.add('visible');
        var thumbSrc = '';
        if (cam.type === 'youtube' && cam.videoId) {
          thumbSrc = 'https://img.youtube.com/vi/' + cam.videoId + '/mqdefault.jpg';
        } else if (safeHttpUrl(cam.url)) {
          var safeThumbUrl = safeHttpUrl(cam.url);
          thumbSrc = safeThumbUrl + (safeThumbUrl.indexOf('?') !== -1 ? '&' : '?') + 't=' + Math.floor(Date.now()/30000);
        }
        if (thumbSrc) {
          thumbEl.innerHTML = '<div class="ph"><i class="fa-solid fa-spinner fa-spin"></i></div><img alt="" />';
          var imgNode = thumbEl.querySelector('img');
          if (imgNode) imgNode.referrerPolicy = 'no-referrer';
          imgNode.onload = function() {
            imgNode.style.opacity = '1';
            var ph = thumbEl.querySelector('.ph');
            if (ph) ph.style.display = 'none';
          };
          imgNode.onerror = function() {
            thumbEl.innerHTML = '<div class="ph"><i class="fa-solid fa-triangle-exclamation"></i></div>';
          };
          imgNode.src = thumbSrc;
        } else {
          thumbEl.innerHTML = '<div class="ph"><i class="fa-solid fa-camera"></i></div>';
        }
      }
      if (playBtn) {
        playBtn.textContent = cam.type === 'youtube' ? '\u25B6 \u958b\u555f YouTube' : '\u25B6 \u958b\u555f\u5f71\u50cf';
        playBtn.style.display = (cam.url || cam.videoId) ? 'block' : 'none';
      }
      panel.classList.remove('hidden');
      panel.classList.add('flex');
      Bus.emit('camera:selected', cam);
    },
    close: function() {
      var panel = Dom.byId('info-panel');
      if (panel) { panel.classList.add('hidden'); panel.classList.remove('flex'); }
      var thumbEl = Dom.byId('info-thumb');
      if (thumbEl) thumbEl.classList.remove('visible');
      InfoMod.current = null;
    }
  };

  var RouteMod = {
    active: false, filteredCams: [], routeCoords: [],
    mode: 'motorcycle', plate: 'white', analyzing: false, analysisVersion: 0,
    setAnalyzeBusy: function(isBusy) {
      RouteMod.analyzing = !!isBusy;
      var btn = Dom.byId('js-route-btn');
      if (!btn) return;
      btn.disabled = !!isBusy;
      btn.classList.toggle('loading', !!isBusy);
      btn.textContent = isBusy ? '\u5206\u6790\u4e2d\u2026' : ROUTE_BTN_IDLE_TEXT;
    },
    setVehicle: function(mode, plate) {
      RouteMod.mode = mode === 'car' ? 'car' : 'motorcycle';
      if (RouteMod.mode === 'motorcycle') RouteMod.plate = plate || 'white';
      Dom.queryAll('.route-mode-btn').forEach(function(button) {
        var active = button.dataset.mode === RouteMod.mode
          && (RouteMod.mode === 'car' || button.dataset.plate === RouteMod.plate);
        button.classList.toggle('active', active);
      });
      Dom.queryAll('.desktop-vehicle-tab').forEach(function(button) {
        var active = button.dataset.desktopMode === RouteMod.mode
          && (RouteMod.mode === 'car' || button.dataset.desktopPlate === RouteMod.plate);
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      Bus.emit('vehicle:changed', { mode: RouteMod.mode, plate: RouteMod.plate });
    },
    updateRouteUi: function(cameraCount) {
      var count = cameraCount || 0;
      var copy = window.RouteSummaryModel.routeUiCopy(count, AppState.lastRouteInfo, RouteMod.mode);
      var st = Dom.byId('js-route-status');
      var banner = Dom.byId('js-route-banner');
      var info = Dom.byId('js-list-route-info');
      var cnt = Dom.byId('js-list-route-count');
      var summary = Dom.byId('route-summary');
      if (st) st.textContent = copy.statusText;
      setFlexVisible(banner, !UiPrefsMod.isHidden('routeBannerHidden'));
      setFlexVisible(info, true);
      if (cnt) cnt.textContent = copy.listCountText;
      if (summary && copy.summaryText) {
        summary.textContent = copy.summaryText;
        summary.classList.remove('hidden');
      }
      Bus.emit('route:updated', {
        cameraCount: count,
        routeInfo: AppState.lastRouteInfo,
        cams: RouteMod.filteredCams.slice()
      });
    },
    clearRouteUi: function() {
      var startEl = Dom.byId('js-route-start');
      var endEl = Dom.byId('js-route-end');
      var st = Dom.byId('js-route-status');
      var banner = Dom.byId('js-route-banner');
      var info = Dom.byId('js-list-route-info');
      var summary = Dom.byId('route-summary');
      if (startEl) {
        startEl.value = '';
        delete startEl.dataset.routePoint;
        delete startEl.dataset.routePointLabel;
      }
      if (endEl) {
        endEl.value = '';
        delete endEl.dataset.routePoint;
        delete endEl.dataset.routePointLabel;
      }
      if (st) st.textContent = '';
      setFlexVisible(banner, false);
      setFlexVisible(info, false);
      if (summary) {
        summary.textContent = '';
        summary.classList.add('hidden');
      }
    },
    init: function() {
      Dom.onAll('.route-mode-btn', 'click', function(btn) {
          RouteMod.setVehicle(btn.dataset.mode, btn.dataset.plate || RouteMod.plate);
      });
      Dom.onId('js-route-btn', 'click', function() { RouteMod.analyze(); });
      Dom.onId('js-rb-clear', 'click', function() { RouteMod.clear(); });
      ['js-route-start','js-route-end'].forEach(function(id) {
        Dom.onId(id, 'keydown', function(e) {
          if (e.key === 'Enter') RouteMod.analyze();
        });
      });
    },
    analyze: function() {
      if (RouteMod.analyzing) return;
      var startEl  = Dom.byId('js-route-start');
      var endEl    = Dom.byId('js-route-end');
      var endpointInput = window.RouteSearchModel.prepareEndpoints(
        startEl ? startEl.value : '',
        endEl ? endEl.value : ''
      );
      if (!endpointInput.ok) { Toast.show(endpointInput.message); return; }
      var startVal = endpointInput.startValue;
      var endVal = endpointInput.endValue;
      var thisAnalysisVersion = ++RouteMod.analysisVersion;
      RouteUiMod.setState('analyzing');
      RouteMod.setAnalyzeBusy(true);
      var status = Dom.byId('js-route-status');
      if (status) status.textContent = '\u89e3\u6790\u5730\u9ede\u2026';
      var uiWaypoints = window.WaypointsMod ? WaypointsMod.getWaypoints() : (AppState.pendingWaypoints || []);
      var addressPlan = window.RouteSearchModel.buildAddressPlan({
        startValue: startVal,
        endValue: endVal,
        waypoints: uiWaypoints,
        startRoutePoint: startEl && startEl.dataset.routePoint,
        startRoutePointLabel: startEl && startEl.dataset.routePointLabel,
        endRoutePoint: endEl && endEl.dataset.routePoint,
        endRoutePointLabel: endEl && endEl.dataset.routePointLabel
      });
      var displayAddrs = addressPlan.displayAddrs;
      var allAddrs = addressPlan.resolutionAddrs;
      AppState.pendingWaypoints = [];

      Promise.all(allAddrs.map(function(addr) { return extractPointFromUrl(addr); }))
        .then(function(results) {
          if (thisAnalysisVersion !== RouteMod.analysisVersion) return null;
          var failedIndex = results.findIndex(function(result) { return !result; });
          if (failedIndex !== -1) {
            throw new Error(window.RouteSearchModel.unresolvedPointMessage(failedIndex, results.length));
          }
          Toast.show('\u9a57\u8b49\u724c\u7167\u9650\u5236\u8207\u9053\u8def\u5b89\u5168\u2026');
          if (status) status.textContent = '\u9a57\u8b49\u724c\u7167\u9650\u5236\u2026';
          var finalPoints = results;
          AppState.routeAllPoints = finalPoints;
          AppState.routeInputValues = displayAddrs.slice();
          var vehicle = window.RouteSearchModel.buildVehicle(RouteMod.mode, RouteMod.plate);
          return AppServices.createRoute(finalPoints, vehicle, { strategy: 'balanced' });
        })
        .then(function(payload) {
          if (thisAnalysisVersion !== RouteMod.analysisVersion) return;
          var route = payload && payload.data;
          if (!route || !route.geometry || !route.validation || route.validation.status !== 'safe') {
            throw new Error('\u8def\u7dda\u672a\u901a\u904e\u5b89\u5168\u9a57\u8b49');
          }
          var coords = route.geometry.coordinates.map(function(point) {
            return [Number(point[1]), Number(point[0])];
          });
          AppState.activeRoute = route;
          AppState.lastRouteInfo = window.RouteSummaryModel.normalizeRouteInfo(route);
          RouteMod.setAnalyzeBusy(false);
          var info = AppState.lastRouteInfo;
          var msg = window.RouteSummaryModel.completionMessage(route, info, RouteMod.mode, RouteMod.plate);
          Toast.show(msg, 3000);
          var exp = Dom.byId('route-expanded');
          var col = Dom.byId('route-collapsed');
          if (exp) exp.classList.add('hidden');
          if (col) col.classList.remove('hidden');
          var clearMini = Dom.byId('js-route-clear-small');
          if (clearMini) clearMini.classList.remove('hidden');
          RouteUiMod.setState('ready');
          if (status) status.textContent = '\u6574\u7406\u6cbf\u9014\u8def\u6cc1\u2026';
          if (window.RouteConditionsMod) RouteConditionsMod.load(route, false);
          RouteMod._doFilter(coords);
        })
        .catch(function(err) {
          if (thisAnalysisVersion !== RouteMod.analysisVersion) return;
          RouteUiMod.setState('empty');
          RouteMod.setAnalyzeBusy(false);
          var message = err && err.message ? err.message : '\u8def\u7dda\u67e5\u8a62\u5931\u6557\uff0c\u8acb\u91cd\u8a66';
          var validation = err && err.payload && err.payload.data && err.payload.data.validation;
          var violation = validation && validation.violations && validation.violations[0];
          if (violation && violation.message) message = violation.message;
          Toast.show(message, 5000);
          var status = Dom.byId('js-route-status');
          if (status) status.textContent = '\u26d4 ' + message;
          MapMod.drawStartEnd(AppState.routeAllPoints);
        });
    },
    _doFilter: function(coords) {
      var adaptiveStep = Math.max(Config.SIMPLIFY_STEP, Math.ceil(coords.length / 600));
      var simplified = simplifyCoords(coords, adaptiveStep);
      RouteMod.routeCoords = coords;
      RouteMod.active = true;
      ListMod.visibleLimit = ListMod.PAGE_SIZE;
      var cctv = Data.allCams();
      var FILTER_KM = 5;

      // 先用路線 bounding box 粗篩，避免每次都讓全台攝影機逐段計算距離。
      var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      coords.forEach(function(point) {
        minLat = Math.min(minLat, point[0]);
        maxLat = Math.max(maxLat, point[0]);
        minLng = Math.min(minLng, point[1]);
        maxLng = Math.max(maxLng, point[1]);
      });
      var latPad = FILTER_KM / 110.6;
      var lngPad = FILTER_KM / (111.3 * Math.max(0.35, Math.cos((minLat + maxLat) / 2 * Math.PI / 180)));
      var candidates = cctv.filter(function(cam) {
        return cam.lat >= minLat - latPad && cam.lat <= maxLat + latPad
          && cam.lng >= minLng - lngPad && cam.lng <= maxLng + lngPad;
      });

      // 同一輪算出是否在 5km 內與沿線位置，避免超過 50 支後再掃一次。
      var filteredEntries = [];
      candidates.forEach(function(cam) {
        var minD = Infinity;
        var bestT = 0;
        for (var i = 0; i < simplified.length - 1; i++) {
          var d = distToSegKm(
            cam.lat, cam.lng,
            simplified[i][0], simplified[i][1],
            simplified[i + 1][0], simplified[i + 1][1]
          );
          if (d >= minD) continue;
          minD = d;
          var dx = simplified[i + 1][0] - simplified[i][0];
          var dy = simplified[i + 1][1] - simplified[i][1];
          var len = dx * dx + dy * dy;
          var t = len ? ((cam.lat - simplified[i][0]) * dx + (cam.lng - simplified[i][1]) * dy) / len : 0;
          bestT = i + Math.max(0, Math.min(1, t));
        }
        if (minD <= FILTER_KM) filteredEntries.push({ cam: cam, routePos: bestT });
      });

      // 沿路均勻取樣，最多 50 支 CCTV（避免 lag）
      var MAX_CCTV = 50;
      filteredEntries.sort(function(a, b) { return a.routePos - b.routePos; });
      if (filteredEntries.length > MAX_CCTV) {
        var step = (filteredEntries.length - 1) / (MAX_CCTV - 1);
        var sampled = [];
        for (var si = 0; si < MAX_CCTV; si++) {
          sampled.push(filteredEntries[Math.round(si * step)]);
        }
        filteredEntries = sampled;
      }

      var filteredCctv = filteredEntries.map(function(entry) { return entry.cam; });
      RouteMod.filteredCams = filteredCctv;
      MapMod.drawRoute(simplified, RouteMod.mode);
      // 立即畫起終點標記（MapMod 內建，不依賴 WaypointsMod）
      MapMod.drawStartEnd(AppState.routeAllPoints);
      RouteMod.updateRouteUi(RouteMod.filteredCams.length);
      (function(){
        var startInput = Dom.byId('js-route-start');
        var endInput = Dom.byId('js-route-end');
        if(startInput && endInput && window.HistoryMod) {
          HistoryMod.add(
            startInput.value,
            endInput.value,
            AppState.routeAllPoints ? AppState.routeAllPoints.slice(1,-1).map(function(p){ return p[0]+','+p[1]; }) : []
          );
        }
      })();
      Bus.emit('filter:changed');
      // 攝影機已整合進沿途時間軸；舊輪播僅在使用者主動點擊「影像」時顯示。
      RouteStripMod.hide();
    },
    clear: function() {
      RouteMod.analysisVersion += 1;
      RouteUiMod.setState('empty');
      RouteMod.setAnalyzeBusy(false);
      RouteMod.active = false; RouteMod.filteredCams = []; RouteMod.routeCoords = [];
      ListMod.visibleLimit = ListMod.PAGE_SIZE;
      AppState.routeAllPoints = [];
      MapMod.clearRoute();
      MapMod.drawStartEnd(null); // 清除起終點標記
      RouteStripMod.hide();
      WaypointsMod && WaypointsMod.clearMarkers();
      AppState.pendingWaypoints = [];
      AppState.activeRoute = null;
      AppState.routeConditions = null;
      AppState.lastRouteInfo = null;
      AppState.routeInputValues = [];
      WaypointsMod && WaypointsMod.render([]);
      if (window.RouteConditionsMod) RouteConditionsMod.clear();
      RouteMod.clearRouteUi();
      Bus.emit('filter:changed');
      Bus.emit('route:cleared');
    }
  };

  var ListMod = {
    region: 'all', regionCounty: 'all', search: '',
    PAGE_SIZE: 200, visibleLimit: 200,
    MAP_MARKER_ZOOM: 10, // 縮放 >= 10 才畫 marker
    applySearch: function(value) {
      var nextValue = value || '';
      var input = Dom.byId('js-search');
      if (input) input.value = nextValue;
      ListMod.search = nextValue.trim().toLowerCase();
      ListMod.visibleLimit = ListMod.PAGE_SIZE;
      Bus.emit('filter:changed');
    },
    renderSearchHints: function() {
      var wrap = Dom.byId('js-search-hints');
      if (!wrap) return;
      var hints = (SEARCH_HINTS[ListMod.region] || SEARCH_HINTS.all).slice();
      if (ListMod.regionCounty !== 'all') hints.unshift(ListMod.regionCounty);
      hints = hints.filter(function(value, index, arr) { return arr.indexOf(value) === index; }).slice(0, 6);
      wrap.innerHTML = '<span class="text-[10px] text-slate-500 py-1">\u63d0\u793a\uff1a</span>' + hints.map(function(hint) {
        return '<button class="hint-chip px-2.5 py-1 text-[11px] font-bold rounded-full transition-all" data-hint="' + hint + '">' + hint + '</button>';
      }).join('');
      Dom.onAll('.hint-chip', 'click', function(btn) {
        ListMod.applySearch(btn.dataset.hint || '');
      }, wrap);
    },
    renderRideRouteChips: function() {
      var wrap = Dom.byId('js-ride-route-chips');
      if (!wrap) return;
      wrap.innerHTML = RIDE_ROUTE_CHIPS.map(function(route) {
        return '<button class="ride-route-chip" data-route="' + route + '">' + route + '</button>';
      }).join('');
      Dom.onAll('.ride-route-chip', 'click', function(btn) {
        ListMod.applySearch(btn.dataset.route || '');
      }, wrap);
    },
    buildCameraSuggestions: function(query) {
      var nq = normalizeSearchText(query);
      if (!nq || nq.length < 2) return [];
      var cams = (RouteMod.active ? RouteMod.filteredCams : Data.allCams()).slice();
      var scored = [];
      cams.forEach(function(cam) {
        var haystack = cam.searchText || normalizeSearchText([cam.name, cam.county, cam.id].join(' '));
        if (!haystack) return;
        var score = -1;
        if (haystack.indexOf(nq) !== -1) score = 92 - Math.max(0, haystack.length - nq.length);
        else if (haystack.split(' ').some(function(part) { return part.indexOf(nq) !== -1; })) score = 72;
        if (score < 0) return;
        scored.push({
          name: cam.name,
          sub: [cam.county, getRoadCategoryLabel(cam.cat)].filter(Boolean).join(' · '),
          lat: cam.lat,
          lng: cam.lng,
          camId: cam.id,
          score: score
        });
      });
      return scored.sort(function(a, b) { return b.score - a.score; }).slice(0, 4);
    },
    renderSuggestGroups: function(query) {
      var wrap = Dom.byId('suggest-list');
      if (!wrap) return;
      if (!query) {
        wrap.innerHTML = '';
        wrap.classList.remove('visible');
        return;
      }
      PlaceSuggest.search(query, function(results) {
        var routeItems = [];
        var placeItems = [];
        (results || []).forEach(function(item) {
          var normalized = {
            name: item.name,
            sub: item.sub || '',
            lat: item.lat,
            lng: item.lng
          };
          if (PlaceSuggest.isMotorcycleHotspot(item.name)) routeItems.push(normalized);
          else placeItems.push(normalized);
        });
        var cameraItems = ListMod.buildCameraSuggestions(query);
        var groups = [];
        if (routeItems.length) groups.push({ key: 'route', title: '熱門路線', icon: 'fa-road', items: routeItems.slice(0, 4) });
        if (placeItems.length) groups.push({ key: 'place', title: '地點', icon: 'fa-location-dot', items: placeItems.slice(0, 3) });
        if (cameraItems.length) groups.push({ key: 'camera', title: '攝影機', icon: 'fa-camera', items: cameraItems });
        if (!groups.length) {
          wrap.innerHTML = '';
          wrap.classList.remove('visible');
          return;
        }
        wrap.innerHTML = groups.map(function(group) {
          var itemsHtml = group.items.map(function(item) {
            return '<div class="suggest-item" data-type="' + group.key + '" data-name="' + escapeHtml(item.name) + '" data-lat="' + (Number(item.lat) || '') + '" data-lng="' + (Number(item.lng) || '') + '" data-cam-id="' + escapeHtml(item.camId || '') + '">'
              + '<i class="fa-solid ' + group.icon + ' suggest-icon"></i>'
              + '<span class="suggest-name">' + escapeHtml(item.name) + '</span>'
              + '<span class="suggest-sub">' + escapeHtml(item.sub || '') + '</span>'
              + '</div>';
          }).join('');
          return '<div class="suggest-group"><div class="suggest-group-title"><i class="fa-solid ' + group.icon + '"></i><span>' + group.title + '</span></div>' + itemsHtml + '</div>';
        }).join('');
        wrap.classList.add('visible');
        Dom.onAll('.suggest-item', 'click', function(item) {
          ListMod.applySearch(item.dataset.name || '');
          wrap.innerHTML = '';
          wrap.classList.remove('visible');
          var camId = item.dataset.camId;
          var lat = parseFloat(item.dataset.lat);
          var lng = parseFloat(item.dataset.lng);
          if (camId) {
            var cam = Data.allCams().find(function(entry) { return entry.id === camId; });
            if (cam) {
              NavMod.go('map');
              MapMod.focusCam(cam);
              return;
            }
          }
          if (lat && lng && MapMod.map) {
            NavMod.go('map');
            MapMod.map.setView([lat, lng], 13);
          }
        }, wrap);
      });
    },
    renderCountyTabs: function() {
      var wrap = Dom.byId('js-region-county-tabs');
      if (!wrap) return;
      var counties = Config.REGIONS[ListMod.region] || [];
      if (ListMod.region === 'all' || !counties.length) {
        wrap.innerHTML = '';
        wrap.classList.add('hidden');
        ListMod.renderSearchHints();
        return;
      }
      var regionLabel = REGION_LABELS[ListMod.region] || '\u5340\u57df';
      var html = '<button data-county="all" class="county-rtab px-3 py-1.5 text-[11px] font-bold rounded-full transition-all">'
        + regionLabel + '\u5168\u90e8</button>';
      counties.forEach(function(county) {
        html += '<button data-county="' + county + '" class="county-rtab px-3 py-1.5 text-[11px] font-bold rounded-full transition-all">'
          + county + '</button>';
      });
      wrap.innerHTML = html;
      wrap.classList.remove('hidden');
      Dom.onAll('.county-rtab', 'click', function(btn) {
        ListMod.regionCounty = btn.dataset.county || 'all';
        ListMod.visibleLimit = ListMod.PAGE_SIZE;
        ListMod.syncCountyTabs();
        ListMod.renderSearchHints();
        Bus.emit('filter:changed');
      }, wrap);
      ListMod.syncCountyTabs();
      ListMod.renderSearchHints();
    },
    syncCountyTabs: function() {
      var wrap = Dom.byId('js-region-county-tabs');
      if (!wrap) return;
      wrap.classList.toggle('hidden', ListMod.region === 'all');
      Dom.queryAll('.county-rtab', wrap).forEach(function(btn) {
        var isActive = btn.dataset.county === ListMod.regionCounty;
        btn.classList.toggle('active', isActive);
        btn.classList.toggle('bg-orange-500', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-white/5', !isActive);
        btn.classList.toggle('text-slate-300', !isActive);
      });
    },
    init: function() {
      Dom.onAll('.rtab', 'click', function(btn) {
          Dom.queryAll('.rtab').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          ListMod.region = btn.dataset.r;
          ListMod.regionCounty = 'all';
          ListMod.visibleLimit = ListMod.PAGE_SIZE;
          ListMod.renderCountyTabs();
          Bus.emit('filter:changed');
      });
      ListMod.renderCountyTabs();
      ListMod.renderSearchHints();
      ListMod.renderRideRouteChips();
      var s = Dom.byId('js-search');
      var suggestList = Dom.byId('suggest-list');
      if (s) {
        Dom.on(s, 'input', function() {
          ListMod.search = s.value.trim().toLowerCase();
          ListMod.visibleLimit = ListMod.PAGE_SIZE;
          Bus.emit('filter:changed');
          var q = s.value.trim();
          if (!q || q.length < 1) { if (suggestList) { suggestList.innerHTML=''; suggestList.classList.remove('visible'); } return; }
          ListMod.renderSuggestGroups(q);
        });
        Dom.on(s, 'blur', function() {
          setTimeout(function() { if (suggestList) { suggestList.innerHTML=''; suggestList.classList.remove('visible'); } }, 200);
        });
      }
      var listInner = Dom.byId('js-list-inner');
      Dom.on(listInner, 'click', function(event) {
        var target = event.target && event.target.closest ? event.target : null;
        if (!target) return;
        var loadMoreButton = target.closest('.list-load-more');
        if (loadMoreButton && listInner.contains(loadMoreButton)) {
          ListMod.visibleLimit += ListMod.PAGE_SIZE;
          ListMod.render();
          return;
        }
        var favoriteButton = target.closest('.card-favorite-btn');
        if (favoriteButton && listInner.contains(favoriteButton)) {
          event.stopPropagation();
          Bus.emit('favorite:toggle', (ListMod._camById || {})[favoriteButton.dataset.favoriteId]);
          return;
        }
        var card = target.closest('.cam-card');
        if (!card || !listInner.contains(card)) return;
        var cam = (ListMod._camById || {})[card.dataset.id];
        if (!cam) return;
        Dom.queryAll('.cam-card', listInner).forEach(function(item) {
          item.style.borderColor = '';
          item.style.background = '';
        });
        card.style.borderColor = '#f97316';
        card.style.background = 'rgba(249,115,22,0.08)';
        InfoMod.open(cam);
        NavMod.go('map');
        MapMod.map.setView([cam.lat, cam.lng], 14);
      });
    },
    getFiltered: function() {
      var cams = RouteMod.active ? RouteMod.filteredCams : Data.allCams();
      var normalizedQuery = normalizeSearchText(ListMod.search);
      var queryTerms = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];
      return cams.filter(function(cam) {
        var rOk = ListMod.region === 'all' || getRegion(cam.county) === ListMod.region;
        var cOk = ListMod.region === 'all' || ListMod.regionCounty === 'all' || cam.county === ListMod.regionCounty;
        var haystack = cam.searchText || normalizeSearchText([cam.name, cam.county, cam.id].join(' '));
        var sOk = !queryTerms.length || queryTerms.every(function(term) {
          return haystack.indexOf(term) !== -1;
        });
        return rOk && cOk && sOk;
      });
    },
    refreshMarkers: function(cams) {
      cams = cams || ListMod.getFiltered();
      var zoom = MapMod.map ? MapMod.map.getZoom() : 0;
      var markerCams = [];
      if (RouteMod.active || zoom >= ListMod.MAP_MARKER_ZOOM) {
        markerCams = cams;
        if (!RouteMod.active && MapMod.map && MapMod.map.getBounds) {
          var bounds = MapMod.map.getBounds();
          markerCams = markerCams.filter(function(cam) {
            return bounds.contains([cam.lat, cam.lng]);
          }).slice(0, 600);
        }
      }
      var markerSignature = (zoom >= 12 ? 'tooltip|' : 'plain|')
        + markerCams.map(function(cam) { return cam.id; }).join(',');
      if (markerSignature !== MapMod._markerSignature) {
        MapMod.clearMarkers();
        markerCams.forEach(function(cam) { MapMod.addMarker(cam); });
        MapMod._markerSignature = markerSignature;
      }

      if (MapMod.map && !MapMod._zoomBound) {
        MapMod._zoomBound = true;
        var viewTimer;
        function refreshVisibleMarkers() {
          clearTimeout(viewTimer);
          viewTimer = setTimeout(function() { ListMod.refreshMarkers(); }, 180);
        }
        MapMod.map.on('zoomend', refreshVisibleMarkers);
        MapMod.map.on('moveend', refreshVisibleMarkers);
      }
    },
    render: function() {
      var el = Dom.byId('js-list-inner');
      var stateEl = Dom.byId('js-list-state');
      if (!el) return;
      var cams = ListMod.getFiltered();
      ListMod.refreshMarkers(cams);
      var stat = Dom.byId('js-stat-cams');
      if (stat) stat.textContent = Data.allCams().length;
      if (cams.length === 0) {
        if (stateEl) {
          stateEl.classList.remove('hidden');
          stateEl.textContent = RouteMod.active
            ? '目前是沿途結果模式，試著放寬條件或清除路線。'
            : '可切換區域、縣市或搜尋關鍵字來縮小範圍。';
        }
        if (Data.camsState === 'loading' || Data.camsState === 'idle') {
          el.innerHTML = '<div class="text-center text-slate-500 py-12 text-sm">\u8f09\u5165\u4e2d\uff0c\u8acb\u7a0d\u5019...</div>';
        } else if (Data.camsState === 'error') {
          el.innerHTML = '<div class="text-center text-amber-400 py-12 text-sm">\u651d\u5f71\u6a5f\u8cc7\u6599\u66ab\u6642\u7121\u6cd5\u8f09\u5165</div>';
        } else {
          el.innerHTML = '<div class="text-center text-slate-500 py-12 text-sm">\u76ee\u524d\u689d\u4ef6\u4e0b\u6c92\u6709\u7b26\u5408\u7684\u651d\u5f71\u6a5f</div>';
        }
        return;
      }
      if (stateEl) {
        stateEl.classList.remove('hidden');
        stateEl.textContent = RouteMod.active
          ? '沿途模式：已依目前路線過濾並優先顯示可快速判斷的影像點。'
          : '列表模式：可收藏常用停靠點，並從這裡直接跳回地圖。';
      }
      var map = {};
      Data.allCams().forEach(function(c) { map[c.id] = c; });
      ListMod._camById = map;

      // 列表分批載入，避免單字搜尋一次建立數千張卡片。
      var listCams = cams.slice(0, ListMod.visibleLimit);
      var hasMore = listCams.length < cams.length;
      var routeCamIds = new Set(RouteMod.filteredCams.map(function(cam) { return cam.id; }));

      var html = '';
      listCams.forEach(function(cam) {
        var w  = Data.weather[cam.county];
        var wt = w ? (w.temp + '\u00B0C') : '';
        var catLabel = getRoadCategoryLabel(cam.cat);
        var safeCamUrl = safeHttpUrl(cam.url);
        var _ts = safeCamUrl ? (safeCamUrl + (safeCamUrl.indexOf('?') !== -1 ? '&' : '?') + 't=' + Math.floor(Date.now()/60000)) : '';
        var isRouteCam = RouteMod.active && routeCamIds.has(cam.id);
        var distLabel = '';
        if (NearbyMod.userLat !== null && NearbyMod.userLng !== null) {
          distLabel = haversineKm(NearbyMod.userLat, NearbyMod.userLng, cam.lat, cam.lng).toFixed(1) + 'km';
        }
        html += '<div class="cam-card rounded-2xl p-3 flex items-center gap-3 cursor-pointer border border-white/5" data-id="'+escapeHtml(cam.id)+'">'
          + '<div class="cam-card-top w-full">'
          + '<div class="cam-tw relative w-16 h-12 rounded-xl overflow-hidden shrink-0 bg-slate-800">'
          + '<i class="fa-solid fa-camera absolute inset-0 m-auto text-slate-600 text-sm" style="top:50%;left:50%;transform:translate(-50%,-50%);position:absolute"></i>'
          + '<img class="cam-th absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300" data-src="'+escapeHtml(_ts)+'" />'
          + '</div>'
          + '<div class="flex-1 min-w-0">'
          + '<div class="font-bold text-xs truncate flex items-center gap-1.5">'+escapeHtml(cam.name)+'</div>'
          + '<div class="text-[10px] text-slate-400 mt-0.5">'+escapeHtml(cam.county)+(wt?' \u00B7 '+escapeHtml(wt):'')+'</div>'
          + '<div class="cam-card-meta">'
          + '<span class="meta-chip">'+escapeHtml(catLabel)+'</span>'
          + (isRouteCam ? '<span class="meta-chip">\u6cbf\u9014</span>' : '')
          + (distLabel ? '<span class="meta-chip">\u8ddd\u96e2 ' + distLabel + '</span>' : '')
          + '</div>'
          + '</div>'
          + '<button class="card-favorite-btn" data-favorite-id="' + escapeHtml(cam.id) + '"><i class="fa-regular fa-bookmark text-xs"></i></button>'
          + '<i class="fa-solid fa-chevron-right text-slate-600 text-xs shrink-0"></i></div></div>';
      });
      if (hasMore) {
        html += '<button type="button" class="list-load-more w-full text-center text-xs py-4">'
          + '目前顯示 ' + listCams.length + ' / ' + cams.length + ' 支 · 載入更多'
          + '</button>';
      }
      el.innerHTML = html;
      if (ListMod._imageObserver) ListMod._imageObserver.disconnect();
      if('IntersectionObserver' in window){
        ListMod._imageObserver = new IntersectionObserver(function(entries){
          entries.forEach(function(e){
            if(!e.isIntersecting)return;
            var img=e.target.querySelector('.cam-th');
            if(img&&img.dataset.src&&!img.src){img.referrerPolicy='no-referrer';img.src=img.dataset.src;img.onload=function(){img.style.opacity='1';};}
            ListMod._imageObserver.unobserve(e.target);
          });
        },{rootMargin:'80px'});
        Dom.queryAll('.cam-tw', el).forEach(function(w){ListMod._imageObserver.observe(w);});
      }
      if (window.FavoritesMod) FavoritesMod.syncButtons();
      // clearMarkers 裡的 setTimeout 會自動補畫，這裡不需要再呼叫
    }
  };

  var ModalMod = {
    open: function(cam) {
      var ttl = Dom.byId('m-ttl');
      var org = Dom.byId('m-org');
      var med = Dom.byId('m-med');
      if (ttl) ttl.textContent = cam.name;
      if (org) {
        var w = Data.weather[cam.county];
        org.textContent = '\u{1F4CD} ' + cam.county + (w ? ' \u00B7 '+w.temp+'\u00B0C '+(w.weather||'') : '');
      }
      if (med) {
        med.innerHTML = '';
        if (cam.type === 'youtube' && cam.videoId) {
          var iframe = document.createElement('iframe');
          if (!/^[A-Za-z0-9_-]{11}$/.test(String(cam.videoId))) {
            med.textContent = '此直播來源格式不正確';
            return;
          }
          iframe.src = 'https://www.youtube-nocookie.com/embed/' + cam.videoId + '?autoplay=1&mute=0';
          iframe.className = 'w-full h-full';
          iframe.style.minHeight = '240px';
          iframe.allow = 'autoplay; encrypted-media';
          iframe.referrerPolicy = 'no-referrer';
          iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
          iframe.allowFullscreen = true;
          med.appendChild(iframe);
        } else if (safeHttpUrl(cam.url)) {
          var img = document.createElement('img');
          var safeUrl = safeHttpUrl(cam.url);
          var imgUrl = safeUrl + (safeUrl.indexOf('?') !== -1 ? '&' : '?') + 't=' + Date.now();
          img.src = imgUrl;
          img.referrerPolicy = 'no-referrer';
          img.className = 'w-full h-full object-contain';
          img.style.opacity = '0';
          img.style.transition = 'opacity 0.3s';
          img.onload = function() { img.style.opacity = '1'; };
          img.onerror = function() {
            med.innerHTML = '';
            var errorWrap = document.createElement('div');
            errorWrap.className = 'text-slate-500 text-sm p-8 text-center';
            errorWrap.textContent = '\u26A0\uFE0F \u5f71\u50cf\u7121\u6cd5\u8f09\u5165\u3002\u651d\u5f71\u6a5f\u53ef\u80fd\u96e2\u7dda\u6216\u4f86\u6e90\u672a\u66f4\u65b0\u3002';
            var sourceLink = document.createElement('a');
            sourceLink.href = safeUrl;
            sourceLink.target = '_blank';
            sourceLink.rel = 'noopener noreferrer';
            sourceLink.className = 'camera-source-link';
            sourceLink.textContent = '\u76f4\u63a5\u958b\u555f\u539f\u59cb\u9023\u7d50';
            errorWrap.appendChild(sourceLink);
            med.appendChild(errorWrap);
          };
          med.appendChild(img);
        } else {
          med.innerHTML = '<div class="text-slate-500 text-sm p-8 text-center">\u6b64\u651d\u5f71\u6a5f\u7121\u5f71\u50cf\u4f86\u6e90</div>';
        }
      }
      InfoMod.close();
      if (window.ModalEffect) window.ModalEffect.open();
    }
  };

  window.InfoMod = InfoMod;
  window.RouteMod = RouteMod;

  window.addEventListener('load', function() {
    ClockMod.init();
    UiPrefsMod.init();
    MapMod.init();
    installMapTestProbe();
    if (Storage.get(THEME_KEY, 'dark') === 'light') {
      document.body.classList.add('light');
      var _tb = Dom.byId('js-theme'); if(_tb) _tb.textContent='\u2600\uFE0F';
      MapMod.setTile(Config.TILE_LIGHT);
    }
    ThemeMod.init();
    NavMod.init();
    Dom.onId('brand-home', 'click', function() {
      if (window.DesktopDashboardMod && DesktopDashboardMod.goHome) DesktopDashboardMod.goHome();
      else {
        NavMod.go('map');
        if (MapMod.focusRoute) MapMod.focusRoute();
      }
    });
    RouteMod.init();
    ListMod.init();
    InfoMod.init();
    Dom.onId('diag-close', 'click', function() {
      var panel = Dom.byId('diag-panel');
      if (panel) panel.classList.remove('visible');
    });

    // render 加 debounce，避免短時間內多次觸發（天氣+資料同時到達時）
    var _renderTimer;
    function debouncedRender() {
      clearTimeout(_renderTimer);
      _renderTimer = setTimeout(function() { ListMod.render(); }, 80);
    }
    Bus.on('filter:changed',  debouncedRender);
    Bus.on('cams:updated',    debouncedRender);
    Bus.on('weather:updated', debouncedRender);
    ListMod.render();
    NearbyMod.init();

    // 起終點地名建議
    PlaceSuggest.bind('js-route-start', 'suggest-start');
    PlaceSuggest.bind('js-route-end',   'suggest-end');
    RouteMod.setAnalyzeBusy(false);

    // iOS Safari：輸入框 font-size 固定 16px，防止縮放（純 CSS 解法更穩定）

    // 沿途影像按鈕
    Dom.onId('js-strip-btn', 'click', function() { RouteStripMod.toggle(); });
    Dom.onId('route-strip-close', 'click', function() { RouteStripMod.hide(); });
  });
})();
