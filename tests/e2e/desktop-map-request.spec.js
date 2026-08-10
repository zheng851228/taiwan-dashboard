import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

test('map view commands flow through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(window.Bus && window.MapMod && window.MapMod.map))).toBe(true);

  const result = await page.evaluate(() => {
    const calls = [];
    const map = window.MapMod.map;
    const originalSetView = map.setView;
    const originalInvalidateSize = map.invalidateSize;
    const originalFocusRoute = window.MapMod.focusRoute;

    map.setView = function(center, zoom) { calls.push({ action: 'set-view', center: center.slice(), zoom }); return map; };
    map.invalidateSize = function() { calls.push({ action: 'invalidate-size' }); return map; };
    window.MapMod.focusRoute = function() { calls.push({ action: 'focus-route' }); };

    window.Bus.emit('map:request', { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 });
    window.Bus.emit('map:request', { action: 'invalidate-size' });
    window.Bus.emit('map:request', { action: 'focus-route' });
    window.Bus.emit('map:request', { action: 'set-view', center: ['bad', 120], zoom: 9 });
    window.Bus.emit('map:request', { action: 'unknown' });

    map.setView = originalSetView;
    map.invalidateSize = originalInvalidateSize;
    window.MapMod.focusRoute = originalFocusRoute;
    return calls;
  });

  expect(result).toEqual([
    { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 },
    { action: 'invalidate-size' },
    { action: 'focus-route' }
  ]);
});
