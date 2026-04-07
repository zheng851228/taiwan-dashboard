(function() {
‘use strict’;

// Event Bus
var _listeners = {};
window.Bus = {
on: function(evt, fn) {
if (!_listeners[evt]) _listeners[evt] = [];
_listeners[evt].push(fn);
},
emit: function(evt, data) {
(_listeners[evt] || []).forEach(function(fn) { fn(data); });
}
};

// Clock
window.Clock = {
start: function() {
var el = document.getElementById(‘clock’);
function tick() {
var now = new Date();
var h = String(now.getHours()).padStart(2,‘0’);
var m = String(now.getMinutes()).padStart(2,‘0’);
var s = String(now.getSeconds()).padStart(2,‘0’);
if (el) el.textContent = h + ‘:’ + m + ‘:’ + s;
}
tick();
setInterval(tick, 1000);
}
};

// Toast
window.Toast = {
show: function(msg, duration) {
var el = document.getElementById(‘toast’);
if (!el) return;
el.textContent = msg;
el.classList.add(‘show’);
setTimeout(function() { el.classList.remove(‘show’); }, duration || 2500);
}
};

// 點到線段距離 (km)，Haversine 簡化版
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

// 座標抽稀
window.simplifyCoords = function(coords, step) {
step = step || Config.SIMPLIFY_STEP;
var out = [];
for (var i = 0; i < coords.length; i += step) {
out.push(coords[i]);
}
if (out[out.length-1] !== coords[coords.length-1]) {
out.push(coords[coords.length-1]);
}
return out;
};

// 判斷縣市屬於哪個 region
window.getRegion = function(county) {
var regions = Config.REGIONS;
for (var r in regions) {
if (regions[r].indexOf(county) !== -1) return r;
}
return ‘other’;
};

// 解析 Google Maps URL 中的座標點 (waypoints)
window.parseGoogleMapsCoords = function(url) {
var coords = [];
// 嘗試解析 /dir/ 路徑
var dirMatch = url.match(//dir/([^@?]+)/);
if (dirMatch) {
var parts = dirMatch[1].split(’/’);
parts.forEach(function(p) {
var m = p.match(/^(-?\d+.?\d*),(-?\d+.?\d*)/);
if (m) coords.push([parseFloat(m[1]), parseFloat(m[2])]);
});
}
// 嘗試解析 data= 內的座標序列
var dataMatch = url.match(/data=([^&]+)/);
if (dataMatch) {
var raw = decodeURIComponent(dataMatch[1]);
var re = /!3d(-?\d+.?\d+)!4d(-?\d+.?\d+)/g;
var m;
while ((m = re.exec(raw)) !== null) {
coords.push([parseFloat(m[1]), parseFloat(m[2])]);
}
}
// 備援：抓所有明顯台灣座標
if (coords.length < 2) {
var re2 = /([2][0-5].\d{4,}),\s*(1[12][0-9].\d{4,})/g;
var m2;
while ((m2 = re2.exec(url)) !== null) {
coords.push([parseFloat(m2[1]), parseFloat(m2[2])]);
}
}
return coords;
};
})();