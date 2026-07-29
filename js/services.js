// Unified service layer for remote data and adapters.

(function() {
  'use strict';

  var GEOCODE_CACHE_MS = 10 * 60 * 1000;
  var geocodeCache = {};
  var geocodeRequests = {};

  function geocodeCacheKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/臺/g, '台')
      .replace(/\s+/g, ' ');
  }

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

  function requestJsonWithTimeout(url, options, fallbackKey, timeoutMs) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var requestOptions = options ? Object.assign({}, options) : {};
    if (controller) requestOptions.signal = controller.signal;
    var timeout = Math.max(1000, Number(timeoutMs) || 20000);
    var timedOut = false;
    var timeoutError = new Error('\u6cbf\u9014\u72c0\u6cc1\u56de\u61c9\u903e\u6642\uff0c\u8acb\u7a0d\u5f8c\u91cd\u8a66\u3002');
    timeoutError.code = 'CONDITIONS_TIMEOUT';
    var timer;
    var request = requestJson(url, requestOptions, fallbackKey).then(function(payload) {
      clearTimeout(timer);
      return payload;
    }, function(error) {
      clearTimeout(timer);
      if (timedOut) throw timeoutError;
      throw error;
    });
    var deadline = new Promise(function(resolve, reject) {
      timer = setTimeout(function() {
        timedOut = true;
        if (controller) controller.abort();
        reject(timeoutError);
      }, timeout);
    });
    return Promise.race([request, deadline]);
  }

  window.AppServices = {
    loadCams: function() {
      setDataStatus('cams', 'loading');
      return requestJson(Config.WORKER_BASE + '/v2/cams', null, 'cams')
        .catch(function(err) {
          if (err.status === 404) return requestJson(Config.WORKER_BASE + '/cam-list', null, 'cams');
          throw err;
        })
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
      return requestJson(Config.WORKER_BASE + '/v2/weather', null, 'weather')
        .catch(function(err) {
          if (err.status === 404) return requestJson(Config.WORKER_BASE + '/weather', null, 'weather');
          throw err;
        })
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

    searchPlaces: function(name, options) {
      var trackStatus = !(options && options.silent);
      var key = geocodeCacheKey(name);
      var cached = geocodeCache[key];
      if (trackStatus) setDataStatus('geocode', 'loading');
      if (cached && cached.expiresAt > Date.now()) {
        if (trackStatus) {
          var cachedPlaces = Array.isArray(cached.payload.data) ? cached.payload.data : [];
          setDataStatus('geocode', cachedPlaces.length ? 'ready' : 'empty', cached.payload.updatedAt);
        }
        return Promise.resolve(cached.payload);
      }

      if (!geocodeRequests[key]) {
        geocodeRequests[key] = requestJson(
          Config.WORKER_BASE + '/v2/geocode?q=' + encodeURIComponent(String(name || '').trim()),
          null,
          'places'
        ).then(function(payload) {
          geocodeCache[key] = {
            payload: payload,
            expiresAt: Date.now() + GEOCODE_CACHE_MS
          };
          delete geocodeRequests[key];
          return payload;
        }).catch(function(err) {
          delete geocodeRequests[key];
          throw err;
        });
      }

      return geocodeRequests[key]
        .then(function(payload) {
          var places = Array.isArray(payload.data) ? payload.data : [];
          if (trackStatus) setDataStatus('geocode', places.length ? 'ready' : 'empty', payload.updatedAt);
          return payload;
        })
        .catch(function(err) {
          if (trackStatus) setDataStatus('geocode', 'error');
          throw err;
        });
    },

    geocodePlace: function(name) {
      return AppServices.searchPlaces(name).then(function(payload) {
        var first = payload.data && payload.data[0];
        return first ? [Number(first.lat), Number(first.lng)] : null;
      });
    },

    createRoute: function(locations, vehicle, preferences) {
      setDataStatus('route', 'loading');
      return requestJson(Config.WORKER_BASE + '/v2/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: locations.map(function(point) {
            return { lat: point[0], lng: point[1], type: 'break' };
          }),
          vehicle: vehicle,
          preferences: preferences || { strategy: 'balanced' }
        })
      }, 'route').then(function(payload) {
        setDataStatus('route', 'ready', payload.updatedAt);
        return payload;
      }).catch(function(err) {
        setDataStatus('route', 'error');
        throw err;
      });
    },

    loadRouteConditions: function(routeId, forceRefresh) {
      setDataStatus('conditions', 'loading');
      var suffix = forceRefresh ? '?refresh=1' : '';
      return requestJsonWithTimeout(
        Config.WORKER_BASE + '/v2/routes/' + encodeURIComponent(routeId) + '/conditions' + suffix,
        null,
        'conditions',
        Config.CONDITIONS_TIMEOUT_MS
      )
        .then(function(payload) {
          var sections = payload.data && Array.isArray(payload.data.sections) ? payload.data.sections : [];
          setDataStatus('conditions', sections.length ? 'ready' : 'empty', payload.updatedAt);
          return payload;
        }).catch(function(err) {
          setDataStatus('conditions', 'error');
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
      return requestJson(Config.WORKER_BASE + '/v2/expand?url=' + encodeURIComponent(url), null, 'data')
        .catch(function(err) {
          if (err.status === 404) return requestJson(Config.WORKER_BASE + '/?url=' + encodeURIComponent(url), null, 'data');
          throw err;
        });
    }
  };
})();
