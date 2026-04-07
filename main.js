/**

- main.js — UI 模組與啟動邏輯
- 
- 模組清單：
- Theme    — 亮/暗主題切換
- MapMod   — Leaflet 地圖、縣市標記、GPS 定位
- RouteMod — Google Maps 網址解析、路徑感知過濾
- Renderer — 純函式 HTML 渲染
- List     — 縣市列表、搜尋、過濾、統計
- Modal    — CCTV 影像播放器（靜態圖 / YouTube）
- App      — 頁面路由
- BOOT     — 非同步啟動
  */

‘use strict’;

/* ══════════════════════════════════════
THEME
══════════════════════════════════════ */
const Theme = (() => {
let dark = true;
const btn = $(‘js-theme’);

function apply(isDark) {
dark = isDark;
document.documentElement.setAttribute(‘data-theme’, isDark ? ‘dark’ : ‘light’);
$(‘meta-theme’).content = isDark ? ‘#060d1f’ : ‘#eef2f7’;
btn.textContent = isDark ? ‘🌙’ : ‘☀️’;
const cols = isDark ? C.COLS.dark : C.COLS.light;
$(‘lp-free’).style.background = cols.free;
$(‘lp-slow’).style.background = cols.slow;
$(‘lp-bad’).style.background  = cols.bad;
Bus.emit(‘theme’, isDark);
}

btn.addEventListener(‘click’, () => apply(!dark));
return { init() { apply(true); }, isDark() { return dark; } };
})();

/* ══════════════════════════════════════
MAP MODULE
══════════════════════════════════════ */
const MapMod = (() => {
let map, tile;
let cityMarkers = [];
let userMarker, userCircle;

function markerColor(city) {
return (Theme.isDark() ? C.COLS.dark : C.COLS.light)[city._ms];
}

function makeIcon(city) {
const col = markerColor(city);
return L.divIcon({
className: ‘’,
html: `<div style="background:${col};color:#fff;border-radius:18px;padding:4px 9px;font-size:11px;font-weight:900;border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(0,0,0,.4);white-space:nowrap;cursor:pointer;font-family:var(--font)">${city.name}</div>`,
iconAnchor: [34, 15],
});
}

function showCity(city) {
const w = city.w, cnt = city._cnt;
$(‘mc-ico’).textContent  = w.i;
$(‘mc-city’).textContent = `${city.name}  ${w.t}°C`;
$(‘mc-meta’).textContent = `${w.d} | 💧${w.h}% 🌧️${w.rain}%`;
$(‘mc-pills’).innerHTML  = Object.entries(C.ST).map(([k, s]) =>
`<span class="mc-pill ${s.p}">${cnt[k] || 0} ${s.lbl}</span>`
).join(’’);
map.flyTo([city.lat, city.lng], C.MAP.cityZoom, { duration: C.MAP.flyDur, easeLinearity: .5 });
}

// 主題切換時換底圖並重繪標記
Bus.on(‘theme’, () => {
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
.addTo(map).on(‘click’, () => showCity(city));
cityMarkers.push(m);
});
}

return {
init() {
map  = L.map(‘map’, { zoomControl: true, attributionControl: false }).setView(C.MAP.center, C.MAP.zoom);
tile = L.tileLayer(C.TILES.dark, { maxZoom: 19 }).addTo(map);
refreshMks();
},
getMap()      { return map; },
invalidate()  { setTimeout(() => map?.invalidateSize(), 80); },
refreshMks,

```
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

      const nearest = Data.all().reduce(
        (b, c) => { const d = Math.hypot(c.lat - lat, c.lng - lng); return d < b.d ? { c, d } : b; },
        { c: null, d: Infinity }
      );
      if (nearest.c) { showCity(nearest.c); Toast.show(`📍 最近縣市：${nearest.c.name}`); }
    },
    err => {
      btn.textContent = '📍';
      Toast.show({ 1: '請允許位置存取', 2: '無法取得位置', 3: '定位逾時' }[err.code] || '定位失敗');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
},
```

};
})();

