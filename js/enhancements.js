// Secondary UI features, history, suggestions, modal effects, and service worker boot.

(function() {
  var WX_ICONS = {
    '\u6674':'\u2600\uFE0F','\u6674\u5929':'\u2600\uFE0F','\u591a\u96f2\u6642\u6674':'\ud83c\udf24\ufe0f',
    '\u591a\u96f2':'\u26c5','\u591a\u96f2\u6642\u9670':'\ud83c\udf25\ufe0f','\u9670':'\u2601\uFE0F',
    '\u9670\u5929':'\u2601\uFE0F','\u77ed\u6682\u96e8':'\ud83c\udf26\ufe0f','\u77ed\u6682\u9663\u96e8':'\ud83c\udf26\ufe0f',
    '\u96e8':'\ud83c\udf27\ufe0f','\u5927\u96e8':'\ud83c\udf27\ufe0f','\u8c6a\u96e8':'\u26c8\uFE0F',
    '\u96f7\u96e8':'\u26c8\uFE0F','\u6709\u96f7':'\u26c8\uFE0F','\u9727':'\ud83c\udf2b\ufe0f',
    '\u8d77\u9727':'\ud83c\udf2b\ufe0f','\u96ea':'\u2744\uFE0F'
  };
  function getWxIcon(desc) {
    if (!desc) return '\ud83c\udf21\ufe0f';
    for (var k in WX_ICONS) { if (desc.indexOf(k) !== -1) return WX_ICONS[k]; }
    return '\ud83c\udf21\ufe0f';
  }
  var COUNTIES = [
    '\u57fa\u9686\u5e02','\u53f0\u5317\u5e02','\u65b0\u5317\u5e02','\u6843\u5712\u5e02','\u65b0\u7af9\u5e02','\u65b0\u7af9\u7e23',
    '\u82d7\u6817\u7e23','\u53f0\u4e2d\u5e02','\u5f70\u5316\u7e23','\u5357\u6295\u7e23','\u96f2\u6797\u7e23',
    '\u5609\u7fa9\u5e02','\u5609\u7fa9\u7e23','\u53f0\u5357\u5e02','\u9ad8\u96c4\u5e02','\u5c4f\u6771\u7e23',
    '\u5b9c\u862d\u7e23','\u82b1\u84ee\u7e23','\u53f0\u6771\u7e23','\u6f8e\u6e56\u7e23','\u91d1\u9580\u7e23','\u9023\u6c5f\u7e23'
  ];
  function renderWeather() {
    var grid = Dom.byId('wx-grid');
    if (!grid) return;
    var wx = Data.weather;
    var state = Data.weatherState || 'idle';
    var hasData = Object.keys(wx).length > 0;
    if (state === 'loading' || (!hasData && state === 'idle')) {
      grid.innerHTML = '<div class="col-span-2 text-center text-slate-500 text-xs py-4">\u5929\u6c23\u8cc7\u6599\u8f09\u5165\u4e2d...</div>';
      return;
    }
    if (state === 'error') {
      grid.innerHTML = '<div class="col-span-2 text-center text-amber-400 text-xs py-4">\u5929\u6c23\u8cc7\u6599\u66ab\u6642\u7121\u6cd5\u8f09\u5165</div>';
      return;
    }
    if (!hasData) {
      grid.innerHTML = '<div class="col-span-2 text-center text-slate-500 text-xs py-4">\u66ab\u7121\u5929\u6c23\u8cc7\u6599</div>';
      return;
    }
    var html = '';
    COUNTIES.forEach(function(county) {
      var w = wx[county];
      var temp    = w ? w.temp    : '--';
      var weather = w ? w.weather : '--';
      var icon    = getWxIcon(weather);
      var shortName = county.replace('\u53f0','').replace('\u5e02','').replace('\u7e23','');
      html += '<div class="bg-slate-800/50 rounded-2xl p-3 flex items-center gap-2 hover:bg-slate-700/50 transition-colors cursor-pointer wx-county-card" data-county="' + county + '">' +
        '<span class="text-xl">' + icon + '</span>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="text-xs font-bold truncate">' + shortName + '</div>' +
          '<div class="text-[10px] text-slate-400 truncate">' + (weather || '--') + '</div>' +
        '</div>' +
        '<div class="text-right shrink-0">' +
          '<div class="text-sm font-black text-orange-400">' + (temp !== '--' ? temp + '\u00B0' : '--') + '</div>' +
        '</div>' +
      '</div>';
    });
    grid.innerHTML = html;
    Dom.queryAll('.wx-county-card', grid).forEach(function(card) {
      Dom.on(card, 'click', function() {
        var county = card.dataset.county;
        var center = window.COUNTY_CENTERS && window.COUNTY_CENTERS[county];
        if (center && MapMod.map) {
          NavMod.go('map');
          MapMod.map.setView(center, 11);
          Toast.show(county + ' ' + (Data.weather[county] ? Data.weather[county].temp + '\u00B0C' : ''));
        }
      });
    });
    var updEl = Dom.byId('wx-updated');
    if (updEl) {
      var now = new Date();
      updEl.textContent = '\u66f4\u65b0\u6642\u9593\uff1a' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    }
  }
  window.addEventListener('load', function() {
    Bus.on('weather:updated', function() { renderWeather(); });
    var refreshBtn = Dom.byId('wx-refresh');
    Dom.on(refreshBtn, 'click', function() {
        var icon = refreshBtn.querySelector('i');
        if (icon) icon.style.animation = 'spin 1s linear infinite';
        Data.fetchWeather();
        setTimeout(function() { if (icon) icon.style.animation = ''; }, 1500);
    });
    renderWeather();
  });
})();

