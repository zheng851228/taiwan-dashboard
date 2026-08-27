import { test, expect } from '@playwright/test';
import { gotoFixtureApp } from './helpers/fixture-app.js';

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

const STALE_CONDITION_CAMS = [
  {
    id: 'stale-condition-cam',
    name: 'stale condition camera',
    lat: 25.03,
    lng: 121.56,
    imageUrl: 'https://example.test/stale-condition-camera.jpg',
  },
];

test.describe('route camera state boundary', () => {
  test('desktop and strip consume the route camera snapshot without exposing it', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-chromium', 'desktop regression coverage');

    await page.addInitScript(() => {
      localStorage.setItem('guide_done_v1', '1');
    });
    await gotoFixtureApp(page);
    await page.waitForFunction(() => window.Bus && window.RouteStripMod && window.DesktopApp);

    await page.evaluate(({ routeCams, staleCams }) => {
      window.Bus.emit('route:updated', { coords: [], cams: routeCams });
      window.Bus.emit('conditions:updated', {
        events: [],
        weather: null,
        cctv: staleCams,
        cams: staleCams,
      });
      window.DesktopApp.updateConditions([], null, staleCams);
      window.RouteStripMod.toggle();
    }, { routeCams: ROUTE_CAMS, staleCams: STALE_CONDITION_CAMS });

    await expect(page.locator('#deskCctvCount')).toHaveText('2 支');
    await expect(page.locator('#route-camera-strip')).toContainText('route camera north');
    await expect(page.locator('#route-camera-strip')).not.toContainText('stale condition camera');
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
