import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

test('navigation requests drive page changes without a global NavMod', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(window.Bus && document.getElementById('pg-map')))).toBe(true);
  await expect.poll(() => page.evaluate(() => Object.prototype.hasOwnProperty.call(window, 'NavMod'))).toBe(false);

  await page.evaluate(() => window.Bus.emit('navigation:request', { page: 'list' }));
  await expect(page.locator('#pg-list')).toHaveClass(/active/);
  await expect(page.locator('#nav-list')).toHaveClass(/active/);

  await page.evaluate(() => window.Bus.emit('navigation:request', { page: 'not-a-page' }));
  await expect(page.locator('#pg-list')).toHaveClass(/active/);

  await page.evaluate(() => window.Bus.emit('navigation:request', { page: 'tools' }));
  await expect(page.locator('#pg-tools')).toHaveClass(/active/);
  await expect(page.locator('#nav-tools')).toHaveClass(/active/);

  await page.evaluate(() => window.Bus.emit('navigation:request', { page: 'map' }));
  await expect(page.locator('#pg-map')).toHaveClass(/active/);
  await expect(page.locator('#nav-map')).toHaveClass(/active/);
});
