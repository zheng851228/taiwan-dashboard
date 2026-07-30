// Desktop MapLibre renderer. The existing Leaflet map remains the mobile and
// WebGL fallback renderer; this module only owns the desktop map surface.
(function() {
  'use strict';

  var TRAFFIC_COLORS = {
    clear: '#52b788',
    slow: '#f6c945',
    congested: '#ef5350',
    unknown: '#94a3b8'
  };
  var EVENT_COLORS = {
    accident: '#f43f5e',
    construction: '#f59e0b',
    congestion: '#ef4444',
    control: '#8b5cf6',
    weather: '#38bdf8',
    disaster: '#be123c',
    activity: '#22d3ee',
    hazard: '#fb923c',
    other: '#64748b'
  };
  // Mapterhorn publishes a broad TileJSON envelope, but terrain tiles are
  // only available around Taiwan. Limiting the DEM sources to this coverage
  // keeps MapLibre from requesting surrounding sea/Japan tiles that return
  // 404, while still covering Taiwan, Kinmen, Matsu, and Penghu routes.
  var TERRAIN_BOUNDS = [117.5, 20.5, 123.4, 26.7];
  var maplibreModule = null;
  var maplibrePromise = null;

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
      maplibreModule = module;
      return module;
    });
    return maplibrePromise;
  }

  function toLngLat(point) {
    return [Number(point[1]), Number(point[0])];
  }

  function sectionFeature(section) {
    var coordinates = (section.geometry || []).map(toLngLat)
      .filter(function(point) { return Number.isFinite(point[0]) && Number.isFinite(point[1]); });
    if (coordinates.length < 2) return null;
    var traffic = section.traffic || {};
    return {
      type: 'Feature',
      properties: {
        order: Number(section.order),
        level: TRAFFIC_COLORS[traffic.level] ? traffic.level : 'unknown',
        road: section.roadRef || section.roadName || '沿途路段'
      },
      geometry: { type: 'LineString', coordinates: coordinates }
    };
  }

  function makeBounds(maplibregl, coordinates) {
    var bounds = new maplibregl.LngLatBounds();
    (coordinates || []).forEach(function(point) {
      if (point && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))) {
        bounds.extend([Number(point[1]), Number(point[0])]);
      }
    });
    return bounds.isEmpty() ? null : bounds;
  }

  function inferEventKind(incident) {
    if (incident && EVENT_COLORS[incident.kind]) return incident.kind;
    var text = String((incident && incident.title || '') + ' ' + (incident && incident.description || ''));
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

  function eventCue(section, incident) {
    if (!incident || incident.locationApproximate) return null;
    if (!Number.isFinite(Number(incident.lat)) || !Number.isFinite(Number(incident.lng))) return null;
    var points = (section.geometry || []).map(function(point) {
      return [Number(point[0]), Number(point[1])];
    });
    if (points.length < 2) return null;
    var target = [Number(incident.lat), Number(incident.lng)];
    var nearest = 0;
    var best = Infinity;
    points.forEach(function(point, index) {
      var distance = Math.pow(point[0] - target[0], 2) + Math.pow(point[1] - target[1], 2);
      if (distance < best) { best = distance; nearest = index; }
    });
    var start = Math.max(0, nearest - 2);
    var end = Math.min(points.length - 1, nearest + 2);
    if (end <= start) return null;
    var kind = inferEventKind(incident);
    return {
      type: 'Feature',
      properties: {
        order: Number(section.order),
        kind: kind,
        color: EVENT_COLORS[kind] || EVENT_COLORS.other,
        label: incident.title || kind
      },
      geometry: {
        type: 'LineString',
        coordinates: points.slice(start, end + 1).map(toLngLat)
      }
    };
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

  function createRenderer(options) {
    var renderer = {
      map: null,
      module: null,
      markers: [],
      terrainTimer: null,
      mode: '3d',
      onReady: options.onReady || function() {},
      onFallback: options.onFallback || function() {},
      onStatus: options.onStatus || function() {},
      init: function() {
        var self = this;
        return loadMapLibre().then(function(module) {
          self.module = module;
          var maplibregl = module;
          self.map = new maplibregl.Map({
            container: options.container,
            center: [Config.MAP_CENTER[1], Config.MAP_CENTER[0]],
            zoom: Config.MAP_ZOOM,
            pitch: 58,
            bearing: -12,
            maxPitch: 85,
            attributionControl: true,
            style: {
              version: 8,
              sources: {
                base: {
                  type: 'raster',
                  tiles: [
                    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                    'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                    'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
                  ],
                  tileSize: 256,
                  attribution: '&copy; OpenStreetMap &copy; CARTO',
                  maxzoom: 19
                },
                terrainSource: {
                  type: 'raster-dem',
                  url: 'https://tiles.mapterhorn.com/tilejson.json',
                  tileSize: 512,
                  encoding: 'terrarium',
                  bounds: TERRAIN_BOUNDS
                },
                hillshadeSource: {
                  type: 'raster-dem',
                  url: 'https://tiles.mapterhorn.com/tilejson.json',
                  tileSize: 512,
                  encoding: 'terrarium',
                  bounds: TERRAIN_BOUNDS
                }
              },
              layers: [
                { id: 'base', type: 'raster', source: 'base' },
                {
                  id: 'hillshade',
                  type: 'hillshade',
                  source: 'hillshadeSource',
                  paint: {
                    'hillshade-shadow-color': '#0b1f2a',
                    'hillshade-highlight-color': '#b8d5c5',
                    'hillshade-accent-color': '#284c4d',
                    'hillshade-exaggeration': 0.55
                  }
                }
              ],
              terrain: { source: 'terrainSource', exaggeration: 1 },
              sky: {}
            }
          });
          self.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
          self.map.on('load', function() {
            self._addDataLayers();
            self.terrainTimer = window.setTimeout(function() {
              if (self.mode === '3d' && self.map && !self.map.isSourceLoaded('terrainSource')) {
                self.setTerrainMode('2d');
                self.onStatus('terrain-unavailable');
              }
            }, 8000);
            self.onReady(self);
          });
          self.map.on('error', function(event) {
            var message = String(event && event.error && event.error.message || '');
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
      _addDataLayers: function() {
        var map = this.map;
        if (!map || map.getSource('desktop-route')) return;
        map.addSource('desktop-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addSource('desktop-sections', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addSource('desktop-events', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addSource('desktop-cameras', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addSource('desktop-weather', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'desktop-route-glow', type: 'line', source: 'desktop-route', paint: { 'line-color': '#fb923c', 'line-width': 12, 'line-opacity': 0.18, 'line-blur': 2 } });
        map.addLayer({ id: 'desktop-route-core', type: 'line', source: 'desktop-route', paint: { 'line-color': '#f97316', 'line-width': 4, 'line-opacity': 0.96 } });
        map.addLayer({ id: 'desktop-section-glow', type: 'line', source: 'desktop-sections', paint: { 'line-color': ['match', ['get', 'level'], 'clear', TRAFFIC_COLORS.clear, 'slow', TRAFFIC_COLORS.slow, 'congested', TRAFFIC_COLORS.congested, TRAFFIC_COLORS.unknown], 'line-width': 12, 'line-opacity': 0.2, 'line-blur': 2 } });
        map.addLayer({ id: 'desktop-section-core', type: 'line', source: 'desktop-sections', paint: { 'line-color': ['match', ['get', 'level'], 'clear', TRAFFIC_COLORS.clear, 'slow', TRAFFIC_COLORS.slow, 'congested', TRAFFIC_COLORS.congested, TRAFFIC_COLORS.unknown], 'line-width': 6, 'line-opacity': 0.98 } });
        map.addLayer({ id: 'desktop-event-cue', type: 'line', source: 'desktop-events', paint: { 'line-color': ['get', 'color'], 'line-width': 8, 'line-opacity': 0.96, 'line-dasharray': [1.5, 1] } });
        map.addLayer({ id: 'desktop-weather', type: 'circle', source: 'desktop-weather', paint: { 'circle-radius': 8, 'circle-color': '#38bdf8', 'circle-opacity': 0.9, 'circle-stroke-color': '#e0f2fe', 'circle-stroke-width': 1 } });
        map.addLayer({ id: 'desktop-cameras', type: 'circle', source: 'desktop-cameras', paint: { 'circle-radius': 5, 'circle-color': '#f8fafc', 'circle-opacity': 0.9, 'circle-stroke-color': '#475569', 'circle-stroke-width': 2 } });
        var self = this;
        map.on('click', 'desktop-section-core', function(event) {
          var feature = event.features && event.features[0];
          if (feature) Bus.emit('condition:select', Number(feature.properties.order));
        });
        map.on('click', 'desktop-cameras', function(event) {
          var feature = event.features && event.features[0];
          var id = feature && feature.properties && feature.properties.id;
          var cam = self.cameraById && self.cameraById[id];
          if (cam && window.InfoMod) InfoMod.open(cam);
        });
        ['desktop-section-core', 'desktop-cameras'].forEach(function(layer) {
          map.on('mouseenter', layer, function() { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', layer, function() { map.getCanvas().style.cursor = ''; });
        });
      },
      _setSourceData: function(id, data) {
        var source = this.map && this.map.getSource(id);
        if (source) source.setData(data);
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
      },
      drawRoute: function(coords) {
        if (!coords || coords.length < 2) return;
        var line = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.map(toLngLat) } };
        this._setSourceData('desktop-route', { type: 'FeatureCollection', features: [line] });
        var bounds = makeBounds(this.module, coords);
        if (bounds && this.map) this.map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 0 });
      },
      drawConditionSections: function(sections) {
        var self = this;
        var sectionFeatures = [];
        var eventFeatures = [];
        var weatherFeatures = [];
        (sections || []).forEach(function(section) {
          var feature = sectionFeature(section);
          if (!feature) return;
          sectionFeatures.push(feature);
          (section.incidents || []).forEach(function(incident) {
            var cue = eventCue(section, incident);
            if (cue) eventFeatures.push(cue);
            if (!incident.locationApproximate && Number.isFinite(Number(incident.lat)) && Number.isFinite(Number(incident.lng))) {
              self._addEventMarker(incident, section);
            }
          });
          var weather = section.weather || {};
          if ((weather.condition || '').indexOf('雨') !== -1 || Number(weather.rainChance) >= 60) {
            var middle = section.geometry[Math.floor(section.geometry.length * 0.62)];
            if (middle) weatherFeatures.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: toLngLat(middle) } });
          }
        });
        this._setSourceData('desktop-sections', { type: 'FeatureCollection', features: sectionFeatures });
        this._setSourceData('desktop-events', { type: 'FeatureCollection', features: eventFeatures });
        this._setSourceData('desktop-weather', { type: 'FeatureCollection', features: weatherFeatures });
        var coords = [];
        sectionFeatures.forEach(function(feature) { coords = coords.concat(feature.geometry.coordinates.map(function(point) { return [point[1], point[0]]; })); });
        var bounds = makeBounds(this.module, coords);
        if (bounds && this.map) this.map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 0 });
      },
      _addEventMarker: function(incident, section) {
        if (!this.module || !this.map) return;
        var kind = inferEventKind(incident);
        var label = (section.roadRef || section.roadName || '沿途路段') + ' · ' + (incident.title || kind);
        var element = markerElement('desktop-event-marker desktop-event-' + kind, label, EVENT_COLORS[kind]);
        element.innerHTML = '<span>' + (kind === 'construction' ? '⚠' : kind === 'accident' ? '!' : kind === 'weather' ? '☁' : '•') + '</span>';
        element.addEventListener('click', function() { Bus.emit('condition:select', Number(section.order)); });
        this.markers.push(new this.module.Marker({ element: element, anchor: 'center' }).setLngLat([Number(incident.lng), Number(incident.lat)]).addTo(this.map));
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
      drawCameras: function(cams) {
        var self = this;
        var features = [];
        this.cameraById = {};
        (cams || []).forEach(function(cam) {
          if (!Number.isFinite(Number(cam.lat)) || !Number.isFinite(Number(cam.lng))) return;
          self.cameraById[cam.id] = cam;
          features.push({ type: 'Feature', properties: { id: cam.id }, geometry: { type: 'Point', coordinates: [Number(cam.lng), Number(cam.lat)] } });
        });
        this._setSourceData('desktop-cameras', { type: 'FeatureCollection', features: features });
      },
      setCursor: function(point) {
        if (!this.module || !this.map || !point) return;
        if (!this.cursorMarker) {
          var element = markerElement('desktop-cursor-marker', '模擬位置', '#f8fafc');
          element.innerHTML = '<span><i class="fa-solid fa-motorcycle"></i></span>';
          this.cursorMarker = new this.module.Marker({ element: element, anchor: 'center' }).addTo(this.map);
        }
        this.cursorMarker.setLngLat([Number(point[1]), Number(point[0])]);
      },
      focusSection: function(order) {
        var source = this.map && this.map.getSource('desktop-sections');
        if (!source || !source._data) return;
        var feature = (source._data.features || []).find(function(item) { return Number(item.properties.order) === Number(order); });
        if (!feature) return;
        var bounds = makeBounds(this.module, feature.geometry.coordinates.map(function(point) { return [point[1], point[0]]; }));
        if (bounds) this.map.fitBounds(bounds, { padding: 90, maxZoom: 13, duration: 550 });
      },
      focusPoint: function(lat, lng, zoom) {
        if (this.map) this.map.easeTo({ center: [Number(lng), Number(lat)], zoom: zoom || 12, duration: 450 });
      },
      setTerrainMode: function(mode) {
        if (!this.map) return;
        this.mode = mode === '3d' ? '3d' : '2d';
        if (this.mode === '3d') {
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
        if (this.terrainTimer) window.clearTimeout(this.terrainTimer);
        this.markers.forEach(function(marker) { marker.remove(); });
        this.markers = [];
        if (this.cursorMarker) this.cursorMarker.remove();
        this.cursorMarker = null;
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
