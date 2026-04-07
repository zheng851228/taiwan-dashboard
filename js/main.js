/**
 * main.js — 環島路況指揮中心 v1.0 核心邏輯
 * 整合：Theme, Map, Route, List, Modal, App
 */

'use strict';

/* ══════════════════════════════════════
   1. THEME：亮/暗主題切換
   ══════════════════════════════════════ */
const Theme = (() => {
  let dark = true;
  const btn = $('js-theme');

  function apply(isDark) {
    dark = isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    $('meta-theme').content = isDark ? '#060d1f' : '#eef2f7';
    btn.textContent = isDark ? '🌙' : '☀️';
    
    // 從 config.js (C) 獲取顏色並更新圖例
    const cols = isDark ? C.COLS.dark : C.COLS.light;
    if ($('lp-free')) $('lp-free').style.background = cols.free;
    if ($('lp-slow')) $('lp-slow').style.background = cols.slow;
    if ($('lp-bad'))  $('lp-bad').style.background  = cols.bad;
    
    Bus.emit('theme', isDark);
  }

  btn.addEventListener('click', () => apply(!dark));
  return { init() { apply(true); }, isDark() { return dark; } };
})();

/* ══════════════════════════════════════
   2. MAPMOD：地圖控制與座標呈現
   ══════════════════════════════════════ */
const MapMod = (() => {
  let map, tile;
  let cityMarkers = [];
  let userMarker, userCircle;

  function markerColor(city) {
    // _ms 為資料中計算出的路況狀態代碼
    return (Theme.isDark() ? C.COLS.dark : C.COLS.light)[city._ms || 'free'];
  }

  function makeIcon(city) {
    const col = markerColor(city);
    return L.divIcon({
      className: '',
      html: `<div style="background:${col};color:#fff;border-radius:18px;padding:4px 9px;font-size:11px;font-weight:900;border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(0,0,0,.4);white-space:nowrap;cursor:pointer;font-family:var(--font)">${city.name}</div>`,
      iconAnchor: [34, 15],
    });
  }

  function showCity(city) {
    const w = city.w, cnt = city._cnt;
    $('mc-ico').textContent  = w.i;
    $('mc-city').textContent = `${city.name}  ${w.t}°C`;
    $('mc-meta').textContent = `${w.d} | 💧${w.h}% 🌧️${w.rain}%`;
    $('mc-pills').innerHTML  = Object.entries(C.ST).map(([k, s]) =>
      `<span class="mc-pill ${s.p}">${cnt[k] || 0} ${s.lbl}</span>`
    ).join('');
    map.flyTo([city.lat, city.lng], C.MAP.cityZoom, { duration: C.MAP.flyDur });
  }

  // 監聽主題切換，更新底圖與標記
  Bus.on('theme', () => {
    if (!map) return;
    map.removeLayer(tile);
    tile = L.tileLayer(Theme.isDark() ? C.TILES.dark : C.TILES.light, { maxZoom: 19 }).addTo(map);
    refreshMks();
  });

  function refreshMks() {
    cityMarkers.forEach(m => map.removeLayer(m));
    cityMarkers = [];
    Data.all().forEach(city => {
      const m = L.marker([city.lat, city.lng], { icon: makeIcon(city) })
        .addTo(map).on('click', () => showCity(city));
      cityMarkers.push(m);
    });
  }

  return {
    init() {
      map  = L.map('map', { zoomControl: true, attributionControl: false }).setView(C.MAP.center, C.MAP.zoom);
      tile = L.tileLayer(C.TILES.dark, { maxZoom: 19 }).addTo(map);
      refreshMks();
    },
    getMap()     { return map; },
    invalidate() { setTimeout(() => map?.invalidateSize(), 80); },
    refreshMks,
    locate() {
      if (!navigator.geolocation) { Toast.show('瀏覽器不支援定位'); return; }
      const btn = $('js-loc');
      btn.textContent = '⏳';

      navigator.geolocation.getCurrentPosition(
        ({ coords: { latitude: lat, longitude: lng, accuracy } }) => {
          btn.textContent = '📍';
          if (userMarker) map.removeLayer(userMarker);
          if (userCircle) map.removeLayer(userCircle);

          userCircle = L.circle([lat, lng], {
            radius: Math.min(accuracy, 600), color: '#38bdf8', fillColor: '#38bdf8',
            fillOpacity: .1, weight: 1.5, opacity: .4,
          }).addTo(map);

          userMarker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: '',
              html: '<div class="u-wrap"><div class="u-ring"></div><div class="u-core"></div></div>',
              iconSize: [34, 34], iconAnchor: [17, 17],
            }),
            zIndexOffset: 2000,
          }).addTo(map).bindPopup('<strong>📍 你在這裡</strong>');

          map.flyTo([lat, lng], 14, { duration: 1.5 });

          // 自動尋找最近縣市
          const nearest = Data.all().reduce(
            (b, c) => { const d = Math.hypot(c.lat - lat, c.lng - lng); return d < b.d ? { c, d } : b; },
            { c: null, d: Infinity }
          );
          if (nearest.c) { showCity(nearest.c); Toast.show(`📍 最近縣市：${nearest.c.name}`); }
        },
        err => {
          btn.textContent = '📍';
          Toast.show('定位失敗，請確認權限');
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    }
  };
})();

