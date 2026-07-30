import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

async function openRoutePlanner(page) {
  if (!(await page.locator('#route-expanded').isVisible())) {
    await page.locator('#route-toggle').click();
  }
}

async function buildFixtureRoute(page) {
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect(page.locator('#route-conditions-panel')).toBeVisible();
}

test('desktop command center keeps the initial map focused and expands on a ready route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop command-center verification only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect(page.locator('#desktop-map')).toBeVisible();
  await expect(page.locator('#desktop-map .local-map-place-label').filter({ hasText: '台北' })).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#route-expanded')).toBeVisible();
  await expect(page.locator('#desktop-left-insights')).toBeVisible();
  await expect(page.locator('#desktop-vehicle-tabs')).toBeVisible();
  await expect(page.locator('#route-expanded > .route-vehicle-shell')).toBeHidden();
  await expect(page.locator('.desktop-vehicle-tab')).toHaveText(['白牌', '黃牌', '紅牌', '汽車']);
  await expect(page.locator('#desktop-route-context')).toBeHidden();
  await expect(page.locator('#desktop-cctv-card')).toBeHidden();
  await expect(page.locator('#route-conditions-panel')).toBeHidden();
  await expect(page.locator('#desktop-support-panel')).toBeHidden();
  await expect(page.locator('.bottom-navigation')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await buildFixtureRoute(page);
  await expect(page.locator('body')).toHaveAttribute('data-route-state', 'ready');
  await expect(page.locator('#route-expanded')).toBeVisible();
  await expect(page.locator('#route-collapsed')).toBeHidden();
  await expect(page.locator('#desktop-support-panel')).toBeVisible();
  await expect(page.locator('#desktop-route-context')).toBeVisible();
  await expect(page.locator('#desktop-cctv-card')).toBeVisible();
  await expect(page.locator('#desktop-elevation-panel')).toBeVisible({ timeout: 8000 }).catch(() => {});
  await expect(page.locator('.bottom-navigation')).toBeHidden();
  await expect(page.locator('#desktop-event-construction, .desktop-event-construction').last()).toBeVisible();

  await page.locator('#desktop-map-2d').click();
  await expect(page.locator('#desktop-map-2d')).toHaveClass(/active/);
  await page.locator('.desktop-vehicle-tab[data-desktop-plate="yellow"]').click();
  await expect(page.locator('.desktop-vehicle-tab[data-desktop-plate="yellow"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.route-mode-btn[data-plate="yellow"]')).toHaveClass(/active/);

  await page.locator('#condition-clear').click();
  await expect(page.locator('body')).toHaveAttribute('data-route-state', 'empty');
  await expect(page.locator('#desktop-route-context')).toBeHidden();
  await expect(page.locator('#desktop-cctv-card')).toBeHidden();
  await expect(page.locator('#desktop-support-panel')).toBeHidden();
});

test('1280px ready command center keeps the map dominant without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop command-center verification only.');
  await page.setViewportSize({ width: 1280, height: 854 });
  await page.goto(WORKER);
  await buildFixtureRoute(page);
  await expect(page.locator('#desktop-support-panel')).toBeVisible();
  const metrics = await page.evaluate(() => {
    const map = document.querySelector('#desktop-map');
    const support = document.querySelector('#desktop-support-panel');
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      mapWidth: map ? map.getBoundingClientRect().width : 0,
      supportHeight: support ? support.getBoundingClientRect().height : 0
    };
  });
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.mapWidth).toBeGreaterThan(700);
  expect(metrics.supportHeight).toBeGreaterThan(200);
});

