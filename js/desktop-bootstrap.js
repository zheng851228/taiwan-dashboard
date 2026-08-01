// Load desktop-only modules only when the viewport needs them. This keeps
// MapLibre out of the mobile PWA shell and preserves a Leaflet fallback when
// a desktop asset cannot be fetched.
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

  function showLeafletFallback() {
    document.body.classList.add('desktop-legacy-map');
    var map = document.getElementById('map');
    if (map) map.style.display = 'block';
    var desktopMap = document.getElementById('desktop-map');
    if (desktopMap) desktopMap.style.display = 'none';
  }

  function activateDesktopModules() {
    if (!window.matchMedia || !window.matchMedia(DESKTOP_QUERY).matches || loading) return;
    loading = loadScript('./js/maplibre-renderer.js')
      .then(function() { return loadScript('./js/desktop-dashboard.js'); })
      .catch(function() { showLeafletFallback(); });
  }

  var media = window.matchMedia && window.matchMedia(DESKTOP_QUERY);
  if (media) {
    activateDesktopModules();
    if (media.addEventListener) media.addEventListener('change', function(event) {
      if (event.matches) activateDesktopModules();
    });
  }
})();
