import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

test('nearby and waypoint overlays flow through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(window.Bus && window.MapMod && window.MapMod.map && window.L))).toBe(true);

  const result = await page.evaluate(() => {
    const map = window.MapMod.map;
    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });

    window.Bus.emit('map:request', {
      action: 'nearby-overlay-upsert',
      center: [24.1477, 120.6736],
      radiusMeters: 5000
    });

    const marker = window.MapMod._nearbyMarker;
    const circle = window.MapMod._nearbyCircle;
    const markerLatLng = marker && marker.getLatLng();
    const firstRadius = circle && circle.getRadius();

    window.Bus.emit('map:request', { action: 'nearby-overlay-radius', radiusMeters: 8000 });
    const secondRadius = window.MapMod._nearbyCircle && window.MapMod._nearbyCircle.getRadius();

    const waypoint = window.L.marker([24.2, 120.7]).addTo(map);
    window.AppState.waypointMapMarkers = [waypoint];
    const waypointBeforeClear = map.hasLayer(waypoint);
    window.Bus.emit('map:request', { action: 'clear-waypoint-overlays' });
    const waypointAfterClear = map.hasLayer(waypoint);
    const waypointStateCount = window.AppState.waypointMapMarkers.length;

    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });
    const cleared = window.MapMod._nearbyMarker === null && window.MapMod._nearbyCircle === null;

    window.Bus.emit('map:request', {
      action: 'nearby-overlay-upsert',
      center: ['bad', 120.6736],
      radiusMeters: 3000
    });
    const invalidIgnored = window.MapMod._nearbyMarker === null && window.MapMod._nearbyCircle === null;

    return {
      markerCenter: markerLatLng ? [markerLatLng.lat, markerLatLng.lng] : null,
      firstRadius,
      secondRadius,
      waypointBeforeClear,
      waypointAfterClear,
      waypointStateCount,
      cleared,
      invalidIgnored
    };
  });

  expect(result.markerCenter).toEqual([24.1477, 120.6736]);
  expect(result.firstRadius).toBe(5000);
  expect(result.secondRadius).toBe(8000);
  expect(result.waypointBeforeClear).toBe(true);
  expect(result.waypointAfterClear).toBe(false);
  expect(result.waypointStateCount).toBe(0);
  expect(result.cleared).toBe(true);
  expect(result.invalidIgnored).toBe(true);
});
