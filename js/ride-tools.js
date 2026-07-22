// Rider-focused dashboard modules: favorites, route brief, and pre-ride checklist.

(function() {
  'use strict';

  var FAVORITES_KEY = 'tw_favorites_v2';

  window.FavoritesMod = {
    load: function() {
      return Storage.getJson(FAVORITES_KEY, []);
    },
    save: function(list) {
      Storage.setJson(FAVORITES_KEY, list);
    },
    has: function(id) {
      return FavoritesMod.load().some(function(item) { return item.id === id; });
    },
    toggle: function(cam) {
      if (!cam) return;
      var list = FavoritesMod.load();
      var existing = list.findIndex(function(item) { return item.id === cam.id; });
      if (existing >= 0) {
        list.splice(existing, 1);
        Toast.show('已從收藏移除');
      } else {
        list.unshift({
          id: cam.id,
          type: cam.type || 'cctv',
          name: cam.name,
          lat: cam.lat,
          lng: cam.lng,
          county: cam.county,
          savedAt: Date.now()
        });
        Toast.show('已加入收藏');
      }
      FavoritesMod.save(list.slice(0, 24));
      FavoritesMod.renderAll();
    },
    syncButtons: function() {
      var selected = InfoMod.current;
      Dom.queryAll('.card-favorite-btn').forEach(function(btn) {
        var active = FavoritesMod.has(btn.dataset.favoriteId);
        btn.classList.toggle('active', active);
        btn.innerHTML = active
          ? '<i class="fa-solid fa-bookmark text-xs"></i>'
          : '<i class="fa-regular fa-bookmark text-xs"></i>';
      });
      var infoBtn = Dom.byId('info-favorite');
      if (infoBtn) {
        var activeInfo = !!(selected && FavoritesMod.has(selected.id));
        infoBtn.classList.toggle('active', activeInfo);
        infoBtn.innerHTML = activeInfo
          ? '<i class="fa-solid fa-bookmark text-sm"></i>'
          : '<i class="fa-regular fa-bookmark text-sm"></i>';
      }
    },
    renderList: function(targetId) {
      var el = Dom.byId(targetId);
      if (!el) return;
      var list = FavoritesMod.load();
      if (!list.length) {
        el.innerHTML = '<div class="tool-empty">目前還沒有收藏任何停靠點。</div>';
        return;
      }
      el.innerHTML = list.map(function(item) {
        return '<div class="favorite-item flex items-start gap-3">'
          + '<div class="flex-1 min-w-0">'
          + '<div class="favorite-title truncate">' + escapeHtml(item.name) + '</div>'
          + '<div class="favorite-sub">' + escapeHtml(item.county) + ' · ' + formatUpdatedAt(item.savedAt) + ' 收藏</div>'
          + '</div>'
          + '<button class="favorite-action active" data-open-favorite="' + escapeHtml(item.id) + '"><i class="fa-solid fa-location-arrow text-xs"></i></button>'
          + '<button class="favorite-action" data-remove-favorite="' + escapeHtml(item.id) + '"><i class="fa-solid fa-trash-can text-xs"></i></button>'
          + '</div>';
      }).join('');
      Dom.queryAll('[data-open-favorite]', el).forEach(function(btn) {
        Dom.on(btn, 'click', function() {
          var item = FavoritesMod.load().find(function(fav) { return fav.id === btn.dataset.openFavorite; });
          if (!item || !MapMod.map) return;
          NavMod.go('map');
          MapMod.map.setView([item.lat, item.lng], 14);
          var match = Data.allCams().find(function(cam) { return cam.id === item.id; });
          if (match) InfoMod.open(match);
        });
      });
      Dom.queryAll('[data-remove-favorite]', el).forEach(function(btn) {
        Dom.on(btn, 'click', function() {
          var next = FavoritesMod.load().filter(function(item) { return item.id !== btn.dataset.removeFavorite; });
          FavoritesMod.save(next);
          FavoritesMod.renderAll();
        });
      });
    },
    renderAll: function() {
      FavoritesMod.renderList('favorites-list');
      FavoritesMod.renderList('favorites-tools-list');
      FavoritesMod.syncButtons();
    },
    init: function() {
      Dom.onId('js-open-favorites', 'click', function() {
        var panel = Dom.byId('favorites-panel');
        if (!panel) return;
        panel.classList.toggle('hidden');
      });
      Dom.onId('favorites-close', 'click', function() {
        var panel = Dom.byId('favorites-panel');
        if (panel) panel.classList.add('hidden');
      });
      Dom.onId('info-favorite', 'click', function() {
        FavoritesMod.toggle(InfoMod.current);
      });
      Bus.on('favorite:toggle', function(cam) {
        FavoritesMod.toggle(cam);
      });
      Bus.on('camera:selected', function() {
        FavoritesMod.syncButtons();
      });
      Bus.on('filter:changed', function() {
        setTimeout(FavoritesMod.syncButtons, 0);
      });
      FavoritesMod.renderAll();
    }
  };

  window.RideInsightsMod = {
    updateStatusCard: function() {
      var report = AppState.routeReport;
      var routeInfo = AppState.lastRouteInfo;
      var weatherText = report ? report.weatherSummary : (getDataStatus('weather') === 'ready' ? '待選定路線' : '天氣載入中');
      var inline = Dom.byId('ride-risk-inline');
      var updatedLabel = AppState.updatedAt.route || AppState.updatedAt.cams || AppState.updatedAt.weather;
      var distanceEl = Dom.byId('ride-metric-distance');
      var cameraEl = Dom.byId('ride-metric-cameras');
      var weatherEl = Dom.byId('ride-metric-weather');
      var updatedEl = Dom.byId('ride-metric-updated');
      if (distanceEl) distanceEl.textContent = routeInfo ? (routeInfo.distance + ' km / ' + routeInfo.duration + ' 分') : '未規劃';
      if (cameraEl) cameraEl.textContent = report ? (report.cameraCount + ' 支') : '0 支';
      if (weatherEl) weatherEl.textContent = weatherText;
      if (updatedEl) updatedEl.textContent = formatUpdatedAt(updatedLabel);
      if (inline) inline.textContent = report && report.riskNotes.length
        ? report.riskNotes[0]
        : '尚未建立路線，先貼上 Google Maps 或手動輸入起終點。';
    },
    updateRiskPanel: function() {
      var summaryEl = Dom.byId('route-risk-summary');
      var tagsEl = Dom.byId('route-risk-tags');
      var report = AppState.routeReport;
      if (!summaryEl || !tagsEl) return;
      if (!report) {
        summaryEl.className = 'tool-empty';
        summaryEl.textContent = '建立路線後，這裡會彙整天氣、攝影機覆蓋與道路型態提醒。';
        tagsEl.innerHTML = '';
        return;
      }
      summaryEl.className = 'favorite-item';
      summaryEl.innerHTML = '<div class="favorite-title">' + escapeHtml(report.routeLabel || '沿途狀況') + '</div>'
        + '<div class="favorite-sub">' + escapeHtml(report.weatherSummary + '。' + report.riskNotes.join(' ')) + '</div>';
      tagsEl.innerHTML = report.riskNotes.map(function(note) {
        return '<span class="risk-chip warn"><i class="fa-solid fa-bolt"></i>' + escapeHtml(note) + '</span>';
      }).join('') + '<span class="risk-chip good"><i class="fa-solid fa-camera"></i>' + report.cameraCount + ' 支沿途影像</span>';
    },
    updateChecklist: function() {
      var el = Dom.byId('ride-checklist');
      if (!el) return;
      var routeInfo = AppState.lastRouteInfo;
      var report = AppState.routeReport;
      var now = new Date();
      var isNight = now.getHours() >= 18 || now.getHours() < 6;
      var items = [
        {
          title: routeInfo ? '路線已建立' : '先規劃路線',
          sub: routeInfo ? ('全程約 ' + routeInfo.distance + ' km，預估 ' + routeInfo.duration + ' 分。') : '貼上 Google Maps 或填寫起終點才能得到沿途建議。'
        },
        {
          title: isNight ? '目前偏夜騎時段' : '目前屬白天時段',
          sub: isNight ? '建議優先看沿途影像與山區路段是否有低能見度。' : '白天資訊較完整，適合用天氣與景點鏡頭判斷停靠點。'
        },
        {
          title: report ? report.weatherSummary : '等待天氣資料',
          sub: report
            ? (report.weatherCoveragePercent < 100
              ? ('目前只有 ' + report.weatherCoveragePercent + '% 路段具有效氣象資料，未知路段請保守判斷。')
              : ('沿途 ' + report.sectionCount + ' 段中有 ' + report.rainSections + ' 段降雨提醒。'))
            : '沿途天氣會在路線狀況載入後提供摘要。'
        },
        {
          title: report ? ('攝影機覆蓋 ' + report.cameraCount + ' 支') : '尚未有沿途影像',
          sub: report && report.cameraCount < 8
            ? '這條路線影像覆蓋偏稀，遇到山區或海線時保守評估。'
            : '影像點足夠，可快速抽查主要路段。'
        }
      ];
      el.innerHTML = items.map(function(item) {
        return '<div class="tool-check-item"><div class="tool-check-title">' + escapeHtml(item.title) + '</div><div class="tool-check-sub">' + escapeHtml(item.sub) + '</div></div>';
      }).join('');
    },
    buildRouteReport: function() {
      var conditions = AppState.routeConditions;
      if (!RouteMod.active || !AppState.lastRouteInfo || !conditions || !conditions.sections) {
        AppState.routeReport = null;
        RideInsightsMod.updateStatusCard();
        RideInsightsMod.updateRiskPanel();
        RideInsightsMod.updateChecklist();
        return;
      }
      var sections = conditions.sections;
      var overall = conditions.overall || {};
      var trafficCoverage = Number(overall.coveragePercent || 0);
      var weatherCoverage = Number(overall.weatherCoveragePercent || 0);
      var cameraIds = {};
      sections.forEach(function(section) {
        (section.cameras || []).forEach(function(camera) { cameraIds[camera.id] = true; });
      });
      var riskNotes = [];
      if (overall.congestedSections > 0) riskNotes.push(overall.congestedSections + ' 段壅塞，建議先查看紅色路段。');
      if (overall.rainSections > 0) riskNotes.push(overall.rainSections + ' 段有降雨提醒，請準備雨具。');
      if (overall.incidentCount > 0) riskNotes.push(overall.incidentCount + ' 件道路事件需要留意。');
      if (trafficCoverage < 60) {
        riskNotes.push('即時交通覆蓋偏低，灰色路段不可視為順暢。');
      } else if (trafficCoverage < 100) {
        riskNotes.push('部分路段沒有即時交通資料，請保守判斷灰色路段。');
      }
      if (weatherCoverage < 60) {
        riskNotes.push('沿途氣象覆蓋偏低，無資料路段不可視為無雨。');
      } else if (weatherCoverage < 100) {
        riskNotes.push('部分路段缺少氣象觀測，降雨摘要並非全程判斷。');
      }
      if (!riskNotes.length) riskNotes.push('目前官方資料未顯示明顯壅塞、降雨或道路事件。');
      var weatherSummary = overall.rainSections > 0
        ? ('有 ' + overall.rainSections + ' 段降雨')
        : (weatherCoverage < 100 ? ('天氣覆蓋 ' + weatherCoverage + '%') : '沿途官方資料暫無降雨訊號');
      AppState.routeReport = {
        cameraCount: Object.keys(cameraIds).length,
        counties: [],
        routeLabel: '安全路線 · ' + sections.length + ' 段',
        sectionCount: sections.length,
        rainSections: overall.rainSections || 0,
        weatherSummary: weatherSummary,
        riskNotes: riskNotes,
        coveragePercent: trafficCoverage,
        weatherCoveragePercent: weatherCoverage
      };
      AppState.updatedAt.route = new Date().toISOString();
      RideInsightsMod.updateStatusCard();
      RideInsightsMod.updateRiskPanel();
      RideInsightsMod.updateChecklist();
    },
    init: function() {
      Bus.on('route:updated', RideInsightsMod.buildRouteReport);
      Bus.on('route:cleared', RideInsightsMod.buildRouteReport);
      Bus.on('conditions:updated', RideInsightsMod.buildRouteReport);
      Bus.on('weather:updated', function() {
        RideInsightsMod.buildRouteReport();
        RideInsightsMod.updateStatusCard();
        RideInsightsMod.updateChecklist();
      });
      Bus.on('cams:updated', function() {
        RideInsightsMod.updateStatusCard();
        RideInsightsMod.updateChecklist();
      });
      RideInsightsMod.updateStatusCard();
      RideInsightsMod.updateRiskPanel();
      RideInsightsMod.updateChecklist();
    }
  };

  window.addEventListener('load', function() {
    FavoritesMod.init();
    RideInsightsMod.init();
  });
})();
