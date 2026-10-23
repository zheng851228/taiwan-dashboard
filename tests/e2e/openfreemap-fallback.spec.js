import { test, expect } from './helpers/hermetic-map.js';
import { isDesktopViewport, waitForMapReady, mapRoot } from './helpers/map-probe.js';

// These tests assert provider requests. A controlling Service Worker can bypass
// Playwright routing, even for cross-origin requests it passes through.
// Service-worker behavior is covered separately by pwa-update.spec.js.
test.use({ serviceWorkers: 'block' });

async function readState(page) {
  return page.evaluate(desktop => {
    const r = desktop ? window.DesktopDashboardMod.getRenderer() : window.MapMod.renderer;
    const map = r.map;
    return {
      layers: map.getStyle().layers.map(l => ({ id: l.id, type: l.type, visibility: l.layout?.visibility || 'visible' })),
      base: map.getLayoutProperty('base', 'visibility'),
      light: map.getLayer('mobile-base-light') && map.getLayoutProperty('mobile-base-light', 'visibility'),
      source: map.getStyle().sources.ofm
    };
  }, isDesktopViewport(page));
}

async function stubOFM(page, requests) {
  await page.route('https://tiles.openfreemap.org/**', route => {
    requests.push(route.request().url());
    if (new URL(route.request().url()).pathname === '/planet') return route.fulfill({
      json: { tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/fixture/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14 },
      headers: { 'access-control-allow-origin': '*' }
    });
    // Zero bytes is a valid protobuf message with zero vector-tile layers.
    return route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0), headers: { 'access-control-allow-origin': '*' } });
  });
}

for (const light of [false, true]) {
  test(`MapTiler 403 switches to embedded OFM (${light ? 'light' : 'dark'})`, async ({ page }, testInfo) => {
    const requests = [];
    await stubOFM(page, requests);
    await page.addInitScript(light => localStorage.setItem('tw_theme', light ? 'light' : 'dark'), light);
    await page.route('https://api.maptiler.com/**', route => route.fulfill({ status: 403, body: 'Forbidden', headers: { 'access-control-allow-origin': '*' } }));
    await page.goto('/');
    await waitForMapReady(page);
    await expect.poll(async () => (await readState(page)).layers.some(l => l.id.startsWith('ofm-'))).toBe(true);
    const state = await readState(page);
    expect(state.base).toBe('none');
    if (!isDesktopViewport(page)) expect(state.light).toBe('none');
    const theme = light && !isDesktopViewport(page) ? 'positron' : 'dark';
    expect(state.layers.find(l => l.id === `ofm-${theme}-background`).visibility).toBe('visible');
    const lastOFM = Math.max(...state.layers.map((l, i) => l.id.startsWith('ofm-') ? i : -1));
    expect(state.layers.findIndex(l => l.id === 'desktop-route-core')).toBeGreaterThan(lastOFM);
    expect(state.layers.filter(l => l.id.startsWith('ofm-')).every(l => ['background', 'fill', 'line'].includes(l.type))).toBe(true);
    await expect(mapRoot(page).locator('.maplibregl-ctrl-attrib')).toContainText('OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
    await expect.poll(() => requests.filter(url => url.includes('/fixture/')).length).toBeGreaterThan(0);
    expect(requests.some(url => /styles|glyph|sprite/.test(url))).toBe(false);
    // Actual theme control must retain the fallback and never uncover MapTiler again.
    await page.locator('#js-theme').click();
    const after = await readState(page);
    expect(after.base).toBe('none');
    if (!isDesktopViewport(page)) {
      expect(after.light).toBe('none');
      expect(after.layers.find(l => l.id === `ofm-${light ? 'dark' : 'positron'}-background`).visibility).toBe('visible');
    }
    await page.screenshot({ path: testInfo.outputPath('fallback.png') });
  });
}

test('healthy MapTiler makes no OpenFreeMap requests, including after theme change', async ({ page }) => {
  const requests = [];
  await stubOFM(page, requests);
  await page.goto('/');
  await waitForMapReady(page);
  await page.locator('#js-theme').click();
  // Wait beyond the provider budget, proving the timeout does not spuriously trigger.
  await page.waitForTimeout(8500);
  expect((await readState(page)).source).toBeUndefined();
  expect(requests).toEqual([]);
});

test('a single 503 tile does not permanently switch a usable MapTiler base', async ({ page }) => {
  const requests = [];
  await stubOFM(page, requests);
  let failed = false;
  await page.route('https://api.maptiler.com/**', route => {
    if (failed) return route.fallback();
    failed = true;
    return route.fulfill({ status: 503, body: 'Unavailable', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/');
  await waitForMapReady(page);
  await page.waitForTimeout(8500);
  expect(failed).toBe(true);
  expect((await readState(page)).source).toBeUndefined();
  expect(requests).toEqual([]);
});

test('total 503 tile failure switches only after the eight-second budget', async ({ page }) => {
  const requests = [];
  await stubOFM(page, requests);
  await page.route('https://api.maptiler.com/**', route => route.fulfill({
    status: 503, body: 'Unavailable', headers: { 'access-control-allow-origin': '*' }
  }));
  await page.goto('/');
  await waitForMapReady(page);
  expect((await readState(page)).source).toBeUndefined();
  await expect.poll(async () => Boolean((await readState(page)).source), { timeout: 12000 }).toBe(true);
  expect((await readState(page)).base).toBe('none');
});