var NearbyMod = {
  userLat: null, userLng: null, radius: 5, marker: null, circle: null,
  init: function() {
    var fsBtn = Dom.byId('js-fullscreen');
    Dom.on(fsBtn, 'click', function() {
        var header = document.querySelector('header');
        var nav    = document.querySelector('nav');
        var isFS   = fsBtn.querySelector('i').classList.contains('fa-compress');
        if (isFS) {
          if(header) header.style.display='';
          if(nav)    nav.style.display='';
          fsBtn.querySelector('i').className = 'fa-solid fa-expand text-xl';
          fsBtn.classList.remove('text-orange-500'); fsBtn.classList.add('text-slate-400');
        } else {
          if(header) header.style.display='none';
          if(nav)    nav.style.display='none';
          fsBtn.querySelector('i').className = 'fa-solid fa-compress text-xl';
          fsBtn.classList.add('text-orange-500'); fsBtn.classList.remove('text-slate-400');
        }
        setTimeout(function(){MapMod.map&&MapMod.map.invalidateSize();},100);
    });
    var radiusBtns = Dom.queryAll('.nearby-r-btn');
    Dom.onId('js-loc', 'click', function() { NearbyMod.locate(); });
    Dom.onId('nearby-close', 'click', function() { NearbyMod.hide(); });
    Dom.onAll('.nearby-r-btn', 'click', function(btn) {
        radiusBtns.forEach(function(b) { b.classList.remove('text-orange-400','font-bold'); b.classList.add('text-slate-400'); });
        btn.classList.add('text-orange-400','font-bold'); btn.classList.remove('text-slate-400');
        NearbyMod.radius = parseInt(btn.dataset.r);
        if (NearbyMod.userLat !== null) NearbyMod.render();
    });
  },
  locate: function() {
    if (!navigator.geolocation) { Toast.show('\u700f\u89bd\u5668\u4e0d\u652f\u63f4\u5b9a\u4f4d'); return; }
    var btn = Dom.byId('js-loc');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-lg"></i>';
    Toast.show('\u5b9a\u4f4d\u4e2d...', 8000);

    function onSuccess(pos) {
      if (btn) btn.innerHTML = '<i class="fa-solid fa-location-crosshairs text-lg"></i>';
      NearbyMod.userLat = pos.coords.latitude;
      NearbyMod.userLng = pos.coords.longitude;
      var acc = Math.round(pos.coords.accuracy);
      NearbyMod.showOnMap();
      NearbyMod.render();
      NearbyMod.show();
      var sEl = Dom.byId('js-route-start');
      if (sEl && !sEl.value) {
        sEl.value = pos.coords.latitude.toFixed(6) + ',' + pos.coords.longitude.toFixed(6);
        var cs = Dom.byId('clear-start');
        if (cs) cs.classList.remove('hidden');
      }
      Toast.show('\u5b9a\u4f4d\u6210\u529f\uff01\u7cbe\u78ba\u5ea6 \u00b1' + acc + 'm', 3000);
    }

    function onError(err) {
      if (btn) btn.innerHTML = '<i class="fa-solid fa-location-crosshairs text-lg"></i>';
      var msgs = { 1: '\u8acb\u5141\u8a31\u4f4d\u7f6e\u6b0a\u9650\uff08\u8a2d\u5b9a > Safari > \u4f4d\u7f6e\uff09', 2: '\u7121\u6cd5\u53d6\u5f97\u4f4d\u7f6e', 3: '\u5b9a\u4f4d\u903e\u6642\uff0c\u8acb\u91cd\u8a66' };
      Toast.show(msgs[err.code] || '\u5b9a\u4f4d\u5931\u6557', 4000);
    }

    // 第一次：允許快取位置（快速回應）
    navigator.geolocation.getCurrentPosition(onSuccess, function() {
      // 失敗則重試精確定位
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      });
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000
    });
  },
  showOnMap: function() {
    if (!NearbyMod.userLat) return;
    if (NearbyMod.marker) MapMod.map.removeLayer(NearbyMod.marker);
    var icon = L.divIcon({
      className: '',
      html: '<div style="position:relative;width:20px;height:20px">' +
            '<div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.3;animation:ping 1.5s ease-in-out infinite"></div>' +
            '<div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 8px #3b82f6"></div>' +
            '</div>',
      iconSize: [20,20], iconAnchor: [10,10]
    });
    NearbyMod.marker = L.marker([NearbyMod.userLat, NearbyMod.userLng], { icon: icon })
      .addTo(MapMod.map).bindTooltip('\u{1F4CD} \u6211\u7684\u4f4d\u7f6e', { direction:'top', permanent: false });
    if (NearbyMod.circle) MapMod.map.removeLayer(NearbyMod.circle);
    NearbyMod.circle = L.circle([NearbyMod.userLat, NearbyMod.userLng], {
      radius: NearbyMod.radius * 1000, color: '#3b82f6', fillColor: '#3b82f6',
      fillOpacity: 0.05, weight: 1.5, dashArray: '6,4'
    }).addTo(MapMod.map);
    MapMod.map.setView([NearbyMod.userLat, NearbyMod.userLng], 12);
  },
  getNearby: function() {
    if (NearbyMod.userLat === null) return [];
    return Data.allCams().filter(function(cam) {
      cam._dist = haversineKm(NearbyMod.userLat, NearbyMod.userLng, cam.lat, cam.lng);
      return cam._dist <= NearbyMod.radius;
    }).sort(function(a,b) { return a._dist - b._dist; });
  },
  render: function() {
    var list  = Dom.byId('nearby-list');
    var count = Dom.byId('nearby-count');
    if (!list) return;
    if (NearbyMod.circle) NearbyMod.circle.setRadius(NearbyMod.radius * 1000);
    var cams = NearbyMod.getNearby();
    if (count) count.textContent = cams.length + ' \u652f';
    if (cams.length === 0) {
      list.innerHTML = '<div class="px-4 py-6 text-center text-slate-500 text-xs">' + NearbyMod.radius + 'km \u5167\u7121\u653d\u5f71\u6a5f</div>';
      return;
    }
    var html = '';
    cams.slice(0,15).forEach(function(cam) {
      var color  = '#f97316';
      var distTx = cam._dist < 1 ? Math.round(cam._dist*1000)+'m' : cam._dist.toFixed(1)+'km';
      html += '<div class="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors nearby-cam-item" data-id="'+cam.id+'">' +
        '<div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style="background:'+color+'22">' +
        '<span class="w-2.5 h-2.5 rounded-full inline-block" style="background:'+color+'"></span></div>' +
        '<div class="flex-1 min-w-0"><div class="text-xs font-bold truncate">'+cam.name+'</div>' +
        '<div class="text-[10px] text-slate-400">'+cam.county+'</div></div>' +
        '<div class="text-[11px] font-bold text-blue-400 shrink-0">'+distTx+'</div></div>';
    });
    list.innerHTML = html;
    var camMap = {};
    Data.allCams().forEach(function(c) { camMap[c.id] = c; });
    Dom.queryAll('.nearby-cam-item', list).forEach(function(item) {
      Dom.on(item, 'click', function() {
        var cam = camMap[item.dataset.id];
        if (cam) { InfoMod.open(cam); MapMod.map.setView([cam.lat, cam.lng], 14); }
      });
    });
  },
  show: function() {
    var panel = Dom.byId('nearby-panel');
    if (panel) { panel.classList.remove('hidden'); panel.classList.add('flex','flex-col'); }
  },
  hide: function() {
    var panel = Dom.byId('nearby-panel');
    if (panel) { panel.classList.add('hidden'); panel.classList.remove('flex','flex-col'); }
    if (NearbyMod.marker) { MapMod.map.removeLayer(NearbyMod.marker); NearbyMod.marker = null; }
    if (NearbyMod.circle) { MapMod.map.removeLayer(NearbyMod.circle); NearbyMod.circle = null; }
    NearbyMod.userLat = null; NearbyMod.userLng = null;
  }
};

