// Install guidance, controlled service-worker updates, network state, and offline route snapshots.

(function() {
  'use strict';

  var INSTALL_DISMISSED_KEY = 'tw_pwa_install_dismissed_v1';
  var INSTALL_PROMPTED_KEY = 'tw_pwa_install_prompted_v2';
  var ROUTE_SNAPSHOT_KEY = 'tw_last_route_snapshot_v1';
  var SNAPSHOT_VERSION = 1;
  var MAX_OFFLINE_COORDINATES = 2000;
  var updateRegistration = null;
  var reloadForUpdate = false;
  var latestLiveConditions = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isIPhone() {
    return /iPhone|iPod/.test(navigator.userAgent);
  }

  function isSafari() {
    return /WebKit/i.test(navigator.userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(navigator.userAgent);
  }

  function setVisible(id, visible) {
    var element = Dom.byId(id);
    if (element) element.classList.toggle('hidden', !visible);
  }

  function formatSnapshotTime(value) {
    if (!value) return '--';
    try {
      return new Intl.DateTimeFormat('zh-TW', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(value));
    } catch (error) {
      return '--';
    }
  }

  function updateInstallState() {
    var state = Dom.byId('pwa-install-state');
    var button = Dom.byId('pwa-install-open');
    if (!state || !button) return;
    if (isStandalone()) {
      state.textContent = '已從主畫面獨立開啟；網站更新不需重新安裝。';
      button.textContent = '已安裝';
      button.disabled = true;
      return;
    }
    if (isIOS() && isSafari()) {
      state.textContent = '從 Safari 加入主畫面，像 App 一樣獨立開啟。';
      button.textContent = '查看';
      button.disabled = false;
      return;
    }
    state.textContent = '請使用 iPhone Safari 開啟，再加入主畫面。';
    button.textContent = '說明';
    button.disabled = false;
  }

  function openInstallSheet() {
    closeInstallNudge(false);
    var note = Dom.byId('pwa-install-note');
    if (note) {
      note.textContent = isIOS() && !isSafari()
        ? '目前瀏覽器無法完成 iPhone 主畫面安裝，請複製網址後改用 Safari 開啟。'
        : '安裝後從主畫面開啟，就不會顯示 Safari 網址列；網站更新也不需重新安裝。';
    }
    setVisible('pwa-install-sheet', true);
    document.body.classList.add('pwa-sheet-open');
    var done = Dom.byId('pwa-install-done');
    if (done) done.focus();
  }

  function closeInstallSheet(remember) {
    setVisible('pwa-install-sheet', false);
    document.body.classList.remove('pwa-sheet-open');
    if (remember) Storage.set(INSTALL_DISMISSED_KEY, String(Date.now()));
  }

  function installGuideWouldInterrupt() {
    var updateBanner = Dom.byId('pwa-update-banner');
    var networkBanner = Dom.byId('pwa-network-banner');
    var installSheet = Dom.byId('pwa-install-sheet');
    return Boolean(
      (updateBanner && !updateBanner.classList.contains('hidden'))
      || (networkBanner && !networkBanner.classList.contains('hidden'))
      || (installSheet && !installSheet.classList.contains('hidden'))
    );
  }

  function closeInstallNudge(remember) {
    setVisible('pwa-install-nudge', false);
    if (remember) Storage.set(INSTALL_DISMISSED_KEY, String(Date.now()));
  }

  function installPromptEligible(data) {
    var route = window.AppState && AppState.activeRoute;
    var validation = route && route.validation;
    var dataMode = data && data.dataMode;
    return Boolean(
      isIPhone()
      && isSafari()
      && !isStandalone()
      && navigator.onLine
      && !Storage.get(INSTALL_DISMISSED_KEY, '')
      && !Storage.get(INSTALL_PROMPTED_KEY, '')
      && route
      && validation
      && validation.status === 'safe'
      && data
      && dataMode
      && dataMode !== 'fixture'
      && (!data.routeId || data.routeId === route.routeId)
      && !installGuideWouldInterrupt()
    );
  }

  function showInstallNudge(data) {
    if (!installPromptEligible(data)) return;
    setVisible('pwa-install-nudge', true);
    Storage.set(INSTALL_PROMPTED_KEY, String(Date.now()));
  }

  function maybeShowInstallNudge(data) {
    if (data && data.dataMode && data.dataMode !== 'fixture') latestLiveConditions = data;
    showInstallNudge(data || latestLiveConditions);
  }

  function initInstallGuidance() {
    updateInstallState();
    Dom.onId('pwa-install-open', 'click', openInstallSheet);
    Dom.onId('pwa-install-close', 'click', function() { closeInstallSheet(true); });
    Dom.onId('pwa-install-done', 'click', function() { closeInstallSheet(true); });
    Dom.onId('pwa-install-backdrop', 'click', function() { closeInstallSheet(true); });
    Dom.onId('pwa-install-nudge-open', 'click', function() {
      closeInstallNudge(false);
      openInstallSheet();
    });
    Dom.onId('pwa-install-nudge-close', 'click', function() {
      closeInstallNudge(true);
    });
    Bus.on('conditions:updated', maybeShowInstallNudge);
  }

  function showUpdate(registration) {
    updateRegistration = registration;
    closeInstallNudge(false);
    setVisible('pwa-update-banner', true);
  }

  function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('./sw.js').then(function(registration) {
      if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration);
      registration.addEventListener('updatefound', function() {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function() {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdate(registration);
          }
        });
      });
      registration.update().catch(function() {});
    }).catch(function(error) {
      Diag.warn('離線功能暫時無法啟用: ' + error.message);
    });

    Dom.onId('pwa-update-action', 'click', function() {
      var waiting = updateRegistration && updateRegistration.waiting;
      if (!waiting) {
        window.location.reload();
        return;
      }
      reloadForUpdate = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    });

    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (!reloadForUpdate) return;
      reloadForUpdate = false;
      window.location.reload();
    });
  }

  function updateNetworkUi() {
    var offline = !navigator.onLine;
    setVisible('pwa-network-banner', offline);
    document.body.classList.toggle('is-offline', offline);
    if (offline) closeInstallNudge(false);
    if (!offline) {
      var message = Dom.byId('pwa-network-message');
      if (message) message.textContent = '目前離線，只顯示已保存內容；即時路況、天氣與影像暫停更新。';
      maybeShowInstallNudge(latestLiveConditions);
    }
  }

  function saveRouteSnapshot() {
    var route = AppState.activeRoute;
    if (!route || !route.geometry || !AppState.lastRouteInfo) return;
    if (!route.validation || route.validation.status !== 'safe') return;

    var coordinates = route.geometry.coordinates || [];
    var step = Math.max(1, Math.ceil(coordinates.length / MAX_OFFLINE_COORDINATES));
    var compactCoordinates = coordinates.filter(function(_point, index) {
      return index % step === 0 || index === coordinates.length - 1;
    });
    var compactRoute = {
      routeId: route.routeId,
      dataMode: route.dataMode,
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      vehicle: route.vehicle,
      locations: route.locations,
      validation: route.validation,
      geometry: {
        type: 'LineString',
        coordinates: compactCoordinates
      }
    };

    var saved = Storage.setJson(ROUTE_SNAPSHOT_KEY, {
      version: SNAPSHOT_VERSION,
      savedAt: new Date().toISOString(),
      route: compactRoute,
      lastRouteInfo: AppState.lastRouteInfo,
      routeAllPoints: AppState.routeAllPoints,
      routeInputValues: AppState.routeInputValues,
      routeReport: AppState.routeReport
    });
    if (!saved) Diag.warn('裝置儲存空間不足，最後路線無法提供離線查看');
  }

  function getRouteSnapshot() {
    var snapshot = Storage.getJson(ROUTE_SNAPSHOT_KEY, null);
    if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) return null;
    if (!snapshot.route || !snapshot.route.geometry || !snapshot.lastRouteInfo) return null;
    return snapshot;
  }

  function restoreOfflineRoute() {
    if (navigator.onLine) return false;
    var snapshot = getRouteSnapshot();
    if (!snapshot) return false;

    var route = snapshot.route;
    var coordinates = route.geometry && route.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
    var mapCoordinates = coordinates.map(function(point) {
      return [Number(point[1]), Number(point[0])];
    }).filter(function(point) {
      return Number.isFinite(point[0]) && Number.isFinite(point[1]);
    });
    if (mapCoordinates.length < 2) return false;

    AppState.activeRoute = route;
    AppState.lastRouteInfo = snapshot.lastRouteInfo;
    AppState.routeAllPoints = snapshot.routeAllPoints || [];
    AppState.routeInputValues = snapshot.routeInputValues || [];
    AppState.routeReport = snapshot.routeReport || null;
    AppState.routeConditions = null;

    RouteMod.active = true;
    if (window.RouteUiMod) RouteUiMod.setState('ready');
    RouteMod.mode = route.vehicle && route.vehicle.type === 'car' ? 'car' : 'motorcycle';
    RouteMod.routeCoords = mapCoordinates;
    RouteMod.filteredCams = [];
    MapMod.drawRoute(mapCoordinates, RouteMod.mode);
    MapMod.drawStartEnd(AppState.routeAllPoints);

    var start = Dom.byId('js-route-start');
    var end = Dom.byId('js-route-end');
    if (start && AppState.routeInputValues.length) start.value = AppState.routeInputValues[0] || '';
    if (end && AppState.routeInputValues.length > 1) {
      end.value = AppState.routeInputValues[AppState.routeInputValues.length - 1] || '';
    }

    var info = snapshot.lastRouteInfo;
    var summary = Dom.byId('route-summary');
    if (summary) {
      summary.textContent = '離線快照 · ' + info.distance + 'km/' + info.duration + '分';
      summary.classList.remove('hidden');
    }
    var status = Dom.byId('js-route-status');
    if (status) {
      status.textContent = '離線快照 · 儲存於 ' + formatSnapshotTime(snapshot.savedAt) + '；即時資料暫停更新';
    }
    var banner = Dom.byId('js-route-banner');
    if (banner) {
      banner.classList.remove('hidden');
      banner.classList.add('flex');
    }
    var bannerLabel = Dom.byId('js-route-banner-label');
    if (bannerLabel) bannerLabel.textContent = '已保存路線 · 非即時';
    var clear = Dom.byId('js-route-clear-small');
    if (clear) clear.classList.remove('hidden');

    if (window.RideInsightsMod) {
      RideInsightsMod.updateStatusCard();
      RideInsightsMod.updateRiskPanel();
      RideInsightsMod.updateChecklist();
    }
    Bus.emit('offline-route:restored', snapshot);
    return true;
  }

  function initNetworkAndSnapshots() {
    updateNetworkUi();
    window.addEventListener('offline', updateNetworkUi);
    window.addEventListener('online', function() {
      updateNetworkUi();
      Toast.show('連線已恢復，可重新整理即時路況', 3500);
    });
    Bus.on('route:updated', saveRouteSnapshot);
    Bus.on('conditions:updated', saveRouteSnapshot);
    restoreOfflineRoute();
  }

  window.PwaMod = {
    isStandalone: isStandalone,
    isIOS: isIOS,
    isSafari: isSafari,
    openInstallSheet: openInstallSheet,
    closeInstallSheet: closeInstallSheet,
    saveRouteSnapshot: saveRouteSnapshot,
    getRouteSnapshot: getRouteSnapshot,
    restoreOfflineRoute: restoreOfflineRoute
  };

  window.addEventListener('load', function() {
    initInstallGuidance();
    initServiceWorker();
    initNetworkAndSnapshots();
  });
})();
