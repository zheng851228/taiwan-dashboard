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

test('preserves ordered Google Maps waypoints when importing a route', async ({ page }) => {
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
  await page.locator('#js-route-btn').click();
  await expect(page.locator('.condition-section').first()).toBeVisible();
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

test('keeps the PWA shell offline without serving stale API data', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Offline service-worker verification runs in Chromium.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole('heading', { name: '\u74b0\u5cf6\u8def\u6cc1\u6307\u63ee\u4e2d\u5fc3' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '\u74b0\u5cf6\u8def\u6cc1\u6307\u63ee\u4e2d\u5fc3' })).toBeVisible();
  const apiResult = await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:8787/v2/weather');
    return { status: response.status, body: await response.json() };
  });
  expect(apiResult.status).toBe(503);
  expect(apiResult.body.status).toBe('error');
  expect(apiResult.body.message).toContain('\u96e2\u7dda');
});
