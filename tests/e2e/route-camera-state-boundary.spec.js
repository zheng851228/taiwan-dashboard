import { expect, test } from '@playwright/test';

test('route camera consumers use route:updated payload instead of RouteMod.filteredCams', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus
      && window.AppState
      && window.RouteMod
      && window.RouteStripMod
      && document.getElementById('desktop-camera-count')
      && document.getElementById('route-camera-strip')
      && document.getElementById('strip-count')
  ))).toBe(true);

  const result = await page.evaluate(() => {
    const original = {
      activeRoute: AppState.activeRoute,
      filteredCams: RouteMod.filteredCams
    };
    const stale = [{ id: 'stale-cam', name: 'Stale camera', lat: 24.1, lng: 120.6 }];
    const fresh = [
      { id: 'fresh-a', name: 'Fresh A', lat: 24.15, lng: 120.68 },
      { id: 'fresh-b', name: 'Fresh B', lat: 24.16, lng: 120.69 }
    ];

    AppState.activeRoute = {
      routeId: 'route-camera-state-boundary',
      geometry: {
        type: 'LineString',
        coordinates: [[120.68, 24.15], [120.69, 24.16]]
      }
    };
    RouteMod.filteredCams = stale.slice();

    Bus.emit('route:updated', { cams: fresh.slice() });
    RouteStripMod.hide();
    RouteStripMod.toggle();

    const cameraCount = document.getElementById('desktop-camera-count');
    const strip = document.getElementById('route-camera-strip');
    const stripCount = document.getElementById('strip-count');
    const scroll = document.getElementById('route-camera-strip-scroll');
    const afterPayload = {
      desktopCameraCount: cameraCount.textContent,
      stripCount: stripCount.textContent,
      stripText: scroll.textContent,
      stripVisible: strip.classList.contains('visible') || strip.style.display === 'block'
    };

    RouteMod.filteredCams = stale.slice();
    Bus.emit('filter:changed');
    RouteStripMod.hide();
    RouteStripMod.toggle();
    const afterLegacyMutation = {
      desktopCameraCount: cameraCount.textContent,
      stripCount: stripCount.textContent,
      stripText: scroll.textContent
    };

    AppState.activeRoute = null;
    Bus.emit('route:cleared');
    RouteStripMod.toggle();
    const afterClear = {
      desktopCameraCount: cameraCount.textContent,
      stripVisible: strip.classList.contains('visible') || strip.style.display === 'block'
    };

    AppState.activeRoute = original.activeRoute;
    RouteMod.filteredCams = original.filteredCams;

    return { afterPayload, afterLegacyMutation, afterClear };
  });

  expect(result.afterPayload).toEqual({
    desktopCameraCount: '2 支',
    stripCount: '共 2 支',
    stripText: expect.stringContaining('Fresh A'),
    stripVisible: true
  });
  expect(result.afterPayload.stripText).toContain('Fresh B');

  expect(result.afterLegacyMutation.desktopCameraCount).toBe('2 支');
  expect(result.afterLegacyMutation.stripCount).toBe('共 2 支');
  expect(result.afterLegacyMutation.stripText).toContain('Fresh A');
  expect(result.afterLegacyMutation.stripText).toContain('Fresh B');
  expect(result.afterLegacyMutation.stripText).not.toContain('Stale camera');

  expect(result.afterClear).toEqual({
    desktopCameraCount: '--',
    stripVisible: false
  });
});
