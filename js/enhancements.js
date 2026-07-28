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
          '<div class="text-xs font-bold truncate">' + escapeHtml(shortName) + '</div>' +
          '<div class="text-[10px] text-slate-400 truncate">' + escapeHtml(weather || '--') + '</div>' +
        '</div>' +
        '<div class="text-right shrink-0">' +
          '<div class="text-sm font-black text-orange-400">' + escapeHtml(temp !== '--' ? temp + '\u00B0' : '--') + '</div>' +
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
    if (Data.camsState === 'loading' || Data.camsState === 'idle') {
      list.innerHTML = '<div class="px-4 py-6 text-center text-slate-500 text-xs">\u651d\u5f71\u6a5f\u8cc7\u6599\u8f09\u5165\u4e2d...</div>';
      return;
    }
    if (Data.camsState === 'error') {
      list.innerHTML = '<div class="px-4 py-6 text-center text-amber-400 text-xs">\u651d\u5f71\u6a5f\u8cc7\u6599\u66ab\u6642\u7121\u6cd5\u8f09\u5165</div>';
      return;
    }
    if (cams.length === 0) {
      list.innerHTML = '<div class="px-4 py-6 text-center text-slate-500 text-xs">' + NearbyMod.radius + 'km \u5167\u7121\u653d\u5f71\u6a5f</div>';
      return;
    }
    var html = '';
    cams.slice(0,15).forEach(function(cam) {
      var color  = '#f97316';
      var distTx = cam._dist < 1 ? Math.round(cam._dist*1000)+'m' : cam._dist.toFixed(1)+'km';
      html += '<div class="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors nearby-cam-item" data-id="'+escapeHtml(cam.id)+'">' +
        '<div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style="background:'+color+'22">' +
        '<span class="w-2.5 h-2.5 rounded-full inline-block" style="background:'+color+'"></span></div>' +
        '<div class="flex-1 min-w-0"><div class="text-xs font-bold truncate">'+escapeHtml(cam.name)+'</div>' +
        '<div class="text-[10px] text-slate-400">'+escapeHtml(cam.county)+'</div></div>' +
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

    function analyzeNextFrame() {
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function() { RouteMod.analyze(); });
      } else {
        RouteMod.analyze();
      }
    }

    function doGmapsParse(urlText) {
      urlText = urlText ? urlText.trim() : '';
      if (!urlText) return;
      if (gmapsInput) gmapsInput.value = urlText;
      if (gmapsStatus) { gmapsStatus.textContent = '正在讀取路線連結...'; gmapsStatus.classList.remove('hidden'); }
      autoFillRoute(urlText, function(start, end, waypoints) {
        if (startEl2) {
          startEl2.value = start || '';
          delete startEl2.dataset.routePoint;
          delete startEl2.dataset.routePointLabel;
        }
        if (endEl2) {
          endEl2.value = end || '';
          delete endEl2.dataset.routePoint;
          delete endEl2.dataset.routePointLabel;
        }
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
          analyzeNextFrame();
        } else if (end && !start) {
          Toast.show('終點已帶入，請補充起點', 3000);
        } else if (start && !end) {
          Toast.show('起點已帶入，請補充終點', 3000);
        } else {
          Toast.show('解析完成，請確認起終點');
        }
      }, function(message) {
        if (gmapsStatus) {
          gmapsStatus.textContent = '';
          gmapsStatus.classList.add('hidden');
        }
        Toast.show(message || '無法解析，請手動輸入起終點', 3500);
      });
    }

    Dom.on(gmapsBtn, 'click', function() {
      if (gmapsInput) doGmapsParse(gmapsInput.value);
    });
    if (gmapsInput) {
      Dom.on(gmapsInput, 'paste', function(e) {
        var txt = (e.clipboardData || window.clipboardData).getData('text');
        if (txt) {
          e.preventDefault();
          doGmapsParse(txt);
        }
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
        delete inp.dataset.routePoint;
        delete inp.dataset.routePointLabel;
        btn.classList.add('hidden');
        inp.focus();
      });
    }
    bindClearBtn('js-route-start', 'clear-start');
    bindClearBtn('js-route-end',   'clear-end');
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
        if (!text) return;
        e.preventDefault();
        function importPastedRoute() {
          pasteInput.value = text;
          doExpand();
          var status = Dom.byId('js-route-status');
          if (status) status.textContent = '\u89e3\u6790\u9023\u7d50\u4e2d...';
          autoFillRoute(text, function(start, end, waypoints) {
            pasteInput.value = '';
            if (startEl) {
              startEl.value = start || '';
              delete startEl.dataset.routePoint;
              delete startEl.dataset.routePointLabel;
            }
            if (endEl && end) {
              endEl.value = end;
              delete endEl.dataset.routePoint;
              delete endEl.dataset.routePointLabel;
            }
            if (status) status.textContent = '';
            AppState.pendingWaypoints = (waypoints && waypoints.length > 0) ? waypoints : [];
            WaypointsMod.render(AppState.pendingWaypoints);
            // 填入後自動執行路線解析
            if (start && end) {
              if (window.requestAnimationFrame) {
                window.requestAnimationFrame(function() { RouteMod.analyze(); });
              } else {
                RouteMod.analyze();
              }
            } else {
              Toast.show(end ? '\u8d77\u7d42\u9ede\u5df2\u5e36\u5165\uff01' : '\u8d77\u9ede\u5df2\u5e36\u5165');
            }
          }, function(message) {
            if (status) status.textContent = '';
            Toast.show(message || '\u7121\u6cd5\u89e3\u6790\uff0c\u8acb\u624b\u52d5\u8f38\u5165\u8d77\u7d42\u9ede', 3500);
          });
        }
        importPastedRoute();
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
        + '<div class="flex-1 min-w-0"><div class="text-xs font-bold truncate">'+escapeHtml(item.start.slice(0,10))+' \u2192 '+escapeHtml(item.end.slice(0,10))+'</div>'
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
          '<input type="text" class="wp-input w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-1.5 pr-7 text-xs focus:outline-none" data-idx="' + idx + '" value="' + escapeHtml(wp || '') + '" placeholder="停靠點 ' + label + '" />' +
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
      } else if (safeHttpUrl(cam.url)) {
        var safeStripUrl = safeHttpUrl(cam.url);
        thumbSrc = safeStripUrl + (safeStripUrl.indexOf('?') !== -1 ? '&' : '?') + 't=' + Math.floor(Date.now()/60000);
      }
      var badgeHtml = isYT
        ? '<span class="strip-cam-badge yt">YT</span>'
        : '<span class="strip-cam-badge cctv">CCTV</span>';
      var w = Data.weather[cam.county];
      var wTxt = w ? (' \u00b7 ' + w.temp + '\u00B0C') : '';
      var imgHtml = thumbSrc ? '<img data-src="' + escapeHtml(thumbSrc) + '" alt="" />' : '';
      card.innerHTML =
        '<div class="strip-cam-img">' +
          '<div class="ph"><i class="fa-solid fa-camera"></i></div>' +
          imgHtml +
        '</div>' +
        '<div class="strip-cam-info">' +
          '<div class="strip-cam-name">' + escapeHtml(cam.name) + '</div>' +
          '<div class="strip-cam-meta">' + badgeHtml + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(cam.county + wTxt) + '</span></div>' +
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
    '基隆車站','台北車站','板橋車站','桃園車站','新竹車站','苗栗車站',
    '台中車站','彰化車站','斗六車站','嘉義車站','台南車站','高雄車站',
    '屏東車站','宜蘭車站','蘇澳車站','花蓮車站','台東車站','枋寮車站',
    '台中市政府','奇美博物館','桃園機場','高雄機場',
    '墾丁','日月潭','阿里山','合歡山','太魯閣','九份','淡水','烏來',
    '北海岸','東海岸','花東縱谷','南橫公路','北橫公路','中橫公路',
    '蘇花公路','蘇花改','北宜公路','淡金公路','羅馬公路','南迴公路',
    '台11線','台9線','台1線','台3線','台7線','台7乙','台8線','台14甲','台17線','台20線','台26線','台61線',
    '136縣道','139縣道','182縣道',
    '武嶺','清境','埔里','霧社','大禹嶺','梨山','奮起湖','太麻里','多良車站',
    '國道1號','國道3號','國道5號','國道6號','國道10號',
    '中山高','二高','北宜','北二高','北部濱海','西濱','雪隧'
  ],
  // 座標取自 repo 的全台路線稽核案例；選取後可直接規劃，不必再做地名解析。
  PLACE_COORDS: {
    '基隆': [25.1327, 121.7393],
    '台北': [25.0478, 121.5170],
    '新北': [25.0143, 121.4637],
    '桃園': [24.9892, 121.3133],
    '新竹': [24.8016, 120.9716],
    '苗栗': [24.5700, 120.8223],
    '台中': [24.1370, 120.6868],
    '彰化': [24.0818, 120.5385],
    '雲林': [23.7110, 120.5411],
    '嘉義': [23.4791, 120.4412],
    '台南': [22.9971, 120.2127],
    '高雄': [22.6394, 120.3020],
    '屏東': [22.6692, 120.4863],
    '宜蘭': [24.7540, 121.7580],
    '花蓮': [23.9937, 121.6013],
    '台東': [22.7937, 121.1230],
    '澎湖': [23.5663, 119.5770],
    '金門': [24.4321, 118.3171],
    '馬祖': [26.1592, 119.9432],
    '基隆車站': [25.1327, 121.7393],
    '台北車站': [25.0478, 121.5170],
    '板橋車站': [25.0143, 121.4637],
    '桃園車站': [24.9892, 121.3133],
    '新竹車站': [24.8016, 120.9716],
    '苗栗車站': [24.5700, 120.8223],
    '台中車站': [24.1370, 120.6868],
    '彰化車站': [24.0818, 120.5385],
    '斗六車站': [23.7110, 120.5411],
    '嘉義車站': [23.4791, 120.4412],
    '台南車站': [22.9971, 120.2127],
    '高雄車站': [22.6394, 120.3020],
    '屏東車站': [22.6692, 120.4863],
    '宜蘭車站': [24.7540, 121.7580],
    '蘇澳車站': [24.5960, 121.8510],
    '花蓮車站': [23.9937, 121.6013],
    '台東車站': [22.7937, 121.1230],
    '枋寮車站': [22.3672, 120.5924],
    '淡水': [25.1676, 121.4450],
    '埔里': [23.9660, 120.9680],
    '阿里山': [23.5110, 120.8050],
    '台中市政府': [24.1618, 120.6466],
    '奇美博物館': [22.9346, 120.2260]
  },
  PLACE_ALIASES: {
    '台北': ['臺北', '台北市', '信義區', '西門', '士林'],
    '新北': ['新北市', '板橋', '淡水', '汐止', '三重'],
    '桃園': ['桃園市', '中壢', '龍潭', '大溪'],
    '台中': ['臺中', '台中市', '豐原', '大甲', '清水'],
    '台南': ['臺南', '台南市', '新營', '永康', '仁德'],
    '台東': ['臺東', '台東市', '池上', '鹿野'],
    '花蓮': ['花蓮市', '太魯閣', '新城', '秀林'],
    '高雄': ['高雄市', '岡山', '旗山', '左營'],
    '墾丁': ['恆春', '南灣', '鵝鑾鼻'],
    '日月潭': ['魚池', '水社'],
    '阿里山': ['奮起湖', '石棹'],
    '合歡山': ['武嶺', '清境'],
    '蘇花公路': ['蘇花', '台9線', '崇德'],
    '蘇花改': ['蘇花改路段', '蘇澳', '東澳', '南澳', '和平'],
    '北宜公路': ['北宜', '新店', '坪林', '頭城', '九彎十八拐'],
    '淡金公路': ['淡金', '台2線', '三芝', '石門', '金山'],
    '羅馬公路': ['羅馬', '復興', '關西', '北橫支線'],
    '南迴公路': ['南迴', '台9線', '楓港', '達仁', '太麻里'],
    '南橫公路': ['南橫', '台20線', '梅山口', '向陽'],
    '北橫公路': ['北橫', '台7線', '大溪', '巴陵', '明池'],
    '中橫公路': ['中橫', '台8線', '太魯閣', '大禹嶺', '梨山'],
    '台61線': ['西濱', '西濱快速道路'],
    '台14甲': ['合歡山公路', '武嶺', '清境', '小風口'],
    '台7線': ['北橫', '棲蘭', '明池', '巴陵'],
    '台7乙': ['台七乙', '三峽', '復興', '羅浮'],
    '台8線': ['中橫', '太魯閣', '天祥', '梨山'],
    '台20線': ['南橫', '向陽', '利稻', '梅山口'],
    '台26線': ['墾丁', '鵝鑾鼻', '風吹砂', '佳樂水'],
    '136縣道': ['136', '赤崁頂', '台中山線'],
    '139縣道': ['139', '彰化139', '八卦山'],
    '182縣道': ['182', '182線', '龍崎', '台南山線'],
    '武嶺': ['合歡山', '台14甲', '小風口'],
    '清境': ['仁愛', '霧社', '台14甲'],
    '埔里': ['南投埔里', '國6', '台14線'],
    '太麻里': ['金針山', '南迴', '台東'],
    '多良車站': ['多良', '南迴', '台9線'],
    '國道1號': ['國1', '中山高'],
    '國道3號': ['國3', '二高'],
    '國道5號': ['國5', '雪隧'],
    '台9線': ['南迴', '北宜', '蘇花'],
    '台11線': ['東海岸', '海線']
  },
  isMotorcycleHotspot: function(place) {
    return [
      '北宜公路', '淡金公路', '羅馬公路', '北橫公路', '中橫公路', '南橫公路',
      '蘇花公路', '蘇花改', '南迴公路', '台3線', '台7線', '台7乙', '台8線',
      '台9線', '台11線', '台14甲', '台20線', '台26線', '台61線', '136縣道',
      '139縣道', '182縣道', '武嶺', '清境', '阿里山', '墾丁', '太魯閣'
    ].indexOf(place) !== -1;
  },

  buildFallbacks: function(q, existingNames) {
    var nq = normalizeSearchText(q);
    if (!nq) return [];
    var seen = {};
    (existingNames || []).forEach(function(name) { seen[normalizeSearchText(name)] = 1; });
    var groups = [
      {
        trigger: ['坪林', '頭城', '礁溪', '石碇', '九彎十八拐', '北宜'],
        picks: [
          { name: '北宜公路', sub: '猜你想找：坪林、頭城、九彎十八拐' },
          { name: '台9線', sub: '猜你想找：北宜、蘇花、南迴' }
        ]
      },
      {
        trigger: ['西濱', '新豐', '白沙屯', '芳苑', '布袋', '台61', '台61線'],
        picks: [
          { name: '台61線', sub: '猜你想找：西濱快速道路' },
          { name: '台17線', sub: '猜你想找：濱海平面替代路線' }
        ]
      },
      {
        trigger: ['武嶺', '清境', '埔里', '霧社', '小風口', '合歡山'],
        picks: [
          { name: '台14甲', sub: '猜你想找：清境、武嶺、合歡山公路' },
          { name: '合歡山', sub: '猜你想找：高山熱門路線' }
        ]
      },
      {
        trigger: ['蘇花', '崇德', '和仁', '南澳', '東澳', '新城'],
        picks: [
          { name: '蘇花公路', sub: '猜你想找：蘇花山海線路段' },
          { name: '蘇花改', sub: '猜你想找：蘇澳、東澳、南澳' }
        ]
      },
      {
        trigger: ['南迴', '太麻里', '多良', '楓港', '達仁', '大武'],
        picks: [
          { name: '南迴公路', sub: '猜你想找：台東到屏東的山海線' },
          { name: '台9線', sub: '猜你想找：南迴主線' }
        ]
      },
      {
        trigger: ['北橫', '巴陵', '羅浮', '明池', '棲蘭', '復興'],
        picks: [
          { name: '北橫公路', sub: '猜你想找：大溪、巴陵、明池' },
          { name: '台7線', sub: '猜你想找：北橫主線' }
        ]
      },
      {
        trigger: ['羅馬', '關西', '復興', '三民', '羅浮'],
        picks: [
          { name: '羅馬公路', sub: '猜你想找：關西到復興的熱門跑法' },
          { name: '台7乙', sub: '猜你想找：三峽、復興支線' }
        ]
      },
      {
        trigger: ['淡金', '三芝', '石門', '金山', '北海岸'],
        picks: [
          { name: '淡金公路', sub: '猜你想找：北海岸海線巡航' },
          { name: '北海岸', sub: '猜你想找：三芝、石門、金山' }
        ]
      },
      {
        trigger: ['182', '龍崎', '關廟', '台南山線'],
        picks: [
          { name: '182縣道', sub: '猜你想找：台南熱門山線' },
          { name: '阿里山', sub: '猜你想找：南部熱門山路' }
        ]
      }
    ];
    var fallback = [];
    groups.forEach(function(group) {
      var matched = group.trigger.some(function(term) {
        var nt = normalizeSearchText(term);
        return nt.indexOf(nq) !== -1 || nq.indexOf(nt) !== -1;
      });
      if (!matched) return;
      group.picks.forEach(function(pick) {
        var key = normalizeSearchText(pick.name);
        if (seen[key]) return;
        seen[key] = 1;
        fallback.push({
          name: pick.name,
          sub: pick.sub,
          lat: null,
          lng: null,
          score: 48
        });
      });
    });
    return fallback.slice(0, 4);
  },

  rankLocal: function(q, context) {
    var nq = normalizeSearchText(q);
    var prioritizeRoads = context === 'traffic';
    var prioritizePlaces = context === 'route';
    var scored = [];
    PlaceSuggest.PLACES.forEach(function(place) {
      var variants = [place].concat(PlaceSuggest.PLACE_ALIASES[place] || []);
      var bestScore = -1;
      var matchedName = place;
      variants.forEach(function(variant, variantIndex) {
        var nv = normalizeSearchText(variant);
        if (!nv) return;
        var score = -1;
        if (nv === nq) score = 100;
        else if (nv.indexOf(nq) === 0) score = 90 - Math.max(0, nv.length - nq.length);
        else if (nv.indexOf(nq) !== -1) score = 72 - Math.max(0, nv.length - nq.length);
        else if (
          prioritizeRoads
          && PlaceSuggest.isMotorcycleHotspot(place)
          && nq.indexOf(nv) !== -1
        ) score = 60;
        if (score > bestScore) {
          bestScore = score;
          matchedName = variantIndex === 0 ? place : variant;
        }
      });
      var canonicalMatch = normalizeSearchText(matchedName) === normalizeSearchText(place);
      var coords = PlaceSuggest.PLACE_COORDS[matchedName]
        || (canonicalMatch ? PlaceSuggest.PLACE_COORDS[place] : null);
      if (bestScore >= 0 && prioritizeRoads && PlaceSuggest.isMotorcycleHotspot(place)) {
        bestScore += 12;
      }
      if (bestScore >= 0 && prioritizePlaces && coords) bestScore += nq.length === 1 ? 24 : 12;
      if (bestScore >= 0 && prioritizePlaces && PlaceSuggest.isMotorcycleHotspot(place)) bestScore -= 8;
      if (bestScore >= 0) scored.push({
        name: matchedName,
        sub: coords
          ? '可直接規劃'
          : (matchedName !== place
            ? place + '常用地名'
            : ((PlaceSuggest.PLACE_ALIASES[place] || []).slice(0, 2).join('、') || '快速選擇')),
        lat: coords ? coords[0] : null,
        lng: coords ? coords[1] : null,
        score: bestScore
      });
    });
    var seen = {};
    return scored.sort(function(a, b) { return b.score - a.score; }).filter(function(item) {
      var key = normalizeSearchText(item.name);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).slice(0, 6);
  },

  // 輸入建議只用本地索引。遠端 Nominatim 僅在使用者送出完整地名時解析，
  // 避免逐字查詢造成額外等待，也符合 public Nominatim 不提供 autocomplete 的規範。
  search: function(q, cb, options) {
    if (!q || q.length < 1) { cb([]); return; }
    var context = options && options.context ? options.context : 'traffic';
    var local = PlaceSuggest.rankLocal(q, context);
    var fallback = PlaceSuggest.buildFallbacks(q, local.map(function(item) { return item.name; }));
    cb(local.concat(fallback).slice(0, 6));
  },

  // 綁定輸入框和建議框
  bind: function(inputId, suggestId, onSelect) {
    var inp = Dom.byId(inputId);
    var box = Dom.byId(suggestId);
    if (!inp || !box) return;
    var results = [];
    var activeIndex = -1;

    inp.setAttribute('role', 'combobox');
    inp.setAttribute('aria-autocomplete', 'list');
    inp.setAttribute('aria-controls', suggestId);
    inp.setAttribute('aria-expanded', 'false');
    box.setAttribute('role', 'listbox');

    function hasCoordinates(item) {
      return item && item.lat !== null && item.lat !== '' && item.lng !== null && item.lng !== ''
        && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng));
    }

    function hide() {
      results = [];
      activeIndex = -1;
      box.innerHTML = '';
      box.classList.remove('visible');
      inp.setAttribute('aria-expanded', 'false');
      inp.removeAttribute('aria-activedescendant');
    }

    function setActive(index) {
      var items = Dom.queryAll('.suggest-item', box);
      if (!items.length) return;
      activeIndex = (index + items.length) % items.length;
      items.forEach(function(item, itemIndex) {
        var isActive = itemIndex === activeIndex;
        item.classList.toggle('is-active', isActive);
        item.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      inp.setAttribute('aria-activedescendant', items[activeIndex].id);
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function select(item) {
      if (!item) return;
      inp.value = item.name;
      if (hasCoordinates(item)) {
        inp.dataset.routePoint = Number(item.lat) + ',' + Number(item.lng);
        inp.dataset.routePointLabel = item.name;
      } else {
        delete inp.dataset.routePoint;
        delete inp.dataset.routePointLabel;
      }
      hide();
      var cs = Dom.byId('clear-' + inputId.replace('js-route-',''));
      if (cs) cs.classList.remove('hidden');
      if (onSelect) onSelect(item.name, item.lat, item.lng);
    }

    function render(nextResults) {
      results = nextResults || [];
      activeIndex = -1;
      if (!results.length) { hide(); return; }
      box.innerHTML = results.map(function(r, index) {
        var icon = hasCoordinates(r) ? 'fa-location-dot' : 'fa-road';
        return '<div id="' + suggestId + '-option-' + index + '" role="option" aria-selected="false"'
          + ' class="suggest-item" data-index="' + index + '">'
          + '<i class="fa-solid ' + icon + ' suggest-icon"></i>'
          + '<span class="suggest-name">' + escapeHtml(r.name) + '</span>'
          + '<span class="suggest-sub">' + escapeHtml(r.sub||'') + '</span>'
          + '</div>';
      }).join('');
      box.classList.add('visible');
      inp.setAttribute('aria-expanded', 'true');
    }

    Dom.on(inp, 'input', function() {
      var q = inp.value.trim();
      if (inp.dataset.routePointLabel !== q) {
        delete inp.dataset.routePoint;
        delete inp.dataset.routePointLabel;
      }
      if (!q) { hide(); return; }
      PlaceSuggest.search(q, function(results) {
        render(results);
      }, { context: 'route' });
    });

    function activateOption(event) {
      var itemEl = event.target.closest('.suggest-item');
      if (!itemEl || !box.contains(itemEl)) return;
      event.preventDefault();
      select(results[Number(itemEl.dataset.index)]);
    }
    Dom.on(box, 'mousedown', activateOption);
    // VoiceOver 等輔助技術可能只送出 synthetic click。
    Dom.on(box, 'click', activateOption);

    // Capture 先於 RouteMod 的 Enter handler，選單展開時 Enter 用來選取候選。
    Dom.on(inp, 'keydown', function(event) {
      if (!box.classList.contains('visible') || !results.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive(activeIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive(activeIndex <= 0 ? results.length - 1 : activeIndex - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        select(results[activeIndex >= 0 ? activeIndex : 0]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        hide();
      }
    }, true);

    Dom.on(inp, 'focus', function() {
      var q = inp.value.trim();
      if (!q) return;
      PlaceSuggest.search(q, render, { context: 'route' });
    });

    Dom.on(inp, 'blur', function() {
      setTimeout(hide, 120);
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
