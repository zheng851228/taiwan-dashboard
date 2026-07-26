import { expect, test } from '@playwright/test';

test('plans a validated motorcycle route and renders ordered conditions', async ({ page }) => {
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/?worker=http://127.0.0.1:8787');
  await expect(page.locator('#map')).toBeVisible();

  await page.locator('#route-toggle').click();
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('[data-plate="yellow"]').click();
  await page.locator('#js-route-btn').click();

  await expect(page.locator('#route-conditions-panel')).toBeVisible();
  await expect(page.locator('#condition-demo-warning')).toBeVisible();
  await expect(page.locator('.condition-section').first()).toBeVisible();
  await expect(page.locator('#condition-validation')).toContainText('安全路線');
  await expect(page.locator('#condition-coverage')).not.toHaveText('--');
  await expect(page.locator('#condition-loading')).toBeHidden();
  await expect(page.locator('#route-camera-strip')).not.toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('keeps traffic unknown semantics and safety guidance visible', async ({ page }) => {
  await page.goto('/?worker=http://127.0.0.1:8787');
  await expect(page.getByText('資料不足', { exact: true })).toBeVisible();
  await page.locator('#nav-tools').click();
  await expect(page.getByText(/灰色路段代表資料不足/)).toBeVisible();
});

test('keeps the mobile route planner focused on the active task', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 640, 'Mobile density verification only.');

  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.locator('#route-toggle').click();

  await expect(page.locator('#route-expanded')).toBeVisible();
  await expect(page.locator('#ride-status-card')).toBeHidden();
  await expect(page.locator('.map-legend-item').filter({ hasText: '資料不足' })).toBeVisible();
  await expect(page.locator('.route-title-kicker')).toBeHidden();

  const plannerBox = await page.locator('#route-expanded').boundingBox();
  const navBox = await page.locator('.bottom-navigation').boundingBox();
  expect(plannerBox?.height).toBeLessThanOrEqual(390);
  expect(navBox?.height).toBeLessThanOrEqual(70);
});

test('keeps the mobile ride status compact after collapsing conditions', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 640, 'Mobile density verification only.');

  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.locator('#route-toggle').click();
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect(page.locator('#route-conditions-panel')).toBeVisible();
  await page.locator('#condition-toggle').click();

  const status = page.locator('#ride-status-card');
  await expect(status).toBeVisible();
  const statusBox = await status.boundingBox();
  const metricBoxes = await page.locator('.ride-metric-card').evaluateAll((cards) =>
    cards.map((card) => card.getBoundingClientRect().toJSON())
  );

  expect(statusBox?.height).toBeLessThanOrEqual(150);
  expect(new Set(metricBoxes.map((box) => Math.round(box.y))).size).toBe(1);
});

test('keeps the light theme and map tiles consistent after reload', async ({ page }) => {
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.locator('#js-theme').click();
  await expect(page.locator('body')).toHaveClass(/light/);
  await expect.poll(() => page.evaluate(() => MapMod.tileLayer && MapMod.tileLayer._url)).toBe(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  );
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/light/);
  await expect.poll(() => page.evaluate(() => MapMod.tileLayer && MapMod.tileLayer._url)).toBe(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  );
});

test('shows useful route suggestions from the first character without remote autocomplete', async ({ page }) => {
  let geocodeRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/v2/geocode') geocodeRequests += 1;
  });
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.locator('#route-toggle').click();

  const start = page.locator('#js-route-start');
  await start.fill('台');
  const box = page.locator('#suggest-start');
  await expect(box).toBeVisible();
  await expect(start).toHaveAttribute('aria-expanded', 'true');
  await expect(box.locator('.suggest-item')).toHaveCount(6);
  await expect(box.locator('.suggest-item').first()).toContainText('台北');
  expect((await box.boundingBox())?.height).toBeGreaterThan(0);

  await start.press('ArrowDown');
  await start.press('Enter');
  await expect(start).toHaveValue('台北');
  await expect(start).toHaveAttribute('aria-expanded', 'false');

  await start.fill('信義');
  await expect(box.locator('.suggest-item').first()).toContainText('信義區');
  await box.locator('.suggest-item').first().click();
  await expect(start).toHaveValue('信義區');
  expect(await start.evaluate((input) => input.dataset.routePoint || '')).toBe('');

  await start.fill('淡水');
  await box.locator('.suggest-item').first().click();
  await expect(start).toHaveValue('淡水');
  expect(await start.evaluate((input) => input.dataset.routePoint)).toBe('25.1676,121.445');

  await start.fill('台北101');
  await expect(box).toBeHidden();
  expect(await start.evaluate((input) => input.dataset.routePoint || '')).toBe('');
  expect(geocodeRequests).toBe(0);
});

