(function() {
‘use strict’;

// Theme
var ThemeMod = {
dark: true,
init: function() {
var btn = document.getElementById(‘js-theme’);
if (!btn) return;
btn.addEventListener(‘click’, function() { ThemeMod.toggle(); });
},
toggle: function() {
ThemeMod.dark = !ThemeMod.dark;
var btn = document.getElementById(‘js-theme’);
if (ThemeMod.dark) {
document.body.classList.remove(‘light’);
if (btn) btn.textContent = ‘\u{1F319}’;
MapMod.setTile(Config.TILE_DARK);
} else {
document.body.classList.add(‘light’);
if (btn) btn.textContent = ‘\u2600\uFE0F’;
MapMod.setTile(Config.TILE_LIGHT);
}
}
};

// Clock
var ClockMod = {
init: function() {
var clkEl  = document.getElementById(‘js-clk’);
var dateEl = document.getElementById(‘js-date’);
function tick() {
var now = new Date();
var h = String(now.getHours()).padStart(2,‘0’);
var m = String(now.getMinutes()).padStart(2,‘0’);
var s = String(now.getSeconds()).padStart(2,‘0’);
if (clkEl) clkEl.textContent = h + ‘:’ + m + ‘:’ + s;
if (dateEl) {
var y  = now.getFullYear();
var mo = String(now.getMonth()+1).padStart(2,‘0’);
var d  = String(now.getDate()).padStart(2,‘0’);
dateEl.textContent = y + ‘/’ + mo + ‘/’ + d;
}
}
tick();
setInterval(tick, 1000);
}
};

// Toast
var ToastMod = {
show: function(msg, ms) {
var el = document.getElementById(‘toast’);
if (!el) return;
el.textContent = msg;
el.style.opacity = ‘1’;
el.style.transform = ‘translateX(-50%) translateY(0)’;
setTimeout(function() {
el.style.opacity = ‘0’;
el.style.transform = ‘translateX(-50%) translateY(8px)’;
}, ms || 2500);
}
};
window.Toast = ToastMod;

// Page Nav
var NavMod = {
current: ‘map’,
pages:   { map: ‘pg-map’, list: ‘pg-list’, tools: ‘pg-tools’ },
navBtns: { map: ‘nav-map’, list: ‘nav-list’, tools: ‘nav-tools’ },
init: function() {
Object.keys(NavMod.navBtns).forEach(function(key) {
var btn = document.getElementById(NavMod.navBtns[key]);
if (!btn) return;
btn.addEventListener(‘click’, function() { NavMod.go(key); });
});
},
go: function(key) {
Object.keys(NavMod.pages).forEach(function(k) {
var pg  = document.getElementById(NavMod.pages[k]);
var btn = document.getElementById(NavMod.navBtns[k]);
if (pg)  pg.classList.toggle(‘active’, k === key);
if (btn) {
btn.classList.toggle(‘active’, k === key);
btn.classList.toggle(‘text-slate-500’, k !== key);
}
});
NavMod.current = key;
if (key === ‘map’) setTimeout(function() { MapMod.map.invalidateSize(); }, 50);
}
};

// Map
var MapMod = {
map: null,
tileLayer: null,
markers: [],
routeLayer: null,
init: function() {
MapMod.map = L.map(‘map’, { center: Config.MAP_CENTER, zoom: Config.MAP_ZOOM, zoomControl: true });
MapMod.tileLayer = L.tileLayer(Config.TILE_DARK, { attribution: Config.TILE_ATTR, maxZoom: 19 }).addTo(MapMod.map);
},
setTile: function(url) { if (MapMod.tileLayer) MapMod.tileLayer.setUrl(url); },
clearMarkers: function() {
MapMod.markers.forEach(function(m) { MapMod.map.removeLayer(m); });
MapMod.markers = [];
},
addMarker: function(cam) {
var color = Config.STATUS_COLOR[cam.status] || Config.STATUS_COLOR.unknown;
var icon = L.divIcon({
className: ‘’,
html: ‘<div style="width:12px;height:12px;border-radius:50%;background:' + color + ';border:2px solid rgba(255,255,255,0.5);box-shadow:0 0 6px ' + color + '"></div>’,
iconSize: [12,12], iconAnchor: [6,6]
});
var marker = L.marker([cam.lat, cam.lng], { icon: icon })
.addTo(MapMod.map)
.bindTooltip(cam.name, { direction: ‘top’, offset: [0,-8] });
marker.on(‘click’, function() { ModalMod.open(cam); });
MapMod.markers.push(marker);
},
drawRoute: function(coords) {
if (MapMod.routeLayer) { MapMod.map.removeLayer(MapMod.routeLayer); MapMod.routeLayer = null; }
if (!coords || coords.length < 2) return;
var latlngs = coords.map(function(c) { return [c[0], c[1]]; });
MapMod.routeLayer = L.polyline(latlngs, { color: ‘#f97316’, weight: 3, opacity: 0.8, dashArray: ‘8,4’ }).addTo(MapMod.map);
MapMod.map.fitBounds(MapMod.routeLayer.getBounds(), { padding: [40,40] });
},
clearRoute: function() {
if (MapMod.routeLayer) { MapMod.map.removeLayer(MapMod.routeLayer); MapMod.routeLayer = null; }
}
};

// Route
var RouteMod = {
active: false,
filteredCams: [],
init: function() {
var btn      = document.getElementById(‘js-route-btn’);
var clearBtn = document.getElementById(‘js-rb-clear’);
var locBtn   = document.getElementById(‘js-loc’);
if (btn)      btn.addEventListener(‘click’, function() { RouteMod.analyze(); });
if (clearBtn) clearBtn.addEventListener(‘click’, function() { RouteMod.clear(); });
if (locBtn)   locBtn.addEventListener(‘click’, function() { RouteMod.locate(); });
},
analyze: function() {
var input = document.getElementById(‘js-route-input’);
if (!input) return;
var url = input.value.trim();
if (!url) { ToastMod.show(‘請貼上 Google Maps 網址’); return; }
var coords = parseGoogleMapsCoords(url);
if (coords.length < 2) { ToastMod.show(‘無法解析座標，請確認網址格式’); return; }
var simplified = simplifyCoords(coords, Config.SIMPLIFY_STEP);
RouteMod.active = true;
RouteMod.filteredCams = Data.allCams().filter(function(cam) {
for (var i = 0; i < simplified.length - 1; i++) {
var d = distToSegKm(cam.lat, cam.lng, simplified[i][0], simplified[i][1], simplified[i+1][0], simplified[i+1][1]);
if (d <= Config.ROUTE_FILTER_KM) return true;
}
return false;
});
MapMod.drawRoute(simplified);
var statusEl = document.getElementById(‘js-route-status’);
if (statusEl) statusEl.textContent = ‘找到 ’ + RouteMod.filteredCams.length + ’ 支沿途攝影機’;
var banner = document.getElementById(‘js-route-banner’);
if (banner) { banner.classList.remove(‘hidden’); banner.classList.add(‘flex’); }
var info = document.getElementById(‘js-list-route-info’);
var cnt  = document.getElementById(‘js-list-route-count’);
if (info) { info.classList.remove(‘hidden’); info.classList.add(‘flex’); }
if (cnt)  cnt.textContent = ‘路線過濾中：共 ’ + RouteMod.filteredCams.length + ’ 支沿途攝影機’;
ToastMod.show(‘找到 ’ + RouteMod.filteredCams.length + ’ 支沿途攝影機’);
Bus.emit(‘filter:changed’);
},
clear: function() {
RouteMod.active = false;
RouteMod.filteredCams = [];
MapMod.clearRoute();
var input    = document.getElementById(‘js-route-input’);
var statusEl = document.getElementById(‘js-route-status’);
var banner   = document.getElementById(‘js-route-banner’);
var info     = document.getElementById(‘js-list-route-info’);
if (input)    input.value = ‘’;
if (statusEl) statusEl.textContent = ‘’;
if (banner)   { banner.classList.add(‘hidden’); banner.classList.remove(‘flex’); }
if (info)     { info.classList.add(‘hidden’);   info.classList.remove(‘flex’); }
Bus.emit(‘filter:changed’);
},
locate: function() {
if (!navigator.geolocation) { ToastMod.show(‘瀏覽器不支援定位’); return; }
navigator.geolocation.getCurrentPosition(
function(pos) { MapMod.map.setView([pos.coords.latitude, pos.coords.longitude], 13); },
function()    { ToastMod.show(‘無法取得位置’); }
);
}
};

// List
var ListMod = {
currentRegion: ‘all’,
searchText: ‘’,
init: function() {
document.querySelectorAll(’.rtab’).forEach(function(btn) {
btn.addEventListener(‘click’, function() {
document.querySelectorAll(’.rtab’).forEach(function(b) { b.classList.remove(‘active’); });
btn.classList.add(‘active’);
ListMod.currentRegion = btn.dataset.r;
Bus.emit(‘filter:changed’);
});
});
var searchEl = document.getElementById(‘js-search’);
if (searchEl) {
searchEl.addEventListener(‘input’, function() {
ListMod.searchText = searchEl.value.trim().toLowerCase();
Bus.emit(‘filter:changed’);
});
}
},
getFiltered: function() {
var cams = RouteMod.active ? RouteMod.filteredCams : Data.allCams();
return cams.filter(function(cam) {
var regionOk = ListMod.currentRegion === ‘all’ || getRegion(cam.county) === ListMod.currentRegion;
var searchOk = !ListMod.searchText ||
cam.name.toLowerCase().indexOf(ListMod.searchText) !== -1 ||
cam.county.toLowerCase().indexOf(ListMod.searchText) !== -1;
return regionOk && searchOk;
});
},
render: function() {
var listEl = document.getElementById(‘js-list-inner’);
if (!listEl) return;
var cams = ListMod.getFiltered();
MapMod.clearMarkers();
var statEl = document.getElementById(‘js-stat-cams’);
if (statEl) statEl.textContent = Data.allCams().length;
if (cams.length === 0) {
listEl.innerHTML = ‘<div class="text-center text-slate-500 py-12 text-sm">找不到攝影機</div>’;
return;
}
var allCamsMap = {};
Data.allCams().forEach(function(c) { allCamsMap[c.id] = c; });
var html = ‘’;
cams.forEach(function(cam) {
var color   = Config.STATUS_COLOR[cam.status] || Config.STATUS_COLOR.unknown;
var weather = Data.weather[cam.county];
var wText   = weather ? (weather.temp + ‘\u00B0C ’ + (weather.weather || ‘’)) : ‘’;
html += ‘<div class="cam-card glass rounded-2xl p-4 flex items-center gap-4 cursor-pointer border border-white/5" data-id="' + cam.id + '">’ +
‘<div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:' + color + '22">’ +
‘<span class="w-3 h-3 rounded-full inline-block" style="background:' + color + '"></span>’ +
‘</div>’ +
‘<div class="flex-1 min-w-0">’ +
‘<div class="font-bold text-sm truncate">’ + cam.name + ‘</div>’ +
‘<div class="text-[11px] text-slate-400 mt-0.5">’ + cam.county + (wText ? ’ · ’ + wText : ‘’) + ‘</div>’ +
‘</div>’ +
‘<i class="fa-solid fa-chevron-right text-slate-600 text-sm shrink-0"></i>’ +
‘</div>’;
MapMod.addMarker(cam);
});
listEl.innerHTML = html;
listEl.querySelectorAll(’.cam-card’).forEach(function(card) {
card.addEventListener(‘click’, function() {
var cam = allCamsMap[card.dataset.id];
if (!cam) return;
ModalMod.open(cam);
NavMod.go(‘map’);
MapMod.map.setView([cam.lat, cam.lng], 14);
});
});
}
};

// Modal
var ModalMod = {
open: function(cam) {
var ttl = document.getElementById(‘m-ttl’);
var org = document.getElementById(‘m-org’);
var med = document.getElementById(‘m-med’);
if (ttl) ttl.textContent = cam.name;
if (org) {
var weather = Data.weather[cam.county];
var wText   = weather ? (’ · ’ + weather.temp + ‘\u00B0C ’ + (weather.weather || ‘’)) : ‘’;
org.textContent = ‘\u{1F4CD} ’ + cam.county + wText;
}
if (med) {
med.innerHTML = ‘’;
if (cam.url) {
var img = document.createElement(‘img’);
img.src = cam.url + (cam.url.indexOf(’?’) !== -1 ? ‘&’ : ‘?’) + ‘t=’ + Date.now();
img.className = ‘w-full h-full object-contain’;
img.alt = cam.name;
img.onerror = function() {
med.innerHTML = ‘<div class="text-slate-500 text-sm p-8 text-center">\u26A0\uFE0F \u5F71\u50CF\u7121\u6CD5\u8F09\u5165<br><span class="text-xs text-slate-600 mt-2 block">HTTP \u4F86\u6E90\u6216\u651D\u5F71\u6A5F\u96E2\u7DDA</span></div>’;
};
med.appendChild(img);
} else {
med.innerHTML = ‘<div class="text-slate-500 text-sm p-8">\u7121\u5F71\u50CF\u4F86\u6E90</div>’;
}
}
if (window.ModalEffect) window.ModalEffect.open();
}
};

// Bootstrap
window.addEventListener(‘load’, function() {
ClockMod.init();
MapMod.init();
ThemeMod.init();
NavMod.init();
RouteMod.init();
ListMod.init();
Bus.on(‘filter:changed’,  function() { ListMod.render(); });
Bus.on(‘cams:updated’,    function() { ListMod.render(); });
Bus.on(‘weather:updated’, function() { ListMod.render(); });
ListMod.render();
});
})();