import { expect, test } from '@playwright/test';

// MapMod is the mobile MapLibre map (#76 removed the Leaflet map). It only
// becomes ready when #map is visible, so these bus-seam checks run at a phone
// viewport. MapTiler tiles are stubbed so the map loads without network.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

async function openMobileMap(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://api.maptiler.com/**', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    headers: { 'access-control-allow-origin': '*' },
    body: TILE_PNG
  }));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus && window.MapMod && window.MapMod._ready && window.MapMod.map
  )), { timeout: 15000 }).toBe(true);
}

test('legacy map view commands flow through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await openMobileMap(page);

  const result = await page.evaluate(() => {
    const mapMod = window.MapMod;
    const map = mapMod.map;
    const originals = {
      easeTo: map.easeTo,
      invalidateSize: mapMod.invalidateSize,
      focusRouteNow: mapMod._focusRouteNow
    };
    const easeCalls = [];
    let invalidateCalls = 0;
    let focusRouteCalls = 0;

    map.easeTo = function(options) {
      easeCalls.push({ center: options.center, zoom: options.zoom });
      return map;
    };
    mapMod.invalidateSize = function() { invalidateCalls += 1; };
    mapMod._focusRouteNow = function() { focusRouteCalls += 1; };

    window.Bus.emit('map:request', { action: 'set-view', center: [24.1477, 120.6736], zoom: 11 });
    window.Bus.emit('map:request', { action: 'invalidate-size' });
    window.Bus.emit('map:request', { action: 'focus-route' });
    window.Bus.emit('map:request', { action: 'set-view', center: ['bad', 120], zoom: 9 });
    window.Bus.emit('map:request', { action: 'unknown' });

    map.easeTo = originals.easeTo;
    mapMod.invalidateSize = originals.invalidateSize;
    mapMod._focusRouteNow = originals.focusRouteNow;

    return { easeCalls, invalidateCalls, focusRouteCalls };
  });

  // MapLibre takes [lng, lat]; the bus payload is [lat, lng].
  expect(result.easeCalls).toHaveLength(1);
  expect(result.easeCalls[0].center[0]).toBeCloseTo(120.6736, 6);
  expect(result.easeCalls[0].center[1]).toBeCloseTo(24.1477, 6);
  expect(result.easeCalls[0].zoom).toBe(11);
  expect(result.invalidateCalls).toBe(1);
  expect(result.focusRouteCalls).toBe(1);
});

test('PWA route drawing command flows through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await openMobileMap(page);

  const calls = await page.evaluate(() => {
    const original = window.MapMod._drawRouteNow;
    const observed = [];
    window.MapMod._drawRouteNow = function(coords, mode) {
      observed.push([coords, mode]);
    };

    window.Bus.emit('map:request', {
      action: 'draw-route',
      coords: [[24.1, 120.6], [24.2, 120.7]],
      mode: 'motorcycle'
    });
    window.Bus.emit('map:request', { action: 'draw-route', coords: [[24.1, 120.6]], mode: 'car' });
    window.Bus.emit('map:request', { action: 'draw-route', coords: null, mode: 'car' });

    window.MapMod._drawRouteNow = original;
    return observed;
  });

  expect(calls).toEqual([
    [[[24.1, 120.6], [24.2, 120.7]], 'motorcycle']
  ]);
});

test('route-condition map commands flow through map:request bus events', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await openMobileMap(page);

  const result = await page.evaluate(() => {
    const mapMod = window.MapMod;
    const names = ['_drawStartEndNow', '_focusCamNow', '_drawConditionSectionsNow', '_focusSectionNow'];
    const originals = {};
    const observed = [];
    names.forEach(name => { originals[name] = mapMod[name]; });

    mapMod._drawStartEndNow = function(points) { observed.push(['draw-start-end', points]); };
    mapMod._focusCamNow = function(camera) { observed.push(['focus-camera', camera && camera.id]); };
    mapMod._drawConditionSectionsNow = function(sections) { observed.push(['draw-condition-sections', sections && sections.length]); };
    mapMod._focusSectionNow = function(order) { observed.push(['focus-section', order]); };

    // Payload keys exactly as route-conditions.js / pwa.js emit them.
    window.Bus.emit('map:request', { action: 'draw-start-end', points: [[24.1, 120.6], [24.2, 120.7]] });
    window.Bus.emit('map:request', { action: 'focus-camera', camera: { id: 'camera-1', lat: 24.1, lng: 120.6 } });
    window.Bus.emit('map:request', { action: 'draw-condition-sections', sections: [{ order: 1 }] });
    window.Bus.emit('map:request', { action: 'focus-section', order: 3 });
    window.Bus.emit('map:request', { action: 'focus-camera' });
    window.Bus.emit('map:request', { action: 'draw-condition-sections', sections: null });
    window.Bus.emit('map:request', { action: 'focus-section', order: 'bad' });
    const busCalls = observed.splice(0);

    // MapMod's own wrappers use `coords` / `cam`, and drawStartEnd(null) clears.
    mapMod.focusCam({ id: 'camera-2', lat: 24.3, lng: 120.8 });
    mapMod.drawStartEnd(null);
    const wrapperCalls = observed.splice(0);

    names.forEach(name => { mapMod[name] = originals[name]; });
    return { busCalls, wrapperCalls };
  });

  expect(result.busCalls).toEqual([
    ['draw-start-end', [[24.1, 120.6], [24.2, 120.7]]],
    ['focus-camera', 'camera-1'],
    ['draw-condition-sections', 1],
    ['focus-section', 3]
  ]);
  expect(result.wrapperCalls).toEqual([
    ['focus-camera', 'camera-2'],
    ['draw-start-end', []]
  ]);
});