function haversineKm(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = (lat2-lat1)*Math.PI/180;
  var dLon = (lon2-lon1)*Math.PI/180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
          Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
          Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

(function() {
  window.addEventListener('load', function() {
    var histBtn = Dom.byId('history-btn');
    var toggleBtn = Dom.byId('route-toggle');
    var closeBtn  = Dom.byId('route-toggle-close');
    var collapsed = Dom.byId('route-collapsed');
    var expanded  = Dom.byId('route-expanded');
    function openExp() { if (collapsed) collapsed.classList.add('hidden'); if (expanded) expanded.classList.remove('hidden'); }
    function closeExp() { if (collapsed) collapsed.classList.remove('hidden'); if (expanded) expanded.classList.add('hidden'); }
    if (histBtn) HistoryMod.updateCount();
    Dom.on(histBtn, 'click', function() { HistoryMod.toggle(); });
    Dom.on(toggleBtn, 'click', openExp);
    Dom.on(closeBtn, 'click', closeExp);
    Bus.on('filter:changed', function() {
      if (RouteMod && RouteMod.active) {
        closeExp();
        var clearMini = Dom.byId('js-route-clear-small');
        if (clearMini) clearMini.classList.remove('hidden');
      }
    });
    var clearMini = Dom.byId('js-route-clear-small');
    Dom.on(clearMini, 'click', function() {
      if (RouteMod) RouteMod.clear();
      clearMini.classList.add('hidden');
    });

    var gmapsInput  = Dom.byId('js-gmaps-url');
    var gmapsBtn    = Dom.byId('js-gmaps-parse');
    var gmapsStatus = Dom.byId('js-gmaps-status');
    var startEl2    = Dom.byId('js-route-start');
    var endEl2      = Dom.byId('js-route-end');

    function doGmapsParse(urlText) {
      urlText = urlText ? urlText.trim() : '';
      if (!urlText) return;
      if (gmapsStatus) { gmapsStatus.textContent = '解析中...'; gmapsStatus.classList.remove('hidden'); }
      autoFillRoute(urlText, function(start, end, waypoints) {
        if (startEl2) startEl2.value = start || '';
        if (endEl2)   endEl2.value   = end   || '';
        if (gmapsInput) gmapsInput.value = '';
        if (gmapsStatus) { gmapsStatus.classList.add('hidden'); }
        AppState.pendingWaypoints = (waypoints && waypoints.length > 0) ? waypoints : [];
        WaypointsMod.render(AppState.pendingWaypoints);
        var cs = Dom.byId('clear-start');
        var ce = Dom.byId('clear-end');
        if (cs) cs.classList.toggle('hidden', !start);
        if (ce) ce.classList.toggle('hidden', !end);
        var wpCount = AppState.pendingWaypoints.length;
        if (start && end) {
          var msg = wpCount > 0 ? '起點→' + wpCount + '個停靠點→終點，解析中...' : '起終點已帶入，解析中...';
          Toast.show(msg, 2000);
          setTimeout(function() { RouteMod.analyze(); }, 300);
        } else if (end && !start) {
          Toast.show('終點已帶入，請補充起點', 3000);
        } else if (start && !end) {
          Toast.show('起點已帶入，請補充終點', 3000);
        } else {
          Toast.show('解析完成，請確認起終點');
        }
      });
    }

    Dom.on(gmapsBtn, 'click', function() {
      if (gmapsInput) doGmapsParse(gmapsInput.value);
    });
    if (gmapsInput) {
      Dom.on(gmapsInput, 'paste', function(e) {
        var txt = (e.clipboardData || window.clipboardData).getData('text');
        setTimeout(function() { doGmapsParse(txt || gmapsInput.value); }, 80);
      });
      Dom.on(gmapsInput, 'keydown', function(e) {
        if (e.key === 'Enter') doGmapsParse(gmapsInput.value);
      });
    }

    function bindClearBtn(inputId, btnId) {
      var inp = Dom.byId(inputId);
      var btn = Dom.byId(btnId);
      if (!inp || !btn) return;
      Dom.on(inp, 'input', function() {
        btn.classList.toggle('hidden', inp.value.length === 0);
      });
      Dom.on(btn, 'click', function() {
        inp.value = '';
        btn.classList.add('hidden');
        inp.focus();
      });
    }
    bindClearBtn('js-route-start', 'clear-start');
    bindClearBtn('js-route-end',   'clear-end');

    var _origDoGmaps = doGmapsParse;
    doGmapsParse = function(urlText) {
      _origDoGmaps(urlText);
      setTimeout(function() {
        var s = Dom.byId('js-route-start');
        var e = Dom.byId('js-route-end');
        var cs = Dom.byId('clear-start');
        var ce = Dom.byId('clear-end');
        if (s && cs) cs.classList.toggle('hidden', s.value.length === 0);
        if (e && ce) ce.classList.toggle('hidden', e.value.length === 0);
      }, 600);
    };
  });
})();

(function() {
  window.addEventListener('load', function() {
    var pasteInput = Dom.byId('route-paste-input');
    var startEl    = Dom.byId('js-route-start');
    var endEl      = Dom.byId('js-route-end');
    var expanded   = Dom.byId('route-expanded');
    var collapsed  = Dom.byId('route-collapsed');
    function doExpand() {
      if (expanded)  expanded.classList.remove('hidden');
      if (collapsed) collapsed.classList.add('hidden');
    }
    if (pasteInput) {
      Dom.on(pasteInput, 'focus', doExpand);
      Dom.on(pasteInput, 'paste', function(e) {
        var text = (e.clipboardData || window.clipboardData).getData('text');
        setTimeout(function() {
          pasteInput.value = '';
          doExpand();
          var status = Dom.byId('js-route-status');
          if (status) status.textContent = '\u89e3\u6790\u9023\u7d50\u4e2d...';
          var filled = autoFillRoute(text, function(start, end, waypoints) {
            if (startEl) startEl.value = start || '';
            if (endEl && end) endEl.value = end;
            if (status) status.textContent = '';
            AppState.pendingWaypoints = (waypoints && waypoints.length > 0) ? waypoints : [];
            WaypointsMod.render(AppState.pendingWaypoints);
            // 填入後自動執行路線解析
            if (start && end) {
              setTimeout(function() { RouteMod.analyze(); }, 200);
            } else {
              Toast.show(end ? '\u8d77\u7d42\u9ede\u5df2\u5e36\u5165\uff01' : '\u8d77\u9ede\u5df2\u5e36\u5165');
            }
          });
          if (!filled) {
            if (status) status.textContent = '';
          }
        }, 50);
      });
      Dom.on(pasteInput, 'input', function() { if (pasteInput.value.length > 3) doExpand(); });
    }
  });
})();

var HistoryMod = {
  KEY: 'tw_route_history', MAX: 10,
  load: function() {
    return Storage.getJson(HistoryMod.KEY, []);
  },
  save: function(list) { Storage.setJson(HistoryMod.KEY, list); },
  add: function(start, end, wps) {
    if (!start || !end) return;
    var list = HistoryMod.load().filter(function(r) { return !(r.start===start && r.end===end); });
    list.unshift({ start:start, end:end, waypoints:wps||[],
      distance: AppState.lastRouteInfo ? AppState.lastRouteInfo.distance : 0,
      duration: AppState.lastRouteInfo ? AppState.lastRouteInfo.duration : 0,
      mode: RouteMod ? RouteMod.mode : 'motorcycle', time: Date.now() });
    if (list.length > HistoryMod.MAX) list = list.slice(0, HistoryMod.MAX);
    HistoryMod.save(list); HistoryMod.updateCount();
  },
  updateCount: function() {
    var el = Dom.byId('history-count');
    var n = HistoryMod.load().length;
    if (el) el.textContent = n > 0 ? n + '\u7b46' : '';
  },
  render: function() {
    var panel = Dom.byId('history-panel');
    if (!panel) return;
    var list = HistoryMod.load();
    if (!list.length) { panel.innerHTML = '<div class="text-center text-slate-500 text-xs py-3">\u5c1a\u7121\u8a18\u9304</div>'; return; }
    var html = '';
    list.forEach(function(item, idx) {
      var d = new Date(item.time);
      var ds = (d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      var mIco = item.mode === 'motorcycle' ? '\ud83c\udfcd\ufe0f' : '\ud83d\ude97';
      var wpTxt = item.waypoints && item.waypoints.length ? ' \u00b7 '+item.waypoints.length+'\u505c\u9760' : '';
      html += '<div class="hist-item flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0" data-idx="'+idx+'">'
        + '<div class="flex-1 min-w-0"><div class="text-xs font-bold truncate">'+item.start.slice(0,10)+' \u2192 '+item.end.slice(0,10)+'</div>'
        + '<div class="text-[10px] text-slate-500 mt-0.5">'+mIco+' '+(item.distance||'?')+'km'+wpTxt+' \u00b7 '+ds+'</div></div>'
        + '<button class="hist-del text-slate-600 hover:text-red-400 text-sm px-1 shrink-0" data-idx="'+idx+'">\u00d7</button></div>';
    });
    panel.innerHTML = html;
    Dom.queryAll('.hist-item', panel).forEach(function(el) {
      Dom.on(el, 'click', function(e) {
        if (e.target.classList.contains('hist-del')) return;
        var item = list[parseInt(el.dataset.idx)];
        var sEl = Dom.byId('js-route-start');
        var eEl = Dom.byId('js-route-end');
        if (sEl) {
          sEl.value = item.start;
          var cs = Dom.byId('clear-start');
          if (cs) cs.classList.remove('hidden');
        }
        if (eEl) {
          eEl.value = item.end;
          var ce = Dom.byId('clear-end');
          if (ce) ce.classList.remove('hidden');
        }
        AppState.pendingWaypoints = item.waypoints||[];
        if (window.WaypointsMod) WaypointsMod.render(AppState.pendingWaypoints);
        HistoryMod.hide();
        Toast.show('\u8def\u7dda\u5df2\u5e36\u5165\uff0c\u8acb\u6309\u89e3\u6790');
      });
    });
    Dom.queryAll('.hist-del', panel).forEach(function(btn) {
      Dom.on(btn, 'click', function(e) {
        e.stopPropagation();
        var l=HistoryMod.load(); l.splice(parseInt(btn.dataset.idx),1);
        HistoryMod.save(l); HistoryMod.render(); HistoryMod.updateCount();
      });
    });
  },
  toggle: function() {
    var dd = Dom.byId('history-dropdown');
    if (!dd) return;
    if (dd.classList.contains('hidden')) { HistoryMod.render(); dd.classList.remove('hidden'); }
    else dd.classList.add('hidden');
  },
  hide: function() {
    var dd = Dom.byId('history-dropdown');
    if(dd) dd.classList.add('hidden');
  }
};

var WaypointsMod = {
  COLORS: ['#f97316','#3b82f6','#a855f7','#ec4899','#14b8a6','#f59e0b'],

  render: function(waypoints) {
    var container = Dom.byId('waypoints-container');
    if (!container) return;
    container.innerHTML = '';
    var wps = waypoints || AppState.pendingWaypoints || [];
    wps.forEach(function(wp, idx) {
      var color = WaypointsMod.COLORS[idx % WaypointsMod.COLORS.length];
      var label = idx + 1;
      var div = document.createElement('div');
      div.className = 'flex gap-2 items-center';
      div.innerHTML =
        '<div class="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style="background:' + color + '">' +
          '<span class="text-white text-[9px] font-black">' + label + '</span>' +
        '</div>' +
        '<div class="flex-1 relative">' +
          '<input type="text" class="wp-input w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-1.5 pr-7 text-xs focus:outline-none" data-idx="' + idx + '" value="' + (wp || '') + '" placeholder="停靠點 ' + label + '" />' +
          '<button class="wp-clear absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-orange-400 text-xs leading-none" data-idx="' + idx + '">&#10005;</button>' +
        '</div>';
      container.appendChild(div);
      Dom.on(Dom.query('.wp-clear', div), 'click', function() {
        AppState.pendingWaypoints.splice(parseInt(this.dataset.idx), 1);
        WaypointsMod.render(AppState.pendingWaypoints);
      });
      Dom.on(Dom.query('.wp-input', div), 'input', function() {
        AppState.pendingWaypoints[parseInt(this.dataset.idx)] = this.value;
      });
    });
  },

  updateEndLabel: function() {},

  getWaypoints: function() {
    var result = [];
    Dom.queryAll('.wp-input').forEach(function(inp) {
      if (inp.value.trim()) result.push(inp.value.trim());
    });
    return result;
  },

  clearMarkers: function() {
    if (AppState.waypointMapMarkers) {
      AppState.waypointMapMarkers.forEach(function(m) { MapMod.map.removeLayer(m); });
      AppState.waypointMapMarkers = [];
    }
  }
};

// ===== 沿途影像輪播 =====
var RouteStripMod = {
  show: function(cams) {
    var panel   = Dom.byId('route-camera-strip');
    var scroll  = Dom.byId('route-camera-strip-scroll');
    var countEl = Dom.byId('strip-count');
    if (!panel || !scroll) return;
    if (!cams || cams.length === 0) { RouteStripMod.hide(); return; }
    var sorted = cams.slice();
    if (countEl) countEl.textContent = '\u5171 ' + sorted.length + ' \u652f';
    scroll.innerHTML = '';
    sorted.forEach(function(cam) {
      var card = document.createElement('div');
      card.className = 'strip-cam';
      card.dataset.id = cam.id;
      var isYT = cam.type === 'youtube';
      var thumbSrc = '';
      if (isYT && cam.videoId) {
        thumbSrc = 'https://img.youtube.com/vi/' + cam.videoId + '/mqdefault.jpg';
      } else if (cam.url) {
        thumbSrc = cam.url + (cam.url.indexOf('?') !== -1 ? '&' : '?') + 't=' + Math.floor(Date.now()/60000);
      }
      var badgeHtml = isYT
        ? '<span class="strip-cam-badge yt">YT</span>'
        : '<span class="strip-cam-badge cctv">CCTV</span>';
      var w = Data.weather[cam.county];
      var wTxt = w ? (' \u00b7 ' + w.temp + '\u00B0C') : '';
      var imgHtml = thumbSrc ? '<img data-src="' + thumbSrc + '" alt="" />' : '';
      card.innerHTML =
        '<div class="strip-cam-img">' +
          '<div class="ph"><i class="fa-solid fa-camera"></i></div>' +
          imgHtml +
        '</div>' +
        '<div class="strip-cam-info">' +
          '<div class="strip-cam-name">' + cam.name + '</div>' +
          '<div class="strip-cam-meta">' + badgeHtml + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + cam.county + wTxt + '</span></div>' +
        '</div>';
      Dom.on(card, 'click', function() {
        var allCams = Data.allCams();
        var found = null;
        for (var i = 0; i < allCams.length; i++) { if (allCams[i].id === cam.id) { found = allCams[i]; break; } }
        if (!found) return;
        InfoMod.open(found);
        MapMod.map.setView([found.lat, found.lng], 13);
      });
      scroll.appendChild(card);
    });
    panel.classList.add('visible');
    panel.style.display = 'block';
    // 縮圖延遲載入
    if ('IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) {
          if (!e.isIntersecting) return;
          var img = e.target;
          if (img.dataset.src && !img.src) {
            img.src = img.dataset.src;
            img.onload = function() {
              img.style.opacity = '1';
              var ph = img.parentElement.querySelector('.ph');
              if (ph) ph.style.display = 'none';
            };
            img.onerror = function() { img.remove(); };
          }
          obs.unobserve(img);
        });
      }, { root: scroll, rootMargin: '100px' });
      Dom.queryAll('img[data-src]', scroll).forEach(function(img) { obs.observe(img); });
    } else {
      Dom.queryAll('img[data-src]', scroll).forEach(function(img) {
        img.src = img.dataset.src;
        img.onload = function() {
          img.style.opacity = '1';
          var ph = img.parentElement.querySelector('.ph');
          if (ph) ph.style.display = 'none';
        };
      });
    }
  },
  hide: function() {
    var panel = Dom.byId('route-camera-strip');
    if (panel) { panel.classList.remove('visible'); panel.style.display = 'none'; }
  },
  toggle: function() {
    var panel = Dom.byId('route-camera-strip');
    if (!panel) return;
    var isVisible = panel.classList.contains('visible') || panel.style.display === 'block';
    if (isVisible) {
      RouteStripMod.hide();
    } else {
      RouteStripMod.show(RouteMod.filteredCams);
    }
  }
};

