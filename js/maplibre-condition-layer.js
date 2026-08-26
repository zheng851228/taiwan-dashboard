// Dedicated MapLibre condition overlay for desktop renderer instances.
// Keeps the existing drawConditionSections() contract while isolating
// traffic sections, incident cues/markers, weather points, and fallback fit.
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

  function toLngLat(point) {
    return [Number(point[1]), Number(point[0])];
  }

  function escapeHtmlValue(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  function weatherFeature(section) {
    var weather = section.weather || {};
    if ((weather.condition || '').indexOf('雨') === -1 && Number(weather.rainChance) < 60) return null;
    var geometry = section.geometry || [];
    var middle = geometry[Math.floor(geometry.length * 0.62)];
    if (!middle) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: toLngLat(middle) }
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

  function makeBounds(maplibregl, coordinates) {
    if (!maplibregl || typeof maplibregl.LngLatBounds !== 'function') return null;
    var bounds = new maplibregl.LngLatBounds();
    (coordinates || []).forEach(function(point) {
      if (point && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))) {
        bounds.extend([Number(point[1]), Number(point[0])]);
      }
    });
    return bounds.isEmpty() ? null : bounds;
  }

  function addEventMarker(renderer, incident, section) {
    if (!renderer.module || !renderer.map) return null;
    var kind = inferEventKind(incident);
    var label = (section.roadRef || section.roadName || '沿途路段') + ' · ' + (incident.title || kind);
    var element = markerElement('desktop-event-marker desktop-event-' + kind, label, EVENT_COLORS[kind]);
    var safeTitle = escapeHtmlValue(incident.title || kind);
    element.innerHTML = '<span class="desktop-event-icon">' +
      (kind === 'construction' ? '⚠' : kind === 'accident' ? '!' : kind === 'weather' ? '☁' : '•') +
      '</span><span class="desktop-event-callout">' + safeTitle + '</span>';
    element.addEventListener('click', function() {
      if (window.Bus) window.Bus.emit('condition:select', Number(section.order));
    });
    var marker = new renderer.module.Marker({ element: element, anchor: 'center' })
      .setLngLat([Number(incident.lng), Number(incident.lat)])
      .addTo(renderer.map);
    renderer.markers.push(marker);
    return marker;
  }

  function install(renderer) {
    if (!renderer || renderer.conditionLayerInstalled) return renderer;
    renderer.conditionLayerInstalled = true;

    renderer.drawConditionSections = function(sections) {
      var self = this;
      var sectionFeatures = [];
      var eventFeatures = [];
      var weatherFeatures = [];
      this.eventMarkerCount = 0;

      this.markers.forEach(function(marker) {
        var element = marker.getElement && marker.getElement();
        if (element && element.classList.contains('desktop-event-marker')) marker.remove();
      });
      this.markers = this.markers.filter(function(marker) {
        var element = marker.getElement && marker.getElement();
        return !(element && element.classList.contains('desktop-event-marker'));
      });

      (sections || []).forEach(function(section) {
        var feature = sectionFeature(section);
        if (!feature) return;
        sectionFeatures.push(feature);
        (section.incidents || []).forEach(function(incident) {
          var cue = eventCue(section, incident);
          if (cue) eventFeatures.push(cue);
          if (self.eventMarkerCount < 6 && !incident.locationApproximate &&
              Number.isFinite(Number(incident.lat)) && Number.isFinite(Number(incident.lng))) {
            addEventMarker(self, incident, section);
            self.eventMarkerCount += 1;
          }
        });
        var weather = weatherFeature(section);
        if (weather) weatherFeatures.push(weather);
      });

      this._setSourceData('desktop-sections', { type: 'FeatureCollection', features: sectionFeatures });
      this._setSourceData('desktop-events', { type: 'FeatureCollection', features: eventFeatures });
      this._setSourceData('desktop-weather', { type: 'FeatureCollection', features: weatherFeatures });

      var coords = [];
      sectionFeatures.forEach(function(feature) {
        coords = coords.concat(feature.geometry.coordinates.map(function(point) {
          return [point[1], point[0]];
        }));
      });
      if (!this.routeCoords.length && coords.length) this.routeCoords = coords;
      var bounds = makeBounds(this.module, coords);
      if (bounds && this.map && !this.routeFitApplied) {
        this.routeFitApplied = true;
        this.map.fitBounds(bounds, { padding: this._routePadding(), maxZoom: 11, duration: 0 });
      }

      return {
        sections: sectionFeatures,
        events: eventFeatures,
        weather: weatherFeatures,
        eventMarkerCount: this.eventMarkerCount
      };
    };

    return renderer;
  }

  window.MapConditionLayer = {
    install: install,
    sectionFeature: sectionFeature,
    inferEventKind: inferEventKind,
    eventCue: eventCue,
    weatherFeature: weatherFeature
  };

  if (window.MapRenderer && typeof window.MapRenderer.create === 'function' &&
      !window.MapRenderer.__conditionLayerInstalled) {
    var originalCreate = window.MapRenderer.create;
    window.MapRenderer.create = function(options) {
      return install(originalCreate(options));
    };
    window.MapRenderer.__conditionLayerInstalled = true;
  }
})();
