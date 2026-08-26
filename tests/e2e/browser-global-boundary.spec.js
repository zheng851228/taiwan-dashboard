import { expect, test } from '@playwright/test';

test('internal UI modules stay off window while supported cross-file capabilities remain available', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Browser global boundary regression.');
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.RouteMod && window.MapMod && window.Bus
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
    info: 'undefined'
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

test('camera info opens and closes through bus events without an InfoMod global', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Browser camera boundary regression.');
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => typeof window.Bus?.emit === 'function')).toBe(true);

  const selected = await page.evaluate(() => new Promise((resolve) => {
    window.Bus.on('camera:selected', function onSelected(camera) {
      resolve(camera && camera.id);
    });
    window.Bus.emit('camera:open', {
      id: 'boundary-camera',
      name: 'Boundary Camera',
      county: '台中市',
      type: 'cctv',
      lat: 24.1477,
      lng: 120.6736,
      url: ''
    });
  }));

  expect(selected).toBe('boundary-camera');
  await expect(page.locator('#info-panel')).not.toHaveClass(/hidden/);
  await expect(page.locator('#info-name')).toHaveText('Boundary Camera');
  expect(await page.evaluate(() => typeof window.InfoMod)).toBe('undefined');

  const closed = page.evaluate(() => new Promise((resolve) => {
    window.Bus.on('camera:closed', function onClosed() { resolve(true); });
  }));
  await page.locator('#info-close').click();
  expect(await closed).toBe(true);
  await expect(page.locator('#info-panel')).toHaveClass(/hidden/);
});
