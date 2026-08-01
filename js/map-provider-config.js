// Desktop-only public map provider configuration.
// MapTiler browser keys are visible by design; use a dedicated key restricted
// to the GitHub Pages origin. Leave this empty in local checkouts until that
// key has been created. No Worker or private provider token belongs here.
(function() {
  'use strict';

  window.TWMapProviderConfig = Object.freeze({
    provider: 'maptiler',
    tileset: 'satellite-v4',
    keyName: 'taiwan-dashboard-pages',
    key: '',
    logoUrl: 'https://api.maptiler.com/resources/logo.svg',
    logoLink: 'https://www.maptiler.com/'
  });
})();