/* ══════════════════════════════════════
ROUTE MODULE
Google Maps 網址解析 + 路徑感知過濾
══════════════════════════════════════ */
const RouteMod = (() => {
let routeCoords    = null;
let routeLayer     = null;
let onRouteCamIds  = new Set();
let onRouteCityIds = new Set();

/**

- 解析 Google Maps 長網址，支援三種格式：
- 1. @lat,lng 多段（最常見）
- 1. /dir/lat,lng/lat,lng
- 1. saddr/daddr 參數
   */
   function parseGoogleMapsUrl(url) {
   try {
   // 格式一：@lat,lng（取第一與最後一個）
   const atMatches = […url.matchAll(/@(-?\d+.\d+),(-?\d+.\d+)/g)];
   if (atMatches.length >= 2) {
   return {
   from: [parseFloat(atMatches[0][1]),                    parseFloat(atMatches[0][2])],
   to:   [parseFloat(atMatches[atMatches.length-1][1]), parseFloat(atMatches[atMatches.length-1][2])],
   };
   }
   // 格式二：/dir/lat,lng/lat,lng
   const dirMatch = url.match(//dir/(-?\d+.\d+),(-?\d+.\d+)/(-?\d+.\d+),(-?\d+.\d+)/);
   if (dirMatch) {
   return {
   from: [parseFloat(dirMatch[1]), parseFloat(dirMatch[2])],
   to:   [parseFloat(dirMatch[3]), parseFloat(dirMatch[4])],
   };
   }
   // 格式三：saddr / daddr 參數
   const saddr = url.match(/saddr=(-?\d+.\d+),(-?\d+.\d+)/);
   const daddr = url.match(/daddr=(-?\d+.\d+),(-?\d+.\d+)/);
   if (saddr && daddr) {
   return {
   from: [parseFloat(saddr[1]), parseFloat(saddr[2])],
   to:   [parseFloat(daddr[1]), parseFloat(daddr[2])],
   };
   }
   return null;
   } catch { return null; }
   }

/**

- 路徑感知過濾演算法（含座標抽稀）
- 計算所有 CCTV 到路徑線段的最短距離
- 距離 <= ROUTE_RADIUS_KM 者標記為沿途
  */
  function filterCamsOnRoute(coords) {
  onRouteCamIds  = new Set();
  onRouteCityIds = new Set();
  // 座標抽稀：每隔 N 點取一個，降低長途路線計算量
  const thinned = thinCoords(coords, C.ROUTE_THIN_STEP);
  const allCams = Data.allCams();
  const R       = C.ROUTE_RADIUS_KM;

```
allCams.forEach(cam => {
  let minDist = Infinity;
  for (let i = 0; i < thinned.length - 1; i++) {
    const d = distToSegKm(
      cam.lat, cam.lng,
      thinned[i].lat,   thinned[i].lng,
      thinned[i+1].lat, thinned[i+1].lng
    );
    if (d < minDist) minDist = d;
    if (minDist <= R) break; // 提前退出
  }
  if (minDist <= R) {
    onRouteCamIds.add(cam.id);
    onRouteCityIds.add(cam.cityId);
  }
});
return { camCount: onRouteCamIds.size, cityCount: onRouteCityIds.size };
```

}

function setStatus(text) {
const el = $(‘js-route-status’);
el.textContent = text;
el.className   = text ? ‘route-status show’ : ‘route-status’;
}

return {
parse() {
const url = $(‘js-route-input’).value.trim();
// 錯誤邊界：空白
if (!url) { Toast.show(‘請貼上 Google Maps 網址’); return; }
// 錯誤邊界：非 Google Maps
if (!url.includes(‘google.com/maps’) && !url.includes(‘goo.gl’)) {
Toast.show(‘⚠️ 請貼上 Google Maps 的網址’);
setStatus(‘提示：請從 Google Maps 網址列複製完整長網址’);
return;
}

```
  const coords = parseGoogleMapsUrl(url);
  // 錯誤邊界：無法解析座標
  if (!coords) {
    Toast.show('⚠️ 無法解析座標，請使用含路線的長網址');
    setStatus('找不到座標。請確認網址包含導航路線');
    return;
  }

  // 清除舊路線
  if (routeLayer) { MapMod.getMap().removeLayer(routeLayer); routeLayer = null; }
  setStatus('🔄 路線計算中…');

  routeLayer = L.Routing.control({
    waypoints: [
      L.latLng(coords.from[0], coords.from[1]),
      L.latLng(coords.to[0],   coords.to[1]),
    ],
    routeWhileDragging: false,
    addWaypoints:       false,
    fitSelectedRoutes:  true,
    lineOptions: {
      styles: [{ color: '#f97316', opacity: .85, weight: 5 }],
      extendToWaypoints: true, missingRouteTolerance: 0,
    },
    createMarker(i, wp) {
      const labels = ['起點', '終點'], colors = ['#22c55e', '#ef4444'];
      return L.marker(wp.latLng, {
        icon: L.divIcon({
          className: '',
          html: `<div class="route-marker" style="background:${colors[i]}">${labels[i]}</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18],
        }),
      });
    },
  }).addTo(MapMod.getMap());

  // 路線計算完成
  routeLayer.on('routesfound', e => {
    routeCoords = e.routes[0].coordinates;
    const { camCount, cityCount } = filterCamsOnRoute(routeCoords);
    setStatus(`✅ 找到 ${cityCount} 個縣市・${camCount} 個沿途攝影機`);
    Bus.emit('route:updated', { camIds: onRouteCamIds, cityIds: onRouteCityIds, camCount, cityCount });
    Toast.show(`🛣️ 沿途共 ${camCount} 個攝影機`, 3000);
  });

  // 路線計算失敗
  routeLayer.on('routingerror', () => {
    setStatus('❌ 路線計算失敗，請確認起訖點正確');
    Toast.show('路線計算失敗');
  });
},

