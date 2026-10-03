// Shared pure map helpers (no DOM, no map instance, no side effects).
// Single source of truth for traffic colors, event-kind inference, and
// bounds math previously duplicated across the Leaflet mobile adapter and
// the MapLibre desktop renderer/layers. Loaded before the layer modules in
// the app bundle; layer files reference window.MapGeoUtils at call time.
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

  // The 9 event kinds both the view-model and the map layers recognize.
  var ROAD_EVENT_KINDS = {
    accident: true,
    construction: true,
    congestion: true,
    control: true,
    weather: true,
    disaster: true,
    activity: true,
    hazard: true,
    other: true
  };

  // [lat, lng] -> [lng, lat] (GeoJSON / MapLibre order).
  function toLngLat(point) {
    return [Number(point[1]), Number(point[0])];
  }

  // Build a maplibregl.LngLatBounds from [lat, lng] points. Returns null when
  // empty. Requires the maplibre module (for LngLatBounds).
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

  // Pure [[swLng, swLat], [neLng, neLat]] bounds from [lat, lng] points.
  // No maplibre dependency; suitable for map.fitBounds(array).
  function boundsOf(points) {
    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    (points || []).forEach(function(point) {
      if (!point) return;
      var lat = Number(point[0]);
      var lng = Number(point[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    });
    if (!Number.isFinite(minLng)) return null;
    return [[minLng, minLat], [maxLng, maxLat]];
  }

  // Infer the road-event kind from title/description via Chinese keywords.
  // Previously duplicated verbatim in route-condition-view-model.js and
  // maplibre-condition-layer.js.
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

  // Approximate a circle as a GeoJSON polygon ring ([lng, lat] pairs).
  // Used for the nearby-radius overlay (MapLibre has no L.circle).
  function circlePolygon(lng, lat, radiusMeters, steps) {
    steps = Math.max(8, Math.min(128, steps || 48));
    var ring = [];
    var earthRadius = 6371000;
    var latRad = Number(lat) * Math.PI / 180;
    var angularDistance = Number(radiusMeters) / earthRadius;
    for (var i = 0; i <= steps; i++) {
      var bearing = (i / steps) * 2 * Math.PI;
      var sinLat = Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing);
      var pointLat = Math.asin(Math.max(-1, Math.min(1, sinLat)));
      var y = Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad);
      var x = Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat);
      var pointLng = (Number(lng) * Math.PI / 180) + Math.atan2(y, x);
      ring.push([pointLng * 180 / Math.PI, pointLat * 180 / Math.PI]);
    }
    return ring;
  }

  window.MapGeoUtils = {
    TRAFFIC_COLORS: TRAFFIC_COLORS,
    EVENT_COLORS: EVENT_COLORS,
    ROAD_EVENT_KINDS: ROAD_EVENT_KINDS,
    toLngLat: toLngLat,
    makeBounds: makeBounds,
    boundsOf: boundsOf,
    inferRoadEventKind: inferRoadEventKind,
    circlePolygon: circlePolygon
  };
})();
