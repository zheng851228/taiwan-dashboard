import { expect, test } from '@playwright/test';

const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;

test('desktop route cameras come from the route-updated bus payload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus
      && window.RouteMod
      && window.DesktopDashboardMod
      && window.DesktopDashboardMod.state
  ))).toBe(true);

  const state = await page.evaluate(() => {
    const cams = [
      { id: 'bus-cam-1', name: 'Bus Camera 1', lat: 24.1, lng: 120.6, url: '' },
      { id: 'bus-cam-2', name: 'Bus Camera 2', lat: 24.2, lng: 120.7, url: '' }
    ];

    window.RouteMod.filteredCams = [{ id: 'route-mod-only' }];
    window.Bus.emit('route:updated', { cams });
    window.RouteMod.filteredCams = [{ id: 'mutated-after-event' }];

    return {
      routeCameraIds: window.DesktopDashboardMod.state.routeCameras.map((cam) => cam.id),
      routeModIds: window.RouteMod.filteredCams.map((cam) => cam.id)
    };
  });

  expect(state.routeCameraIds).toEqual(['bus-cam-1', 'bus-cam-2']);
  expect(state.routeModIds).toEqual(['mutated-after-event']);
});
