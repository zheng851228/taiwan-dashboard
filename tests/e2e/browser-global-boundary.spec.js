import { expect, test } from '@playwright/test';

test('internal UI modules stay off window while supported cross-file capabilities remain available', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Browser global boundary regression.');
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.RouteMod && window.MapMod && window.NavMod && window.InfoMod
  ))).toBe(true);

  const globals = await page.evaluate(() => ({
    theme: typeof window.ThemeMod,
    list: typeof window.ListMod,
    modal: typeof window.ModalMod,
    elevation: typeof window.DesktopElevationMod,
    route: typeof window.RouteMod,
    map: typeof window.MapMod,
    nav: typeof window.NavMod,
    info: typeof window.InfoMod
  }));

  expect(globals).toEqual({
    theme: 'undefined',
    list: 'undefined',
    modal: 'undefined',
    elevation: 'undefined',
    route: 'object',
    map: 'object',
    nav: 'object',
    info: 'object'
  });
});