/* ══════════════════════════════════════
   3. ROUTEMOD：路徑感知核心 (剛剛優化的版本)
   ══════════════════════════════════════ */
const RouteMod = (() => {
  let routeLayer     = null;
  let onRouteCamIds  = new Set();
  let onRouteCityIds = new Set();

  function parseGoogleMapsUrl(url) {
    try {
      const atMatches = [...url.matchAll(/@(-?\d+\.\d+),(-?\d+\.\d+)/g)];
      if (atMatches.length >= 2) {
        return {
          from: [parseFloat(atMatches[0][1]), parseFloat(atMatches[0][2])],
          to:   [parseFloat(atMatches[atMatches.length - 1][1]), parseFloat(atMatches[atMatches.length - 1][2])],
        };
      }
      const dirMatch = url.match(/\/dir\/(-?\d+\.\d+),(-?\d+\.\d+)\/(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (dirMatch) {
        return {
          from: [parseFloat(dirMatch[1]), parseFloat(dirMatch[2])],
          to:   [parseFloat(dirMatch[3]), parseFloat(dirMatch[4])],
        };
      }
      return null;
    } catch { return null; }
  }

  function filterCamsOnRoute(coords) {
    onRouteCamIds = new Set();
    onRouteCityIds = new Set();
    const thinned = thinCoords(coords, C.ROUTE_THIN_STEP);
    const allCams = Data.allCams();
    const radius  = C.ROUTE_RADIUS_KM;

    allCams.forEach(cam => {
      let minDist = Infinity;
      for (let i = 0; i < thinned.length - 1; i++) {
        const d = distToSegKm(cam.lat, cam.lng, thinned[i].lat, thinned[i].lng, thinned[i+1].lat, thinned[i+1].lng);
        if (d < minDist) minDist = d;
        if (minDist <= radius) break;
      }
      if (minDist <= radius) {
        onRouteCamIds.add(cam.id);
        onRouteCityIds.add(cam.cityId);
      }
    });
    return { camCount: onRouteCamIds.size, cityCount: onRouteCityIds.size };
  }

  return {
    parse() {
      const url = $('js-route-input').value.trim();
      if (!url) { Toast.show('請貼上網址'); return; }
      if (url.includes('goo.gl')) { Toast.show('⚠️ 請提供完整長網址'); return; }

      const coords = parseGoogleMapsUrl(url);
      if (!coords) { Toast.show('⚠️ 無法解析網址座標'); return; }

      if (routeLayer) MapMod.getMap().removeLayer(routeLayer);
      this.setStatus('🔄 正在規劃環島路徑...');

      routeLayer = L.Routing.control({
        waypoints: [L.latLng(coords.from[0], coords.from[1]), L.latLng(coords.to[0], coords.to[1])],
        lineOptions: { styles: [{ color: '#f97316', opacity: 0.8, weight: 6 }] },
        createMarker: () => null,
        addWaypoints: false
      }).addTo(MapMod.getMap());

      routeLayer.on('routesfound', e => {
        const result = filterCamsOnRoute(e.routes[0].coordinates);
        this.setStatus(`✅ 找到沿途 ${result.cityCount} 個縣市・${result.camCount} 台 CCTV`);
        Bus.emit('route:updated', { camIds: onRouteCamIds, cityIds: onRouteCityIds, ...result });
      });
    },
    clear() {
      if (routeLayer) MapMod.getMap().removeLayer(routeLayer);
      onRouteCamIds = new Set(); onRouteCityIds = new Set();
      $('js-route-input').value = '';
      this.setStatus('');
      Bus.emit('route:cleared');
    },
    setStatus(t) {
      const el = $('js-route-status');
      el.textContent = t;
      el.className = t ? 'route-status show' : 'route-status';
    },
    isActive() { return onRouteCamIds.size > 0; },
    getOnRouteCamIds() { return onRouteCamIds; },
    getOnRouteCityIds() { return onRouteCityIds; }
  };
})();

/* ══════════════════════════════════════
   4. RENDERER & LIST：UI 生成與縣市列表
   ══════════════════════════════════════ */
const Renderer = (() => {
  const { ST: st, SRC: src } = C;
  return {
    card(city, gi, delay, onRouteCamIds) {
      const isOnRoute = RouteMod.getOnRouteCityIds().has(city.id);
      const cnt = city._cnt;
      return `
        <div class="city-card ${isOnRoute ? 'on-route' : ''}" style="animation-delay:${delay}s">
          ${isOnRoute ? '<div class="on-route-badge">🛣️ 沿途</div>' : ''}
          <div class="c-top">
            <div>
              <div class="c-name">${city.name}</div>
              <div class="c-summary">${Object.entries(st).map(([k, s]) => `<span class="cpill ${s.p}">${cnt[k] || 0} ${s.lbl}</span>`).join('')}</div>
            </div>
          </div>
          <div class="wx">
            <div class="wx-ico">${city.w.i}</div>
            <div style="flex:1">
              <div style="display:flex;align-items:baseline;gap:4px"><div class="wx-t">${city.w.t}</div><div class="wx-u">°C</div></div>
              <div class="wx-d">${city.w.d}</div>
            </div>
          </div>
          <div class="cctv-s">
            <div class="reel">${city.cams.map((cv, j) => `
              <div class="thumb ${onRouteCamIds?.has(cv.id) ? 'on-route' : ''}" data-ci="${gi}" data-vi="${j}">
                <div class="th-img">
                  <img data-src="${cv.src === 'yt' ? `https://img.youtube.com/vi/${cv.ytId}/mqdefault.jpg` : cv.img}" alt="${cv.n}">
                  <div class="src-pip" style="background:${src[cv.src].col}">${src[cv.src].lbl}</div>
                  ${cv.src === 'yt' ? '<div class="yt-pip">▶ LIVE</div>' : ''}
                </div>
                <div class="th-lbl">${cv.n}</div>
              </div>`).join('')}
            </div>
          </div>
        </div>`;
    },
    skeleton() { return `<div class="sk-card"><div class="sk sk-h20 sk-30"></div><div class="sk sk-h84 sk-90"></div></div>`; }
  };
})();

const List = (() => {
  let region = 'all', search = '', routeFilter = null;
  const $inner = $('js-list-inner');

  function render() {
    const filtered = Data.filter(region, search, routeFilter);
    $inner.innerHTML = filtered.map(() => Renderer.skeleton()).join('');
    requestAnimationFrame(() => {
      $inner.innerHTML = filtered.map((c, i) => Renderer.card(c, Data.all().indexOf(c), i * .03, RouteMod.getOnRouteCamIds())).join('');
      Lazy.watch($inner);
    });
  }

  Bus.on('route:updated', ({ cityIds }) => { routeFilter = cityIds; $('js-route-banner').classList.add('show'); render(); App.go('list', $('nav-list')); });
  Bus.on('route:cleared', () => { routeFilter = null; $('js-route-banner').classList.remove('show'); render(); });

  $('js-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.rtab');
    if (!btn) return;
    document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    region = btn.dataset.r;
    render();
  });

  $('js-list').addEventListener('click', e => {
    const thumb = e.target.closest('.thumb');
    if (thumb) Modal.open(parseInt(thumb.dataset.ci), parseInt(thumb.dataset.vi));
  });

  return { init: render };
})();

