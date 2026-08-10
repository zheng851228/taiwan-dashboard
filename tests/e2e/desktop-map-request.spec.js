import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787&e2e=1';

test('map commands flow through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus
      && window.__MapTestProbe
      && window.__MapTestProbe.snapshot().ready
  ))).toBe(true);

  const result = await page.evaluate(() => {
    window.__MapTestProbe.clearActions();

    const routeCoords = [[24.1477, 120.6736], [24.151, 120.68]];
    const routePoints = [[24.1477, 120.6736], [24.151, 120.68]];
    const camera = { id: 'cam-1', lat: 24.15, lng: 120.68 };
    const sections = [{ order: 2, status: 'green' }];

    window.Bus.emit('map:request', { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 });
    window.Bus.emit('map:request', { action: 'invalidate-size' });
    window.Bus.emit('map:request', { action: 'focus-route' });
    window.Bus.emit('map:request', { action: 'draw-route', coords: routeCoords, mode: 'motorcycle' });
    window.Bus.emit('map:request', { action: 'draw-start-end', points: routePoints });
    const routeSnapshot = window.__MapTestProbe.snapshot();

    window.Bus.emit('map:request', { action: 'focus-camera', camera });
    window.Bus.emit('map:request', { action: 'draw-condition-sections', sections });
    window.Bus.emit('map:request', { action: 'focus-section', order: 2 });

    window.Bus.emit('map:request', { action: 'set-view', center: ['bad', 120], zoom: 9 });
    window.Bus.emit('map:request', { action: 'draw-route', coords: [[24, 120]], mode: 'car' });
    window.Bus.emit('map:request', { action: 'focus-camera' });
    window.Bus.emit('map:request', { action: 'draw-condition-sections', sections: null });
    window.Bus.emit('map:request', { action: 'focus-section', order: 'bad' });
    window.Bus.emit('map:request', { action: 'unknown' });

    return {
      actions: window.__MapTestProbe.actions(),
      routeSnapshot,
      finalSnapshot: window.__MapTestProbe.snapshot()
    };
  });

  expect(result.actions).toEqual([
    { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 },
    { action: 'invalidate-size' },
    { action: 'focus-route' },
    { action: 'draw-route', mode: 'motorcycle', points: 2 },
    { action: 'draw-start-end' },
    { action: 'focus-camera' },
    { action: 'draw-condition-sections', sections: 1 },
    { action: 'focus-section', order: 2 }
  ]);
  expect(result.routeSnapshot.routeLayerCount).toBeGreaterThan(0);
  expect(result.routeSnapshot.startEndMarkerCount).toBe(2);
  expect(result.finalSnapshot.center[0]).toBeCloseTo(24.15, 2);
  expect(result.finalSnapshot.center[1]).toBeCloseTo(120.68, 2);
});
