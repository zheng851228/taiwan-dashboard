import { test, expect } from '@playwright/test';

const ROUTE_CAMS = [
  {
    id: 'route-cam-north',
    name: 'route camera north',
    lat: 25.032,
    lng: 121.565,
    imageUrl: 'https://example.test/route-camera-north.jpg',
  },
  {
    id: 'route-cam-south',
    name: 'route camera south',
    lat: 25.022,
    lng: 121.575,
    imageUrl: 'https://example.test/route-camera-south.jpg',
  },
];

const STALE_LEGACY_CAMS = [
  {
    id: 'stale-legacy-cam',
    name: 'stale legacy camera',
    lat: 25.03,
    lng: 121.56,
    imageUrl: 'https://example.test/stale-legacy-camera.jpg',
  },
];

test.describe('route camera state boundary', () => {
  test('desktop and strip consume the route camera snapshot without exposing it', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-chromium', 'desktop regression coverage');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('guide_done_v1', '1');
    });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => Boolean(
      window.Bus && window.AppState && window.RouteMod && window.RouteStripMod && window.DesktopApp
        && document.getElementById('desktop-camera-count')
    ))).toBe(true);

    await page.evaluate(({ routeCams, staleCams }) => {
      window.AppState.activeRoute = {
        routeId: 'route-camera-boundary',
        geometry: {
          type: 'LineString',
          coordinates: [[121.565, 25.032], [121.575, 25.022]],
        },
      };
      window.Bus.emit('route:updated', { coords: [], cams: routeCams });
      window.RouteMod.filteredCams = staleCams.slice();
      window.RouteStripMod.toggle();
    }, { routeCams: ROUTE_CAMS, staleCams: STALE_LEGACY_CAMS });

    await expect(page.locator('#desktop-camera-count')).toHaveText('2 支');
    await expect(page.locator('#route-camera-strip')).toContainText('route camera north');
    await expect(page.locator('#route-camera-strip')).not.toContainText('stale legacy camera');
    expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(window.RouteStripMod, 'routeCameras'))).toBe(false);

    // Clearing the route snapshot must keep the strip closed on the next toggle.
    await page.evaluate(() => {
      window.Bus.emit('route:cleared', {});
      window.RouteStripMod.hide();
      window.RouteStripMod.toggle();
    });

    await expect(page.locator('#route-camera-strip')).not.toHaveClass(/visible/);
  });
});
