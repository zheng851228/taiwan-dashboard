import { expect, test } from '@playwright/test';

test('legacy map view commands flow through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus && window.MapMod && window.MapMod.map
  ))).toBe(true);

  const result = await page.evaluate(() => {
    const map = window.MapMod.map;
    const originalInvalidateSize = map.invalidateSize;
    const originalFocusRoute = window.MapMod.focusRoute;
    let invalidateCalls = 0;
    let focusRouteCalls = 0;

    map.invalidateSize = function() {
      invalidateCalls += 1;
      return map;
    };
    window.MapMod.focusRoute = function() {
      focusRouteCalls += 1;
    };

    window.Bus.emit('map:request', {
      action: 'set-view',
      center: [24.1477, 120.6736],
      zoom: 11
    });
    const firstCenter = map.getCenter();
    const firstZoom = map.getZoom();

    window.Bus.emit('map:request', { action: 'invalidate-size' });
    window.Bus.emit('map:request', { action: 'focus-route' });
    window.Bus.emit('map:request', { action: 'set-view', center: ['bad', 120], zoom: 9 });
    window.Bus.emit('map:request', { action: 'unknown' });

    const finalCenter = map.getCenter();
    const finalZoom = map.getZoom();

    map.invalidateSize = originalInvalidateSize;
    window.MapMod.focusRoute = originalFocusRoute;

    return {
      firstCenter: [firstCenter.lat, firstCenter.lng],
      firstZoom,
      finalCenter: [finalCenter.lat, finalCenter.lng],
      finalZoom,
      invalidateCalls,
      focusRouteCalls
    };
  });

  expect(result.firstCenter[0]).toBeCloseTo(24.1477, 3);
  expect(result.firstCenter[1]).toBeCloseTo(120.6736, 3);
  expect(result.firstZoom).toBe(11);
  expect(result.finalCenter[0]).toBeCloseTo(result.firstCenter[0], 6);
  expect(result.finalCenter[1]).toBeCloseTo(result.firstCenter[1], 6);
  expect(result.finalZoom).toBe(11);
  expect(result.invalidateCalls).toBe(1);
  expect(result.focusRouteCalls).toBe(1);
});

test('route-condition map commands flow through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus && window.MapMod && window.MapMod.map
  ))).toBe(true);

  const calls = await page.evaluate(() => {
    const originals = {
      drawStartEnd: window.MapMod.drawStartEnd,
      focusCam: window.MapMod.focusCam,
      drawConditionSections: window.MapMod.drawConditionSections,
      focusSection: window.MapMod.focusSection
    };
    const observed = [];

    window.MapMod.drawStartEnd = function(points) { observed.push(['draw-start-end', points]); };
    window.MapMod.focusCam = function(camera) { observed.push(['focus-camera', camera && camera.id]); };
    window.MapMod.drawConditionSections = function(sections) { observed.push(['draw-condition-sections', sections && sections.length]); };
    window.MapMod.focusSection = function(order) { observed.push(['focus-section', order]); };

    window.Bus.emit('map:request', { action: 'draw-start-end', points: [[24.1, 120.6], [24.2, 120.7]] });
    window.Bus.emit('map:request', { action: 'focus-camera', camera: { id: 'camera-1', lat: 24.1, lng: 120.6 } });
    window.Bus.emit('map:request', { action: 'draw-condition-sections', sections: [{ order: 1 }] });
    window.Bus.emit('map:request', { action: 'focus-section', order: 3 });
    window.Bus.emit('map:request', { action: 'focus-camera' });
    window.Bus.emit('map:request', { action: 'draw-condition-sections', sections: null });
    window.Bus.emit('map:request', { action: 'focus-section', order: 'bad' });

    window.MapMod.drawStartEnd = originals.drawStartEnd;
    window.MapMod.focusCam = originals.focusCam;
    window.MapMod.drawConditionSections = originals.drawConditionSections;
    window.MapMod.focusSection = originals.focusSection;

    return observed;
  });

  expect(calls).toEqual([
    ['draw-start-end', [[24.1, 120.6], [24.2, 120.7]]],
    ['focus-camera', 'camera-1'],
    ['draw-condition-sections', 1],
    ['focus-section', 3]
  ]);
});
