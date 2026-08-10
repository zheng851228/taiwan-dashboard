import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

test('keeps internal-only modules off window while retaining integration globals', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.RouteMod
      && window.MapMod
      && window.NavMod
      && window.RouteConditionsMod
      && window.DesktopDashboardMod
  ))).toBe(true);

  const surface = await page.evaluate(() => ({
    internal: {
      ThemeMod: Object.prototype.hasOwnProperty.call(window, 'ThemeMod'),
      ListMod: Object.prototype.hasOwnProperty.call(window, 'ListMod'),
      ModalMod: Object.prototype.hasOwnProperty.call(window, 'ModalMod'),
      DesktopElevationMod: Object.prototype.hasOwnProperty.call(window, 'DesktopElevationMod')
    },
    integration: {
      RouteMod: typeof window.RouteMod === 'object',
      MapMod: typeof window.MapMod === 'object',
      NavMod: typeof window.NavMod === 'object',
      RouteConditionsMod: typeof window.RouteConditionsMod === 'object',
      DesktopDashboardMod: typeof window.DesktopDashboardMod === 'object'
    }
  }));

  expect(surface.internal).toEqual({
    ThemeMod: false,
    ListMod: false,
    ModalMod: false,
    DesktopElevationMod: false
  });
  expect(surface.integration).toEqual({
    RouteMod: true,
    MapMod: true,
    NavMod: true,
    RouteConditionsMod: true,
    DesktopDashboardMod: true
  });
});
