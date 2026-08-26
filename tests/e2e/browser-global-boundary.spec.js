import { expect, test } from '@playwright/test';

test('internal UI modules stay off window while supported cross-file capabilities remain available', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Browser global boundary regression.');
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.RouteMod && window.MapMod && window.InfoMod && window.Bus
  ))).toBe(true);

  const globals = await page.evaluate(() => ({
    theme: typeof window.ThemeMod,
    list: typeof window.ListMod,
    modal: typeof window.ModalMod,
    elevation: typeof window.DesktopElevationMod,
    nav: typeof window.NavMod,
    route: typeof window.RouteMod,
    map: typeof window.MapMod,
    info: typeof window.InfoMod
  }));

  expect(globals).toEqual({
    theme: 'undefined',
    list: 'undefined',
    modal: 'undefined',
    elevation: 'undefined',
    nav: 'undefined',
    route: 'object',
    map: 'object',
    info: 'object'
  });
});

test('page navigation is available through the bus without a NavMod global', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Browser navigation boundary regression.');
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => typeof window.Bus?.emit === 'function')).toBe(true);

  await page.evaluate(() => window.Bus.emit('navigation:request', { page: 'list' }));
  await expect(page.locator('#pg-list')).toHaveClass(/active/);
  await expect(page.locator('#nav-list')).toHaveClass(/active/);

  await page.evaluate(() => window.Bus.emit('navigation:request', { page: 'tools' }));
  await expect(page.locator('#pg-tools')).toHaveClass(/active/);
  await expect(page.locator('#nav-tools')).toHaveClass(/active/);

  await page.evaluate(() => window.Bus.emit('navigation:request', { page: 'map' }));
  await expect(page.locator('#pg-map')).toHaveClass(/active/);
  await expect(page.locator('#nav-map')).toHaveClass(/active/);
  expect(await page.evaluate(() => typeof window.NavMod)).toBe('undefined');
});
