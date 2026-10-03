/* Google Maps 分享匯入：share target（Android）/ 貼上連結解析。
 * - 分享連結只含起終點、沒有完整 polyline；這裡只解析起終點，
 *   實際路線一律交給 App 自己的路權路線引擎（RouteMod.analyze）重算。
 * - 短連結（maps.app.goo.gl）經 Worker /v2/expand 展開後再解析。
 * - ES5 風格，掛 window.GoogleMapsShare；parseGoogleMapsUrl 為純函式可單元測試。
 */
(function() {
  'use strict';

  var SKIP_SEGMENTS = ['place', 'my location', 'current location', '我的位置', ''];

  function isGoogleMapsHost(hostname) {
    if (!hostname) return false;
    var host = String(hostname).toLowerCase();
    return host === 'google.com' ||
      host === 'maps.app.goo.gl' ||
      host === 'goo.gl' ||
      host.slice(-11) === '.google.com';
  }

  function cleanSegment(raw) {
    try {
      return decodeURIComponent(String(raw).replace(/\+/g, ' ')).trim();
    } catch (err) {
      return String(raw).replace(/\+/g, ' ').trim();
    }
  }

  function parseDirSegments(url) {
    var dirMatch = url.match(/\/dir\/([^@?#]+)/);
    if (!dirMatch) return null;
    var parts = [];
    dirMatch[1].split('/').forEach(function(p) {
      var decoded = cleanSegment(p);
      if (decoded && decoded.length > 1 && SKIP_SEGMENTS.indexOf(decoded.toLowerCase()) === -1) {
        parts.push(decoded);
      }
    });
    if (parts.length >= 2) {
      return { origin: parts[0], destination: parts[parts.length - 1] };
    }
    if (parts.length === 1) {
      return { origin: '', destination: parts[0] };
    }
    return null;
  }

  function parseDataParam(url) {
    var dataMatch = url.match(/data=([^&\s#]+)/);
    if (!dataMatch) return null;
    var data;
    try { data = decodeURIComponent(dataMatch[1]); } catch (err) { return null; }
    var pairs = [];
    var re = /!2m2!1d(-?\d+\.?\d*)!2d(-?\d+\.?\d*)/g;
    var m;
    while ((m = re.exec(data)) !== null) {
      pairs.push(m[2] + ',' + m[1]);
    }
    if (pairs.length >= 2) {
      return { origin: pairs[0], destination: pairs[pairs.length - 1] };
    }
    if (pairs.length === 1) {
      return { origin: '', destination: pairs[0] };
    }
    return null;
  }

  // 純函式：解析 Google Maps 路線 URL，回傳 { origin, destination } 或 null。
  // 起終點可能是地名或 "lat,lng"，保留原字串不另做 geocode。
  function parseGoogleMapsUrl(url) {
    if (typeof url !== 'string') return null;
    url = url.trim();
    if (!url) return null;
    var parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return null;
    }
    if (!isGoogleMapsHost(parsed.hostname)) return null;

    // 1. ?api=1&origin=…&destination=… 參數式（通用分享格式）
    var origin = '';
    var destination = '';
    try {
      origin = (parsed.searchParams.get('origin') || '').trim();
      destination = (parsed.searchParams.get('destination') || '').trim();
    } catch (err) {}
    if (origin || destination) {
      return { origin: origin, destination: destination };
    }

    // 2. /dir/起點/終點/ 路徑段
    var seg = parseDirSegments(url);
    if (seg && (seg.origin || seg.destination)) return seg;

    // 3. data= 內嵌座標（短連結展開後的常見格式）
    var data = parseDataParam(url);
    if (data && (data.origin || data.destination)) return data;

    return null;
  }

  // 從分享文字中抽出 Google Maps 連結（text 參數可能夾雜其他文字）
  function extractMapsUrl(text) {
    if (typeof text !== 'string') return null;
    var m = text.match(/https?:\/\/[^\s"'<>]+/);
    if (!m) return null;
    var url = m[0].replace(/[.,;:!?)\]]+$/, '');
    var parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return null;
    }
    return isGoogleMapsHost(parsed.hostname) ? url : null;
  }

  function needsExpand(url) {
    return url.indexOf('maps.app.goo.gl') !== -1 || url.indexOf('goo.gl/') !== -1;
  }

  // 展開短連結（經 Worker /v2/expand）後解析；回傳 Promise<{origin,destination}|null>
  function expandAndParse(url) {
    var done = function(finalUrl) { return parseGoogleMapsUrl(finalUrl); };
    if (!needsExpand(url)) {
      return Promise.resolve(done(url));
    }
    if (window.AppServices && typeof window.AppServices.expandShortUrl === 'function') {
      return window.AppServices.expandShortUrl(url).then(function(payload) {
        var data = (payload && payload.data) || {};
        return done(data.finalUrl || url);
      }, function() {
        return done(url);
      });
    }
    return Promise.resolve(done(url));
  }

  function getShareParams() {
    try {
      return new URLSearchParams(window.location.search || '');
    } catch (err) {
      return null;
    }
  }

  // 完成（成功或失敗）後清掉分享參數，避免重新整理重複匯入
  function clearShareParams() {
    try {
      var params = getShareParams();
      if (!params) return;
      ['shared', 'url', 'text', 'title'].forEach(function(k) { params.delete(k); });
      var query = params.toString();
      var next = window.location.pathname + (query ? '?' + query : '') + (window.location.hash || '');
      window.history.replaceState(null, '', next);
    } catch (err) {}
  }

  function toast(message, ms) {
    if (window.Toast && typeof window.Toast.show === 'function') {
      window.Toast.show(message, ms);
    }
  }

  function requestAnalyze() {
    var emit = function() {
      if (window.Bus && typeof window.Bus.emit === 'function') {
        window.Bus.emit('route:request', { action: 'analyze' });
      } else if (window.RouteMod && typeof window.RouteMod.analyze === 'function') {
        window.RouteMod.analyze();
      }
    };
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(emit);
    } else {
      emit();
    }
  }

  function fillAndAnalyze(origin, destination) {
    var startEl = window.document.getElementById('js-route-start');
    var endEl = window.document.getElementById('js-route-end');
    if (startEl) {
      startEl.value = origin || '';
      delete startEl.dataset.routePoint;
      delete startEl.dataset.routePointLabel;
    }
    if (endEl) {
      endEl.value = destination || '';
      delete endEl.dataset.routePoint;
      delete endEl.dataset.routePointLabel;
    }
    toast('起終點已帶入，將以起終點重新規劃機車路線', 3000);
    requestAnalyze();
  }

  // 完整匯入流程：展開 → 解析 → 填入 → 分析；回傳 Promise<boolean>（是否成功帶入）
  function importSharedUrl(urlText) {
    var candidate = extractMapsUrl(urlText);
    if (!candidate) {
      toast('無法解析此分享連結，請手動輸入起終點', 3500);
      clearShareParams();
      return Promise.resolve(false);
    }
    return expandAndParse(candidate).then(function(parsed) {
      clearShareParams();
      if (parsed && (parsed.origin || parsed.destination)) {
        fillAndAnalyze(parsed.origin, parsed.destination);
        return true;
      }
      toast('無法解析此分享連結，請手動輸入起終點', 3500);
      return false;
    }, function() {
      clearShareParams();
      toast('讀取分享連結失敗，請稍後重試或手動輸入', 3500);
      return false;
    });
  }

  // 頁面載入時：share target 會帶 ?shared=1&url=…（Android；iOS 不支援靠貼上框）
  function init() {
    var params = getShareParams();
    if (!params) return;
    var sharedUrl = params.get('url') || '';
    var sharedText = params.get('text') || '';
    var candidate = extractMapsUrl(sharedUrl) || extractMapsUrl(sharedText);
    if (!candidate) return;
    importSharedUrl(candidate);
  }

  window.GoogleMapsShare = {
    parseGoogleMapsUrl: parseGoogleMapsUrl,
    extractMapsUrl: extractMapsUrl,
    expandAndParse: expandAndParse,
    importSharedUrl: importSharedUrl,
    init: init
  };
})();
