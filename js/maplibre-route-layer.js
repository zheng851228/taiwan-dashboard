// Desktop MapLibre route overlay seam.
// Loaded after maplibre-renderer.js so new renderer instances preserve the
// existing drawRoute API while route GeoJSON and fitBounds ownership moves
// out of the main renderer incrementally.
(function() {
  'use strict';

  function toLngLat(point) {
    return [Number(point[1]), Number(point[0])];
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

  function draw(renderer, coords) {
    if (!renderer || !coords || coords.length < 2) return false;
    renderer.routeCoords = coords.slice();
    renderer.routeFitApplied = true;

    var line = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords.map(toLngLat) }
    };
    if (typeof renderer._setSourceData === 'function') {
      renderer._setSourceData('desktop-route', { type: 'FeatureCollection', features: [line] });
    }

    var bounds = makeBounds(renderer.module, coords);
    if (bounds && renderer.map && typeof renderer.map.fitBounds === 'function') {
      var padding = typeof renderer._routePadding === 'function' ? renderer._routePadding() : 70;
      renderer.map.fitBounds(bounds, { padding: padding, maxZoom: 11, duration: 0 });
    }
    return true;
  }

  function install() {
    var mapRenderer = window.MapRenderer;
    if (!mapRenderer || typeof mapRenderer.create !== 'function') return false;
    if (mapRenderer.__routeLayerInstalled) return true;

    var originalCreate = mapRenderer.create;
    mapRenderer.create = function(options) {
      var renderer = originalCreate.call(mapRenderer, options);
      if (!renderer) return renderer;
      renderer.drawRoute = function(coords) {
        return draw(renderer, coords);
      };
      renderer.routeLayerInstalled = true;
      return renderer;
    };
    mapRenderer.__routeLayerInstalled = true;
    return true;
  }

  window.MapRouteLayer = {
    draw: draw,
    makeBounds: makeBounds,
    install: install
  };

  install();
})();
