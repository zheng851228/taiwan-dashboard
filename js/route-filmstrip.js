// js/route-filmstrip.js — 沿途 CCTV 膠卷增強層。
//
// 背景：js/enhancements.js 的 RouteStripMod 已經負責渲染橫向膠卷
// （監聽 route:updated → RouteMod.filteredCams，照行進方向排序，點卡片
// 觸發 camera:open + 地圖聚焦）。本模組不重複渲染，而是掛在既有膠卷上
// 補三件事：
//   1. 新鮮度：每張卡顯示「N 分鐘前」，>15 分鐘標示疑似過期樣式。
//   2. 自動刷新：每 5 分鐘（僅膠卷可見且頁面可見時）重抓可見縮圖。
//   3. 休息站重檢：在路線 banner 注入「從目前位置重新健檢」按鈕，
//      用 geolocation 取目前座標 → 起點設為 lat,lng → RouteMod.analyze()。
//
// 新鮮度調查結論（2026-10-03）：上游 twipcam cam-list 經 worker
// loadCameras() 投影後只有 id/name/lat/lng/roadRef/imageUrl/status/source，
// 沒有逐張影像拍攝時間戳；snapshot header 只有整包 builtAt（6h slot）。
// 因此「新鮮度」以客戶端實際載入影像的時間（img load 事件）為準，
// 這是誠實且唯一可靠的訊號。
//
// ES5 風格；以 IIFE 包裝，透過 window.RouteFilmstrip 暴露可測試的純函式。
(function() {
  'use strict';

  var STALE_MS = 15 * 60 * 1000;   // 超過 15 分鐘視為疑似過期
  var REFRESH_MS = 5 * 60 * 1000;  // 影像自動刷新間隔
  var TICK_MS = 60 * 1000;        // 新鮮度文字更新間隔
  var GEO_TIMEOUT_MS = 10000;      // 定位逾時

  // camId -> 該影像最後一次成功載入的時間戳（ms epoch）
  var observedAt = {};

  // ---------- 純函式（可單元測試） ----------

  // 新鮮度文字：ts 為影像載入時間戳，now 預設 Date.now()（測試可注入）
  // 誠實表述：這是「客戶端載入時間」不是拍攝時間，文案一律加「載入」避免誤導。
  function formatFreshness(ts, now) {
    now = (typeof now === 'number') ? now : Date.now();
    var diff = now - ts;
    if (!(diff >= 0)) return '剛剛載入';
    if (diff < 60 * 1000) return '剛剛載入';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分鐘前載入';
    return Math.floor(diff / 3600000) + ' 小時前載入';
  }

  function isStale(ts, now) {
    now = (typeof now === 'number') ? now : Date.now();
    return (now - ts) > STALE_MS;
  }

  // 移除分鐘級 t= cache-buster（內部共用）
  function stripTParam(url) {
    return String(url || '').split('#')[0]
      .replace(/([?&])t=\d+/, '$1')
      .replace(/([?&])[?&]+/g, '$1')
      .replace(/[?&]$/, '');
  }

  // 影像 URL 加上分鐘級 cache-buster；會先移除舊的 t= 參數避免堆疊
  function withCacheBuster(url, ts) {
    var base = stripTParam(url);
    if (!base) return base;
    var t = Math.floor(((typeof ts === 'number') ? ts : Date.now()) / 60000);
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 't=' + t;
  }

  // geolocation 座標 → RouteMod.analyze 可解析的起點字串
  // （extractPointFromUrl 支援 "lat,lng" 正則）
  function formatLatLng(lat, lng) {
    return Number(lat).toFixed(5) + ',' + Number(lng).toFixed(5);
  }

  function geoErrorMessage(err) {
    if (!err) return '定位失敗，請再試一次';
    if (err.code === 1) return '定位權限被拒絕，請到瀏覽器設定開啟定位後再試';
    if (err.code === 2) return '無法取得目前位置，請確認 GPS 已開啟';
    if (err.code === 3) return '定位逾時，請到空曠處再試一次';
    return '定位失敗，請再試一次';
  }

  // ---------- DOM：新鮮度 ----------

  function getScrollEl() {
    return (typeof document === 'undefined')
      ? null
      : document.getElementById('route-camera-strip-scroll');
  }

  function isYoutubeCard(card) {
    return !!card.querySelector('.strip-cam-badge.yt');
  }

  // 每張卡加一個新鮮度 badge（冪等）
  function ensureBadge(card) {
    var imgWrap = card.querySelector('.strip-cam-img');
    if (!imgWrap || card.querySelector('.strip-cam-fresh')) return;
    var badge = document.createElement('div');
    badge.className = 'strip-cam-fresh';
    badge.textContent = isYoutubeCard(card) ? 'YT 直播' : '載入中…';
    imgWrap.appendChild(badge);
  }

  function updateCardFreshness(card, now) {
    var badge = card.querySelector('.strip-cam-fresh');
    if (!badge || isYoutubeCard(card)) return;
    var id = card.getAttribute('data-id');
    var ts = (id && observedAt[id]) || 0;
    if (!ts) {
      badge.textContent = '載入中…';
      card.classList.remove('is-stale');
      return;
    }
    badge.textContent = formatFreshness(ts, now);
    if (isStale(ts, now)) card.classList.add('is-stale');
    else card.classList.remove('is-stale');
  }

  // 追蹤卡片影像載入 → 記錄 observedAt（冪等）
  function trackCard(card) {
    if (card.getAttribute('data-fs-tracked')) return;
    card.setAttribute('data-fs-tracked', '1');
    ensureBadge(card);
    var img = card.querySelector('img');
    if (!img) return;
    var id = card.getAttribute('data-id');
    var record = function() {
      if (id) observedAt[id] = Date.now();
      updateCardFreshness(card, Date.now());
    };
    // RouteStripMod 用 img.onload = … 直接指派，我們用 addEventListener 不衝突
    img.addEventListener('load', record);
    if (img.complete && img.naturalWidth > 0) record();
    updateCardFreshness(card, Date.now());
  }

  function scanExistingCards() {
    var scroll = getScrollEl();
    if (!scroll) return;
    var cards = scroll.querySelectorAll('.strip-cam');
    for (var i = 0; i < cards.length; i++) trackCard(cards[i]);
  }

  function tickFreshness() {
    var scroll = getScrollEl();
    if (!scroll) return;
    var now = Date.now();
    var cards = scroll.querySelectorAll('.strip-cam');
    for (var i = 0; i < cards.length; i++) updateCardFreshness(cards[i], now);
  }

  // ---------- DOM：5 分鐘自動刷新 ----------

  function stripVisible() {
    if (typeof document === 'undefined') return false;
    var panel = document.getElementById('route-camera-strip');
    return !!(panel && panel.classList.contains('visible'));
  }

  function refreshCardImage(img) {
    var src = img.getAttribute('src');
    if (!src) return; // 尚未 lazy-load 的圖，滑入可視區時自然會載最新
    var orig = img.getAttribute('data-fs-orig');
    if (!orig) {
      orig = stripTParam(img.getAttribute('data-src') || src);
      img.setAttribute('data-fs-orig', orig);
    }
    img.src = withCacheBuster(orig, Date.now());
    // load 事件會更新 observedAt；若載入失敗，原圖保留、新鮮度照舊標示
  }

  function maybeAutoRefresh() {
    if (typeof document === 'undefined') return;
    if (document.hidden) return;                    // 背景分頁不跑，省電
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (!stripVisible()) return;
    var scroll = getScrollEl();
    if (!scroll) return;
    var imgs = scroll.querySelectorAll('.strip-cam img');
    for (var i = 0; i < imgs.length; i++) refreshCardImage(imgs[i]);
  }

  // ---------- 休息站重檢 ----------

  function setRecheckBusy(busy) {
    var btn = (typeof document === 'undefined')
      ? null
      : document.getElementById('js-filmstrip-recheck');
    if (!btn) return;
    btn.disabled = !!busy;
    btn.innerHTML = busy
      ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> 定位中…'
      : '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> 休息站重檢';
  }

  function toast(msg, ms) {
    if (typeof window !== 'undefined' && window.Toast && window.Toast.show) {
      window.Toast.show(msg, ms);
    }
  }

  function recheckFromCurrentPosition() {
    var geo = (typeof navigator !== 'undefined') ? navigator.geolocation : null;
    if (!geo) { toast('此裝置不支援定位功能'); return; }
    var routeMod = (typeof window !== 'undefined') ? window.RouteMod : null;
    if (routeMod && routeMod.analyzing) return;
    setRecheckBusy(true);
    geo.getCurrentPosition(function(pos) {
      setRecheckBusy(false);
      var c = pos && pos.coords;
      if (!c) { toast('定位結果異常，請再試一次'); return; }
      var startEl = document.getElementById('js-route-start');
      var endEl = document.getElementById('js-route-end');
      if (!startEl || !endEl) { toast('路線輸入框不存在'); return; }
      // 清掉舊起點的快取座標，避免 buildAddressPlan 誤用
      if (startEl.dataset) {
        delete startEl.dataset.routePoint;
        delete startEl.dataset.routePointLabel;
      }
      startEl.value = formatLatLng(c.latitude, c.longitude);
      if (routeMod && typeof routeMod.analyze === 'function') {
        toast('已改用目前位置為起點，重新分析中…', 2500);
        routeMod.analyze();
      } else {
        toast('路線模組尚未就緒，請稍後再試');
      }
    }, function(err) {
      setRecheckBusy(false);
      toast(geoErrorMessage(err), 3500);
    }, {
      enableHighAccuracy: true,
      timeout: GEO_TIMEOUT_MS,
      maximumAge: 60000
    });
  }

  // 按鈕以 JS 注入路線 banner（不動 index.html）
  function injectRecheckButton() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('js-filmstrip-recheck')) return;
    var banner = document.getElementById('js-route-banner');
    if (!banner) return;
    var box = banner.querySelector('.glass') || banner;
    var btn = document.createElement('button');
    btn.id = 'js-filmstrip-recheck';
    btn.type = 'button';
    btn.className = 'rb-action-btn';
    btn.setAttribute('aria-label', '從目前位置重新健檢路線');
    btn.innerHTML = '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> 休息站重檢';
    btn.addEventListener('click', recheckFromCurrentPosition);
    box.appendChild(btn);
  }

  // ---------- 初始化 ----------

  function init() {
    if (typeof document === 'undefined') return;
    injectRecheckButton();
    scanExistingCards();
    // 膠卷由 RouteStripMod 動態渲染（innerHTML 重建），用 MutationObserver 追蹤新卡
    if (typeof MutationObserver !== 'undefined') {
      var scroll = getScrollEl();
      if (scroll) {
        var obs = new MutationObserver(function(mutations) {
          mutations.forEach(function(m) {
            for (var i = 0; i < m.addedNodes.length; i++) {
              var node = m.addedNodes[i];
              if (node && node.nodeType === 1 && node.classList &&
                  node.classList.contains('strip-cam')) {
                trackCard(node);
              }
            }
          });
        });
        obs.observe(scroll, { childList: true });
      }
    }
    if (typeof setInterval !== 'undefined') {
      setInterval(tickFreshness, TICK_MS);
      setInterval(maybeAutoRefresh, REFRESH_MS);
    }
  }

  window.RouteFilmstrip = {
    formatFreshness: formatFreshness,
    isStale: isStale,
    withCacheBuster: withCacheBuster,
    formatLatLng: formatLatLng,
    geoErrorMessage: geoErrorMessage,
    recheckFromCurrentPosition: recheckFromCurrentPosition,
    STALE_MS: STALE_MS,
    init: init
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
