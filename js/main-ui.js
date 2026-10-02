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
      var lastText = '';
      function tick() {
        if (!clk || document.visibilityState === 'hidden') return;
        var n = new Date();
        var h = String(n.getHours()).padStart(2,'0');
        var m = String(n.getMinutes()).padStart(2,'0');
        var s = String(n.getSeconds()).padStart(2,'0');
        var desktopClock = window.matchMedia && window.matchMedia('(min-width: 1200px)').matches;
        var text = desktopClock ? h+':'+m : h+':'+m+':'+s;
        if (text !== lastText) {
          clk.textContent = text;
          lastText = text;
        }
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
      if (key === 'map') setTimeout(function() { MapMod.invalidateSize(); }, 50);
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

  // Mobile map: MapLibre GL adapter (Leaflet removed).
  // Owns the #map surface through the shared MapRenderer in simple mode
  // (no terrain/hillshade/satellite sources). Requests arriving before the
  // map's `load` event are queued and replayed in order.
  var MapMod = {
    map: null,
    renderer: null,
    _ready: false,
    _pending: [],
    _degraded: false,
    _eventsBound: false,
    _camData: [],
    _camById: {},
    _markerSignature: '',
    _themeUrl: null,
    _resizeHandler: null,
    _camDrawTimer: null,
    _nearbyCenter: null,
    // D2 viewport camera window: bbox-scoped fetch state. bbox is the snapped
    // [minLng, minLat, maxLng, maxLat] already loaded (with prefetch margin);
    // cams holds the normalized cameras for that window.
    _viewport: { bbox: null, cams: [], timer: null, controller: null, timedOut: false },
    // Legacy property names retained for external readers.
    markers: [], placeLabelMarkers: [], routeLayer: null,
    routeSectionLayers: [], routeWeatherMarkers: [], routeIncidentMarkers: [], routeIncidentLayers: [],
    startEndMarkers: [], waypointMapMarkers: [],
    _nearbyMarker: null, _nearbyCircle: null,

    _webgl2Available: function() {
      try {
        var canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl2') || canvas.getContext('experimental-webgl2'));
      } catch (error) {
        return false;
      }
    },

    _showDegradedNotice: function() {
      if (MapMod._degraded) return;
      MapMod._degraded = true;
      var container = document.getElementById('map');
      if (!container || container.querySelector('.map-degraded-notice')) return;
      var notice = document.createElement('div');
      notice.className = 'map-degraded-notice';
      notice.innerHTML =
        '<div class="map-degraded-card">' +
          '<div class="map-degraded-title">地圖暫時無法顯示</div>' +
          '<div class="map-degraded-desc">您的瀏覽器不支援 WebGL2，無法載入地圖。<br>路線規劃、路況與天氣資訊仍可正常使用。</div>' +
        '</div>';
      container.appendChild(notice);
    },

    init: function() {
      if (MapMod._degraded) return;
      if (!MapMod._webgl2Available() || !window.MapRenderer) {
        MapMod._showDegradedNotice();
        return;
      }
      Bus.on('map:request', function(request) { MapMod._handleMapRequest(request); });
      MapMod._initRenderer();
      MapMod.addPlaceLabels();
      MapMod._resizeHandler = function() { MapMod.invalidateSize(); };
      window.addEventListener('resize', MapMod._resizeHandler);
      window.addEventListener('orientationchange', MapMod._resizeHandler);
    },

    destroy: function() {
      if (MapMod._resizeHandler) {
        window.removeEventListener('resize', MapMod._resizeHandler);
        window.removeEventListener('orientationchange', MapMod._resizeHandler);
        MapMod._resizeHandler = null;
      }
      MapMod._pending = [];
      if (MapMod._camDrawTimer) {
        window.clearTimeout(MapMod._camDrawTimer);
        MapMod._camDrawTimer = null;
      }
      if (MapMod.renderer && typeof MapMod.renderer.destroy === 'function') {
        MapMod.renderer.destroy();
      } else if (MapMod.map && typeof MapMod.map.remove === 'function') {
        MapMod.map.remove();
      }
      MapMod.map = null;
      MapMod.renderer = null;
      MapMod._ready = false;
      MapMod._eventsBound = false;
    },

    _initRenderer: function() {
      var renderer = window.MapRenderer.create({
        containerId: 'map',
        center: [Config.MAP_CENTER[1], Config.MAP_CENTER[0]],
        zoom: Config.MAP_ZOOM,
        terrainMode: '2d',
        simple: true,
        onStatus: function() {},
        onReady: function() { MapMod._onMapLoaded(); },
        onFallback: function() { MapMod._showDegradedNotice(); }
      });
      MapMod.renderer = renderer;
      renderer.init().catch(function() {
        MapMod._showDegradedNotice();
      });
    },

    _onMapLoaded: function() {
      if (MapMod._ready || MapMod._degraded) return;
      var renderer = MapMod.renderer;
      if (!renderer || !renderer.map) return;
      MapMod.map = renderer.map;
      MapMod._ready = true;
      MapMod._addMobileSources();
      MapMod._bindMapEvents();
      MapMod._applyTheme();
      var queued = MapMod._pending;
      MapMod._pending = [];
      queued.forEach(function(request) { MapMod._handleMapRequest(request); });
      ListMod.refreshMarkers();
      // Kick off the first viewport window now that the map is ready.
      MapMod._scheduleViewportCams();
    },

    // Queue-until-ready: bus requests and direct method calls funnel through
    // here so nothing is lost while the MapLibre vendor chunk loads.
    _handleMapRequest: function(request) {
      if (!request) return;
      if (!MapMod._ready || !MapMod.map) {
        MapMod._pending.push(request);
        return;
      }
      var action = request.action;
      if (action === 'invalidate-size') MapMod.invalidateSize();
      else if (action === 'focus-route') MapMod._focusRouteNow();
      else if (action === 'nearby-overlay-upsert') MapMod._nearbyUpsert(request.center, request.radiusMeters);
      else if (action === 'nearby-overlay-radius') MapMod._nearbySetRadius(request.radiusMeters);
      else if (action === 'nearby-overlay-clear') MapMod._nearbyClear();
      else if (action === 'clear-waypoint-overlays') { /* no-op: no waypoint overlays */ }
      else if (action === 'draw-route') MapMod._drawRouteNow(request.coords, request.mode);
      else if (action === 'draw-start-end') MapMod._drawStartEndNow(request.coords);
      else if (action === 'focus-camera') MapMod._focusCamNow(request.cam);
      else if (action === 'draw-condition-sections') MapMod._drawConditionSectionsNow(request.sections);
      else if (action === 'focus-section') MapMod._focusSectionNow(request.order);
      else if (action === 'draw-cameras') MapMod._drawCamerasNow();
      else if (action === 'clear-cameras') MapMod._clearCamerasNow();
      else if (action === 'clear-route') MapMod._clearRouteNow();
      else if (action === 'set-view') {
        var center = request.center;
        if (center && Number.isFinite(Number(center[0])) && Number.isFinite(Number(center[1]))) {
          MapMod.map.easeTo({
            center: [Number(center[1]), Number(center[0])],
            zoom: Number(request.zoom) || MapMod.map.getZoom(),
            duration: 600
          });
        }
      }
    },

    _addMobileSources: function() {
      var map = MapMod.map;
      if (!map || map.getSource('mobile-cameras')) return;
      // Light basemap for the light theme (the renderer's 'base' is dark).
      if (!map.getSource('mobile-base-light')) {
        map.addSource('mobile-base-light', {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
            'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
            'https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
            'https://d.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          maxzoom: 19
        });
        map.addLayer({
          id: 'mobile-base-light', type: 'raster', source: 'mobile-base-light',
          layout: { visibility: 'none' }
        }, 'desktop-route-casing');
      }
      // CCTV markers as a clustered GeoJSON source (no per-camera DOM nodes).
      map.addSource('mobile-cameras', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
      map.addLayer({
        id: 'mobile-camera-clusters', type: 'circle', source: 'mobile-cameras',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#f59e0b', 10, '#f97316', 30, '#ef4444'],
          'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 30, 23],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
      map.addLayer({
        id: 'mobile-camera-points', type: 'circle', source: 'mobile-cameras',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['coalesce', ['get', 'color'], '#f97316'],
          'circle-radius': 7,
          'circle-stroke-color': 'rgba(255,255,255,0.85)',
          'circle-stroke-width': 1.5
        }
      });
    },

    _bindMapEvents: function() {
      var map = MapMod.map;
      if (!map || MapMod._eventsBound) return;
      MapMod._eventsBound = true;
      map.on('click', 'mobile-camera-points', function(event) {
        var feature = event.features && event.features[0];
        var properties = feature && feature.properties;
        var cam = properties && MapMod._camById[properties.id];
        if (cam) InfoMod.open(cam);
      });
      map.on('click', 'mobile-camera-clusters', function(event) {
        var features = map.queryRenderedFeatures(event.point, { layers: ['mobile-camera-clusters'] });
        var clusterId = features.length ? features[0].properties.cluster_id : null;
        var source = map.getSource('mobile-cameras');
        if (clusterId == null || !source || typeof source.getClusterExpansionZoom !== 'function') return;
        source.getClusterExpansionZoom(clusterId, function(error, zoom) {
          if (error || !features.length) return;
          map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom, duration: 500 });
        });
      });
      ['mobile-camera-points', 'mobile-camera-clusters'].forEach(function(layerId) {
        map.on('mouseenter', layerId, function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layerId, function() { map.getCanvas().style.cursor = ''; });
      });
      map.on('zoomend', function() { MapMod._scheduleViewportCams(); ListMod.refreshMarkers(); });
      map.on('moveend', function() { MapMod._scheduleViewportCams(); ListMod.refreshMarkers(); });
    },

    // D2 viewport camera loading: fetch /v2/cams?bbox= for the current view so
    // the map no longer depends on the 2MB full list. Debounced, abortable,
    // with superset-bbox check, prefetch margin and zoom gating.
    _scheduleViewportCams: function() {
      if (!MapMod._ready || !MapMod.map || RouteMod.active) return;
      var vp = MapMod._viewport;
      if (vp.timer) window.clearTimeout(vp.timer);
      vp.timer = window.setTimeout(function() {
        vp.timer = null;
        MapMod._loadViewportCams();
      }, 300);
    },

    _viewportSnap: function(value) {
      return Math.round(value / 0.05) * 0.05;
    },

    _loadViewportCams: function() {
      var vp = MapMod._viewport;
      var map = MapMod.map;
      if (!map || RouteMod.active) return;
      var zoom = map.getZoom();
      // Zoom gating: never fetch for a view that wouldn't draw markers anyway.
      if (zoom < ListMod.MAP_MARKER_ZOOM) {
        if (vp.controller) { try { vp.controller.abort(); } catch (error) {} vp.controller = null; }
        if (vp.cams.length || vp.bbox) {
          vp.cams = [];
          vp.bbox = null;
          ListMod.refreshMarkers();
        }
        return;
      }
      var bounds = map.getBounds();
      if (!bounds) return;
      // Prefetch margin: 30% beyond each edge so small pans stay inside the
      // loaded window; the superset check below then skips refetching.
      var sw = bounds.getSouthWest();
      var ne = bounds.getNorthEast();
      var marginLng = (ne.lng - sw.lng) * 0.3;
      var marginLat = (ne.lat - sw.lat) * 0.3;
      var bbox = [
        MapMod._viewportSnap(Math.max(119.5, sw.lng - marginLng)),
        MapMod._viewportSnap(Math.max(21.8, sw.lat - marginLat)),
        MapMod._viewportSnap(Math.min(122.5, ne.lng + marginLng)),
        MapMod._viewportSnap(Math.min(25.4, ne.lat + marginLat))
      ];
      // Superset check: the current view is already inside the loaded window.
      var loaded = vp.bbox;
      if (loaded && bbox[0] >= loaded[0] && bbox[1] >= loaded[1] &&
          bbox[2] <= loaded[2] && bbox[3] <= loaded[3]) {
        return;
      }
      if (vp.controller) { try { vp.controller.abort(); } catch (error) {} }
      var controller = (typeof AbortController === 'function') ? new AbortController() : null;
      vp.controller = controller;
      vp.timedOut = false;
      var timeoutId = window.setTimeout(function() {
        vp.timedOut = true;
        if (vp.controller === controller && controller) {
          try { controller.abort(); } catch (error) {}
        }
      }, 8000);
      var normalize = (window.Data && Data.normalizeCams) || function(list) { return list || []; };
      AppServices.loadCamsByBbox(bbox, controller ? controller.signal : null).then(function(raw) {
        window.clearTimeout(timeoutId);
        if (vp.controller !== controller) return; // superseded by a newer fetch
        vp.controller = null;
        var seen = {};
        vp.cams = normalize(raw).filter(function(cam) {
          if (!cam || !cam.id || seen[cam.id]) return false;
          seen[cam.id] = true;
          return true;
        });
        vp.bbox = bbox;
        ListMod.refreshMarkers();
      }, function(error) {
        window.clearTimeout(timeoutId);
        if (vp.controller !== controller) return;
        vp.controller = null;
        // AbortError = superseded or timed out: stay silent. Other failures keep
        // the previous window; the next moveend/zoomend retries.
        if (!error || error.name !== 'AbortError') {
          try { Diag.warn('CCTV 視窗查詢失敗，已保留舊資料'); } catch (warnError) {}
        }
      });
    },

    _cameraColor: function(cam) {
      if (cam.type === 'youtube') return '#ff0000';
      var cat = cam.cat || (cam.id && cam.id.charAt(0) === 'n' ? 'highway' : 'provincial');
      if (cat === 'highway') return '#3b82f6';
      if (cat === 'expressway') return '#a855f7';
      if (cat === 'scenic') return '#22c55e';
      if (cat === 'city') return '#f59e0b';
      return '#f97316';
    },

    addMarker: function(cam) {
      if (cam) MapMod._camData.push(cam);
      MapMod._scheduleCamDraw();
    },

    _scheduleCamDraw: function() {
      if (MapMod._camDrawTimer) return;
      MapMod._camDrawTimer = window.setTimeout(function() {
        MapMod._camDrawTimer = null;
        MapMod._handleMapRequest({ action: 'draw-cameras' });
      }, 0);
    },

    _drawCamerasNow: function() {
      var map = MapMod.map;
      var source = map && map.getSource('mobile-cameras');
      if (!source) return;
      MapMod._camById = {};
      var features = [];
      MapMod._camData.forEach(function(cam) {
        if (!cam || !Number.isFinite(Number(cam.lat)) || !Number.isFinite(Number(cam.lng))) return;
        MapMod._camById[cam.id] = cam;
        features.push({
          type: 'Feature',
          properties: { id: cam.id, color: MapMod._cameraColor(cam) },
          geometry: { type: 'Point', coordinates: [Number(cam.lng), Number(cam.lat)] }
        });
      });
      try {
        source.setData({ type: 'FeatureCollection', features: features });
      } catch (error) {}
    },

    _clearCamerasNow: function() {
      MapMod._camById = {};
      var map = MapMod.map;
      var source = map && map.getSource('mobile-cameras');
      if (source) {
        try { source.setData({ type: 'FeatureCollection', features: [] }); } catch (error) {}
      }
    },

    clearMarkers: function() {
      MapMod._camData = [];
      MapMod._handleMapRequest({ action: 'clear-cameras' });
    },

    focusCam: function(cam) {
      MapMod._handleMapRequest({ action: 'focus-camera', cam: cam });
    },

    _focusCamNow: function(cam) {
      if (!cam || !MapMod.map) return;
      var lat = Number(cam.lat);
      var lng = Number(cam.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      MapMod.map.easeTo({ center: [lng, lat], zoom: 14, duration: 600 });
      InfoMod.open(cam);
      window.setTimeout(function() { ListMod.refreshMarkers(); }, 750);
    },

    drawRoute: function(coords, mode) {
      MapMod._handleMapRequest({ action: 'draw-route', coords: coords, mode: mode });
    },

    _drawRouteNow: function(coords, mode) {
      var renderer = MapMod.renderer;
      if (!renderer || typeof renderer.drawRoute !== 'function') return;
      renderer.drawRoute(coords || []);
      // Preserve the vehicle-mode route colors from the Leaflet version.
      var isMoto = mode !== 'car';
      var map = renderer.map;
      if (!map) return;
      try {
        if (map.getLayer('desktop-route-core')) {
          map.setPaintProperty('desktop-route-core', 'line-color', isMoto ? '#f97316' : '#3b82f6');
        }
        if (map.getLayer('desktop-route-glow')) {
          map.setPaintProperty('desktop-route-glow', 'line-color', isMoto ? '#fb923c' : '#60a5fa');
        }
      } catch (error) {}
    },

    drawConditionSections: function(sections) {
      MapMod._handleMapRequest({ action: 'draw-condition-sections', sections: sections });
    },

    _drawConditionSectionsNow: function(sections) {
      var renderer = MapMod.renderer;
      if (!renderer || typeof renderer.drawConditionSections !== 'function') return;
      renderer.drawConditionSections(sections || []);
    },

    focusSection: function(order) {
      MapMod._handleMapRequest({ action: 'focus-section', order: order });
    },

    _focusSectionNow: function(order) {
      var renderer = MapMod.renderer;
      if (renderer && typeof renderer.focusSection === 'function') renderer.focusSection(order);
    },

    focusRoute: function() {
      MapMod._handleMapRequest({ action: 'focus-route' });
    },

    _focusRouteNow: function() {
      var renderer = MapMod.renderer;
      var coords = renderer && renderer.routeCoords;
      if (!coords || !coords.length || !MapMod.map) return;
      var bounds = window.MapGeoUtils ? window.MapGeoUtils.boundsOf(coords) : null;
      if (bounds) {
        try {
          MapMod.map.fitBounds(bounds, {
            padding: { top: 90, bottom: 190, left: 30, right: 30 },
            duration: 600
          });
        } catch (error) {}
      }
    },

    clearRoute: function() {
      MapMod._handleMapRequest({ action: 'clear-route' });
    },

    _clearRouteNow: function() {
      var renderer = MapMod.renderer;
      if (!renderer) return;
      renderer.routeCoords = [];
      renderer.routeFitApplied = false;
      var routeSource = renderer.map && renderer.map.getSource('desktop-route');
      if (routeSource && typeof routeSource.setData === 'function') {
        try { routeSource.setData({ type: 'FeatureCollection', features: [] }); } catch (error) {}
      }
      // drawConditionSections([]) also removes its event DOM markers.
      if (typeof renderer.drawConditionSections === 'function') renderer.drawConditionSections([]);
      if (typeof renderer.drawStartEnd === 'function') renderer.drawStartEnd([]);
      AppState.routeAllPoints = [];
    },

    drawStartEnd: function(pts) {
      MapMod._handleMapRequest({ action: 'draw-start-end', coords: pts });
    },

    _drawStartEndNow: function(pts) {
      var renderer = MapMod.renderer;
      if (renderer && typeof renderer.drawStartEnd === 'function') renderer.drawStartEnd(pts || []);
    },

    redrawStartEnd: function() {
      var pts = AppState.routeAllPoints;
      if (pts && pts.length >= 2) {
        MapMod.drawStartEnd(pts);
      }
    },

    setTile: function(url) {
      MapMod._themeUrl = url || null;
      MapMod._applyTheme();
    },

    _applyTheme: function() {
      var map = MapMod.map;
      if (!map) return;
      var light = MapMod._themeUrl
        ? MapMod._themeUrl === Config.TILE_LIGHT
        : document.body.classList.contains('light');
      try {
        map.setLayoutProperty('base', 'visibility', light ? 'none' : 'visible');
        if (map.getLayer('mobile-base-light')) {
          map.setLayoutProperty('mobile-base-light', 'visibility', light ? 'visible' : 'none');
        }
      } catch (error) {}
    },

    // Place labels are rendered by the shared renderer on map load.
    addPlaceLabels: function() {},

    invalidateSize: function() {
      if (MapMod.map && typeof MapMod.map.resize === 'function') {
        try { MapMod.map.resize(); } catch (error) {}
      }
    },
    resize: function() { MapMod.invalidateSize(); },

    _nearbyUpsert: function(center, radiusMeters) {
      var map = MapMod.map;
      if (!map || !center) return;
      var lat = Number(center[0]);
      var lng = Number(center[1]);
      var radius = Number(radiusMeters) || 0;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      MapMod._nearbyCenter = [lat, lng];
      MapMod._nearbyClear();
      var features = [{
        type: 'Feature',
        properties: { kind: 'center' },
        geometry: { type: 'Point', coordinates: [lng, lat] }
      }];
      if (radius > 0 && window.MapGeoUtils) {
        features.push({
          type: 'Feature',
          properties: { kind: 'radius' },
          geometry: {
            type: 'Polygon',
            coordinates: [window.MapGeoUtils.circlePolygon(lng, lat, radius)]
          }
        });
      }
      try {
        map.addSource('mobile-nearby', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: features }
        });
        map.addLayer({
          id: 'mobile-nearby-fill', type: 'fill', source: 'mobile-nearby',
          filter: ['==', ['get', 'kind'], 'radius'],
          paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.12 }
        });
        map.addLayer({
          id: 'mobile-nearby-line', type: 'line', source: 'mobile-nearby',
          filter: ['==', ['get', 'kind'], 'radius'],
          paint: { 'line-color': '#38bdf8', 'line-width': 2, 'line-opacity': 0.7 }
        });
        map.addLayer({
          id: 'mobile-nearby-dot', type: 'circle', source: 'mobile-nearby',
          filter: ['==', ['get', 'kind'], 'center'],
          paint: {
            'circle-radius': 6, 'circle-color': '#38bdf8',
            'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2
          }
        });
      } catch (error) {}
      MapMod._nearbyMarker = true;
      MapMod._nearbyCircle = true;
      try {
        map.flyTo({ center: [lng, lat], zoom: 14, duration: 600 });
      } catch (error) {}
    },

    _nearbySetRadius: function(radiusMeters) {
      var radius = Number(radiusMeters);
      if (!MapMod._nearbyCenter || !Number.isFinite(radius) || radius < 0) return;
      MapMod._nearbyUpsert(MapMod._nearbyCenter, radius);
    },

    _nearbyClear: function() {
      var map = MapMod.map;
      MapMod._nearbyMarker = null;
      MapMod._nearbyCircle = null;
      if (!map) return;
      ['mobile-nearby-dot', 'mobile-nearby-line', 'mobile-nearby-fill'].forEach(function(layerId) {
        try { if (map.getLayer(layerId)) map.removeLayer(layerId); } catch (error) {}
      });
      try { if (map.getSource('mobile-nearby')) map.removeSource('mobile-nearby'); } catch (error) {}
    }
  };


  var InfoMod = {
    current: null,
    init: function() {
      Bus.on('camera:open', function(cam) { if (cam) InfoMod.open(cam); });
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
      Bus.emit('camera:closed');
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
      Bus.on('route:request', function(request) {
        var action = request && request.action;
        if (action === 'set-vehicle') {
          RouteMod.setVehicle(request && request.mode, request && request.plate);
          return;
        }
        if (action === 'analyze') {
          RouteMod.analyze();
          return;
        }
        if (action === 'clear') RouteMod.clear();
      });
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
    _filterCameras: function(coords) {
      var adaptiveStep = Math.max(Config.SIMPLIFY_STEP, Math.ceil(coords.length / 600));
      var simplified = simplifyCoords(coords, adaptiveStep);
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

      return filteredEntries.map(function(entry) { return entry.cam; });
    },
    refreshCameras: function() {
      if (!navigator.onLine || !RouteMod.active || !Array.isArray(RouteMod.routeCoords) || RouteMod.routeCoords.length < 2) return;
      RouteMod.filteredCams = RouteMod._filterCameras(RouteMod.routeCoords);
      RouteMod.updateRouteUi(RouteMod.filteredCams.length);
      Bus.emit('filter:changed');
    },
    _doFilter: function(coords) {
      var adaptiveStep = Math.max(Config.SIMPLIFY_STEP, Math.ceil(coords.length / 600));
      var simplified = simplifyCoords(coords, adaptiveStep);
      RouteMod.routeCoords = coords;
      RouteMod.active = true;
      ListMod.visibleLimit = ListMod.PAGE_SIZE;
      RouteMod.filteredCams = RouteMod._filterCameras(coords);
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
    getFiltered: function(source) {
      var cams = RouteMod.active ? RouteMod.filteredCams : (source || Data.allCams());
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
      var zoom = MapMod.map ? MapMod.map.getZoom() : 0;
      var markerCams = [];
      if (RouteMod.active || zoom >= ListMod.MAP_MARKER_ZOOM) {
        if (cams) {
          markerCams = cams;
        } else if (!RouteMod.active && MapMod._viewport.cams.length) {
          // D2: the viewport window is already bbox-scoped by the server; apply
          // the list filters only, no strict bounds re-filter (the prefetch
          // margin is intentionally drawn so small pans feel instant).
          markerCams = ListMod.getFiltered(MapMod._viewport.cams).slice(0, 1500);
        } else {
          markerCams = ListMod.getFiltered();
          if (!RouteMod.active && MapMod.map && MapMod.map.getBounds) {
            var bounds = MapMod.map.getBounds();
            markerCams = markerCams.filter(function(cam) {
              // MapLibre LngLatBounds.contains takes [lng, lat] (Leaflet was [lat, lng]).
              return bounds.contains([cam.lng, cam.lat]);
            }).slice(0, 600);
          }
        }
      }
      var markerSignature = (zoom >= 12 ? 'tooltip|' : 'plain|')
        + markerCams.map(function(cam) { return cam.id; }).join(',');
      if (markerSignature !== MapMod._markerSignature) {
        MapMod.clearMarkers();
        markerCams.forEach(function(cam) { MapMod.addMarker(cam); });
        MapMod._markerSignature = markerSignature;
      }
      // zoomend/moveend -> refreshMarkers is bound by MapMod._bindMapEvents
      // once the MapLibre map is ready; no per-module binding here.
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

  window.MapMod = MapMod;
  window.RouteMod = RouteMod;

  window.addEventListener('load', function() {
    ClockMod.init();
    UiPrefsMod.init();
    MapMod.init();
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
    // Google Maps 分享匯入：share target 啟動時帶 ?url= 參數（Android 分享選單；iOS 用貼上框）。
    // share-import.js 已打包進 app.js，直接呼叫即可。
    if (window.GoogleMapsShare && window.GoogleMapsShare.init) window.GoogleMapsShare.init();
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
    Bus.on('cams:updated', function() {
      // Route planning can finish before the large nationwide camera list.
      // Re-run only the camera projection when data arrives; do not rebuild
      // the route, duplicate history, or disturb the current map view.
      if (navigator.onLine && RouteMod.active) RouteMod.refreshCameras();
      debouncedRender();
    });
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