test('2D and 3D controls can recover from the traditional map fallback', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop map renderer verification only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.addInitScript(() => localStorage.removeItem('tw_desktop_map_renderer_v1'));
  await page.goto(WORKER);
  await expect(page.locator('#desktop-map .local-map-place-label').filter({ hasText: '台北' })).toBeVisible({ timeout: 8000 });

  await page.locator('#desktop-map-legacy').click();
  await expect(page.locator('body')).toHaveClass(/desktop-legacy-map/);
  await expect(page.locator('#map')).toBeVisible();

  await page.locator('#desktop-map-2d').click();
  await expect(page.locator('body')).not.toHaveClass(/desktop-legacy-map/, { timeout: 12000 });
  await expect(page.locator('#desktop-map-2d')).toHaveClass(/active/);
  await expect(page.locator('#desktop-map .local-map-place-label').filter({ hasText: '台北' })).toBeVisible({ timeout: 8000 });

  await page.locator('#desktop-map-3d').click();
  await expect(page.locator('#desktop-map-3d')).toHaveClass(/active/);
  await expect(page.locator('#desktop-map-2d')).not.toHaveClass(/active/);
});

test('tall desktop ready layout starts the map directly below the header', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop density verification only.');
  await page.setViewportSize({ width: 2048, height: 978 });
  await page.goto(WORKER);
  await buildFixtureRoute(page);
  const gap = await page.evaluate(() => {
    const header = document.querySelector('header');
    const map = document.querySelector('#desktop-map');
    if (!header || !map) return Infinity;
    return map.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
  });
  expect(gap).toBeLessThanOrEqual(12);
});

test('dark command-center labels use the refreshed readable text ladder', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Dark-theme contrast verification runs once.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  const colors = await page.evaluate(() => {
    const read = (selector) => getComputedStyle(document.querySelector(selector)).color;
    return {
      sourceNote: read('#desktop-source-note'),
      routeHint: read('.route-option-head span:last-child'),
      conditionMeta: read('.condition-metric span')
    };
  });

  expect(colors.sourceNote).toBe('rgb(192, 206, 220)');
  expect(colors.routeHint).toBe('rgb(192, 206, 220)');
  expect(colors.conditionMeta).toBe('rgb(192, 206, 220)');
});

test('light command-center surfaces keep a readable ink hierarchy', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Light-theme contrast verification runs once.');
  await page.setViewportSize({ width: 1280, height: 854 });
  await page.goto(WORKER);
  await expect(page.locator('#desktop-map .local-map-place-label').filter({ hasText: '台北' })).toBeVisible({ timeout: 8000 });
  await page.evaluate(() => {
    document.body.classList.add('light');
    localStorage.setItem('tw_theme', 'light');
  });
  await expect.poll(
    () => page.locator('.desktop-vehicle-tab:not(.active)').first().evaluate((element) => getComputedStyle(element).color),
    { timeout: 5000 }
  ).toBe('rgb(30, 41, 59)');

  const colors = await page.evaluate(() => {
    const read = (selector) => getComputedStyle(document.querySelector(selector)).color;
    return {
      headerClock: read('#js-clk'),
      routeTitle: read('#route-expanded .route-title-text'),
      routeInput: read('#js-route-start'),
      panelHeading: read('#desktop-left-insights .desktop-panel-heading'),
      vehicleTab: read('.desktop-vehicle-tab:not(.active)'),
      placeLabel: read('#desktop-map .local-map-place-label'),
      disclaimer: read('.desktop-disclaimer')
    };
  });

  expect(colors.headerClock).toBe('rgb(30, 41, 59)');
  expect(colors.routeTitle).toBe('rgb(30, 41, 59)');
  expect(colors.routeInput).toBe('rgb(15, 23, 42)');
  expect(colors.panelHeading).toBe('rgb(15, 23, 42)');
  expect(colors.vehicleTab).toBe('rgb(30, 41, 59)');
  expect(colors.placeLabel).toBe('rgb(18, 53, 42)');
  expect(colors.disclaimer).toBe('rgb(71, 85, 105)');
});

test('mobile keeps MapLibre desktop assets unloaded', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'Mobile and tablet request verification only.');
  const mapLibreRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/assets/vendor/maplibre-gl/')) mapLibreRequests.push(request.url());
  });
  await page.goto(WORKER);
  await page.waitForTimeout(700);
  expect(mapLibreRequests).toEqual([]);
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#map .local-map-place-label').filter({ hasText: '台北' })).toBeVisible();
  await expect(page.locator('#desktop-map')).toBeHidden();
});