test('preserves an unsupported pasted route and always clears its loading state', async ({ page }) => {
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.locator('#route-toggle').click();

  const importInput = page.locator('#js-gmaps-url');
  await importInput.fill('這不是路線連結');
  await page.locator('#js-gmaps-parse').click();
  await expect(importInput).toHaveValue('這不是路線連結');
  await expect(page.locator('#js-gmaps-status')).toBeHidden();

  const collapsedInput = page.locator('#route-paste-input');
  await collapsedInput.evaluate((input) => {
    const clipboard = new DataTransfer();
    clipboard.setData('text', '仍然不是路線連結');
    input.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard
    }));
  });
  await expect(collapsedInput).toHaveValue('仍然不是路線連結');
  await expect(page.locator('#js-route-status')).toHaveText('');
});

test('keeps selected place labels while routing with their local coordinates', async ({ page }) => {
  let geocodeRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/v2/geocode') geocodeRequests += 1;
  });
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.locator('#route-toggle').click();

  const start = page.locator('#js-route-start');
  await start.fill('台中市政');
  await page.locator('#suggest-start .suggest-item').filter({ hasText: '台中市政府' }).click();
  await expect(start).toHaveValue('台中市政府');

  const end = page.locator('#js-route-end');
  await end.fill('奇');
  await page.locator('#suggest-end .suggest-item').filter({ hasText: '奇美博物館' }).click();
  await expect(end).toHaveValue('奇美博物館');

  const routeRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/v2/routes'
  );
  await page.locator('#js-route-btn').click();
  const routeRequest = await routeRequestPromise;
  const body = routeRequest.postDataJSON();
  expect(body.locations).toMatchObject([
    { lat: 24.1618, lng: 120.6466 },
    { lat: 22.9346, lng: 120.226 }
  ]);
  await expect(page.locator('#route-conditions-panel')).toBeVisible();
  expect(geocodeRequests).toBe(0);
});

test('keeps a cleared route empty when an older conditions request finishes', async ({ page }) => {
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => {
    window.__releaseConditions = null;
    AppServices.loadRouteConditions = function() {
      return new Promise((resolve) => {
        window.__releaseConditions = function() {
          resolve({
            status: 'ok',
            data: { overall: {}, sections: [] },
            updatedAt: new Date().toISOString()
          });
        };
      });
    };
  });
  await page.locator('#route-toggle').click();
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect.poll(() => page.evaluate(() => typeof window.__releaseConditions)).toBe('function');

  await page.evaluate(() => RouteMod.clear());
  await page.evaluate(() => window.__releaseConditions());
  await page.waitForTimeout(100);

  const clearedState = await page.evaluate(() => ({
    routeAllPoints: AppState.routeAllPoints,
    routeConditions: AppState.routeConditions,
    startEndMarkers: MapMod.startEndMarkers.length
  }));
  expect(clearedState).toEqual({
    routeAllPoints: [],
    routeConditions: null,
    startEndMarkers: 0
  });
  await expect(page.locator('#route-conditions-panel')).toBeHidden();
});

