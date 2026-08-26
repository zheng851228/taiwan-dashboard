import { expect, test } from '@playwright/test';

test('external route-active consumers use AppState.activeRoute instead of RouteMod.active', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus
      && window.AppState
      && window.RouteMod
      && window.RideInsightsMod
      && document.getElementById('desktop-camera-count')
      && document.getElementById('js-route-clear-small')
  ))).toBe(true);

  const result = await page.evaluate(() => {
    const original = {
      activeRoute: AppState.activeRoute,
      lastRouteInfo: AppState.lastRouteInfo,
      routeConditions: AppState.routeConditions,
      routeReport: AppState.routeReport,
      routeActive: RouteMod.active,
      filteredCams: RouteMod.filteredCams
    };

    const testRoute = {
      routeId: 'active-state-boundary',
      geometry: {
        type: 'LineString',
        coordinates: [[120.68, 24.15], [120.69, 24.16]]
      }
    };
    const conditions = {
      sections: [{
        order: 0,
        cameras: [],
        incidents: [],
        traffic: { level: 'unknown' },
        weather: {}
      }],
      overall: {
        coveragePercent: 100,
        weatherCoveragePercent: 100,
        congestedSections: 0,
        rainSections: 0,
        incidentCount: 0
      }
    };

    RouteMod.filteredCams = [{
      id: 'active-state-cam',
      name: 'Active state camera',
      lat: 24.15,
      lng: 120.68
    }];

    const cameraCount = document.getElementById('desktop-camera-count');
    const clearMini = document.getElementById('js-route-clear-small');

    // Legacy flag says active, authoritative route state says no route.
    AppState.activeRoute = null;
    RouteMod.active = true;
    clearMini.classList.add('hidden');
    Bus.emit('filter:changed');
    const noRoute = {
      desktopCameraCount: cameraCount.textContent,
      clearVisible: !clearMini.classList.contains('hidden')
    };

    AppState.lastRouteInfo = { distance: 1, duration: 2 };
    AppState.routeConditions = conditions;
    RideInsightsMod.buildRouteReport();
    noRoute.reportPresent = Boolean(AppState.routeReport);

    // Legacy flag says inactive, authoritative route state contains a route.
    AppState.activeRoute = testRoute;
    RouteMod.active = false;
    clearMini.classList.add('hidden');
    Bus.emit('filter:changed');
    const hasRoute = {
      desktopCameraCount: cameraCount.textContent,
      clearVisible: !clearMini.classList.contains('hidden')
    };

    RideInsightsMod.buildRouteReport();
    hasRoute.reportPresent = Boolean(AppState.routeReport);

    AppState.activeRoute = original.activeRoute;
    AppState.lastRouteInfo = original.lastRouteInfo;
    AppState.routeConditions = original.routeConditions;
    AppState.routeReport = original.routeReport;
    RouteMod.active = original.routeActive;
    RouteMod.filteredCams = original.filteredCams;

    return { noRoute, hasRoute };
  });

  expect(result.noRoute).toEqual({
    desktopCameraCount: '--',
    clearVisible: false,
    reportPresent: false
  });
  expect(result.hasRoute).toEqual({
    desktopCameraCount: '1 支',
    clearVisible: true,
    reportPresent: true
  });
});
