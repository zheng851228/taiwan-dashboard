// Desktop-only public map provider configuration.
// MapTiler browser keys are visible by design; use a dedicated key restricted
// to the GitHub Pages origin. Local source-restricted requests may fall back
// to CARTO. No Worker or private provider token belongs here.
(function() {
  'use strict';

  window.TWMapProviderConfig = Object.freeze({
    provider: 'maptiler',
    tileset: 'satellite-v4',
    keyName: 'taiwan-dashboard-pages',
    key: 'y3Ul1sIMlCMVMr0nx0HG',
    logoUrl: 'https://api.maptiler.com/resources/logo.svg',
    logoLink: 'https://www.maptiler.com/'
  });
})();
