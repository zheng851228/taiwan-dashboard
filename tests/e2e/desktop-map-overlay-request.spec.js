import { expect, test } from '@playwright/test';

test('nearby and waypoint overlay lifecycle flows through map:request', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus && window.MapMod && window.MapMod.map && window.L && window.AppState
  ))).toBe(true);

  const result = await page.evaluate(() => {
    const map = window.MapMod.map;

    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });
    window.Bus.emit('map:request', {
      action: 'nearby-overlay-upsert',
      center: [24.1477, 120.6736],
      radiusMeters: 5000
    });
    const firstLatLng = window.MapMod._nearbyMarker && window.MapMod._nearbyMarker.getLatLng();
    const first = {
      center: firstLatLng ? [firstLatLng.lat, firstLatLng.lng] : null,
      radius: window.MapMod._nearbyCircle ? window.MapMod._nearbyCircle.getRadius() : null,
      markerAttached: Boolean(window.MapMod._nearbyMarker && map.hasLayer(window.MapMod._nearbyMarker)),
      circleAttached: Boolean(window.MapMod._nearbyCircle && map.hasLayer(window.MapMod._nearbyCircle))
    };

    window.Bus.emit('map:request', { action: 'nearby-overlay-radius', radiusMeters: 8000 });
    const secondRadius = window.MapMod._nearbyCircle ? window.MapMod._nearbyCircle.getRadius() : null;

    const waypointMarker = window.L.marker([24.2, 120.7]).addTo(map);
    window.AppState.waypointMapMarkers = [waypointMarker];
    const waypointBefore = map.hasLayer(waypointMarker);
    window.Bus.emit('map:request', { action: 'clear-waypoint-overlays' });
    const waypointAfter = map.hasLayer(waypointMarker);
    const waypointStateCount = window.AppState.waypointMapMarkers.length;

    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });
    const cleared = {
      marker: window.MapMod._nearbyMarker,
      circle: window.MapMod._nearbyCircle
    };

    window.Bus.emit('map:request', {
      action: 'nearby-overlay-upsert',
      center: ['bad', 120.6736],
      radiusMeters: 3000
    });
    const invalid = {
      marker: window.MapMod._nearbyMarker,
      circle: window.MapMod._nearbyCircle
    };

    return { first, secondRadius, waypointBefore, waypointAfter, waypointStateCount, cleared, invalid };
  });

  expect(result.first.center[0]).toBeCloseTo(24.1477, 4);
  expect(result.first.center[1]).toBeCloseTo(120.6736, 4);
  expect(result.first.radius).toBe(5000);
  expect(result.first.markerAttached).toBe(true);
  expect(result.first.circleAttached).toBe(true);
  expect(result.secondRadius).toBe(8000);
  expect(result.waypointBefore).toBe(true);
  expect(result.waypointAfter).toBe(false);
  expect(result.waypointStateCount).toBe(0);
  expect(result.cleared).toEqual({ marker: null, circle: null });
  expect(result.invalid).toEqual({ marker: null, circle: null });
});
