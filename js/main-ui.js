// Main UI modules for map, route, list, modal, and app boot.

(function() {
  'use strict';

  var THEME_KEY = 'tw_theme';
  var ROUTE_BTN_IDLE_TEXT = '\u{1F50D} \u89e3\u6790\u8def\u7dda\uff0c\u627e\u6cbf\u9014\u651d\u5f71\u6a5f';
  var REGION_LABELS = {
    north: '\u5317\u90e8',
    central: '\u4e2d\u90e8',
    south: '\u5357\u90e8',
    east: '\u6771\u90e8',
    island: '\u96e2\u5cf6'
  };
  var SEARCH_HINTS = {
    all: ['北宜', '西濱', '蘇花', '南迴', '台3線', '台61線'],
    north: ['北宜', '台7線', '台7乙', '淡金', '北海岸', '雪隧'],
    central: ['台3線', '台14甲', '清境', '日月潭', '139縣道', '中橫'],
    south: ['台1線', '182縣道', '阿里山', '墾丁', '南橫', '台26線'],
    east: ['花蓮', '台東', '太魯閣', '蘇花', '台11線', '南迴'],
    island: ['澎湖', '金門', '馬祖', '機場', '港', '車站']
  };
  var RIDE_ROUTE_CHIPS = [
    '北宜公路', '台61線', '蘇花公路', '南迴公路', '台14甲', '北橫公路', '182縣道', '淡金公路'
  ];

  function setFlexVisible(el, isVisible) {
    if (!el) return;
    el.classList.toggle('hidden', !isVisible);
    el.classList.toggle('flex', !!isVisible);
  }

  var ThemeMod = {
    dark: Storage.get(THEME_KEY, 'dark') !== 'light',
    init: function() {
      Dom.onId('js-theme', 'click', function() { ThemeMod.toggle(); });
    },
    toggle: function() {
      ThemeMod.dark = !ThemeMod.dark;
      var btn = Dom.byId('js-theme');
      if (ThemeMod.dark) {
        document.body.classList.remove('light');
        if (btn) btn.textContent = '\u{1F319}';
        MapMod.setTile(Config.TILE_DARK);
        Storage.set(THEME_KEY, 'dark');
      } else {
        document.body.classList.add('light');
        if (btn) btn.textContent = '\u2600\uFE0F';
        MapMod.setTile(Config.TILE_LIGHT);
        Storage.set(THEME_KEY, 'light');
      }
    }
  };

  var ClockMod = {
    init: function() {
      var clk = Dom.byId('js-clk');
      function tick() {
        var n = new Date();
        var h = String(n.getHours()).padStart(2,'0');
        var m = String(n.getMinutes()).padStart(2,'0');
        var s = String(n.getSeconds()).padStart(2,'0');
        if (clk) clk.textContent = h+':'+m+':'+s;
      }
      tick(); setInterval(tick, 1000);
    }
  };

  var NavMod = {
    init: function() {
      ['map','list','tools'].forEach(function(k) {
        Dom.onId('nav-' + k, 'click', function() { NavMod.go(k); });
      });
    },
    go: function(key) {
      ['map','list','tools'].forEach(function(k) {
        var pg  = Dom.byId('pg-'+k);
        var btn = Dom.byId('nav-'+k);
        if (pg)  pg.classList.toggle('active', k === key);
        if (btn) {
          btn.classList.toggle('active', k === key);
          btn.classList.toggle('text-slate-500', k !== key);
        }
      });
      if (key === 'map') setTimeout(function() { MapMod.map && MapMod.map.invalidateSize(); }, 50);
    }
  };

  var MapMod = {
    map: null, tileLayer: null, markers: [], routeLayer: null,
    startEndMarkers: [], _canvas: null, _camData: [],
    init: function() {
      MapMod.map = L.map('map', {
        center: Config.MAP_CENTER, zoom: Config.MAP_ZOOM,
        zoomControl: false,
        preferCanvas: true   // 強制 canvas 渲染，iOS 效能大幅提升
      });
      MapMod._canvas = L.canvas({ padding: 0.5 });
      MapMod.tileLayer = L.tileLayer(Config.TILE_DARK, { attribution: Config.TILE_ATTR, maxZoom: 19 }).addTo(MapMod.map);
    },
    setTile: function(url) { if (MapMod.tileLayer) MapMod.tileLayer.setUrl(url); },
    clearMarkers: function() {
      MapMod.markers.forEach(function(m) { MapMod.map.removeLayer(m); });
      MapMod.markers = [];
      MapMod._camData = [];
      setTimeout(function() { MapMod.redrawStartEnd(); }, 0);
    },
    addMarker: function(cam) {
      var color, radius;
      if (cam.type === 'youtube') {
        color = '#ff0000'; radius = 8;
      } else {
        radius = 6;
        var cat = cam.cat || (cam.id && cam.id.charAt(0) === 'n' ? 'highway' : 'provincial');
        if (cat === 'highway')         color = '#3b82f6';
        else if (cat === 'expressway') color = '#a855f7';
        else if (cat === 'scenic')     color = '#22c55e';
        else if (cat === 'city')       color = '#f59e0b';
        else                           color = '#f97316';
      }
      var marker = L.circleMarker([cam.lat, cam.lng], {
        renderer:    MapMod._canvas,
        radius:      radius,
        color:       'rgba(255,255,255,0.6)',
        weight:      1.5,
        fillColor:   color,
        fillOpacity: 0.95
      }).addTo(MapMod.map);
      marker.on('click', function() { InfoMod.open(cam); });
      // tooltip 只在縮放夠大時顯示（避免大量 DOM）
      if (MapMod.map.getZoom() >= 12) {
        marker.bindTooltip(cam.name, { direction:'top', offset:[0,-6] });
      }
      MapMod.markers.push(marker);
      MapMod._camData.push(cam);
    },
    drawRoute: function(coords, mode) {
      if (MapMod.routeLayer) {
        if (Array.isArray(MapMod.routeLayer)) {
          MapMod.routeLayer.forEach(function(l) { MapMod.map.removeLayer(l); });
        } else {
          MapMod.map.removeLayer(MapMod.routeLayer);
        }
        MapMod.routeLayer = null;
      }
      if (!coords || coords.length < 2) return;
      var latlngs = coords.map(function(c) { return [c[0], c[1]]; });
      var isMoto = (mode !== 'car');
      // 主色：機車橘漸層感 / 汽車藍
      var mainColor  = isMoto ? '#f97316' : '#3b82f6';
      var glowColor  = isMoto ? '#fb923c' : '#60a5fa';
      var coreColor  = isMoto ? '#fff7ed' : '#eff6ff';

      // 三層：底層（光暈）→ 中層（主色）→ 頂層（亮芯）
      var glow = L.polyline(latlngs, {
        color: glowColor, weight: 10, opacity: 0.18, lineCap: 'round', lineJoin: 'round'
      }).addTo(MapMod.map);
      var main = L.polyline(latlngs, {
        color: mainColor, weight: 5, opacity: 1.0, lineCap: 'round', lineJoin: 'round'
      }).addTo(MapMod.map);
      var core = L.polyline(latlngs, {
        color: coreColor, weight: 1.5, opacity: 0.55, lineCap: 'round', lineJoin: 'round'
      }).addTo(MapMod.map);

      MapMod.routeLayer = [glow, main, core];
      var bounds = main.getBounds();
      MapMod.map.fitBounds(bounds, { padding: [40, 40] });
    },
    clearRoute: function() {
      if (MapMod.routeLayer) {
        if (Array.isArray(MapMod.routeLayer)) {
          MapMod.routeLayer.forEach(function(l) { MapMod.map.removeLayer(l); });
        } else {
          MapMod.map.removeLayer(MapMod.routeLayer);
        }
        MapMod.routeLayer = null;
      }
    },
    drawStartEnd: function(pts) {
      MapMod.startEndMarkers.forEach(function(m) { MapMod.map.removeLayer(m); });
      MapMod.startEndMarkers = [];
      if (!pts || pts.length < 2) return;
      pts.forEach(function(pt, i) {
        var isFirst = (i === 0);
        var isLast  = (i === pts.length - 1);
        if (!isFirst && !isLast) return;
        var bg    = isFirst ? '#22c55e' : '#ef4444';
        var label = isFirst ? '起' : '終';
        var sz    = 20;
        var html  = '<div style="text-align:center;pointer-events:none;">'
          + '<div style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;background:' + bg + ';border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.7);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#fff;font-family:sans-serif;">' + label + '</div>'
          + '</div>';
        var icon = L.divIcon({
          className: '',
          html: html,
          iconSize:   [sz, sz],
          iconAnchor: [sz/2, sz/2]
        });
        var m = L.marker([pt[0], pt[1]], { icon: icon, zIndexOffset: 9000 }).addTo(MapMod.map);
        MapMod.startEndMarkers.push(m);
      });
    },
    redrawStartEnd: function() {
      var pts = AppState.routeAllPoints;
      if (pts && pts.length >= 2) {
        MapMod.drawStartEnd(pts);
      }
    }
  };

  var InfoMod = {
    current: null,
    init: function() {
      Dom.onId('info-close', 'click', function() { InfoMod.close(); });
      Dom.onId('info-play', 'click', function() {
        if (InfoMod.current) ModalMod.open(InfoMod.current);
      });
    },
    open: function(cam) {
      InfoMod.current = cam;
      var panel     = Dom.byId('info-panel');
      var nameEl    = Dom.byId('info-name');
      var countyEl  = Dom.byId('info-county');
      var typeEl    = Dom.byId('info-type');
      var weatherEl = Dom.byId('info-weather');
      var thumbEl   = Dom.byId('info-thumb');
      var playBtn   = Dom.byId('info-play');
      if (!panel) return;
      if (nameEl)   nameEl.textContent   = cam.name;
      if (countyEl) countyEl.textContent = '\u{1F4CD} ' + cam.county;
      if (typeEl)   typeEl.textContent   = cam.type === 'youtube' ? '\u{1F534} YouTube \u76f4\u64ad' : '\u{1F4F7} CCTV \u651d\u5f71\u6a5f';
      var w = Data.weather[cam.county];
      if (weatherEl) {
        if (w) {
          var _wIcon = '';
          if (w.weather) {
            if (w.weather.indexOf('\u96e8')!==-1) _wIcon='\ud83c\udf27\ufe0f';
            else if (w.weather.indexOf('\u6674')!==-1) _wIcon='\u2600\ufe0f';
            else if (w.weather.indexOf('\u96f2')!==-1) _wIcon='\u26c5';
            else _wIcon='\ud83c\udf21\ufe0f';
          }
          var tempStr = (w.temp !== undefined && w.temp !== null && w.temp !== '--') ? (w.temp + '\u00B0C') : '--';
          weatherEl.textContent = _wIcon + ' ' + tempStr + '  ' + (w.weather||'');
        } else {
          if (Data.weatherState === 'error') {
            weatherEl.textContent = '\u26a0\ufe0f \u5929\u6c23\u8cc7\u6599\u66ab\u6642\u7121\u6cd5\u8f09\u5165';
          } else if (Data.weatherState === 'empty') {
            weatherEl.textContent = '\ud83c\udf21\ufe0f \u66ab\u7121\u5929\u6c23\u8cc7\u6599';
          } else {
            weatherEl.textContent = '\ud83d\udca8 \u5929\u6c23\u8cc7\u6599\u8f09\u5165\u4e2d...';
          }
        }
      }
      // 縮圖預覽
      if (thumbEl) {
        thumbEl.classList.add('visible');
        var thumbSrc = '';
        if (cam.type === 'youtube' && cam.videoId) {
          thumbSrc = 'https://img.youtube.com/vi/' + cam.videoId + '/mqdefault.jpg';
        } else if (cam.url) {
          thumbSrc = cam.url + (cam.url.indexOf('?') !== -1 ? '&' : '?') + 't=' + Math.floor(Date.now()/30000);
        }
        if (thumbSrc) {
          thumbEl.innerHTML = '<div class="ph"><i class="fa-solid fa-spinner fa-spin"></i></div><img alt="" />';
          var imgNode = thumbEl.querySelector('img');
          imgNode.onload = function() {
            imgNode.style.opacity = '1';
            var ph = thumbEl.querySelector('.ph');
            if (ph) ph.style.display = 'none';
          };
          imgNode.onerror = function() {
            thumbEl.innerHTML = '<div class="ph"><i class="fa-solid fa-triangle-exclamation"></i></div>';
          };
          imgNode.src = thumbSrc;
        } else {
          thumbEl.innerHTML = '<div class="ph"><i class="fa-solid fa-camera"></i></div>';
        }
      }
      if (playBtn) {
        playBtn.textContent = cam.type === 'youtube' ? '\u25B6 \u958b\u555f YouTube' : '\u25B6 \u958b\u555f\u5f71\u50cf';
        playBtn.style.display = (cam.url || cam.videoId) ? 'block' : 'none';
      }
      panel.classList.remove('hidden');
      panel.classList.add('flex');
      Bus.emit('camera:selected', cam);
    },
    close: function() {
      var panel = Dom.byId('info-panel');
      if (panel) { panel.classList.add('hidden'); panel.classList.remove('flex'); }
      var thumbEl = Dom.byId('info-thumb');
      if (thumbEl) thumbEl.classList.remove('visible');
      InfoMod.current = null;
    }
  };

  var RouteMod = {
    active: false, filteredCams: [], routeCoords: [],
    mode: 'motorcycle',
    setAnalyzeBusy: function(isBusy) {
      var btn = Dom.byId('js-route-btn');
      if (!btn) return;
      btn.disabled = !!isBusy;
      btn.classList.toggle('loading', !!isBusy);
      btn.textContent = isBusy ? '\u89e3\u6790\u4e2d...' : ROUTE_BTN_IDLE_TEXT;
    },
    updateRouteUi: function(cameraCount) {
      var count = cameraCount || 0;
      var st = Dom.byId('js-route-status');
      var banner = Dom.byId('js-route-banner');
      var info = Dom.byId('js-list-route-info');
      var cnt = Dom.byId('js-list-route-count');
      var summary = Dom.byId('route-summary');
      if (st) {
        st.textContent = count > 0
          ? '\u627e\u5230 ' + count + ' \u652f\u6cbf\u9014\u651d\u5f71\u6a5f'
          : '\u9019\u689d\u8def\u7dda\u9644\u8fd1\u66ab\u6642\u6c92\u6709\u7b26\u5408\u689d\u4ef6\u7684\u651d\u5f71\u6a5f';
      }
      setFlexVisible(banner, true);
      setFlexVisible(info, true);
      if (cnt) {
        cnt.textContent = count > 0
          ? '\u8def\u7dda\u904e\u6ffe\uff1a\u5171 ' + count + ' \u652f'
          : '\u8def\u7dda\u904e\u6ffe\uff1a\u672a\u627e\u5230\u5408\u9069\u651d\u5f71\u6a5f';
      }
      if (summary && AppState.lastRouteInfo) {
        summary.textContent = (RouteMod.mode === 'motorcycle' ? '\ud83c\udfcd' : '\ud83d\ude97') + ' '
          + AppState.lastRouteInfo.distance + 'km/' + AppState.lastRouteInfo.duration + '\u5206 \u00b7 ' + count + '\u652f';
        summary.classList.remove('hidden');
      }
      Bus.emit('route:updated', {
        cameraCount: count,
        routeInfo: AppState.lastRouteInfo,
        cams: RouteMod.filteredCams.slice()
      });
    },
    clearRouteUi: function() {
      var startEl = Dom.byId('js-route-start');
      var endEl = Dom.byId('js-route-end');
      var st = Dom.byId('js-route-status');
      var banner = Dom.byId('js-route-banner');
      var info = Dom.byId('js-list-route-info');
      var summary = Dom.byId('route-summary');
      if (startEl) startEl.value = '';
      if (endEl) endEl.value = '';
      if (st) st.textContent = '';
      setFlexVisible(banner, false);
      setFlexVisible(info, false);
      if (summary) {
        summary.textContent = '';
        summary.classList.add('hidden');
      }
    },
    init: function() {
      Dom.onAll('.route-mode-btn', 'click', function(btn) {
          Dom.queryAll('.route-mode-btn').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          RouteMod.mode = btn.dataset.mode;
      });
      Dom.onId('js-route-btn', 'click', function() { RouteMod.analyze(); });
      Dom.onId('js-rb-clear', 'click', function() { RouteMod.clear(); });
      ['js-route-start','js-route-end'].forEach(function(id) {
        Dom.onId(id, 'keydown', function(e) {
          if (e.key === 'Enter') RouteMod.analyze();
        });
      });
    },
    analyze: function() {
      var startEl  = Dom.byId('js-route-start');
      var endEl    = Dom.byId('js-route-end');
      var startVal = startEl ? startEl.value.trim() : '';
      var endVal   = endEl   ? endEl.value.trim()   : '';
      if (!startVal || !endVal) { Toast.show('\u8acb\u5206\u5225\u586b\u5165\u8d77\u9ede\u548c\u7d42\u9ede'); return; }
      RouteMod.setAnalyzeBusy(true);
      var uiWaypoints = window.WaypointsMod ? WaypointsMod.getWaypoints() : (AppState.pendingWaypoints || []);
      var allAddrs = [simplifyAddress(startVal)]
        .concat(uiWaypoints.map(function(wp) { return simplifyAddress(wp); }))
        .concat([simplifyAddress(endVal)]);
      AppState.pendingWaypoints = [];

      Promise.all(allAddrs.map(function(addr) { return extractPointFromUrl(addr); }))
        .then(function(results) {
          var startPt = results[0];
          var endPt   = results[results.length - 1];
          if (!startPt || !endPt) {
            RouteMod.setAnalyzeBusy(false);
            Toast.show(!startPt ? '\u8d77\u9ede\u7121\u6cd5\u89e3\u6790' : '\u7d42\u9ede\u7121\u6cd5\u89e3\u6790');
            return;
          }
          Toast.show('\u8def\u7dda\u67e5\u8a62\u4e2d...');
          var wpPts = results.slice(1, -1).filter(function(p) { return p; });
          var finalPoints = [startPt].concat(wpPts).concat([endPt]);
          AppState.routeAllPoints = finalPoints;
          var segs = [];
          for (var fi = 0; fi < finalPoints.length - 1; fi++) {
            segs.push(getRoadRoute(finalPoints[fi], finalPoints[fi+1], RouteMod.mode));
          }
          return Promise.all(segs).then(function(segCoords) {
            var merged = [];
            segCoords.forEach(function(seg) { merged = merged.concat(seg); });
            return merged;
          });
        })
        .then(function(coords) {
          if (!coords) {
            RouteMod.setAnalyzeBusy(false);
            // 路線失敗仍畫標記
            MapMod.drawStartEnd(AppState.routeAllPoints);
            return;
          }
          RouteMod.setAnalyzeBusy(false);
          var info = AppState.lastRouteInfo;
          var modeLabel = RouteMod.mode === 'motorcycle' ? '\ud83c\udfcd\ufe0f \u6a5f\u8eca' : '\ud83d\ude97 \u6c7d\u8eca';
          var msg = info ? (modeLabel + ' ' + info.distance + 'km / \u7d04' + info.duration + '\u5206\u9418') : '\u8def\u7dda\u89e3\u6790\u5b8c\u6210';
          Toast.show(msg, 3000);
          var exp = Dom.byId('route-expanded');
          var col = Dom.byId('route-collapsed');
          if (exp) exp.classList.add('hidden');
          if (col) col.classList.remove('hidden');
          var clearMini = Dom.byId('js-route-clear-small');
          if (clearMini) clearMini.classList.remove('hidden');
          RouteMod._doFilter(coords);
        })
        .catch(function() {
          RouteMod.setAnalyzeBusy(false);
          Toast.show('\u8def\u7dda\u67e5\u8a62\u5931\u6557\uff0c\u8acb\u91cd\u8a66');
          MapMod.drawStartEnd(AppState.routeAllPoints);
        });
    },
    _doFilter: function(coords) {
      var simplified = simplifyCoords(coords, Config.SIMPLIFY_STEP);
      RouteMod.routeCoords = coords;
      RouteMod.active = true;
      // YouTube 頻道不過濾，全部保留；CCTV 才做路線過濾
      var cctv = Data.allCams();
      // 縮小半徑到 5km，避免抓太多
      var FILTER_KM = 5;
      var filteredCctv = cctv.filter(function(cam) {
        for (var i = 0; i < simplified.length-1; i++) {
          if (distToSegKm(cam.lat,cam.lng,simplified[i][0],simplified[i][1],simplified[i+1][0],simplified[i+1][1]) <= FILTER_KM) return true;
        }
        return false;
      });

      // 沿路均勻取樣，最多 50 支 CCTV（避免 lag）
      var MAX_CCTV = 50;
      if (filteredCctv.length > MAX_CCTV) {
        // 計算每支攝影機最近的路線點位置，排序後均勻取樣
        filteredCctv = filteredCctv.map(function(cam) {
          var minD = 1e9, bestT = 0;
          for (var i = 0; i < simplified.length-1; i++) {
            var dx = simplified[i+1][0]-simplified[i][0];
            var dy = simplified[i+1][1]-simplified[i][1];
            var len = dx*dx+dy*dy;
            var t = len ? ((cam.lat-simplified[i][0])*dx+(cam.lng-simplified[i][1])*dy)/len : 0;
            t = Math.max(0,Math.min(1,t));
            var d = distToSegKm(cam.lat,cam.lng,simplified[i][0],simplified[i][1],simplified[i+1][0],simplified[i+1][1]);
            if (d < minD) { minD = d; bestT = i + t; }
          }
          cam._routePos = bestT;
          return cam;
        }).sort(function(a,b){ return a._routePos - b._routePos; });

        // 均勻取 MAX_CCTV 支
        var step = filteredCctv.length / MAX_CCTV;
        var sampled = [];
        for (var si = 0; si < MAX_CCTV; si++) {
          sampled.push(filteredCctv[Math.round(si * step)]);
        }
        filteredCctv = sampled;
      }

      RouteMod.filteredCams = filteredCctv;
      MapMod.drawRoute(simplified, RouteMod.mode);
      // 立即畫起終點標記（MapMod 內建，不依賴 WaypointsMod）
      MapMod.drawStartEnd(AppState.routeAllPoints);
      RouteMod.updateRouteUi(RouteMod.filteredCams.length);
      Toast.show(
        RouteMod.filteredCams.length > 0
          ? '\u627e\u5230 ' + RouteMod.filteredCams.length + ' \u652f\u6cbf\u9014\u651d\u5f71\u6a5f'
          : '\u9019\u689d\u8def\u7dda\u9644\u8fd1\u66ab\u6642\u6c92\u6709\u53ef\u986f\u793a\u7684\u651d\u5f71\u6a5f'
      );
      (function(){
        var startInput = Dom.byId('js-route-start');
        var endInput = Dom.byId('js-route-end');
        if(startInput && endInput && window.HistoryMod) {
          HistoryMod.add(
            startInput.value,
            endInput.value,
            AppState.routeAllPoints ? AppState.routeAllPoints.slice(1,-1).map(function(p){ return p[0]+','+p[1]; }) : []
          );
        }
      })();
      Bus.emit('filter:changed');
      // 沿途影像輪播（自動顯示）
      setTimeout(function() { RouteStripMod.show(RouteMod.filteredCams); }, 300);
    },
    clear: function() {
      RouteMod.active = false; RouteMod.filteredCams = []; RouteMod.routeCoords = [];
      MapMod.clearRoute();
      MapMod.drawStartEnd(null); // 清除起終點標記
      RouteStripMod.hide();
      WaypointsMod && WaypointsMod.clearMarkers();
      AppState.pendingWaypoints = [];
      WaypointsMod && WaypointsMod.render([]);
      RouteMod.clearRouteUi();
      Bus.emit('filter:changed');
      Bus.emit('route:cleared');
    }
  };

  var ListMod = {
    region: 'all', regionCounty: 'all', search: '',
    MAP_MARKER_ZOOM: 10, // 縮放 >= 10 才畫 marker
    applySearch: function(value) {
      var nextValue = value || '';
      var input = Dom.byId('js-search');
      if (input) input.value = nextValue;
      ListMod.search = nextValue.trim().toLowerCase();
      Bus.emit('filter:changed');
    },
    renderSearchHints: function() {
      var wrap = Dom.byId('js-search-hints');
      if (!wrap) return;
      var hints = (SEARCH_HINTS[ListMod.region] || SEARCH_HINTS.all).slice();
      if (ListMod.regionCounty !== 'all') hints.unshift(ListMod.regionCounty);
      hints = hints.filter(function(value, index, arr) { return arr.indexOf(value) === index; }).slice(0, 6);
      wrap.innerHTML = '<span class="text-[10px] text-slate-500 py-1">\u63d0\u793a\uff1a</span>' + hints.map(function(hint) {
        return '<button class="hint-chip px-2.5 py-1 text-[11px] font-bold rounded-full transition-all" data-hint="' + hint + '">' + hint + '</button>';
      }).join('');
      Dom.onAll('.hint-chip', 'click', function(btn) {
        ListMod.applySearch(btn.dataset.hint || '');
      }, wrap);
    },
    renderRideRouteChips: function() {
      var wrap = Dom.byId('js-ride-route-chips');
      if (!wrap) return;
      wrap.innerHTML = RIDE_ROUTE_CHIPS.map(function(route) {
        return '<button class="ride-route-chip" data-route="' + route + '">' + route + '</button>';
      }).join('');
      Dom.onAll('.ride-route-chip', 'click', function(btn) {
        ListMod.applySearch(btn.dataset.route || '');
      }, wrap);
    },
    buildCameraSuggestions: function(query) {
      var nq = normalizeSearchText(query);
      if (!nq) return [];
      var cams = (RouteMod.active ? RouteMod.filteredCams : Data.allCams()).slice();
      var scored = [];
      cams.forEach(function(cam) {
        var haystack = cam.searchText || normalizeSearchText([cam.name, cam.county, cam.id].join(' '));
        if (!haystack) return;
        var score = -1;
        if (haystack.indexOf(nq) !== -1) score = 92 - Math.max(0, haystack.length - nq.length);
        else if (haystack.split(' ').some(function(part) { return part.indexOf(nq) !== -1; })) score = 72;
        if (score < 0) return;
        scored.push({
          name: cam.name,
          sub: [cam.county, getRoadCategoryLabel(cam.cat)].filter(Boolean).join(' · '),
          lat: cam.lat,
          lng: cam.lng,
          camId: cam.id,
          score: score
        });
      });
      return scored.sort(function(a, b) { return b.score - a.score; }).slice(0, 4);
    },
    renderSuggestGroups: function(query) {
      var wrap = Dom.byId('suggest-list');
      if (!wrap) return;
      if (!query) {
        wrap.innerHTML = '';
        wrap.classList.remove('visible');
        return;
      }
      PlaceSuggest.search(query, function(results) {
        var routeItems = [];
        var placeItems = [];
        (results || []).forEach(function(item) {
          var normalized = {
            name: item.name,
            sub: item.sub || '',
            lat: item.lat,
            lng: item.lng
          };
          if (PlaceSuggest.isMotorcycleHotspot(item.name)) routeItems.push(normalized);
          else placeItems.push(normalized);
        });
        var cameraItems = ListMod.buildCameraSuggestions(query);
        var groups = [];
        if (routeItems.length) groups.push({ key: 'route', title: '熱門路線', icon: 'fa-road', items: routeItems.slice(0, 4) });
        if (placeItems.length) groups.push({ key: 'place', title: '地點', icon: 'fa-location-dot', items: placeItems.slice(0, 3) });
        if (cameraItems.length) groups.push({ key: 'camera', title: '攝影機', icon: 'fa-camera', items: cameraItems });
        if (!groups.length) {
          wrap.innerHTML = '';
          wrap.classList.remove('visible');
          return;
        }
        wrap.innerHTML = groups.map(function(group) {
          var itemsHtml = group.items.map(function(item) {
            return '<div class="suggest-item" data-type="' + group.key + '" data-name="' + item.name + '" data-lat="' + (item.lat || '') + '" data-lng="' + (item.lng || '') + '" data-cam-id="' + (item.camId || '') + '">'
              + '<i class="fa-solid ' + group.icon + ' suggest-icon"></i>'
              + '<span class="suggest-name">' + item.name + '</span>'
              + '<span class="suggest-sub">' + (item.sub || '') + '</span>'
              + '</div>';
          }).join('');
          return '<div class="suggest-group"><div class="suggest-group-title"><i class="fa-solid ' + group.icon + '"></i><span>' + group.title + '</span></div>' + itemsHtml + '</div>';
        }).join('');
        wrap.classList.add('visible');
        Dom.onAll('.suggest-item', 'click', function(item) {
          ListMod.applySearch(item.dataset.name || '');
          wrap.innerHTML = '';
          wrap.classList.remove('visible');
          var camId = item.dataset.camId;
          var lat = parseFloat(item.dataset.lat);
          var lng = parseFloat(item.dataset.lng);
          if (camId) {
            var cam = Data.allCams().find(function(entry) { return entry.id === camId; });
            if (cam) {
              NavMod.go('map');
              MapMod.focusCam(cam);
              return;
            }
          }
          if (lat && lng && MapMod.map) {
            NavMod.go('map');
            MapMod.map.setView([lat, lng], 13);
          }
        }, wrap);
      });
    },
    renderCountyTabs: function() {
      var wrap = Dom.byId('js-region-county-tabs');
      if (!wrap) return;
      var counties = Config.REGIONS[ListMod.region] || [];
      if (ListMod.region === 'all' || !counties.length) {
        wrap.innerHTML = '';
        wrap.classList.add('hidden');
        ListMod.renderSearchHints();
        return;
      }
      var regionLabel = REGION_LABELS[ListMod.region] || '\u5340\u57df';
      var html = '<button data-county="all" class="county-rtab px-3 py-1.5 text-[11px] font-bold rounded-full transition-all">'
        + regionLabel + '\u5168\u90e8</button>';
      counties.forEach(function(county) {
        html += '<button data-county="' + county + '" class="county-rtab px-3 py-1.5 text-[11px] font-bold rounded-full transition-all">'
          + county + '</button>';
      });
      wrap.innerHTML = html;
      wrap.classList.remove('hidden');
      Dom.onAll('.county-rtab', 'click', function(btn) {
        ListMod.regionCounty = btn.dataset.county || 'all';
        ListMod.syncCountyTabs();
        ListMod.renderSearchHints();
        Bus.emit('filter:changed');
      }, wrap);
      ListMod.syncCountyTabs();
      ListMod.renderSearchHints();
    },
    syncCountyTabs: function() {
      var wrap = Dom.byId('js-region-county-tabs');
      if (!wrap) return;
      wrap.classList.toggle('hidden', ListMod.region === 'all');
      Dom.queryAll('.county-rtab', wrap).forEach(function(btn) {
        var isActive = btn.dataset.county === ListMod.regionCounty;
        btn.classList.toggle('active', isActive);
        btn.classList.toggle('bg-orange-500', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-white/5', !isActive);
        btn.classList.toggle('text-slate-300', !isActive);
      });
    },
    init: function() {
      Dom.onAll('.rtab', 'click', function(btn) {
          Dom.queryAll('.rtab').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          ListMod.region = btn.dataset.r;
          ListMod.regionCounty = 'all';
          ListMod.renderCountyTabs();
          Bus.emit('filter:changed');
      });
      ListMod.renderCountyTabs();
      ListMod.renderSearchHints();
      ListMod.renderRideRouteChips();
      var s = Dom.byId('js-search');
      var suggestList = Dom.byId('suggest-list');
      if (s) {
        Dom.on(s, 'input', function() {
          ListMod.search = s.value.trim().toLowerCase();
          Bus.emit('filter:changed');
          var q = s.value.trim();
          if (!q || q.length < 1) { if (suggestList) { suggestList.innerHTML=''; suggestList.classList.remove('visible'); } return; }
          ListMod.renderSuggestGroups(q);
        });
        Dom.on(s, 'blur', function() {
          setTimeout(function() { if (suggestList) { suggestList.innerHTML=''; suggestList.classList.remove('visible'); } }, 200);
        });
      }
    },
    getFiltered: function() {
      var cams = RouteMod.active ? RouteMod.filteredCams : Data.allCams();
      var normalizedQuery = normalizeSearchText(ListMod.search);
      var queryTerms = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];
      return cams.filter(function(cam) {
        var rOk = ListMod.region === 'all' || getRegion(cam.county) === ListMod.region;
        var cOk = ListMod.region === 'all' || ListMod.regionCounty === 'all' || cam.county === ListMod.regionCounty;
        var haystack = cam.searchText || normalizeSearchText([cam.name, cam.county, cam.id].join(' '));
        var sOk = !queryTerms.length || queryTerms.every(function(term) {
          return haystack.indexOf(term) !== -1;
        });
        return rOk && cOk && sOk;
      });
    },
    render: function() {
      var el = Dom.byId('js-list-inner');
      var stateEl = Dom.byId('js-list-state');
      if (!el) return;
      var cams = ListMod.getFiltered();
      MapMod.clearMarkers();
      var stat = Dom.byId('js-stat-cams');
      if (stat) stat.textContent = Data.allCams().length;
      if (cams.length === 0) {
        if (stateEl) {
          stateEl.classList.remove('hidden');
          stateEl.textContent = RouteMod.active
            ? '目前是沿途結果模式，試著放寬條件或清除路線。'
            : '可切換區域、縣市或搜尋關鍵字來縮小範圍。';
        }
        if (Data.camsState === 'loading' || Data.camsState === 'idle') {
          el.innerHTML = '<div class="text-center text-slate-500 py-12 text-sm">\u8f09\u5165\u4e2d\uff0c\u8acb\u7a0d\u5019...</div>';
        } else if (Data.camsState === 'error') {
          el.innerHTML = '<div class="text-center text-amber-400 py-12 text-sm">\u651d\u5f71\u6a5f\u8cc7\u6599\u66ab\u6642\u7121\u6cd5\u8f09\u5165</div>';
        } else {
          el.innerHTML = '<div class="text-center text-slate-500 py-12 text-sm">\u76ee\u524d\u689d\u4ef6\u4e0b\u6c92\u6709\u7b26\u5408\u7684\u651d\u5f71\u6a5f</div>';
        }
        return;
      }
      if (stateEl) {
        stateEl.classList.remove('hidden');
        stateEl.textContent = RouteMod.active
          ? '沿途模式：已依目前路線過濾並優先顯示可快速判斷的影像點。'
          : '列表模式：可收藏常用停靠點，並從這裡直接跳回地圖。';
      }
      var map = {};
      Data.allCams().forEach(function(c) { map[c.id] = c; });

      // 地圖 marker：路線模式全畫；一般模式縮放夠近才畫
      var zoom = MapMod.map ? MapMod.map.getZoom() : 0;
      if (RouteMod.active || zoom >= ListMod.MAP_MARKER_ZOOM) {
        cams.forEach(function(cam) { MapMod.addMarker(cam); });
      }

      // 地圖縮放時自動補畫/移除 marker（debounce 300ms）
      if (MapMod.map && !MapMod._zoomBound) {
        MapMod._zoomBound = true;
        var _zt;
        MapMod.map.on('zoomend', function() {
          clearTimeout(_zt);
          _zt = setTimeout(function() { Bus.emit('filter:changed'); }, 300);
        });
      }

      // 列表：全部顯示（虛擬化：只渲染可見部分）
      // 簡化版：限制列表最多 200 筆（搜尋或篩選後才顯示全部）
      var listCams = (ListMod.search || ListMod.region !== 'all' || RouteMod.active)
        ? cams
        : cams.slice(0, 200);
      var hasMore = listCams.length < cams.length;

      var html = '';
      listCams.forEach(function(cam) {
        var w  = Data.weather[cam.county];
        var wt = w ? (w.temp + '\u00B0C') : '';
        var catLabel = getRoadCategoryLabel(cam.cat);
        var _ts = cam.url ? (cam.url + (cam.url.indexOf('?') !== -1 ? '&' : '?') + 't=' + Math.floor(Date.now()/60000)) : '';
        var isRouteCam = RouteMod.active && RouteMod.filteredCams.some(function(routeCam) { return routeCam.id === cam.id; });
        var distLabel = '';
        if (NearbyMod.userLat !== null && NearbyMod.userLng !== null) {
          distLabel = haversineKm(NearbyMod.userLat, NearbyMod.userLng, cam.lat, cam.lng).toFixed(1) + 'km';
        }
        html += '<div class="cam-card glass rounded-2xl p-3 flex items-center gap-3 cursor-pointer border border-white/5" data-id="'+cam.id+'">'
          + '<div class="cam-card-top w-full">'
          + '<div class="cam-tw relative w-16 h-12 rounded-xl overflow-hidden shrink-0 bg-slate-800">'
          + '<i class="fa-solid fa-camera absolute inset-0 m-auto text-slate-600 text-sm" style="top:50%;left:50%;transform:translate(-50%,-50%);position:absolute"></i>'
          + '<img class="cam-th absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300" data-src="'+_ts+'" />'
          + '</div>'
          + '<div class="flex-1 min-w-0">'
          + '<div class="font-bold text-xs truncate flex items-center gap-1.5">'+cam.name+'</div>'
          + '<div class="text-[10px] text-slate-400 mt-0.5">'+cam.county+(wt?' \u00B7 '+wt:'')+'</div>'
          + '<div class="cam-card-meta">'
          + '<span class="meta-chip">'+catLabel+'</span>'
          + (isRouteCam ? '<span class="meta-chip">\u6cbf\u9014</span>' : '')
          + (distLabel ? '<span class="meta-chip">\u8ddd\u96e2 ' + distLabel + '</span>' : '')
          + '</div>'
          + '</div>'
          + '<button class="card-favorite-btn" data-favorite-id="' + cam.id + '"><i class="fa-regular fa-bookmark text-xs"></i></button>'
          + '<i class="fa-solid fa-chevron-right text-slate-600 text-xs shrink-0"></i></div></div>';
      });
      if (hasMore) {
        html += '<div class="text-center text-slate-500 text-xs py-4">顯示前 200 支，請選擇縣市或搜尋查看更多</div>';
      }
      el.innerHTML = html;
      if('IntersectionObserver' in window){
        var _ob=new IntersectionObserver(function(entries){
          entries.forEach(function(e){
            if(!e.isIntersecting)return;
            var img=e.target.querySelector('.cam-th');
            if(img&&img.dataset.src&&!img.src){img.src=img.dataset.src;img.onload=function(){img.style.opacity='1';};}
            _ob.unobserve(e.target);
          });
        },{rootMargin:'80px'});
        Dom.queryAll('.cam-tw', el).forEach(function(w){_ob.observe(w);});
      }
      Dom.queryAll('.cam-card', el).forEach(function(card) {
        Dom.on(card, 'click', function() {
          var cam = map[card.dataset.id];
          if (!cam) return;
          Dom.queryAll('.cam-card', el).forEach(function(c){c.style.borderColor='';c.style.background='';});
          card.style.borderColor='#f97316';
          card.style.background='rgba(249,115,22,0.08)';
          InfoMod.open(cam);
          NavMod.go('map');
          MapMod.map.setView([cam.lat, cam.lng], 14);
        });
      });
      Dom.queryAll('.card-favorite-btn', el).forEach(function(btn) {
        Dom.on(btn, 'click', function(event) {
          event.stopPropagation();
          Bus.emit('favorite:toggle', map[btn.dataset.favoriteId]);
        });
      });
      // clearMarkers 裡的 setTimeout 會自動補畫，這裡不需要再呼叫
    }
  };

  var ModalMod = {
    open: function(cam) {
      var ttl = Dom.byId('m-ttl');
      var org = Dom.byId('m-org');
      var med = Dom.byId('m-med');
      if (ttl) ttl.textContent = cam.name;
      if (org) {
        var w = Data.weather[cam.county];
        org.textContent = '\u{1F4CD} ' + cam.county + (w ? ' \u00B7 '+w.temp+'\u00B0C '+(w.weather||'') : '');
      }
      if (med) {
        med.innerHTML = '';
        if (cam.type === 'youtube' && cam.videoId) {
          var iframe = document.createElement('iframe');
          iframe.src = 'https://www.youtube.com/embed/' + cam.videoId + '?autoplay=1&mute=0';
          iframe.className = 'w-full h-full';
          iframe.style.minHeight = '240px';
          iframe.allow = 'autoplay; encrypted-media';
          iframe.allowFullscreen = true;
          med.appendChild(iframe);
        } else if (cam.url) {
          var img = document.createElement('img');
          var imgUrl = cam.url + (cam.url.indexOf('?') !== -1 ? '&' : '?') + 't=' + Date.now();
          img.src = imgUrl;
          img.className = 'w-full h-full object-contain';
          img.style.opacity = '0';
          img.style.transition = 'opacity 0.3s';
          img.onload = function() { img.style.opacity = '1'; };
          img.onerror = function() {
            med.innerHTML = '<div class="text-slate-500 text-sm p-8 text-center">'
              + '\u26A0\uFE0F \u5f71\u50cf\u7121\u6cd5\u8f09\u5165<br>'
              + '<span class="text-xs text-slate-600 mt-2 block">\u651d\u5f71\u6a5f\u96e2\u7dda\u6216 Worker \u5c1a\u672a\u66f4\u65b0</span>'
              + '<a href="' + cam.url.replace(/.*\?img=/, '') + '" target="_blank" '
              + 'style="color:#f97316;font-size:10px;margin-top:8px;display:block;">\u76f4\u63a5\u958b\u542f\u539f\u59cb\u9023\u7d50</a>'
              + '</div>';
          };
          med.appendChild(img);
        } else {
          med.innerHTML = '<div class="text-slate-500 text-sm p-8 text-center">\u6b64\u651d\u5f71\u6a5f\u7121\u5f71\u50cf\u4f86\u6e90</div>';
        }
      }
      InfoMod.close();
      if (window.ModalEffect) window.ModalEffect.open();
    }
  };

  window.addEventListener('load', function() {
    ClockMod.init();
    MapMod.init();
    if (Storage.get(THEME_KEY, 'dark') === 'light') {
      document.body.classList.add('light');
      var _tb = Dom.byId('js-theme'); if(_tb) _tb.textContent='\u2600\uFE0F';
    }
    ThemeMod.init();
    NavMod.init();
    RouteMod.init();
    ListMod.init();
    InfoMod.init();

    // render 加 debounce，避免短時間內多次觸發（天氣+資料同時到達時）
    var _renderTimer;
    function debouncedRender() {
      clearTimeout(_renderTimer);
      _renderTimer = setTimeout(function() { ListMod.render(); }, 80);
    }
    Bus.on('filter:changed',  debouncedRender);
    Bus.on('cams:updated',    debouncedRender);
    Bus.on('weather:updated', debouncedRender);
    ListMod.render();
    NearbyMod.init();

    // 起終點地名建議
    PlaceSuggest.bind('js-route-start', 'suggest-start');
    PlaceSuggest.bind('js-route-end',   'suggest-end');
    RouteMod.setAnalyzeBusy(false);

    // iOS Safari：輸入框 font-size 固定 16px，防止縮放（純 CSS 解法更穩定）

    // 沿途影像按鈕
    Dom.onId('js-strip-btn', 'click', function() { RouteStripMod.toggle(); });
  });
})();