/* ══════════════════════════════════════
   5. MODAL：影像播放器
   ══════════════════════════════════════ */
const Modal = (() => {
  const $bg = $('modal'), $sh = $bg.querySelector('.modal-sh');
  return {
    open(ci, vi) {
      const city = Data.byIdx(ci), cam = city?.cams[vi];
      if (!cam) return;
      const isYt = cam.src === 'yt', origin = encodeURIComponent(location.origin);
      
      $('m-ttl').textContent = cam.n;
      $('m-org').textContent = city.name;
      $('m-med').innerHTML = isYt 
        ? `<iframe src="https://www.youtube.com/embed/${cam.ytId}?autoplay=1&mute=1&playsinline=1&origin=${origin}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
        : `<img src="${cam.img}" alt="${cam.n}">`;

      $bg.classList.add('open');
      document.body.style.overflow = 'hidden';
    },
    close() {
      $('m-med').innerHTML = '';
      $bg.classList.remove('open');
      document.body.style.overflow = '';
    }
  };
})();

/* ══════════════════════════════════════
   6. APP & BOOT：啟動程序
   ══════════════════════════════════════ */
const App = {
  go(page, btn) {
    document.querySelectorAll('.pg').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-it').forEach(b => b.classList.remove('active'));
    $(`pg-${page}`).classList.add('active');
    if (btn) btn.classList.add('active');
    if (page === 'map') MapMod.invalidate();
  }
};

window.addEventListener('load', async () => {
  Clock.init();
  Theme.init();
  MapMod.init();
  List.init();

  await Data.init(); // 初始化氣象資料

  Bus.on('weather:updated', () => { List.init(); MapMod.refreshMks(); });
  
  $('js-loc').addEventListener('click', () => MapMod.locate());
  $('js-route-btn').addEventListener('click', () => RouteMod.parse());
  $('js-rb-clear').addEventListener('click', () => RouteMod.clear());
  $('modal-close-btn').addEventListener('click', () => Modal.close());
  $('nav-map').addEventListener('click', () => App.go('map', $('nav-map')));
  $('nav-list').addEventListener('click', () => App.go('list', $('nav-list')));
});
