import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

test('keeps internal-only modules off window while retaining required integration globals', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.RouteMod
      && window.RouteConditionsMod
      && window.DesktopDashboardMod
  ))).toBe(true);

  const surface = await page.evaluate(() => ({
    internal: {
      ThemeMod: Object.prototype.hasOwnProperty.call(window, 'ThemeMod'),
      ListMod: Object.prototype.hasOwnProperty.call(window, 'ListMod'),
      ModalMod: Object.prototype.hasOwnProperty.call(window, 'ModalMod'),
      NavMod: Object.prototype.hasOwnProperty.call(window, 'NavMod'),
      MapMod: Object.prototype.hasOwnProperty.call(window, 'MapMod'),
      MapTestProbe: Object.prototype.hasOwnProperty.call(window, '__MapTestProbe'),
      DesktopElevationMod: Object.prototype.hasOwnProperty.call(window, 'DesktopElevationMod')
    },
    integration: {
      RouteMod: typeof window.RouteMod === 'object',
      RouteConditionsMod: typeof window.RouteConditionsMod === 'object',
      DesktopDashboardMod: typeof window.DesktopDashboardMod === 'object'
    }
  }));

  expect(surface.internal).toEqual({
    ThemeMod: false,
    ListMod: false,
    ModalMod: false,
    NavMod: false,
    MapMod: false,
    MapTestProbe: false,
    DesktopElevationMod: false
  });
  expect(surface.integration).toEqual({
    RouteMod: true,
    RouteConditionsMod: true,
    DesktopDashboardMod: true
  });
});
