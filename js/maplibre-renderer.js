// Desktop MapLibre renderer. Also used by the mobile shell since the
// Leaflet removal; pass { simple: true } on mobile to skip desktop-only
// terrain/hillshade/satellite sources.
(function() {
  'use strict';

  var TRAFFIC_COLORS = window.MapGeoUtils ? window.MapGeoUtils.TRAFFIC_COLORS : {
    clear: '#52b788',
    slow: '#f6c945',
    congested: '#ef5350',
    unknown: '#94a3b8'
  };
  // Mapterhorn publishes a broad TileJSON envelope, but terrain tiles are
  // only available around Taiwan. Limiting the DEM sources to this coverage
  // keeps MapLibre from requesting surrounding sea/Japan tiles that return
  // 404, while still covering Taiwan, Kinmen, Matsu, and Penghu routes.
  var TERRAIN_BOUNDS = [117.5, 20.5, 123.4, 26.7];
  var PROVIDER_CONFIG = window.TWMapProviderConfig || {};
  var maplibreModule = null;
  var maplibrePromise = null;

  // True while one of MapLibre's user-gesture handlers (wheel, drag, pinch, rotate, pitch,
  // double-click / tap zoom, box zoom) is driving the camera.
  function gestureHandlerActive(map) {
    return ['scrollZoom', 'dragPan', 'dragRotate', 'touchZoomRotate', 'touchPitch', 'doubleClickZoom', 'boxZoom']
      .some(function(name) { return map[name] && typeof map[name].isActive === 'function' && map[name].isActive(); });
  }

  function loadMapLibre() {
    if (maplibreModule) return Promise.resolve(maplibreModule);
    if (maplibrePromise) return maplibrePromise;
    if (!document.querySelector('link[data-maplibre-style]')) {
      var styleLink = document.createElement('link');
      styleLink.rel = 'stylesheet';
      styleLink.href = './assets/vendor/maplibre-gl/maplibre-gl.css';
      styleLink.dataset.maplibreStyle = 'true';
      document.head.appendChild(styleLink);
    }
    var url = new URL('./assets/vendor/maplibre-gl/maplibre-gl.mjs', document.baseURI).href;
    maplibrePromise = import(url).then(function(module) {
      if (typeof module.setWorkerUrl === 'function') {
        module.setWorkerUrl(new URL('./assets/vendor/maplibre-gl/maplibre-gl-worker.mjs', document.baseURI).href);
      }
      maplibreModule = module;
      return module;
    });
    return maplibrePromise;
  }

  function makeBounds(maplibregl, coordinates) {
    if (window.MapGeoUtils) return window.MapGeoUtils.makeBounds(maplibregl, coordinates);
    var bounds = new maplibregl.LngLatBounds();
    (coordinates || []).forEach(function(point) {
      if (point && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))) {
        bounds.extend([Number(point[1]), Number(point[0])]);
      }
    });
    return bounds.isEmpty() ? null : bounds;
  }

  function bearingBetween(start, end) {
    var lat1 = Number(start[0]) * Math.PI / 180;
    var lat2 = Number(end[0]) * Math.PI / 180;
    var deltaLng = (Number(end[1]) - Number(start[1])) * Math.PI / 180;
    var y = Math.sin(deltaLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    var bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  function reduceMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function markerElement(className, label, color) {
    var element = document.createElement('button');
    element.type = 'button';
    element.className = 'desktop-map-marker ' + className;
    element.style.setProperty('--marker-color', color || '#f97316');
    element.setAttribute('aria-label', label || '地圖標記');
    element.innerHTML = '<span></span>';
    return element;
  }

  function satelliteTiles() {
    if (PROVIDER_CONFIG.provider !== 'maptiler' || !PROVIDER_CONFIG.key) return [];
    var tileset = encodeURIComponent(PROVIDER_CONFIG.tileset || 'satellite-v4');
    var key = encodeURIComponent(PROVIDER_CONFIG.key);
    // satellite-v4 is a hosted map (Maps API), not a standalone tileset.
    // Keep the provider key in the query string so MapLibre can request the
    // raster XYZ tiles without exposing it in application state or logs.
    return ['https://api.maptiler.com/maps/' + tileset + '/{z}/{x}/{y}.jpg?key=' + key];
  }

  function baseTiles(tileset) {
    if (PROVIDER_CONFIG.provider !== 'maptiler' || !PROVIDER_CONFIG.key) return [];
    var ts = encodeURIComponent(tileset);
    var key = encodeURIComponent(PROVIDER_CONFIG.key);
    return ['https://api.maptiler.com/maps/' + ts + '/{z}/{x}/{y}.png?key=' + key];
  }

  function createRenderer(options) {
    var initialTerrainMode = options.terrainMode === '3d' ? '3d' : '2d';
    // Mobile shell passes { simple: true }: skip desktop-only terrain,
    // hillshade and satellite sources so phones don't pay for them.
    var simpleMode = !!options.simple;
    var renderer = {
      map: null,
      module: null,
      markers: [],
      placeMarkers: [],
      terrainTimer: null,
      mode: initialTerrainMode,
      routeCoords: [],
      selectedOrder: null,
      currentPreset: 'solid',
      cameraProgrammatic: false,
      basemap: options.basemap === 'satellite' && PROVIDER_CONFIG.key ? 'satellite' : 'dark',
      satelliteAvailable: false,
      satelliteFailed: false,
      satelliteTimer: null,
      baseTimer: null,
      baseFallback: false,
      baseLight: false,
      baseTileReady: {},
      routeFitApplied: false,
      eventMarkerCount: 0,
      onReady: options.onReady || function() {},
      onFallback: options.onFallback || function() {},
      onStatus: options.onStatus || function() {},
      onCameraState: options.onCameraState || function() {},
      init: function() {
        var self = this;
        return loadMapLibre().then(function(module) {
          self.module = module;
          var maplibregl = module;
          var satellite = simpleMode ? [] : satelliteTiles();
          self.satelliteAvailable = satellite.length > 0;
          var sources = {
            base: {
              type: 'raster',
              tiles: baseTiles('dataviz-dark'),
              tileSize: 256,
              attribution: '<a href="https://www.maptiler.com/" target="_blank" rel="noopener noreferrer">MapTiler</a> &copy; OpenStreetMap contributors',
              maxzoom: 19
            }
          };
          if (!simpleMode) {
            sources.terrainSource = {
              type: 'raster-dem',
              url: 'https://tiles.mapterhorn.com/tilejson.json',
              tileSize: 512,
              encoding: 'terrarium',
              bounds: TERRAIN_BOUNDS
            };
            sources.hillshadeSource = {
              type: 'raster-dem',
              url: 'https://tiles.mapterhorn.com/tilejson.json',
              tileSize: 512,
              encoding: 'terrarium',
              bounds: TERRAIN_BOUNDS
            };
          }
          if (self.satelliteAvailable) {
            sources.satellite = {
              type: 'raster',
              tiles: satellite,
              tileSize: 512,
              attribution: '<a href="https://www.maptiler.com/" target="_blank" rel="noopener noreferrer">MapTiler</a> &copy; OpenStreetMap contributors',
              maxzoom: 20
            };
          }
          var layers = [
            // Start on the MapTiler dataviz-dark base. Enable the requested
            // satellite basemap after `load`; satellite errors or timeouts
            // switch back to this base, which uses the same restricted key.
            self.satelliteAvailable ? { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } } : null,
            { id: 'base', type: 'raster', source: 'base', layout: { visibility: 'visible' } },
            simpleMode ? null : {
              id: 'hillshade',
              type: 'hillshade',
              source: 'hillshadeSource',
              layout: { visibility: self.mode === '3d' ? 'visible' : 'none' },
              paint: {
                'hillshade-shadow-color': '#0b1f2a',
                'hillshade-highlight-color': '#b8d5c5',
                'hillshade-accent-color': '#284c4d',
                'hillshade-exaggeration': 0.55
              }
            }
          ].filter(Boolean);
          self.map = new maplibregl.Map({
            container: options.container,
            center: [Config.MAP_CENTER[1], Config.MAP_CENTER[0]],
            zoom: Config.MAP_ZOOM,
            pitch: self.mode === '3d' ? 58 : 0,
            bearing: self.mode === '3d' ? -12 : 0,
            maxPitch: 85,
            bearingSnap: 7,
            touchPitch: true,
            touchZoomRotate: true,
            pitchWithRotate: true,
            attributionControl: true,
            style: Object.assign({
              version: 8,
              sources: sources,
              layers: layers,
              sky: {}
            }, self.mode === '3d' ? { terrain: { source: 'terrainSource', exaggeration: 1 } } : {})
          });
          self.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
          // "自訂" means the USER moved the camera.  Only gestures (drag, wheel, pinch, rotate, the
          // navigation buttons) carry an originalEvent; our own fitBounds after a late route redraw,
          // map.resize() on layout changes and preset eases do not, and must not flip the label.
          // MapLibre attaches originalEvent to drag / pinch / button moves but not to scroll-zoom
          // moves; those are recognised by the gesture handler being active when the move starts.
          // Deterministic - no time window - so slow frames cannot turn a wheel into a non-user move.
          self.map.on('movestart', function(event) {
            self._userMove = Boolean(event && event.originalEvent) || gestureHandlerActive(self.map);
          });
          self.map.on('moveend', function(event) {
            var user = self._userMove || Boolean(event && event.originalEvent);
            self._userMove = false;
            if (user) {
              self.currentPreset = 'custom';
              self.onCameraState({ preset: 'custom', pitch: self.map.getPitch(), bearing: self.map.getBearing() });
            }
          });
          self.map.on('sourcedata', function(event) { self._recordBaseTile(event); });
          self.map.on('load', function() {
            if (window.OpenFreeMapBasemap.active) self._useBasemapFallback();
            self._armBaseFallback();
            self._addDataLayers();
            self._addPlaceLabels();
            if (self.mode === '3d') self._armTerrainFallback();
            self._syncProviderLogo();
            self.onReady(self);
            if (self.satelliteAvailable && self.basemap === 'satellite') {
              self.setBasemap('satellite');
              self.satelliteTimer = window.setTimeout(function() {
                if (self.map && self.basemap === 'satellite' && !self.map.isSourceLoaded('satellite')) {
                  self.setBasemap('dark', true);
                  self.onStatus('basemap-unavailable');
                }
              }, 8000);
            }
          });
          self.map.on('error', function(event) {
            if (window.OpenFreeMapBasemap.isBaseError(event)) {
              self._useBasemapFallback();
              return;
            }
            var message = String(event && event.error && event.error.message || '');
            if (self.basemap === 'satellite' && (/maptiler|satellite/i.test(message) || event && event.sourceId === 'satellite')) {
              self.setBasemap('dark', true);
              self.onStatus('basemap-unavailable');
              return;
            }
            if (/mapterhorn|terrainSource|raster-dem/i.test(message)) {
              self.setTerrainMode('2d');
              self.onStatus('terrain-unavailable');
            }
          });
          return self;
        }).catch(function(error) {
          options.onFallback(error);
          throw error;
        });
      },
      _recordBaseTile: function(event) {
        // MapLibre counts errored tiles as source-loaded too. Only a successful
        // raster tile proves that this provider/theme has supplied a usable base.
        if (event && (event.sourceId === 'base' || event.sourceId === 'mobile-base-light') &&
            event.tile && event.tile.state === 'loaded') this.baseTileReady[event.sourceId] = true;
      },
      _visibleBaseSource: function() {
        if (!this.map) return null;
        var self = this;
        function visible(id) {
          return self.map.getLayer(id) && self.map.getLayoutProperty(id, 'visibility') !== 'none';
        }
        if (visible('satellite')) return null;
        if (visible('mobile-base-light')) return 'mobile-base-light';
        return visible('base') ? 'base' : null;
      },
      _armBaseFallback: function() {
        var self = this;
        if (this.baseTimer) window.clearTimeout(this.baseTimer);
        this.baseTimer = null;
        var source = this._visibleBaseSource();
        if (this.baseFallback || !source) return;
        this.baseTimer = window.setTimeout(function() {
          self.baseTimer = null;
          if (self._visibleBaseSource() === source && !self.baseTileReady[source]) self._useBasemapFallback();
        }, 8000);
      },
      _useBasemapFallback: function() {
        if (!this.map || this.baseFallback) return;
        this.baseFallback = true;
        window.OpenFreeMapBasemap.active = true;
        if (this.baseTimer) window.clearTimeout(this.baseTimer);
        this.baseTimer = null;
        if (this.satelliteTimer) window.clearTimeout(this.satelliteTimer);
        this.satelliteTimer = null;
        this.satelliteAvailable = false;
        this.basemap = 'dark';
        // setGlyphs preserves the style and reloads only glyph dependencies (MapLibre 6).
        // The default localIdeographFontFamily remains enabled for system CJK fonts.
        this.map.setGlyphs(window.OpenFreeMapBasemap.glyphs);
        this.map.addSource('ofm', {
          type: 'vector', url: 'https://tiles.openfreemap.org/planet',
          attribution: '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> © <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
        });
        var self = this;
        var basemapLayers = [];
        ['dark', 'positron'].forEach(function(theme) {
          window.OpenFreeMapBasemap.layers[theme].forEach(function(original) {
            var layer = JSON.parse(JSON.stringify(original));
            layer.id = 'ofm-' + theme + '-' + layer.id;
            if (layer.source) layer.source = 'ofm';
            layer.layout = Object.assign({}, layer.layout, { visibility: 'none' });
            basemapLayers.push(layer);
          });
        });
        // Stable sort: both themes' geometry below text; all remain below app overlays.
        basemapLayers.sort(function(a, b) { return Number(a.type === 'symbol') - Number(b.type === 'symbol'); });
        basemapLayers.forEach(function(layer) { self.map.addLayer(layer, 'base'); });
        this.setBaseTheme(this.baseLight);
        this._syncProviderLogo();
        this.onStatus('basemap-fallback');
      },
      setBaseTheme: function(light) {
        this.baseLight = Boolean(light);
        if (!this.map) return;
        var self = this;
        ['base', 'mobile-base-light'].forEach(function(id) {
          if (self.map.getLayer(id)) self.map.setLayoutProperty(id, 'visibility',
            !self.baseFallback && (id === 'mobile-base-light' ? self.baseLight : !self.baseLight) ? 'visible' : 'none');
        });
        if (!this.baseFallback) return;
        if (this.map.getLayer('satellite')) this.map.setLayoutProperty('satellite', 'visibility', 'none');
        ['dark', 'positron'].forEach(function(theme) {
          window.OpenFreeMapBasemap.layers[theme].forEach(function(layer) {
            self.map.setLayoutProperty('ofm-' + theme + '-' + layer.id, 'visibility',
              theme === (self.baseLight ? 'positron' : 'dark') ? 'visible' : 'none');
          });
        });
      },
      _syncProviderLogo: function() {
        var container = Dom.byId(options.container);
        if (!container) return;
        var existing = container.querySelector('.desktop-map-provider-logo');
        if (this.basemap !== 'satellite' || !this.satelliteAvailable || this.satelliteFailed) {
          if (existing) existing.remove();
          return;
        }
        if (!existing) {
          existing = document.createElement('a');
          existing.className = 'desktop-map-provider-logo';
          existing.target = '_blank';
          existing.rel = 'noopener noreferrer';
          existing.href = PROVIDER_CONFIG.logoLink || 'https://www.maptiler.com/';
          existing.textContent = 'MapTiler';
          existing.setAttribute('aria-label', 'MapTiler 地圖來源');
          container.appendChild(existing);
        }
      },
      _addDataLayers: function() {
        var map = this.map;
        if (!map || map.getSource('desktop-route')) return;
        map.addSource('desktop-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addSource('desktop-sections', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addSource('desktop-events', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addSource('desktop-cameras', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addSource('desktop-weather', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'desktop-route-casing', type: 'line', source: 'desktop-route', paint: { 'line-color': '#07111b', 'line-width': 10, 'line-opacity': 0.9 } });
        map.addLayer({ id: 'desktop-route-glow', type: 'line', source: 'desktop-route', paint: { 'line-color': '#fb923c', 'line-width': 12, 'line-opacity': 0.18, 'line-blur': 2 } });
        map.addLayer({ id: 'desktop-route-core', type: 'line', source: 'desktop-route', paint: { 'line-color': '#f97316', 'line-width': 4, 'line-opacity': 0.96 } });
        map.addLayer({ id: 'desktop-section-casing', type: 'line', source: 'desktop-sections', paint: { 'line-color': '#07111b', 'line-width': 10, 'line-opacity': 0.88 } });
        map.addLayer({ id: 'desktop-section-glow', type: 'line', source: 'desktop-sections', paint: { 'line-color': ['match', ['get', 'level'], 'clear', TRAFFIC_COLORS.clear, 'slow', TRAFFIC_COLORS.slow, 'congested', TRAFFIC_COLORS.congested, TRAFFIC_COLORS.unknown], 'line-width': 12, 'line-opacity': 0.2, 'line-blur': 2 } });
        map.addLayer({ id: 'desktop-section-core', type: 'line', source: 'desktop-sections', paint: { 'line-color': ['match', ['get', 'level'], 'clear', TRAFFIC_COLORS.clear, 'slow', TRAFFIC_COLORS.slow, 'congested', TRAFFIC_COLORS.congested, TRAFFIC_COLORS.unknown], 'line-width': 6, 'line-opacity': 0.98 } });
        map.addLayer({ id: 'desktop-event-cue', type: 'line', source: 'desktop-events', paint: { 'line-color': ['get', 'color'], 'line-width': 8, 'line-opacity': 0.96, 'line-dasharray': [1.5, 1] } });
        map.addLayer({ id: 'desktop-weather', type: 'circle', source: 'desktop-weather', paint: { 'circle-radius': 8, 'circle-color': '#38bdf8', 'circle-opacity': 0.9, 'circle-stroke-color': '#e0f2fe', 'circle-stroke-width': 1 } });
        var self = this;
        map.on('click', 'desktop-section-core', function(event) {
          var feature = event.features && event.features[0];
          if (feature) Bus.emit('condition:select', Number(feature.properties.order));
        });
        ['desktop-section-core'].forEach(function(layer) {
          map.on('mouseenter', layer, function() { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', layer, function() { map.getCanvas().style.cursor = ''; });
        });
      },
      _addPlaceLabels: function() {
        if (!this.module || !this.map || !Array.isArray(Config.MAP_LABELS)) return;
        var self = this;
        this.placeMarkers.forEach(function(marker) { marker.remove(); });
        // 手機版只顯示 6 個主要城市，避免標籤擁擠
        var isMobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
        var majorCities = ['台北', '台中', '高雄', '宜蘭', '花蓮', '台東'];
        var labels = isMobile
          ? Config.MAP_LABELS.filter(function(item) { return majorCities.indexOf(item[0]) >= 0; })
          : Config.MAP_LABELS;
        this.placeMarkers = labels.map(function(item) {
          var element = document.createElement('div');
          element.className = 'local-map-place-label desktop-map-place-label';
          element.textContent = item[0];
          element.setAttribute('aria-label', item[0]);
          return new self.module.Marker({ element: element, anchor: 'center', offset: [0, -4] })
            .setLngLat([Number(item[2]), Number(item[1])])
            .addTo(self.map);
        });
      },
      // MapLibre keeps its own copy of GeoJSON source data in a private,
      // version-specific shape (v6: `{ geojson }`), so the renderer remembers
      // what it last drew instead of reading `source._data`.
      _setSourceData: function(id, data) {
        this._sourceData = this._sourceData || {};
        this._sourceData[id] = data;
        var source = this.map && this.map.getSource(id);
        if (source) source.setData(data);
      },
      getSourceData: function(id) {
        return this._sourceData && this._sourceData[id] || null;
      },
      clear: function() {
        this._setSourceData('desktop-route', { type: 'FeatureCollection', features: [] });
        this._setSourceData('desktop-sections', { type: 'FeatureCollection', features: [] });
        this._setSourceData('desktop-events', { type: 'FeatureCollection', features: [] });
        this._setSourceData('desktop-cameras', { type: 'FeatureCollection', features: [] });
        this._setSourceData('desktop-weather', { type: 'FeatureCollection', features: [] });
        this.markers.forEach(function(marker) { marker.remove(); });
        this.markers = [];
        if (this.cursorMarker) { this.cursorMarker.remove(); this.cursorMarker = null; }
        this.cameraById = {};
        this.routeCoords = [];
        this.conditionSectionsInput = [];
        this.routeFitApplied = false;
        this.selectedOrder = null;
        this.currentPreset = 'solid';
        this.eventMarkerCount = 0;
      },
      drawStartEnd: function(points) {
        if (!this.module || !this.map) return;
        var self = this;
        this.markers = this.markers.filter(function(marker) {
          if (marker.getElement().classList.contains('desktop-start-marker') || marker.getElement().classList.contains('desktop-end-marker')) {
            marker.remove();
            return false;
          }
          return true;
        });
        (points || []).forEach(function(point, index) {
          if (index !== 0 && index !== points.length - 1) return;
          var isStart = index === 0;
          var element = markerElement(isStart ? 'desktop-start-marker' : 'desktop-end-marker', isStart ? '起點' : '終點', isStart ? '#52b788' : '#ef5350');
          element.innerHTML = '<span>' + (isStart ? '起' : '終') + '</span>';
          self.markers.push(new self.module.Marker({ element: element, anchor: 'center' }).setLngLat([Number(point[1]), Number(point[0])]).addTo(self.map));
        });
      },
      setCursor: function(point) {
        if (!this.module || !this.map || !point) return;
        if (!this.cursorMarker) {
          var element = markerElement('desktop-cursor-marker', '模擬位置', '#f8fafc');
          element.innerHTML = '<span><i class="fa-solid fa-motorcycle"></i></span>';
          this.cursorMarker = new this.module.Marker({ element: element, anchor: 'center' });
          this.cursorMarker.setLngLat([Number(point[1]), Number(point[0])]).addTo(this.map);
          return;
        }
        this.cursorMarker.setLngLat([Number(point[1]), Number(point[0])]);
      },
      focusSection: function(order) {
        this.selectedOrder = Number(order);
        var sections = this.getSourceData('desktop-sections');
        var feature = sections && (sections.features || []).find(function(item) { return Number(item.properties.order) === Number(order); });
        if (!feature) return;
        var bounds = makeBounds(this.module, feature.geometry.coordinates.map(function(point) { return [point[1], point[0]]; }));
        if (bounds) this.map.fitBounds(bounds, { padding: 90, maxZoom: 13, duration: 550 });
      },
      focusPoint: function(lat, lng, zoom) {
        if (this.map) this.map.easeTo({ center: [Number(lng), Number(lat)], zoom: zoom || 12, duration: 450 });
      },
      _cameraForRoute: function(pitch, bearing) {
        if (!this.map) return null;
        var bounds = makeBounds(this.module, this.routeCoords);
        if (!bounds) {
          return { center: [Config.MAP_CENTER[1], Config.MAP_CENTER[0]], zoom: Config.MAP_ZOOM, pitch: pitch, bearing: bearing };
        }
        var fitted = this.map.cameraForBounds(bounds, { padding: this._routePadding(), maxZoom: 11 });
        if (!fitted) return null;
        return { center: fitted.center, zoom: fitted.zoom, pitch: pitch, bearing: bearing };
      },
      setCameraPreset: function(preset, options) {
        if (!this.map || this.mode !== '3d') return false;
        options = options || {};
        var selected = options.sectionOrder || this.selectedOrder;
        var camera;
        var normalized = preset === 'birdseye' || preset === 'along' || preset === 'reset' ? preset : 'solid';
        if (normalized === 'reset' && !this.routeCoords.length) {
          camera = { center: [Config.MAP_CENTER[1], Config.MAP_CENTER[0]], zoom: Config.MAP_ZOOM, pitch: 0, bearing: 0 };
        } else if (normalized === 'along') {
          var sectionData = this.getSourceData('desktop-sections');
          var feature = sectionData && (sectionData.features || []).find(function(item) {
            return selected !== null && Number(item.properties.order) === Number(selected);
          });
          var points = feature && feature.geometry && feature.geometry.coordinates;
          if (!points || points.length < 2) points = this.routeCoords.map(toLngLat);
          var index = Math.max(0, Math.floor(points.length / 2) - 1);
          var first = points[index] || points[0];
          var last = points[index + 1] || points[points.length - 1];
          camera = {
            center: points[Math.floor(points.length / 2)] || [Config.MAP_CENTER[1], Config.MAP_CENTER[0]],
            zoom: 13,
            pitch: 72,
            bearing: bearingBetween([first[1], first[0]], [last[1], last[0]])
          };
        } else {
          var bearing = normalized === 'birdseye' ? 0 : this._routeBearing();
          camera = this._cameraForRoute(normalized === 'birdseye' ? 32 : 58, bearing);
        }
        if (!camera) return false;
        var duration = reduceMotion() ? 0 : (options.duration === undefined ? 650 : options.duration);
        var self = this;
        var token = (this._cameraToken || 0) + 1;
        this._cameraToken = token;
        this.cameraProgrammatic = true;
        this.currentPreset = normalized === 'reset' && !this.routeCoords.length ? 'reset' : normalized;
        var settled = false;
        function settle() {
          if (settled || self._cameraToken !== token) return;
          settled = true;
          self.cameraProgrammatic = false;
          self.onCameraState({ preset: self.currentPreset, pitch: self.map.getPitch(), bearing: self.map.getBearing() });
        }
        // The move is "ours" until ITS moveend, not until a timer: under load frames run late and a
        // timer-based reset let the preset's own moveend be read as a user move ("自訂").  The listener
        // is attached after easeTo/jumpTo so the moveend of an interrupted previous move (fired
        // synchronously inside easeTo) cannot settle this one early; jumpTo settles right away.
        if (duration > 0) {
          this.map.easeTo(Object.assign({}, camera, { duration: duration }));
          this.map.once('moveend', settle);
          window.setTimeout(settle, duration + 2000); // fallback if no moveend arrives
        } else {
          this.map.jumpTo(camera);
          settle();
        }
        return true;
      },
      _routeBearing: function() {
        if (!this.routeCoords || this.routeCoords.length < 2) return -12;
        var first = this.routeCoords[0];
        var last = this.routeCoords[this.routeCoords.length - 1];
        return bearingBetween(first, last);
      },
      _routePadding: function() {
        if (!this.map || !this.map.getContainer) return 72;
        var width = this.map.getContainer().clientWidth || 0;
        return Math.max(56, Math.min(118, Math.round(Math.min(width * 0.12, 118))));
      },
      setBasemap: function(basemap, silent) {
        if (this.baseFallback) {
          this.setBaseTheme(this.baseLight);
          return 'dark';
        }
        var next = basemap === 'satellite' && this.satelliteAvailable ? 'satellite' : 'dark';
        this.basemap = next;
        if (!this.map) return next;
        if (this.map.getLayer('satellite')) this.map.setLayoutProperty('satellite', 'visibility', next === 'satellite' ? 'visible' : 'none');
        if (this.map.getLayer('base')) this.map.setLayoutProperty('base', 'visibility', next === 'satellite' ? 'none' : 'visible');
        this.satelliteFailed = next === 'dark' && this.satelliteAvailable && Boolean(silent);
        // Back on the MapTiler base (or leaving it): restart or cancel the fallback budget.
        this._armBaseFallback();
        this._syncProviderLogo();
        if (this.satelliteFailed && !silent) this.onStatus('basemap-unavailable');
        return next;
      },
      getBasemap: function() { return this.basemap; },
      focusRoute: function() {
        return this.setCameraPreset(this.mode === '3d' ? 'solid' : 'reset');
      },
      resetView: function() {
        return this.setCameraPreset('reset');
      },
      // 3D gets 8 seconds, counted from the moment terrain is switched on (map load when it
      // starts in 3D), to get its DEM tiles; otherwise fall back to 2D and say so. Counting
      // from map load instead would abandon a 3D switch made shortly before that mark.
      _armTerrainFallback: function() {
        var self = this;
        if (simpleMode) return;
        if (this.terrainTimer) window.clearTimeout(this.terrainTimer);
        this.terrainTimer = window.setTimeout(function() {
          self.terrainTimer = null;
          if (self.mode === '3d' && self.map && !self.map.isSourceLoaded('terrainSource')) {
            self.setTerrainMode('2d');
            self.onStatus('terrain-unavailable');
          }
        }, 8000);
      },
      setTerrainMode: function(mode) {
        if (!this.map || simpleMode) return;
        var wasMode = this.mode;
        this.mode = mode === '3d' ? '3d' : '2d';
        if (this.mode === '3d') {
          if (wasMode !== '3d') this._armTerrainFallback();
          this.map.setTerrain({ source: 'terrainSource', exaggeration: 1 });
          this.map.setPitch(58);
          if (this.map.getLayer('hillshade')) this.map.setLayoutProperty('hillshade', 'visibility', 'visible');
        } else {
          this.map.setTerrain(null);
          this.map.setPitch(0);
          if (this.map.getLayer('hillshade')) this.map.setLayoutProperty('hillshade', 'visibility', 'none');
        }
      },
      resize: function() { if (this.map) this.map.resize(); },
      destroy: function() {
        if (this.baseTimer) window.clearTimeout(this.baseTimer);
        if (this.terrainTimer) window.clearTimeout(this.terrainTimer);
        if (this.satelliteTimer) window.clearTimeout(this.satelliteTimer);
        this.markers.forEach(function(marker) { marker.remove(); });
        this.markers = [];
        this.placeMarkers.forEach(function(marker) { marker.remove(); });
        this.placeMarkers = [];
        if (this.cursorMarker) this.cursorMarker.remove();
        this.cursorMarker = null;
        var container = Dom.byId(options.container);
        var logo = container && container.querySelector('.desktop-map-provider-logo');
        if (logo) logo.remove();
        if (this.map) this.map.remove();
        this.map = null;
      }
    };
    return renderer;
  }

  window.MapRenderer = {
    load: loadMapLibre,
    create: createRenderer
  };
})();
