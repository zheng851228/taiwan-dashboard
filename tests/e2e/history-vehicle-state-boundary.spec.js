import { expect, test } from '@playwright/test';

test('history mode follows vehicle events instead of RouteMod.mode', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('guide_done_v1', '1');
    localStorage.removeItem('tw_route_history');
  });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus && window.Storage && window.HistoryMod && window.RouteMod
  ))).toBe(true);

  const entries = await page.evaluate(() => {
    Storage.setJson(HistoryMod.KEY, []);

    // Deliberately keep the legacy global stale in the opposite mode.
    RouteMod.mode = 'motorcycle';
    Bus.emit('vehicle:changed', { mode: 'car', plate: 'white' });
    HistoryMod.add('history-car-start', 'history-car-end', []);

    RouteMod.mode = 'car';
    Bus.emit('vehicle:changed', { mode: 'motorcycle', plate: 'white' });
    HistoryMod.add('history-moto-start', 'history-moto-end', []);

    return HistoryMod.load().map((entry) => ({ start: entry.start, mode: entry.mode }));
  });

  expect(entries).toEqual([
    { start: 'history-moto-start', mode: 'motorcycle' },
    { start: 'history-car-start', mode: 'car' },
  ]);
});