test('does not restore a route whose analysis finishes after it was cleared', async ({ page }) => {
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => {
    window.__releaseRouteAnalysis = null;
    AppServices.createRoute = function() {
      return new Promise((resolve) => {
        window.__releaseRouteAnalysis = function() {
          resolve({ status: 'ok', data: {} });
        };
      });
    };
  });
  await page.locator('#route-toggle').click();
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect.poll(() => page.evaluate(() => typeof window.__releaseRouteAnalysis)).toBe('function');

  await page.evaluate(() => RouteMod.clear());
  await page.evaluate(() => window.__releaseRouteAnalysis());
  await page.waitForTimeout(100);

  const clearedState = await page.evaluate(() => ({
    activeRoute: AppState.activeRoute,
    routeAllPoints: AppState.routeAllPoints,
    routeActive: RouteMod.active,
    analyzing: RouteMod.analyzing,
    routeLayer: Boolean(MapMod.routeLayer)
  }));
  expect(clearedState).toEqual({
    activeRoute: null,
    routeAllPoints: [],
    routeActive: false,
    analyzing: false,
    routeLayer: false
  });
});

test('preserves ordered Google Maps waypoints when importing a route', async ({ page }) => {
  let routeRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/v2/routes') routeRequests += 1;
  });
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.locator('#route-toggle').click();
  await page.locator('#js-gmaps-url').fill(
    'https://www.google.com/maps/dir/25.0478,121.5170/24.9500,121.6200/24.7570,121.7530'
  );
  await page.locator('#js-gmaps-parse').click();
  await expect(page.locator('#js-route-start')).toHaveValue('25.0478,121.5170');
  await expect(page.locator('#js-route-end')).toHaveValue('24.7570,121.7530');
  await expect(page.locator('.wp-input')).toHaveCount(1);
  await expect(page.locator('.wp-input')).toHaveValue('24.9500,121.6200');
  await expect(page.locator('.condition-section').first()).toBeVisible();
  expect(routeRequests).toBe(1);
  const route = await page.evaluate(() => AppState.activeRoute);
  expect(route.locations).toHaveLength(3);
  expect(route.distanceKm).toBeGreaterThan(40);

  const googleLink = page.locator('#nav-google');
  await expect(googleLink).toHaveAttribute('target', '_blank');
  await expect(googleLink).toHaveAttribute('rel', /noopener/);
  await expect(googleLink).toHaveAttribute('aria-disabled', 'false');
  const googleUrl = await googleLink.getAttribute('href');
  const googleParams = new URL(googleUrl).searchParams;
  expect(googleParams.get('api')).toBe('1');
  expect(googleParams.get('dir_action')).toBe('navigate');
  expect(googleParams.get('travelmode')).toBe('two-wheeler');
  expect(googleParams.get('waypoints')).toBe('24.950000,121.620000');

  const appleLink = page.locator('#nav-apple');
  await expect(appleLink).toHaveAttribute('target', '_blank');
  await expect(appleLink).toHaveAttribute('rel', /noopener/);
  await expect(appleLink).toHaveAttribute(
    'href',
    /saddr=25\.047800%2C121\.517000&daddr=24\.950000%2C121\.620000/
  );
  await appleLink.click();
  await expect(page.locator('.apple-leg-button')).toHaveCount(2);
  await expect(page.locator('.apple-leg-button').first()).toHaveAttribute(
    'href',
    /saddr=25\.047800%2C121\.517000&daddr=24\.950000%2C121\.620000/
  );
});

test('keeps a saved camera after reload', async ({ page }) => {
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.locator('#nav-list').click();
  const firstCard = page.locator('.cam-card').first();
  await expect(firstCard).toBeVisible();
  const cameraId = await firstCard.getAttribute('data-id');
  await firstCard.locator('.card-favorite-btn').click();
  await expect.poll(async () => page.evaluate(() => {
    return JSON.parse(localStorage.getItem('tw_favorites_v2') || '[]').length;
  })).toBe(1);

  await page.reload();
  await page.locator('#nav-tools').click();
  await expect(page.locator(`#favorites-tools-list [data-open-favorite="${cameraId}"]`)).toBeVisible();
});

