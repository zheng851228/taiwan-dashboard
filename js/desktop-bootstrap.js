// Load desktop-only modules only when the viewport needs them. This keeps
// MapLibre out of the mobile PWA shell and shows a static notice when WebGL2
// is unavailable or a desktop asset cannot be fetched.
(function() {
  'use strict';

  var DESKTOP_QUERY = '(min-width: 1200px)';
  var loading = null;

  function loadScript(src) {
    var existing = document.querySelector('script[data-desktop-module="' + src + '"]');
    if (existing && existing.dataset.loaded === 'true') return Promise.resolve();
    if (existing && existing._loadPromise) return existing._loadPromise;
    var script = existing || document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.desktopModule = src;
    script._loadPromise = new Promise(function(resolve, reject) {
      script.addEventListener('load', function() {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', function() { reject(new Error('Unable to load ' + src)); }, { once: true });
    });
    if (!existing) document.body.appendChild(script);
    return script._loadPromise;
  }

  // No second map stack is maintained: without WebGL2 (or when the desktop
  // bundle fails to load) the desktop surface shows a static notice instead
  // of falling back to another renderer.
  function webgl2Available() {
    try {
      var canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('experimental-webgl2'));
    } catch (error) {
      return false;
    }
  }

  function showMapDegradedNotice() {
    document.body.classList.add('desktop-map-degraded');
    var desktopMap = document.getElementById('desktop-map');
    if (desktopMap && !desktopMap.querySelector('.map-degraded-notice')) {
      var notice = document.createElement('div');
      notice.className = 'map-degraded-notice';
      notice.innerHTML =
        '<div class="map-degraded-card">' +
          '<div class="map-degraded-title">桌機地圖暫時無法顯示</div>' +
          '<div class="map-degraded-desc">您的瀏覽器不支援 WebGL2，或桌機地圖模組載入失敗。<br>路線規劃、路況與天氣資訊仍可正常使用。</div>' +
        '</div>';
      desktopMap.appendChild(notice);
    }
  }

  function activateDesktopModules() {
    if (!window.matchMedia || !window.matchMedia(DESKTOP_QUERY).matches || loading) return;
    if (!webgl2Available()) {
      showMapDegradedNotice();
      return;
    }
    loading = loadScript('./js/map-provider-config.js?v=44')
      .then(function() { return loadScript('./js/maplibre-renderer.js?v=44'); })
      .then(function() { return loadScript('./js/maplibre-camera-layer.js?v=44'); })
      .then(function() { return loadScript('./js/maplibre-route-layer.js?v=44'); })
      .then(function() { return loadScript('./js/maplibre-condition-layer.js?v=44'); })
      .then(function() { return loadScript('./js/desktop-dashboard.js?v=44'); })
      .then(function() { return loadScript('./js/desktop-layout.js?v=44'); })
      .catch(function() { showMapDegradedNotice(); });
  }

  var media = window.matchMedia && window.matchMedia(DESKTOP_QUERY);
  if (media) {
    activateDesktopModules();
    if (media.addEventListener) media.addEventListener('change', function(event) {
      if (event.matches) activateDesktopModules();
    });
  }
})();
