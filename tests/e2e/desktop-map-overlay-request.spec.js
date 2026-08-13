import { expect, test } from '@playwright/test';

const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}&e2e=1`;

test('nearby and waypoint overlays flow through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus
      && window.__MapTestProbe
      && window.__MapTestProbe.snapshot().ready
  ))).toBe(true);

  const result = await page.evaluate(() => {
    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });
    window.Bus.emit('map:request', {
      action: 'nearby-overlay-upsert',
      center: [24.1477, 120.6736],
      radiusMeters: 5000
    });
    const first = window.__MapTestProbe.snapshot();

    window.Bus.emit('map:request', { action: 'nearby-overlay-radius', radiusMeters: 8000 });
    const second = window.__MapTestProbe.snapshot();

    window.__MapTestProbe.createWaypointMarker([24.2, 120.7]);
    const waypointBefore = window.__MapTestProbe.snapshot();
    window.Bus.emit('map:request', { action: 'clear-waypoint-overlays' });
    const waypointAfter = window.__MapTestProbe.snapshot();

    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });
    const cleared = window.__MapTestProbe.snapshot();

    window.Bus.emit('map:request', {
      action: 'nearby-overlay-upsert',
      center: ['bad', 120.6736],
      radiusMeters: 3000
    });
    const invalid = window.__MapTestProbe.snapshot();

    return { first, second, waypointBefore, waypointAfter, cleared, invalid };
  });

  expect(result.first.nearbyMarkerCenter).toEqual([24.1477, 120.6736]);
  expect(result.first.nearbyRadius).toBe(5000);
  expect(result.second.nearbyRadius).toBe(8000);
  expect(result.waypointBefore.testWaypointAttached).toBe(true);
  expect(result.waypointAfter.testWaypointAttached).toBe(false);
  expect(result.waypointAfter.waypointStateCount).toBe(0);
  expect(result.cleared.nearbyCleared).toBe(true);
  expect(result.invalid.nearbyCleared).toBe(true);
});
