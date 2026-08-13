// Core config, diagnostics, utilities, and route helpers.

// Extracted from index.html for easier maintenance.

(function() {
  'use strict';

  var workerOverride = '';
  var DEFAULT_WORKER_ORIGIN = 'https://taiwan-dashboard-api-production.lucky851228.workers.dev';
  var ALLOWED_WORKER_ORIGINS = new Set([
    DEFAULT_WORKER_ORIGIN,
    'https://taiwan-dashboard-api-staging.lucky851228.workers.dev',
    'http://localhost:8787',
    'http://127.0.0.1:8787'
  ]);
  try {
    var candidate = new URLSearchParams(window.location.search).get('worker') || '';
    if (candidate) {
      var parsed = new URL(candidate);
      var origin = parsed.origin;
      var localPage = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      var localFixtureOrigin = localPage && /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
      var isCleanOrigin = parsed.pathname === '/' && !parsed.search && !parsed.hash && (ALLOWED_WORKER_ORIGINS.has(origin) || localFixtureOrigin);
      if (isCleanOrigin) workerOverride = origin;
    }
  } catch (err) {
    workerOverride = '';
  }

  window.Config = {
    MAP_CENTER: [23.9, 121.0],
    MAP_ZOOM: 7,
    ROUTE_FILTER_KM: 20.0,
    SIMPLIFY_STEP: 2,
    CONDITIONS_TIMEOUT_MS: 20000,
    WORKER_BASE: workerOverride || DEFAULT_WORKER_ORIGIN,
    // CARTO supplies the road/land base without baked-in English labels;
    // localized labels are rendered by the app so desktop and mobile stay
    // consistently in Traditional Chinese.
    TILE_DARK:  'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    TILE_LIGHT: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    TILE_ATTR:  '&copy; OpenStreetMap &copy; CARTO',
    MAP_LABELS: [
      ['台北', 25.0330, 121.5654], ['基隆', 25.1283, 121.7419],
      ['桃園', 24.9937, 121.3010], ['新竹', 24.8138, 120.9675],
      ['苗栗', 24.5600, 120.8200], ['台中', 24.1477, 120.6736],
      ['彰化', 23.9916, 120.6158], ['南投', 23.9609, 120.9718],
      ['雲林', 23.7092, 120.4313], ['嘉義', 23.4801, 120.4491],
      ['台南', 22.9999, 120.2270], ['高雄', 22.6273, 120.3014],
      ['屏東', 22.5519, 120.5487], ['宜蘭', 24.6941, 121.7378],
      ['花蓮', 23.9871, 121.6015], ['台東', 22.7972, 121.0713],
      ['澎湖', 23.5711, 119.5793], ['金門', 24.4493, 118.3765]
    ],
    REGIONS: {
      north:   ['台北市','新北市','基隆市','桃園市','新竹市','新竹縣','宜蘭縣'],
      central: ['苗栗縣','台中市','彰化縣','南投縣','雲林縣'],
      south:   ['嘉義市','嘉義縣','台南市','高雄市','屏東縣'],
      east:    ['花蓮縣','台東縣'],
      island:  ['澎湖縣','金門縣','連江縣']
    }
  };

  window.AppState = {
    workerResult: null,
    lastRouteInfo: null,
    routeAllPoints: null,
    routeInputValues: [],
    activeRoute: null,
    routeConditions: null,
    routeReport: null,
    pendingWaypoints: [],
    waypointMapMarkers: [],
    updatedAt: {
      cams: null,
      weather: null,
      route: null
    },
    dataStatus: {
      cams: 'idle',
      weather: 'idle',
      geocode: 'idle',
      route: 'idle',
      conditions: 'idle'
    }
  };

  // ===== 螢幕診斷工具 =====
  window.Diag = {
    logs: [],
    add: function(msg, level) {
      level = level || 'info';
      var time = new Date().toTimeString().slice(0,8);
      Diag.logs.push({ time: time, msg: msg, level: level });
      if (typeof console !== 'undefined') console.log('[Diag]', msg);
      Diag._render();
    },
    info: function(m) { Diag.add(m, 'info'); },
    ok:   function(m) { Diag.add(m, 'ok'); },
    err:  function(m) { Diag.add(m, 'err'); },
    warn: function(m) { Diag.add(m, 'warn'); },
    show: function() {
      var p = document.getElementById('diag-panel');
      if (p) p.classList.add('visible');
    },
    hide: function() {
      var p = document.getElementById('diag-panel');
      if (p) p.classList.remove('visible');
    },
    _render: function() {
      var el = document.getElementById('diag-log');
      if (!el) return;
      var html = Diag.logs.slice(-20).map(function(l) {
        var cls = l.level === 'err' ? 'diag-err' : (l.level === 'warn' ? 'diag-warn' : (l.level === 'info' ? 'diag-info' : ''));
        var icon = l.level === 'err' ? '❌' : (l.level === 'warn' ? '⚠️' : (l.level === 'ok' ? '✅' : '·'));
        return '<div class="' + cls + '">' + icon + ' ' + escapeHtml(l.msg) + '</div>';
      }).join('');
      el.innerHTML = html;
    }
  };

  // 連續點擊時鐘 3 次開啟診斷面板
  (function() {
    var taps = 0, lastTap = 0;
    document.addEventListener('DOMContentLoaded', function() {
      var clk = document.getElementById('js-clk');
      if (!clk) return;
      clk.addEventListener('click', function() {
        var now = Date.now();
        if (now - lastTap < 600) { taps++; } else { taps = 1; }
        lastTap = now;
        if (taps >= 3) {
          Diag.show();
          taps = 0;
        }
      });
    });
  })();
})();