test('keeps all large camera result sets reachable through progressive loading', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Synthetic large-list verification runs once.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await expect.poll(() => page.evaluate(() => Data.allCams().length)).toBeGreaterThan(0);
  await page.evaluate(() => {
    const source = Data.allCams()[0];
    const cameras = Array.from({ length: 205 }, (_, index) => ({
      ...source,
      id: `synthetic-${index}`,
      name: `測試攝影機 ${index}`,
      searchText: `測試攝影機 ${index}`
    }));
    Data.allCams = () => cameras;
    ListMod.visibleLimit = ListMod.PAGE_SIZE;
    ListMod.render();
  });
  await page.locator('#nav-list').click();

  await expect(page.locator('.cam-card')).toHaveCount(200);
  await expect(page.locator('.list-load-more')).toContainText('200 / 205');
  await page.locator('.list-load-more').click();
  await expect(page.locator('.cam-card')).toHaveCount(205);
  await expect(page.locator('.list-load-more')).toHaveCount(0);
});

test('shows iPhone Safari install guidance once and keeps a fixed install entry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'iPhone Safari install guidance verification only.');
  await page.addInitScript(() => localStorage.removeItem('tw_pwa_install_dismissed_v1'));
  await page.goto('/?worker=http://127.0.0.1:8787');

  const sheet = page.locator('#pwa-install-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('加入主畫面');
  await page.locator('#pwa-install-done').click();
  await expect(sheet).toBeHidden();
  await page.reload();
  await expect(sheet).toBeHidden();

  await page.locator('#nav-tools').click();
  await expect(page.locator('#pwa-install-open')).toBeVisible();
});

test('uses foreground location only after the location button is pressed', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Deterministic permission verification runs in Chromium.');
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
  await context.setGeolocation({ latitude: 24.1618, longitude: 120.6466, accuracy: 18 });
  await page.goto('/?worker=http://127.0.0.1:8787');
  await expect(page.locator('#js-route-start')).toHaveValue('');
  await page.locator('#js-loc').click();
  await expect(page.locator('#js-route-start')).toHaveValue('24.161800,120.646600');
});

test('keeps manual route entry available when location is denied', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Deterministic denial verification runs in Chromium.');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(_success, error) {
          error({ code: 1 });
        }
      }
    });
  });
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.locator('#js-loc').click();
  await expect(page.locator('#toast')).toContainText('請允許位置權限');
  await page.locator('#route-toggle').click();
  await page.locator('#js-route-start').fill('台中市政府');
  await expect(page.locator('#js-route-start')).toHaveValue('台中市政府');
});

test('keeps the PWA shell offline without serving stale API data', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Offline service-worker verification runs in Chromium.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.locator('#route-toggle').click();
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect(page.locator('#route-conditions-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem('tw_last_route_snapshot_v1') || 'null');
    return snapshot?.route?.validation?.status;
  })).toBe('safe');
  await page.reload();
  await expect(page.getByRole('heading', { name: '\u74b0\u5cf6\u8def\u6cc1\u6307\u63ee\u4e2d\u5fc3' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '\u74b0\u5cf6\u8def\u6cc1\u6307\u63ee\u4e2d\u5fc3' })).toBeVisible();
  await expect(page.locator('#pwa-network-banner')).toBeVisible();
  await expect(page.locator('#route-summary')).toContainText('離線快照');
  await expect(page.locator('#js-route-status')).toContainText('即時資料暫停更新');
  await expect.poll(() => page.evaluate(() =>
    Array.isArray(MapMod.routeLayer)
      && MapMod.routeLayer.length === 3
      && MapMod.routeLayer.every((layer) => MapMod.map.hasLayer(layer))
  )).toBe(true);
  const apiResult = await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:8787/v2/weather');
    return { status: response.status, body: await response.json() };
  });
  expect(apiResult.status).toBe(503);
  expect(apiResult.body.status).toBe('error');
  expect(apiResult.body.message).toContain('\u96e2\u7dda');
});