// ===== 地名建議模組 =====
var PlaceSuggest = {
  // 台灣常用地名快速候選
  PLACES: [
    '台北','新北','基隆','桃園','新竹','苗栗','台中','彰化','南投','雲林',
    '嘉義','台南','高雄','屏東','宜蘭','花蓮','台東','澎湖','金門','馬祖',
    '台北車站','台中車站','高雄車站','台南車站','桃園機場','高雄機場',
    '墾丁','日月潭','阿里山','合歡山','太魯閣','九份','淡水','烏來',
    '北海岸','東海岸','花東縱谷','南橫公路','北橫公路','中橫公路',
    '蘇花公路','台11線','台9線','台1線','台3線','台17線','台61線',
    '國道1號','國道3號','國道5號','國道6號','國道10號',
    '中山高','二高','北宜','北二高','北部濱海'
  ],
  _timer: null,

  // 從 Nominatim 搜尋地名（搜尋框用）
  search: function(q, cb) {
    if (!q || q.length < 1) { cb([]); return; }
    var lower = q.toLowerCase();
    // 先用本地快速候選
    var local = PlaceSuggest.PLACES.filter(function(p) {
      return p.toLowerCase().indexOf(lower) !== -1;
    }).slice(0, 4).map(function(p) {
      return { name: p, sub: '快速選擇', lat: null, lng: null };
    });
    // 再用 Nominatim 遠端搜尋（debounce 400ms）
    clearTimeout(PlaceSuggest._timer);
    PlaceSuggest._timer = setTimeout(function() {
      var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q + ' 台灣')
              + '&format=json&limit=5&countrycodes=tw&accept-language=zh-TW';
      fetchJson(url, { headers: { 'User-Agent': 'taiwan-road-dashboard/1.0' } })
        .then(function(data) {
          var remote = (data || []).map(function(item) {
            var name = item.display_name.split(',')[0].trim();
            var sub  = item.display_name.split(',').slice(1,3).join(',').trim();
            return { name: name, sub: sub, lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
          });
          // 合併去重
          var seen = {};
          var merged = local.concat(remote).filter(function(r) {
            if (seen[r.name]) return false;
            seen[r.name] = 1; return true;
          });
          cb(merged.slice(0, 6));
        })
        .catch(function() { cb(local); });
    }, 350);
    // 立即回傳本地結果
    if (local.length > 0) cb(local);
  },

  // 綁定輸入框和建議框
  bind: function(inputId, suggestId, onSelect) {
    var inp = Dom.byId(inputId);
    var box = Dom.byId(suggestId);
    if (!inp || !box) return;

    Dom.on(inp, 'input', function() {
      var q = inp.value.trim();
      if (!q) { box.innerHTML = ''; box.classList.remove('visible'); return; }
      PlaceSuggest.search(q, function(results) {
        if (!results.length) { box.innerHTML = ''; box.classList.remove('visible'); return; }
        var html = results.map(function(r) {
          var icon = r.lat ? 'fa-location-dot' : 'fa-road';
          return '<div class="suggest-item" data-name="' + r.name + '" data-lat="' + (r.lat||'') + '" data-lng="' + (r.lng||'') + '">'
            + '<i class="fa-solid ' + icon + ' suggest-icon"></i>'
            + '<span class="suggest-name">' + r.name + '</span>'
            + '<span class="suggest-sub">' + (r.sub||'') + '</span>'
            + '</div>';
        }).join('');
        box.innerHTML = html;
        box.classList.add('visible');
        Dom.queryAll('.suggest-item', box).forEach(function(item) {
          Dom.on(item, 'click', function() {
            var name = item.dataset.name;
            var lat  = item.dataset.lat;
            var lng  = item.dataset.lng;
            inp.value = (lat && lng) ? (lat + ',' + lng) : name;
            box.innerHTML = ''; box.classList.remove('visible');
            var cs = Dom.byId('clear-' + inputId.replace('js-route-',''));
            if (cs) cs.classList.remove('hidden');
            if (onSelect) onSelect(name, lat, lng);
          });
        });
      });
    });

    Dom.on(inp, 'blur', function() {
      setTimeout(function() { box.innerHTML = ''; box.classList.remove('visible'); }, 200);
    });
  }
};
  var modal = Dom.byId('modal');
  var modalSh = Dom.byId('modal-sh');
  window.ModalEffect = {
    open: function() {
      if (!modal || !modalSh) return;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      setTimeout(function() {
        modalSh.classList.remove('scale-95','opacity-0');
        modalSh.classList.add('scale-100','opacity-100');
      }, 10);
    },
    close: function() {
      if (!modal || !modalSh) return;
      modalSh.classList.remove('scale-100','opacity-100');
      modalSh.classList.add('scale-95','opacity-0');
      var med = Dom.byId('m-med');
      if (med) med.innerHTML = '';
      setTimeout(function() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }, 300);
    }
  };
  Dom.onId('modal-overlay', 'click', function() { window.ModalEffect.close(); });
  Dom.onId('modal-close-btn', 'click', function() { window.ModalEffect.close(); });

  // 註冊 Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('./sw.js')
        .then(function(reg) {
          console.log('SW registered:', reg.scope);
          // 有新版本時提示用戶
          reg.addEventListener('updatefound', function() {
            var newWorker = reg.installing;
            newWorker.addEventListener('statechange', function() {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                Toast.show('有新版本，重新整理即可更新', 4000);
              }
            });
          });
        })
        .catch(function(err) {
          console.log('SW registration failed:', err);
        });
    });
  }
