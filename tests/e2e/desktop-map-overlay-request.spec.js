import { expect, test } from '@playwright/test';

// MapMod is the mobile MapLibre map (#76 removed the Leaflet map); see
// desktop-map-request.spec.js for why this runs at a phone viewport.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

test('nearby and waypoint overlay lifecycle flows through map:request', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://api.maptiler.com/**', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    headers: { 'access-control-allow-origin': '*' },
    body: TILE_PNG
  }));
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus && window.MapMod && window.MapMod._ready && window.MapMod.map && window.AppState
  )), { timeout: 15000 }).toBe(true);

  const result = await page.evaluate(() => {
    const mapMod = window.MapMod;
    const map = mapMod.map;
    const layers = ['mobile-nearby-dot', 'mobile-nearby-line', 'mobile-nearby-fill'];
    const attached = () => ({
      source: Boolean(map.getSource('mobile-nearby')),
      layers: layers.every(id => Boolean(map.getLayer(id)))
    });

    // Record the radius each upsert actually draws, without changing behaviour.
    const originalUpsert = mapMod._nearbyUpsert;
    const radii = [];
    mapMod._nearbyUpsert = function(center, radiusMeters) {
      radii.push(radiusMeters);
      return originalUpsert.call(mapMod, center, radiusMeters);
    };

    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });
    window.Bus.emit('map:request', {
      action: 'nearby-overlay-upsert',
      center: [24.1477, 120.6736],
      radiusMeters: 5000
    });
    const first = {
      center: mapMod._nearbyCenter ? mapMod._nearbyCenter.slice() : null,
      ...attached(),
      marker: mapMod._nearbyMarker,
      circle: mapMod._nearbyCircle
    };

    window.Bus.emit('map:request', { action: 'nearby-overlay-radius', radiusMeters: 8000 });
    const afterRadius = attached();

    window.AppState.waypointMapMarkers = [{ id: 'waypoint-1' }];
    window.Bus.emit('map:request', { action: 'clear-waypoint-overlays' });
    const waypointStateCount = window.AppState.waypointMapMarkers.length;

    window.Bus.emit('map:request', { action: 'nearby-overlay-clear' });
    const cleared = { marker: mapMod._nearbyMarker, circle: mapMod._nearbyCircle, ...attached() };

    window.Bus.emit('map:request', {
      action: 'nearby-overlay-upsert',
      center: ['bad', 120.6736],
      radiusMeters: 3000
    });
    const invalid = { marker: mapMod._nearbyMarker, circle: mapMod._nearbyCircle, ...attached() };

    mapMod._nearbyUpsert = originalUpsert;
    return { first, radii, afterRadius, waypointStateCount, cleared, invalid };
  });

  expect(result.first.center[0]).toBeCloseTo(24.1477, 4);
  expect(result.first.center[1]).toBeCloseTo(120.6736, 4);
  expect(result.first.source).toBe(true);
  expect(result.first.layers).toBe(true);
  expect(result.first.marker).toBeTruthy();
  expect(result.first.circle).toBeTruthy();
  // 5000 from the upsert, then 8000 from the radius change; the invalid
  // upsert reaches the handler but must not draw anything.
  expect(result.radii.slice(0, 2)).toEqual([5000, 8000]);
  expect(result.afterRadius).toEqual({ source: true, layers: true });
  expect(result.waypointStateCount).toBe(0);
  expect(result.cleared).toEqual({ marker: null, circle: null, source: false, layers: false });
  expect(result.invalid).toEqual({ marker: null, circle: null, source: false, layers: false });
});
