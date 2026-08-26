// Desktop MapLibre CCTV overlay seam.
// Loaded after maplibre-renderer.js and before desktop-dashboard.js so new
// renderer instances keep the existing drawCameras API while camera marker
// ownership can move out of the main renderer incrementally.
(function() {
  'use strict';

  function cameraMarkerElement(cam) {
    var element = document.createElement('button');
    element.type = 'button';
    element.className = 'desktop-map-marker desktop-cctv-marker';
    element.style.setProperty('--marker-color', '#07111b');
    element.setAttribute('aria-label', '沿途 CCTV：' + (cam.name || '未命名攝影機'));
    element.innerHTML = '<i class="fa-solid fa-camera" aria-hidden="true"></i>';
    element.title = cam.name || '沿途 CCTV';
    return element;
  }

  function removeMarkers(renderer) {
    if (!renderer || !Array.isArray(renderer.markers)) return;
    renderer.markers = renderer.markers.filter(function(marker) {
      var element = marker && marker.getElement && marker.getElement();
      if (element && element.classList && element.classList.contains('desktop-cctv-marker')) {
        marker.remove();
        return false;
      }
      return true;
    });
  }

  function draw(renderer, cams) {
    if (!renderer) return [];
    var features = [];
    renderer.cameraById = {};
    removeMarkers(renderer);

    (cams || []).forEach(function(cam) {
      if (!cam || !Number.isFinite(Number(cam.lat)) || !Number.isFinite(Number(cam.lng))) return;
      renderer.cameraById[cam.id] = cam;
      features.push({
        type: 'Feature',
        properties: { id: cam.id },
        geometry: { type: 'Point', coordinates: [Number(cam.lng), Number(cam.lat)] }
      });

      if (!renderer.module || !renderer.map || typeof renderer.module.Marker !== 'function') return;
      var element = cameraMarkerElement(cam);
      element.addEventListener('click', function(event) {
        event.stopPropagation();
        if (window.InfoMod) window.InfoMod.open(cam);
      });
      renderer.markers.push(new renderer.module.Marker({ element: element, anchor: 'center' })
        .setLngLat([Number(cam.lng), Number(cam.lat)])
        .addTo(renderer.map));
    });

    if (typeof renderer._setSourceData === 'function') {
      renderer._setSourceData('desktop-cameras', { type: 'FeatureCollection', features: features });
    }
    return features;
  }

  function install() {
    var mapRenderer = window.MapRenderer;
    if (!mapRenderer || typeof mapRenderer.create !== 'function') return false;
    if (mapRenderer.__cameraLayerInstalled) return true;

    var originalCreate = mapRenderer.create;
    mapRenderer.create = function(options) {
      var renderer = originalCreate.call(mapRenderer, options);
      if (!renderer) return renderer;
      renderer.drawCameras = function(cams) {
        return draw(renderer, cams);
      };
      renderer.cameraLayerInstalled = true;
      return renderer;
    };
    mapRenderer.__cameraLayerInstalled = true;
    return true;
  }

  window.MapCameraLayer = {
    draw: draw,
    removeMarkers: removeMarkers,
    install: install
  };

  install();
})();