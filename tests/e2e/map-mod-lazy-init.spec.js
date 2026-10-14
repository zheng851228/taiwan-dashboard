import { expect, test } from '@playwright/test';
import { waitForMapReady } from './helpers/map-probe.js';

// MapMod owns the #map surface, which is display:none (0x0) at >=1200px. It must
// not build a second MapLibre renderer/WebGL canvas there, but it must build one
// as soon as #map is in use (phone widths, or the viewport later shrinking).
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

async function stubTiles(page) {
  await page.route('https://api.maptiler.com/**', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    headers: { 'access-control-allow-origin': '*' },
    body: TILE_PNG
  }));
}

const canvasCount = page => page.locator('canvas.maplibregl-canvas').count();

test('desktop builds only the desktop MapLibre canvas and keeps the MapMod queue bounded', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop viewport verification only.');
  await stubTiles(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await waitForMapReady(page);

  expect(await canvasCount(page)).toBe(1);
  await expect(page.locator('#desktop-map canvas.maplibregl-canvas')).toHaveCount(1);
  await expect(page.locator('#map canvas')).toHaveCount(0);
  const idle = await page.evaluate(() => ({
    renderer: window.MapMod.renderer,
    map: window.MapMod.map,
    ready: window.MapMod._ready,
    started: window.MapMod._rendererStarted
  }));
  expect(idle).toEqual({ renderer: null, map: null, ready: false, started: false });

  // The settings row no longer advertises the removed "traditional map" (Leaflet).
  await expect(page.locator('#desktop-map-mode-setting')).not.toContainText('傳統');
  await expect(page.locator('#desktop-map-mode-setting')).toContainText('重新載入地圖');
  await expect(page.locator('#desktop-map-mode-state')).toHaveText(/^(2D 地圖|3D 地形)$/);

  // Requests are not dropped, but a long desktop session must not grow the queue:
  // newer requests of the same action supersede older ones.
  const queued = await page.evaluate(() => {
    for (let i = 0; i < 500; i++) {
      window.Bus.emit('map:request', { action: 'set-view', center: [23 + i / 1000, 121], zoom: 9 });
      window.Bus.emit('map:request', { action: 'invalidate-size' });
    }
    window.Bus.emit('map:request', { action: 'set-view', center: [24.5, 121.5], zoom: 12 });
    return window.MapMod._pending.map(request => request.action + ':' + (request.center ? request.center[0] : ''));
  });
  // (the app itself may have queued a few other single actions such as clear-cameras).
  expect(queued.length).toBeLessThan(10);
  expect(queued.filter(entry => entry.startsWith('set-view:'))).toEqual(['set-view:24.5']);
  expect(queued.filter(entry => entry.startsWith('invalidate-size:'))).toHaveLength(1);
});

test('shrinking a desktop viewport below 1200px lazily builds the MapMod map and replays queued requests', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop viewport verification only.');
  await stubTiles(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await waitForMapReady(page);
  expect(await page.evaluate(() => window.MapMod._rendererStarted)).toBe(false);

  await page.evaluate(() => window.Bus.emit('map:request', { action: 'set-view', center: [24.5, 121.5], zoom: 12 }));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => Boolean(window.MapMod._ready && window.MapMod.map)), { timeout: 15000 }).toBe(true);
  const after = await page.evaluate(() => ({
    pending: window.MapMod._pending.length,
    target: window.MapMod.map.getCenter()
  }));
  expect(after.pending).toBe(0);
  // The queued set-view was replayed (easeTo is animated, so wait for it to settle).
  await expect.poll(() => page.evaluate(() => Math.abs(window.MapMod.map.getCenter().lat - 24.5) < 0.05), { timeout: 10000 }).toBe(true);
  // The desktop renderer is torn down below 1200px, leaving exactly the MapMod canvas.
  await expect.poll(canvasCount.bind(null, page)).toBe(1);
});

test('phone builds exactly one MapLibre canvas and it becomes ready', async ({ page }) => {
  await stubTiles(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(window.MapMod && window.MapMod._ready && window.MapMod.map)), { timeout: 15000 }).toBe(true);
  expect(await canvasCount(page)).toBe(1);
  await expect(page.locator('#map canvas.maplibregl-canvas')).toHaveCount(1);
  expect(await page.evaluate(() => typeof window.DesktopDashboardMod)).toBe('undefined');
});