clear() {
  if (routeLayer) { MapMod.getMap().removeLayer(routeLayer); routeLayer = null; }
  routeCoords    = null;
  onRouteCamIds  = new Set();
  onRouteCityIds = new Set();
  $('js-route-input').value = '';
  setStatus('');
  Bus.emit('route:cleared');
  Toast.show('已清除路線');
},

isActive()          { return routeCoords !== null; },
getOnRouteCamIds()  { return onRouteCamIds; },
getOnRouteCityIds() { return onRouteCityIds; },
```

};
})();

/* ══════════════════════════════════════
RENDERER
純函式 HTML 渲染（無副作用）
══════════════════════════════════════ */
const Renderer = (() => {
const { ST: st, SRC: src } = C;

const road = ({ n, s, nt }) =>
`<div class="road-r"><div><div class="road-n">${n}</div><div class="road-d">${nt}</div></div><span class="st-pill ${st[s].p}">${st[s].lbl}</span></div>`;

const cam = (cv, ci, vi, onRoute) => {
const isYt   = cv.src === ‘yt’;
const srcInf = isYt ? src.yt : src[cv.src];
// 使用 data-ci / data-vi 屬性取代 inline onclick，避免圖片錯誤擋住點擊
const ytThumb = isYt
? `<img src="https://img.youtube.com/vi/${cv.ytId}/mqdefault.jpg" alt="${cv.n}" class="in" onerror="this.style.display='none'">`
: `<img data-src="${cv.img}" alt="${cv.n}" loading="lazy">`;

```
return `<div class="thumb${onRoute ? ' on-route' : ''}" data-ci="${ci}" data-vi="${vi}">
  <div class="th-img">
    ${ytThumb}
    <div class="src-pip" style="background:${srcInf.col}">${srcInf.lbl}</div>
    ${isYt ? '<div class="yt-pip">▶ LIVE</div>' : ''}
  </div>
  <div class="th-lbl">${cv.n}</div>
</div>`;
```

};

const card = (city, gi, delay, onRouteCamIds) => {
const isOnRoute = RouteMod.isActive() && RouteMod.getOnRouteCityIds().has(city.id);
const cnt       = city._cnt;
return `<div class="city-card${isOnRoute ? ' on-route' : ''}" style="animation-delay:${delay}s" role="listitem"> ${isOnRoute ? '<div class="on-route-badge">🛣️ 沿途</div>' : ''} <div class="c-top"> <div> <div class="c-name">${city.name}</div> <div class="c-rgn">${city.rn}</div> <div class="c-summary">${Object.entries(st).map(([k, s]) =>`<span class="cpill ${s.p}">${cnt[k] || 0} ${s.lbl}</span>`).join('')}</div> </div> </div> <div class="wx"> <div class="wx-ico">${city.w.i}</div> <div style="flex:1"> <div style="display:flex;align-items:baseline;gap:4px"><div class="wx-t">${city.w.t}</div><div class="wx-u">°C</div></div> <div class="wx-d">${city.w.d}</div> <div class="wx-m"><span class="wx-c">💧${city.w.h}%</span><span class="wx-c">🌧️${city.w.rain}%</span><span class="wx-c">💨${city.w.wind}m/s</span></div> </div> </div> <div class="roads"><div class="sec-lbl">📍 主要道路</div>${city.roads.map(road).join('')}</div> <div class="cctv-s"> <div class="sec-lbl sp">📷 CCTV 影像</div> <div class="reel">${city.cams.map((cv, j) => cam(cv, gi, j, onRouteCamIds?.has(cv.id))).join('')}</div> </div> </div>`;
};

const skeleton = () =>
`<div class="sk-card"><div class="sk sk-h20 sk-30"></div><div class="sk sk-h12 sk-70" style="margin-top:6px"></div><div class="sk sk-h84 sk-90"></div></div>`;

return { card, skeleton };
})();

/* ══════════════════════════════════════
LIST MODULE
縣市列表渲染、搜尋、過濾
══════════════════════════════════════ */
const List = (() => {
let region = ‘all’, search = ‘’, timer = null;
let routeFilter = null; // Set<cityId> | null
const $inner = $(‘js-list-inner’);
const $stats = $(‘js-stats’);
const $clr   = $(‘js-clr’);
const all    = Data.all(); // 快取全部城市參考

function renderStats(cities) {
const tot = { free: 0, slow: 0, bad: 0 };
cities.forEach(c => Object.keys(tot).forEach(k => tot[k] += c._cnt[k] || 0));
$stats.innerHTML = Object.entries(C.ST).map(([k, s]) =>
`<div class="s-chip ${s.p}"><div class="s-num">${tot[k]}</div><div class="s-lbl">${C.STAT_LBL[k]}</div></div>`
).join(’’);
}

function renderCards(cities) {
if (!cities.length) {
$inner.innerHTML = `<div class="empty"><div class="empty-e">🔍</div><div class="empty-t">找不到「${search}」<br>試試其他關鍵字</div></div>`;
return;
}
// Skeleton 佔位，下一幀換成真實卡片
$inner.innerHTML = cities.map(() => Renderer.skeleton()).join(’’);
requestAnimationFrame(() => {
$inner.innerHTML = cities.map((c, i) =>
Renderer.card(c, all.indexOf(c), i * .03, RouteMod.getOnRouteCamIds())
).join(’’);
Lazy.watch($inner);
$(‘js-list’).scrollTop = 0;
});
}

function render() {
const filtered = Data.filter(region, search, routeFilter);
renderStats(filtered);
renderCards(filtered);
}

// 路線更新：顯示橫條，切換到列表頁
Bus.on(‘route:updated’, ({ cityIds, camCount, cityCount }) => {
routeFilter = cityIds;
$(‘js-route-banner’).classList.add(‘show’);
$(‘js-rb-text’).textContent = `🛣️ 沿途 ${cityCount} 個縣市・${camCount} 個攝影機`;
render();
App.go(‘list’, $(‘nav-list’));
});

// 路線清除
Bus.on(‘route:cleared’, () => {
routeFilter = null;
$(‘js-route-banner’).classList.remove(‘show’);
render();
});

// Tab 事件委派
$(‘js-tabs’).addEventListener(‘click’, e => {
const btn = e.target.closest(’.rtab’);
if (!btn) return;
document.querySelectorAll(’.rtab’).forEach(b => {
b.classList.remove(‘active’);
b.setAttribute(‘aria-selected’, ‘false’);
});
btn.classList.add(‘active’);
btn.setAttribute(‘aria-selected’, ‘true’);
region = btn.dataset.r;
render();
});

// 搜尋（debounce 160ms）
$(‘js-srch’).addEventListener(‘input’, e => {
search = e.target.value.trim();
$clr.classList.toggle(‘on’, search.length > 0);
clearTimeout(timer);
timer = setTimeout(render, 160);
});

// 清除搜尋
$clr.addEventListener(‘click’, () => {
$(‘js-srch’).value = ‘’;
search = ‘’;
$clr.classList.remove(‘on’);
render();
});

// CCTV 縮圖點擊事件委派（使用 data-ci / data-vi）
$(‘js-list’).addEventListener(‘click’, e => {
const thumb = e.target.closest(’.thumb’);
if (!thumb) return;
const ci = parseInt(thumb.dataset.ci);
const vi = parseInt(thumb.dataset.vi);
if (!isNaN(ci) && !isNaN(vi)) Modal.open(ci, vi);
});

return { init: render };
})();

/* ══════════════════════════════════════
MODAL
CCTV 影像播放器
支援：靜態圖片、YouTube 直播 iframe
touch 下滑關閉、關閉時自動清空 iframe 斷流
══════════════════════════════════════ */
const Modal = (() => {
const $bg = $(‘modal’);
const $sh = $bg.querySelector(’.modal-sh’);
let startY = 0, dy = 0, isOpen = false;

// Touch 下滑關閉手勢
$sh.addEventListener(‘touchstart’, e => { startY = e.touches[0].clientY; dy = 0; }, { passive: true });
$sh.addEventListener(‘touchmove’,  e => {
dy = e.touches[0].clientY - startY;
if (dy > 0) $sh.style.transform = `translateY(${dy}px)`;
}, { passive: true });
$sh.addEventListener(‘touchend’, () => {
if (dy > 80) Modal.close(); else $sh.style.transform = ‘’;
dy = 0;
});

return {
open(ci, vi) {
const city = Data.byIdx(ci);
const cam  = city?.cams?.[vi];
// 錯誤邊界：找不到資料
if (!city || !cam) { console.error(’[Modal] 找不到資料’, ci, vi); return; }

```
  const s    = C.ST[cam.s];
  const isYt = cam.src === 'yt';
  const srcInf = isYt ? C.SRC.yt : C.SRC[cam.src];
  const t    = now();

  $('m-tag').textContent  = city.name;
  $('m-ttl').textContent  = cam.n;
  $('m-org').textContent  = srcInf.lbl;
  $('m-st').textContent   = s.lbl;
  $('m-st').className     = `m-cv ${s.c}`;
  $('m-tm').textContent   = t;
  $('m-src').textContent  = srcInf.lbl;
  $('m-src').style.background = srcInf.col;

  const $med = $('m-med');
  if (isYt) {
    // YouTube iframe：
    // autoplay=1 + mute=1 → iOS Safari 自動播放需靜音
    // playsinline=1       → iOS 不強制全螢幕
    // origin              → 對應 GitHub Pages 網域，避免被拒絕
    const origin = encodeURIComponent(location.origin);
    $med.innerHTML = `
      <iframe
        src="https://www.youtube.com/embed/${cam.ytId}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=0&origin=${origin}"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen loading="lazy"
        title="${cam.n}">
      </iframe>
      <div class="m-live">● LIVE</div>`;
  } else {
    // 靜態圖 / TDX MJPEG
    // 真實 TDX streamUrl：將 cam.img 替換為 cam.streamUrl 即可
    $med.innerHTML = `
      <img src="${cam.img}" alt="${cam.n}" style="opacity:1">
      <div class="m-live">● LIVE</div>
      <div class="m-ts">${t}</div>`;
  }

  $sh.style.transform = '';
  $bg.classList.add('open');
  document.body.style.overflow = 'hidden';
  isOpen = true;
},

