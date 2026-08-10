import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

test('map commands flow through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(window.Bus && window.MapMod && window.MapMod.map))).toBe(true);

  const result = await page.evaluate(() => {
    const calls = [];
    const map = window.MapMod.map;
    const originals = {
      setView: map.setView,
      invalidateSize: map.invalidateSize,
      focusRoute: window.MapMod.focusRoute,
      drawRoute: window.MapMod.drawRoute,
      drawStartEnd: window.MapMod.drawStartEnd,
      focusCam: window.MapMod.focusCam,
      drawConditionSections: window.MapMod.drawConditionSections,
      focusSection: window.MapMod.focusSection
    };

    map.setView = function(center, zoom) { calls.push({ action: 'set-view', center: center.slice(), zoom }); return map; };
    map.invalidateSize = function() { calls.push({ action: 'invalidate-size' }); return map; };
    window.MapMod.focusRoute = function() { calls.push({ action: 'focus-route' }); };
    window.MapMod.drawRoute = function(coords, mode) { calls.push({ action: 'draw-route', coords, mode }); };
    window.MapMod.drawStartEnd = function(points) { calls.push({ action: 'draw-start-end', points }); };
    window.MapMod.focusCam = function(camera) { calls.push({ action: 'focus-camera', camera }); };
    window.MapMod.drawConditionSections = function(sections) { calls.push({ action: 'draw-condition-sections', sections }); };
    window.MapMod.focusSection = function(order) { calls.push({ action: 'focus-section', order }); };

    const routeCoords = [[24.1477, 120.6736], [24.151, 120.68]];
    const routePoints = [[24.1477, 120.6736], [24.151, 120.68]];
    const camera = { id: 'cam-1', lat: 24.15, lng: 120.68 };
    const sections = [{ order: 2, status: 'green' }];

    window.Bus.emit('map:request', { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 });
    window.Bus.emit('map:request', { action: 'invalidate-size' });
    window.Bus.emit('map:request', { action: 'focus-route' });
    window.Bus.emit('map:request', { action: 'draw-route', coords: routeCoords, mode: 'motorcycle' });
    window.Bus.emit('map:request', { action: 'draw-start-end', points: routePoints });
    window.Bus.emit('map:request', { action: 'focus-camera', camera });
    window.Bus.emit('map:request', { action: 'draw-condition-sections', sections });
    window.Bus.emit('map:request', { action: 'focus-section', order: 2 });

    window.Bus.emit('map:request', { action: 'set-view', center: ['bad', 120], zoom: 9 });
    window.Bus.emit('map:request', { action: 'draw-route', coords: [[24, 120]], mode: 'car' });
    window.Bus.emit('map:request', { action: 'focus-camera' });
    window.Bus.emit('map:request', { action: 'draw-condition-sections', sections: null });
    window.Bus.emit('map:request', { action: 'focus-section', order: 'bad' });
    window.Bus.emit('map:request', { action: 'unknown' });

    map.setView = originals.setView;
    map.invalidateSize = originals.invalidateSize;
    window.MapMod.focusRoute = originals.focusRoute;
    window.MapMod.drawRoute = originals.drawRoute;
    window.MapMod.drawStartEnd = originals.drawStartEnd;
    window.MapMod.focusCam = originals.focusCam;
    window.MapMod.drawConditionSections = originals.drawConditionSections;
    window.MapMod.focusSection = originals.focusSection;
    return calls;
  });

  expect(result).toEqual([
    { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 },
    { action: 'invalidate-size' },
    { action: 'focus-route' },
    { action: 'draw-route', coords: [[24.1477, 120.6736], [24.151, 120.68]], mode: 'motorcycle' },
    { action: 'draw-start-end', points: [[24.1477, 120.6736], [24.151, 120.68]] },
    { action: 'focus-camera', camera: { id: 'cam-1', lat: 24.15, lng: 120.68 } },
    { action: 'draw-condition-sections', sections: [{ order: 2, status: 'green' }] },
    { action: 'focus-section', order: 2 }
  ]);
});
