import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787&e2e=1';

test('offline snapshot restore flows through the route capability', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    localStorage.setItem('tw_last_route_snapshot_v1', JSON.stringify({
      version: 1,
      savedAt: '2026-08-11T01:02:03.000Z',
      route: {
        routeId: 'offline-regression-route',
        distanceKm: 12.3,
        durationMinutes: 34,
        vehicle: { type: 'motorcycle', plate: 'red' },
        validation: { status: 'safe' },
        geometry: {
          type: 'LineString',
          coordinates: [[120.6736, 24.1477], [120.68, 24.151]]
        }
      },
      lastRouteInfo: { distance: 12.3, duration: 34 },
      routeAllPoints: [[24.1477, 120.6736], [24.151, 120.68]],
      routeInputValues: ['台中起點', '台中終點'],
      routeReport: null
    }));
  });

  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.RouteMod
      && window.RouteMod.active
      && window.__MapTestProbe
      && window.__MapTestProbe.snapshot().routeLayerAttached
  ))).toBe(true);

  const restored = await page.evaluate(() => ({
    active: window.RouteMod.active,
    mode: window.RouteMod.mode,
    plate: window.RouteMod.plate,
    routeCoords: window.RouteMod.routeCoords,
    filteredCams: window.RouteMod.filteredCams,
    routeId: window.AppState.activeRoute && window.AppState.activeRoute.routeId,
    map: window.__MapTestProbe.snapshot(),
    activeVehicleButtons: Array.from(document.querySelectorAll('.route-mode-btn.active'))
      .map((button) => ({ mode: button.dataset.mode, plate: button.dataset.plate || '' }))
  }));

  expect(restored.active).toBe(true);
  expect(restored.mode).toBe('motorcycle');
  expect(restored.plate).toBe('red');
  expect(restored.routeCoords).toEqual([[24.1477, 120.6736], [24.151, 120.68]]);
  expect(restored.filteredCams).toEqual([]);
  expect(restored.routeId).toBe('offline-regression-route');
  expect(restored.map.routeLayerCount).toBeGreaterThan(0);
  expect(restored.map.startEndMarkerCount).toBe(2);
  expect(restored.activeVehicleButtons).toEqual([{ mode: 'motorcycle', plate: 'red' }]);
  await expect(page.locator('#route-summary')).toContainText('離線快照 · 12.3km/34分');
  await expect(page.locator('#js-route-status')).toContainText('即時資料暫停更新');
  await expect(page.locator('#js-route-banner')).not.toHaveClass(/\bhidden\b/);
});