(function() {
  'use strict';

  var _listeners = {};
  window.Bus = {
    on:   function(evt, fn) { if (!_listeners[evt]) _listeners[evt] = []; _listeners[evt].push(fn); },
    emit: function(evt, data) { (_listeners[evt] || []).forEach(function(fn) { fn(data); }); }
  };

  window.Toast = {
    show: function(msg, ms) {
      var el = document.getElementById('toast');
      if (!el) return;
      el.textContent = msg;
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
      setTimeout(function() {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(8px)';
      }, ms || 2500);
    }
  };

  window.Dom = {
    byId: function(id) {
      return document.getElementById(id);
    },
    query: function(selector, root) {
      return (root || document).querySelector(selector);
    },
    queryAll: function(selector, root) {
      return Array.prototype.slice.call((root || document).querySelectorAll(selector));
    },
    on: function(target, eventName, handler, options) {
      if (!target) return null;
      target.addEventListener(eventName, handler, options);
      return target;
    },
    onId: function(id, eventName, handler, options) {
      return Dom.on(Dom.byId(id), eventName, handler, options);
    },
    onAll: function(selector, eventName, handler, root, options) {
      return Dom.queryAll(selector, root).map(function(node, index) {
        node.addEventListener(eventName, function(event) {
          return handler(node, event, index);
        }, options);
        return node;
      });
    }
  };

  window.Storage = {
    get: function(key, fallback) {
      try {
        var value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (err) {
        return fallback;
      }
    },
    set: function(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (err) {
        return false;
      }
    },
    getJson: function(key, fallback) {
      var raw = Storage.get(key, null);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    setJson: function(key, value) {
      try {
        return Storage.set(key, JSON.stringify(value));
      } catch (err) {
        return false;
      }
    }
  };

  window.fetchJson = function(url, options) {
    return fetch(url, options).then(function(response) {
      return response.json().catch(function() { return null; }).then(function(payload) {
        if (!response.ok) {
          var error = new Error(payload && payload.message ? payload.message : ('HTTP ' + response.status));
          error.status = response.status;
          error.payload = payload;
          throw error;
        }
        return payload;
      });
    });
  };

  window.escapeHtml = function(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  window.safeHttpUrl = function(value) {
    try {
      var parsed = new URL(String(value || ''), window.location.href);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (err) {
      return '';
    }
  };

  function toRad(d) { return d * Math.PI / 180; }
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*
            Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  window.distToSegKm = function(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) return haversine(px, py, ax, ay);
    var t = ((px - ax)*dx + (py - ay)*dy) / (dx*dx + dy*dy);
    t = Math.max(0, Math.min(1, t));
    return haversine(px, py, ax + t*dx, ay + t*dy);
  };

  window.simplifyCoords = function(coords, step) {
    step = step || Config.SIMPLIFY_STEP;
    var out = [];
    for (var i = 0; i < coords.length; i += step) { out.push(coords[i]); }
    if (out[out.length-1] !== coords[coords.length-1]) out.push(coords[coords.length-1]);
    return out;
  };

  window.getRegion = function(county) {
    var regions = Config.REGIONS;
    for (var r in regions) { if (regions[r].indexOf(county) !== -1) return r; }
    return 'other';
  };

  window.setDataStatus = function(key, status, updatedAt) {
    if (!AppState.dataStatus) AppState.dataStatus = {};
    AppState.dataStatus[key] = status;
    if (updatedAt) {
      if (!AppState.updatedAt) AppState.updatedAt = {};
      AppState.updatedAt[key] = updatedAt;
    }
    if (window.Bus) Bus.emit('status:changed', {
      key: key,
      status: status,
      updatedAt: updatedAt || null
    });
  };

  window.getDataStatus = function(key) {
    return AppState.dataStatus && AppState.dataStatus[key] ? AppState.dataStatus[key] : 'idle';
  };

  window.formatUpdatedAt = function(value) {
    if (!value) return '--';
    var date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
    if (!(date instanceof Date) || isNaN(date.getTime())) return '--';
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  };

  window.getRoadCategoryLabel = function(cat) {
    if (cat === 'highway') return '國道';
    if (cat === 'expressway') return '快速道路';
    if (cat === 'scenic') return '景點';
    if (cat === 'city') return '市區';
    return '省道';
  };

  window.normalizeSearchText = function(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/臺/g, '台')
      .replace(/台灣/g, '台')
      .replace(/臺灣/g, '台')
      .replace(/國道/g, '國')
      .replace(/快速道路/g, '快')
      .replace(/省道/g, '省')
      .replace(/台9線/g, '台9')
      .replace(/台11線/g, '台11')
      .replace(/台61線/g, '台61')
      .replace(/[縣市鄉鎮區路街道里村]/g, ' ')
      .replace(/[_\-\/,，.。()（）]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  window.getSearchVariants = function(value) {
    var base = String(value || '').trim();
    if (!base) return [];
    var set = {};
    function add(v) {
      if (!v) return;
      set[v] = true;
      set[normalizeSearchText(v)] = true;
    }
    add(base);
    [
      ['北宜', '北宜公路'],
      ['蘇花', '蘇花公路'],
      ['南迴', '南迴公路'],
      ['北橫', '北橫公路'],
      ['中橫', '中橫公路'],
      ['南橫', '南橫公路'],
      ['西濱', '西濱快速公路'],
      ['花東縱谷', '花東縱谷'],
      ['東海岸', '台11線']
    ].forEach(function(alias) {
      if (base.indexOf(alias[0]) !== -1) add(alias[1]);
    });
    add(base.replace(/臺/g, '台'));
    add(base.replace(/台/g, '臺'));
    add(base.replace(/台灣|臺灣/g, ''));
    add(base.replace(/縣|市/g, ''));
    add(base.replace(/國道/g, '國'));
    add(base.replace(/快速道路/g, '快'));
    add(base.replace(/省道/g, '省'));
    return Object.keys(set).filter(Boolean);
  };

  var _geocodeCache = {};
  window.geocodeName = function(name) {
    name = name.trim();
    if (_geocodeCache[name]) return Promise.resolve(_geocodeCache[name]);
    // Worker 已負責台／臺、台灣範圍與公部門名稱正規化。
    // 只在完整名稱查無結果時補一次道路常用名，避免舊流程的多次串行等待。
    var fallback = getSearchVariants(name).find(function(candidate) {
      return candidate !== name
        && candidate.indexOf(' ') === -1
        && normalizeSearchText(candidate) !== normalizeSearchText(name);
    });
    function pointFromPayload(payload) {
      var data = payload.data || [];
      if (data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lng)];
      }
      return null;
    }
    return AppServices.searchPlaces(name).then(function(payload) {
      var result = pointFromPayload(payload);
      if (result || !fallback) return result;
      return AppServices.searchPlaces(fallback).then(pointFromPayload);
    }).then(function(result) {
      if (result) {
        _geocodeCache[name] = result;
        Diag.ok('\u5730\u540d\u89e3\u6790: ' + name + ' \u2192 ' + result[0].toFixed(4) + ',' + result[1].toFixed(4));
        return result;
      }
      Diag.err('\u5730\u540d\u89e3\u6790\u5931\u6557: ' + name);
      Diag.show();
      return null;
    }).catch(function() {
      Diag.err('\u5730\u540d API \u932f\u8aa4: ' + name);
      return null;
    });
  };

  window.parseRouteStartEnd = function(url) {
    var result = { start: '', end: '', waypoints: [] };
    var dirMatch = url.match(/\/dir\/([^@?#]+)/);
    if (dirMatch) {
      var rawParts = dirMatch[1].split('/');
      var SKIP = ['place', 'my location', '我的位置', 'current location', ''];
      var parts = [];
      rawParts.forEach(function(p) {
        var decoded = decodeURIComponent(p.replace(/\+/g, ' ')).trim();
        if (decoded && SKIP.indexOf(decoded.toLowerCase()) === -1 && decoded.length > 1) {
          parts.push(decoded);
        }
      });
      if (parts.length >= 2) {
        result.start = parts[0];
        result.end   = parts[parts.length - 1];
        result.waypoints = parts.slice(1, -1);
      } else if (parts.length === 1) {
        result.end = parts[0];
      }
    }
    if (!result.start || !result.end) {
      var dataMatch = url.match(/data=([^&\s#]+)/);
      if (dataMatch) {
        var data = decodeURIComponent(dataMatch[1]);
        var pairs = [];
        var re = /!2m2!1d(-?\d+\.?\d+)!2d(-?\d+\.?\d+)/g;
        var m;
        while ((m = re.exec(data)) !== null) {
          pairs.push(m[2] + ',' + m[1]);
        }
        if (pairs.length >= 2) {
          if (!result.start) result.start = pairs[0];
          if (!result.end) result.end = pairs[pairs.length - 1];
          if (!result.waypoints.length && pairs.length > 2) result.waypoints = pairs.slice(1, -1);
        } else if (pairs.length === 1 && !result.end) {
          result.end = pairs[0];
        }
      }
    }
    if (result.start || result.end) return result;
    return null;
  };

  window.parseAppleMapsRoute = function(url) {
    try {
      var parsed = new URL(url);
      if (parsed.hostname.indexOf('apple.com') === -1) return null;
      var params = parsed.searchParams;
      var start = (params.get('saddr') || '').trim();
      var end = (params.get('daddr') || '').trim();
      var ll = (params.get('ll') || '').trim();
      var q = (params.get('q') || '').trim();

      if (start || end) {
        return { start: start, end: end };
      }
      if (ll && q) {
        return { start: ll, end: q };
      }
      if (q) {
        return { start: '', end: q };
      }
      if (ll) {
        return { start: ll, end: '' };
      }
    } catch (err) {}
    return null;
  };

  window.autoFillRoute = function(text, onFill, onError) {
    function fail(message) {
      AppState.workerResult = null;
      if (typeof onError === 'function') {
        onError(message);
      } else {
        Toast.show(message);
      }
    }
    text = text.trim();
    if (!text) return false;
    if (text.indexOf('google.com/maps/dir') !== -1) {
      var result = parseRouteStartEnd(text);
      if (result && (result.start || result.end)) {
        onFill(result.start || '', result.end || '', result.waypoints || []);
        return true;
      }
    }
    if (text.indexOf('http') === 0) {
      AppState.workerResult = null;
      expandGoogleUrl(text).then(function(fullUrl) {
        if (AppState.workerResult && (AppState.workerResult.start || AppState.workerResult.end)) {
          onFill(AppState.workerResult.start || '', AppState.workerResult.end || '', AppState.workerResult.waypoints || []);
          AppState.workerResult = null;
          return;
        }
        var r = parseRouteStartEnd(fullUrl);
        if (r && (r.start || r.end)) {
          onFill(r.start || '', r.end || '', r.waypoints || []);
          return;
        }
        var appleRoute = parseAppleMapsRoute(fullUrl);
        if (appleRoute && (appleRoute.start || appleRoute.end)) {
          onFill(appleRoute.start || '', appleRoute.end || '');
          return;
        }
        var coords = parseGoogleMapsCoords(fullUrl);
        if (coords.length >= 2) {
          onFill(
            coords[0][0]+','+coords[0][1],
            coords[coords.length-1][0]+','+coords[coords.length-1][1],
            coords.slice(1, -1).map(function(point) { return point[0] + ',' + point[1]; })
          );
          return;
        }
        var mAt = fullUrl.match(/@(-?[0-9]+\.[0-9]+),(-?[0-9]+\.[0-9]+)/);
        if (mAt) {
          onFill(mAt[1]+','+mAt[2], '');
          Toast.show('地點帶入為起點，請補充終點');
          return;
        }
        fail('無法解析，請保留連結並手動輸入起終點');
      }).catch(function() {
        fail('讀取路線連結失敗，請稍後重試或手動輸入');
      });
      return true;
    }
    fail('目前僅支援 Google Maps 或 Apple Maps 路線連結');
    return false;
  };

  window.extractPointFromUrl = function(input) {
    if (!input || !input.trim()) return Promise.resolve(null);
    var s = input.trim();
    var coordM = s.match(/^(-?\d+\.?\d+),\s*(-?\d+\.?\d+)$/);
    if (coordM) return Promise.resolve([parseFloat(coordM[1]), parseFloat(coordM[2])]);
    if (s.indexOf('http') === 0) {
      return expandGoogleUrl(s).then(function(fullUrl) {
        var m = fullUrl.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (m) return [parseFloat(m[1]), parseFloat(m[2])];
        var m2 = fullUrl.match(/query=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (m2) return [parseFloat(m2[1]), parseFloat(m2[2])];
        var m3 = fullUrl.match(/ll=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (m3) return [parseFloat(m3[1]), parseFloat(m3[2])];
        var appleRoute = parseAppleMapsRoute(fullUrl);
        if (appleRoute) {
          if (appleRoute.start && /^-?\d+\.?\d+,\s*-?\d+\.?\d+$/.test(appleRoute.start)) {
            var a1 = appleRoute.start.split(',');
            return [parseFloat(a1[0]), parseFloat(a1[1])];
          }
          if (appleRoute.end && /^-?\d+\.?\d+,\s*-?\d+\.?\d+$/.test(appleRoute.end)) {
            var a2 = appleRoute.end.split(',');
            return [parseFloat(a2[0]), parseFloat(a2[1])];
          }
          if (appleRoute.end) return geocodeName(appleRoute.end);
          if (appleRoute.start) return geocodeName(appleRoute.start);
        }
        var placeM = fullUrl.match(/\/place\/([^/@]+)/);
        if (placeM) return geocodeName(decodeURIComponent(placeM[1].replace(/\+/g,' ')));
        return null;
      });
    }
    return geocodeName(s);
  };

  window.simplifyAddress = function(addr) {
    if (!addr) return addr;
    addr = addr.trim();
    if (/^-?[0-9]+\.[0-9]+,-?[0-9]+\.[0-9]+$/.test(addr)) return addr;
    if (addr.indexOf(' ') !== -1) addr = addr.split(' ')[0];
    var m = addr.match(/^(.+?(?:路|街|道|巧|大道|大學|博物館|車站|機場|公園|廟|寺|館|院|場|橋|站|港|廠|廣場))/);
    if (m) return m[1];
    return addr.slice(0, 20);
  };

  window.getRoadRoute = function(startLatLng, endLatLng, mode) {
    Diag.info('路線查詢: ' + startLatLng[0].toFixed(4) + ',' + startLatLng[1].toFixed(4) + ' → ' + endLatLng[0].toFixed(4) + ',' + endLatLng[1].toFixed(4));

    return AppServices.parseRoute(startLatLng, endLatLng, mode)
    .then(function(payload) {
      var data = payload.data || {};
      Diag.add('Worker /route HTTP 200', 'ok');
      return data;
    })
    .then(function(data) {
      if (data.error) throw new Error(data.error);
      Diag.ok('路線來源: ' + data.source + ' 距離: ' + data.distance + 'km');

      var coords;
      if (data.source === 'valhalla' && data.shape) {
        coords = decodePolyline6(data.shape);
      } else if (data.source === 'osrm' && data.geojson) {
        coords = data.geojson.map(function(c) { return [c[1], c[0]]; });
      }

      Diag.info('路線點數: ' + (coords ? coords.length : 0));
      if (!coords || coords.length < 5) throw new Error('empty route');

      AppState.lastRouteInfo = {
        distance: data.distance || 0,
        duration: data.duration || 0
      };
      return coords;
    })
    .catch(function(err) {
      Diag.err('路線失敗: ' + err.message);
      Diag.show();
      return [startLatLng, endLatLng];
    });
  };

  // Valhalla encoded polyline6 解碼
  function decodePolyline6(str) {
    var coords = [];
    var index = 0, lat = 0, lng = 0;
    while (index < str.length) {
      var b, shift = 0, result = 0;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      var dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;
      shift = 0; result = 0;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      var dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;
      coords.push([lat / 1e6, lng / 1e6]);
    }
    return coords;
  }

  window.expandGoogleUrl = function(url) {
    return AppServices.expandShortUrl(url)
      .then(function(payload) {
        var data = payload.data || {};
        if (data.start !== undefined || data.end) {
          AppState.workerResult = {
            start:     data.start     || '',
            end:       data.end       || '',
            waypoints: data.waypoints || [],
          };
        }
        return data.finalUrl || url;
      })
      .catch(function() { return url; });
  };

  window.parseGoogleMapsCoords = function(url) {
    var coords = [];
    var dirMatch = url.match(/\/dir\/([^@?]+)/);
    if (dirMatch) {
      dirMatch[1].split('/').forEach(function(p) {
        var m = p.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (m) coords.push([parseFloat(m[1]), parseFloat(m[2])]);
      });
    }
    var dataMatch = url.match(/data=([^&]+)/);
    if (dataMatch) {
      var raw = decodeURIComponent(dataMatch[1]);
      var re = /!3d(-?\d+\.?\d+)!4d(-?\d+\.?\d+)/g;
      var m;
      while ((m = re.exec(raw)) !== null) coords.push([parseFloat(m[1]), parseFloat(m[2])]);
    }
    if (coords.length < 2) {
      var re2 = /([2][0-5]\.\d{4,}),\s*(1[12][0-9]\.\d{4,})/g;
      var m2;
      while ((m2 = re2.exec(url)) !== null) coords.push([parseFloat(m2[1]), parseFloat(m2[2])]);
    }
    return coords;
  };
})();
