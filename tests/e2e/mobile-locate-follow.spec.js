import { expect, test } from '@playwright/test';

// Locate follow mode (phone map = MapMod; see desktop-map-overlay-request.spec.js for why this
// runs in the desktop project at a phone viewport).  Locate -> follow ON; any real user gesture
// -> follow OFF and the camera is never moved by position updates again; the dot keeps moving;
// pressing locate again recentres once and follows again.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;

test('locate follows until the user pans away; the dot keeps updating but the camera stays', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Deterministic geolocation emulation runs in Chromium.');
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
  await context.setGeolocation({ latitude: 24.1618, longitude: 120.6466, accuracy: 30 });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route('https://api.maptiler.com/**', route => route.fulfill({
    status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: TILE_PNG
  }));
  await page.addInitScript(() => localStorage.setItem('tw_pwa_install_dismissed_v1', '1'));
  await page.goto(WORKER);
  await expect.poll(() => page.evaluate(() => Boolean(window.MapMod && MapMod._ready && MapMod.map)), { timeout: 15000 }).toBe(true);

  const snap = () => page.evaluate(() => {
    const c = MapMod.map.getCenter();
    return { lat: c.lat, lng: c.lng, zoom: MapMod.map.getZoom(), dot: MapMod._userCenter && MapMod._userCenter.slice(), moving: MapMod.map.isMoving() };
  });
  const settled = () => expect.poll(async () => (await snap()).moving, { timeout: 5000 }).toBe(false);

  // 1. locate -> following (filled button), camera on the dot
  await page.locator('#js-loc').click();
  await expect(page.locator('#js-loc')).toHaveAttribute('data-follow', 'true');
  await expect.poll(async () => (await snap()).zoom, { timeout: 8000 }).toBeGreaterThanOrEqual(15);
  await settled();
  const located = await snap();
  expect(located.zoom).toBeGreaterThanOrEqual(15);
  expect(located.lat).toBeCloseTo(24.1618, 4);

  // 2. a real mouse drag is a user gesture -> follow OFF immediately
  await page.mouse.move(200, 420);
  await page.mouse.down();
  await page.mouse.move(200, 330, { steps: 8 });
  await page.mouse.move(120, 300, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#js-loc')).toHaveAttribute('data-follow', 'false');
  await expect(page.locator('#js-loc')).toHaveAttribute('aria-pressed', 'true'); // still locating, just not following
  await settled();
  const panned = await snap();
  expect(Math.abs(panned.lat - located.lat) + Math.abs(panned.lng - located.lng)).toBeGreaterThan(1e-4);

  // 3. position changes: the dot moves, the camera does not
  await context.setGeolocation({ latitude: 24.1700, longitude: 120.6550, accuracy: 12 });
  await expect.poll(async () => (await snap()).dot[0], { timeout: 8000 }).toBeCloseTo(24.17, 4);
  await page.waitForTimeout(1200);
  const after = await snap();
  expect(after.dot[1]).toBeCloseTo(120.655, 4);
  expect(after.lat).toBeCloseTo(panned.lat, 8);
  expect(after.lng).toBeCloseTo(panned.lng, 8);
  expect(after.zoom).toBeCloseTo(panned.zoom, 6);

  // 4. pressing locate again recentres once and follows again
  await page.locator('#js-loc').click();
  await expect(page.locator('#js-loc')).toHaveAttribute('data-follow', 'true');
  await expect.poll(async () => (await snap()).lat, { timeout: 8000 }).toBeCloseTo(24.17, 4);
  await settled();
  const back = await snap();
  expect(back.lat).toBeCloseTo(24.17, 4);
  expect(back.lng).toBeCloseTo(120.655, 4);

  // 5. following again: the next position update moves the camera with the dot
  await context.setGeolocation({ latitude: 24.1720, longitude: 120.6570, accuracy: 12 });
  await expect.poll(async () => (await snap()).lat, { timeout: 8000 }).toBeCloseTo(24.172, 4);
  await settled();

  // 6. a scroll / pinch zoom is a user gesture too (MapLibre sends no originalEvent for it)
  await page.mouse.move(200, 420);
  await page.mouse.wheel(0, 300);
  await expect(page.locator('#js-loc')).toHaveAttribute('data-follow', 'false');

  // 7. a plain tap on the map is not: follow survives a tap
  await page.locator('#js-loc').click();
  await expect(page.locator('#js-loc')).toHaveAttribute('data-follow', 'true');
  await settled();
  await page.mouse.click(200, 420);
  await page.waitForTimeout(600);
  await expect(page.locator('#js-loc')).toHaveAttribute('data-follow', 'true');
});
