'use strict';

const Theme = (() => {
  let dark = true;
  return {
    init() {
      const btn = $('js-theme');
      if (btn) btn.addEventListener('click', () => this.apply(!dark));
      this.apply(true);
    },
    apply(isDark) {
      dark = isDark;
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      const meta = $('meta-theme');
      if (meta) meta.content = isDark ? '#060d1f' : '#eef2f7';
      const btn = $('js-theme');
      if (btn) btn.textContent = isDark ? '🌙' : '☀️';
      Bus.emit('theme', isDark);
    },
    isDark() { return dark; }
  };
})();

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
        const col = (Theme.isDark() ? C.COLS.dark : C.COLS.light)[city._ms || 'free'];
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
    invalidate() { setTimeout(() => map?.invalidateSize(), 80); }
  };
})();

window.addEventListener('load', async () => {
  Clock.init();
  Theme.init();
  MapMod.init();
  // ...其餘初始化邏輯
});