close() {
  if (!isOpen) return;
  // 關閉時清空 m-med，停止 YouTube 串流，節省資源
  $('m-med').innerHTML = '';
  $bg.classList.remove('open');
  document.body.style.overflow = '';
  $sh.style.transform = '';
  isOpen = false;
},
```

};
})();

/* ══════════════════════════════════════
APP：頁面路由
══════════════════════════════════════ */
const App = {
cur: ‘map’,

go(page, btn) {
document.querySelectorAll(’.pg’).forEach(p => p.classList.remove(‘active’));
document.querySelectorAll(’.nav-it’).forEach(b => {
b.classList.remove(‘active’);
b.removeAttribute(‘aria-current’);
});
$(`pg-${page}`).classList.add(‘active’);
if (btn instanceof Element) {
btn.classList.add(‘active’);
btn.setAttribute(‘aria-current’, ‘page’);
}
this.cur = page;
if (page === ‘map’) MapMod.invalidate();
},
};

/* ══════════════════════════════════════
KEYBOARD：ESC 關閉 Modal
══════════════════════════════════════ */
document.addEventListener(‘keydown’, e => {
if (e.key === ‘Escape’) Modal.close();
});

/* ══════════════════════════════════════
BOOT：非同步啟動序列
流程：
Clock / Theme / MapMod / List（Mock）→ 立刻顯示
await Data.init() → CWA API
weather:updated   → 重繪列表 + 地圖標記
══════════════════════════════════════ */
window.addEventListener(‘load’, async () => {

// 不依賴天氣的模組先初始化，讓畫面立刻可用
Clock.init();
Theme.init();
MapMod.init();
List.init();

// 等待 CWA API（成功 → 真實資料；失敗 → 靜默保留 Mock）
await Data.init();

// 天氣更新後重繪
Bus.on(‘weather:updated’, () => {
List.init();
MapMod.refreshMks();
Toast.show(‘🌤️ 天氣資料已更新’);
});
Bus.on(‘weather:error’, () => {
Toast.show(‘⚠️ 天氣載入失敗，顯示估計值’);
});

// 定位按鈕
$(‘js-loc’).addEventListener(‘click’, () => MapMod.locate());

// 路線按鈕
$(‘js-route-btn’).addEventListener(‘click’, () => RouteMod.parse());
$(‘js-route-input’).addEventListener(‘keydown’, e => { if (e.key === ‘Enter’) RouteMod.parse(); });

// Modal 關閉按鈕（index.html 改用 id 綁定，不用 inline onclick）
$(‘modal-close-btn’).addEventListener(‘click’, () => Modal.close());
$(‘modal’).addEventListener(‘click’, Modal.close.bind(Modal));
$(‘modal’).querySelector(’.modal-sh’).addEventListener(‘click’, e => e.stopPropagation());

// 沿途清除按鈕
$(‘js-rb-clear’).addEventListener(‘click’, () => RouteMod.clear());

// 導覽列按鈕
$(‘nav-map’).addEventListener(‘click’,  () => App.go(‘map’,  $(‘nav-map’)));
$(‘nav-list’).addEventListener(‘click’, () => App.go(‘list’, $(‘nav-list’)));

// 字型預熱（避免閃爍）
document.fonts.ready.then(() => document.body.style.visibility = ‘visible’);

// 每 30 分鐘自動更新天氣（可依需求調整）
setInterval(() => Data.refresh(), 30 * 60 * 1000);
});