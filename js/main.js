'use strict';

/** 頁面切換模組 */
const App = {
  cur: 'map',
  go(page, btn) {
    document.querySelectorAll('.pg').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-it').forEach(b => {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });
    const targetPg = $('pg-' + page);
    if (targetPg) targetPg.classList.add('active');
    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
    }
    this.cur = page;
    if (page === 'map') MapMod.invalidate();
  }
};

/** 主題切換模組 */
const Theme = (() => {
  let dark = true;
  function apply(isDark) {
    dark = isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const meta = $('meta-theme');
    if (meta) meta.content = isDark ? '#060d1f' : '#eef2f7';
    const btn = $('js-theme');
    if (btn) btn.textContent = isDark ? '🌙' : '☀️';
    Bus.emit('theme', isDark);
  }
  return {
    init() {
      const btn = $('js-theme');
      if (btn) btn.addEventListener('click', () => apply(!dark));
      apply(true);
    },
    isDark() { return dark; }
  };
})();

/** 地圖模組 */
const MapMod = (() => {
  let map, tile, cityMarkers = [];
  return {
    init() {
      const mapEl = $('map');
      if (!mapEl) return;
      map = L.map('map', { zoomControl: true, attributionControl: false }).setView(C.MAP.center, C.MAP.zoom);
      tile = L.tileLayer(C.TILES.dark, { maxZoom: 19 }).addTo(map);
      this.refreshMks();
    },
    getMap() { return map; },
    refreshMks() {
      cityMarkers.forEach(m => map.removeLayer(m));
      cityMarkers = [];
      Data.all().forEach(city => {
        const cols = Theme.isDark() ? C.COLS.dark : C.COLS.light;
        const col = cols[city._ms || 'free'];
        const m = L.marker([city.lat, city.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="background:${col};color:#fff;border-radius:18px;padding:4px 9px;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.4)">${city.name}</div>`,
            iconAnchor: [34, 15]
          })
        }).addTo(map);
        cityMarkers.push(m);
      });
    },
    invalidate() { setTimeout(() => map?.invalidateSize(), 100); }
  };
})();

/** 列表渲染模組 */
const List = (() => {
  return {
    init() {
      const $inner = $('js-list-inner');
      if (!$inner) return;
      const cities = Data.all();
      $inner.innerHTML = cities.map((c, i) => {
        const cnt = c._cnt || { free: 0, slow: 0, bad: 0 };
        return `
          <div class="city-card">
            <div class="c-top">
              <div class="c-name">${c.name}</div>
              <div class="c-summary">
                <span class="cpill bg-free">${cnt.free} 順暢</span>
                <span class="cpill bg-slow">${cnt.slow} 緩慢</span>
              </div>
            </div>
            <div class="wx">
              <div class="wx-ico">${c.w.i}</div>
              <div class="wx-t">${c.w.t}°C</div>
            </div>
          </div>`;
      }).join('');
    }
  };
})();

/** 啟動程式 */
window.addEventListener('load', async () => {
  Clock.init();[span_4](start_span)[span_4](end_span)[span_5](start_span)[span_5](end_span)
  Theme.init();[span_6](start_span)[span_6](end_span)
  MapMod.init();[span_7](start_span)[span_7](end_span)
  List.init();[span_8](start_span)[span_8](end_span)

  // 綁定導覽列點擊[span_9](start_span)[span_9](end_span)
  $('nav-map').addEventListener('click', () => App.go('map', $('nav-map')));
  $('nav-list').addEventListener('click', () => App.go('list', $('nav-list')));
  
  // 異步載入氣象資料[span_10](start_span)[span_10](end_span)
  await Data.init();
  Bus.on('weather:updated', () => {
    List.init();
    MapMod.refreshMks();
  });
});
