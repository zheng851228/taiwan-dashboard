// Unified service layer for remote data and adapters.

(function() {
  'use strict';

  function normalizeEnvelope(raw, fallbackKey) {
    if (raw && typeof raw === 'object' && raw.status && raw.data !== undefined) {
      return raw;
    }
    return {
      status: 'ok',
      updatedAt: new Date().toISOString(),
      data: raw && raw[fallbackKey] !== undefined ? raw[fallbackKey] : raw,
      message: ''
    };
  }

  function requestJson(url, options, fallbackKey) {
    return fetchJson(url, options).then(function(raw) {
      return normalizeEnvelope(raw, fallbackKey);
    });
  }

  window.AppServices = {
    loadCams: function() {
      setDataStatus('cams', 'loading');
      return requestJson(Config.WORKER_BASE + '/cam-list', null, 'cams')
        .then(function(payload) {
          var list = Array.isArray(payload.data) ? payload.data : [];
          setDataStatus('cams', list.length ? 'ready' : 'empty', payload.updatedAt);
          return payload;
        })
        .catch(function(err) {
          setDataStatus('cams', 'error');
          throw err;
        });
    },

    loadWeather: function() {
      setDataStatus('weather', 'loading');
      return requestJson(Config.WORKER_BASE + '/weather', null, 'weather')
        .then(function(payload) {
          var keys = payload.data && typeof payload.data === 'object' ? Object.keys(payload.data) : [];
          setDataStatus('weather', keys.length ? 'ready' : 'empty', payload.updatedAt);
          return payload;
        })
        .catch(function(err) {
          setDataStatus('weather', 'error');
          throw err;
        });
    },

    geocodePlace: function(name) {
      setDataStatus('geocode', 'loading');
      return geocodeName(name)
        .then(function(result) {
          setDataStatus('geocode', result ? 'ready' : 'empty');
          return result;
        })
        .catch(function(err) {
          setDataStatus('geocode', 'error');
          throw err;
        });
    },

    parseRoute: function(startLatLng, endLatLng, mode) {
      setDataStatus('route', 'loading');
      return requestJson(Config.WORKER_BASE + '/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startLat: startLatLng[0],
          startLng: startLatLng[1],
          endLat: endLatLng[0],
          endLng: endLatLng[1],
          mode: mode
        })
      }, 'route').then(function(payload) {
        setDataStatus('route', 'ready', payload.updatedAt);
        return payload;
      }).catch(function(err) {
        setDataStatus('route', 'error');
        throw err;
      });
    },

    expandShortUrl: function(url) {
      if (url.indexOf('maps.app.goo.gl') === -1 && url.indexOf('goo.gl') === -1) {
        return Promise.resolve({
          status: 'ok',
          updatedAt: new Date().toISOString(),
          data: { finalUrl: url },
          message: ''
        });
      }
      return requestJson(Config.WORKER_BASE + '/?url=' + encodeURIComponent(url), null, 'data');
    }
  };
})();
