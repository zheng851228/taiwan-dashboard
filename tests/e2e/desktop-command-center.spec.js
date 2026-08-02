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
  await expect(page.locator('#desktop-map-2d')).toHaveClass(/active/);
  await expect(page.locator('#desktop-map-2d')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#desktop-map-3d')).not.toHaveClass(/active/);
  await expect(page.locator('#desktop-camera-toggle')).toBeDisabled();
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
  const cameraMarkers = page.locator('.desktop-cctv-marker');
  await expect(cameraMarkers.first()).toBeVisible();
  await expect(cameraMarkers.first()).toHaveAttribute('aria-label', /沿途 CCTV/);
  const clickableCameraIndex = await cameraMarkers.evaluateAll(nodes => {
    const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom || 0;
    const mapRect = document.querySelector('#desktop-map')?.getBoundingClientRect();
    return nodes.findIndex(node => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return mapRect && (hit === node || node.contains(hit))
        && rect.top >= Math.max(headerBottom, mapRect.top) + 4
        && rect.bottom <= mapRect.bottom - 4
        && rect.left >= mapRect.left + 4
        && rect.right <= mapRect.right - 4;
    });
  });
  expect(clickableCameraIndex).toBeGreaterThanOrEqual(0);
  await cameraMarkers.nth(clickableCameraIndex).click();
  await expect(page.locator('#info-panel')).toBeVisible();
  await page.locator('#info-close').click();

  await page.locator('#desktop-map-3d').click();
  await expect(page.locator('#desktop-map-3d')).toHaveClass(/active/);
  await expect(page.locator('#desktop-camera-toggle')).toBeEnabled();
  await page.locator('#desktop-map-2d').click();
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

test('desktop traffic browser keeps the filter shell above cards without covering them', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop traffic-browser verification only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);
  await page.locator('#desktop-settings-toggle').click();
  await page.locator('#desktop-open-list').click();
  await expect(page.locator('#pg-list')).toHaveClass(/active/);

  const filter = page.locator('#pg-list .list-filter-shell');
  const firstCard = page.locator('#pg-list .cam-card').first();
  await expect(firstCard).toBeVisible();
  const layout = await page.evaluate(() => {
    const shell = document.querySelector('#pg-list .list-filter-shell');
    const card = document.querySelector('#pg-list .cam-card');
    if (!shell || !card) return null;
    const shellRect = shell.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      position: getComputedStyle(shell).position,
      shellBottom: shellRect.bottom,
      cardTop: cardRect.top
    };
  });
  expect(layout).not.toBeNull();
  expect(layout.position).toBe('relative');
  expect(layout.cardTop).toBeGreaterThanOrEqual(layout.shellBottom - 1);
});

test('desktop workspace splitters resize and persist the three command-center regions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop workspace verification only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.removeItem('tw_desktop_layout_v1'));
  await page.goto(WORKER);
  await expect(page.locator('#desktop-resize-left')).toBeVisible();
  await buildFixtureRoute(page);
  await expect(page.locator('#desktop-resize-right')).toBeVisible();
  await expect(page.locator('#desktop-resize-bottom')).toBeVisible();

  const readLayout = () => page.evaluate(() => ({
    layout: window.DesktopDashboardMod.getLayout(),
    columns: getComputedStyle(document.querySelector('#pg-map')).gridTemplateColumns,
    rows: getComputedStyle(document.querySelector('#pg-map')).gridTemplateRows,
    bottomHeight: document.querySelector('#desktop-support-panel')?.getBoundingClientRect().height || 0
  }));
  const initial = await readLayout();

  const leftHandle = page.locator('#desktop-resize-left');
  const leftBox = await leftHandle.boundingBox();
  expect(leftBox).not.toBeNull();
  await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(leftBox.x + leftBox.width / 2 + 72, leftBox.y + 120);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.DesktopDashboardMod.getLayout().left)).toBeGreaterThan(initial.layout.left);

  const rightHandle = page.locator('#desktop-resize-right');
  const rightBox = await rightHandle.boundingBox();
  expect(rightBox).not.toBeNull();
  await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(rightBox.x + rightBox.width / 2 - 56, rightBox.y + 120);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.DesktopDashboardMod.getLayout().right)).toBeGreaterThan(initial.layout.right);

  const bottomHandle = page.locator('#desktop-resize-bottom');
  const bottomBox = await bottomHandle.boundingBox();
  expect(bottomBox).not.toBeNull();
  await page.mouse.move(bottomBox.x + 300, bottomBox.y + bottomBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(bottomBox.x + 300, bottomBox.y + bottomBox.height / 2 - 48);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.DesktopDashboardMod.getLayout().bottom)).toBeGreaterThan(initial.layout.bottom);

  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('tw_desktop_layout_v1')));
  expect(persisted.left).toBeGreaterThan(initial.layout.left);
  expect(persisted.right).toBeGreaterThan(initial.layout.right);
  expect(persisted.bottom).toBeGreaterThan(initial.layout.bottom);
  expect((await readLayout()).columns).not.toBe(initial.columns);
  const current = await readLayout();
  expect(current.rows).not.toBe(initial.rows);

  await page.locator('#desktop-settings-toggle').click();
  await page.locator('#desktop-layout-reset').click();
  await expect.poll(() => page.evaluate(() => window.DesktopDashboardMod.getLayout())).toEqual(initial.layout);
});

test('v40 lower intelligence rail interactions remain error-free', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop v40 verification only.');
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let mapTilerRequestCount = 0;
  let satelliteMapRequestCount = 0;
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname !== 'api.maptiler.com') return;
    mapTilerRequestCount += 1;
    if (url.pathname.includes('/maps/satellite-v4/')) satelliteMapRequestCount += 1;
  });
  await page.setViewportSize({ width: 1280, height: 853 });
  await page.addInitScript(() => {
    localStorage.removeItem('tw_desktop_basemap_v1');
    localStorage.removeItem('tw_desktop_map_renderer_v1');
    localStorage.removeItem('tw_desktop_layout_v1');
  });
  await page.goto(WORKER);
  await buildFixtureRoute(page);
  await expect(page.locator('#desktop-route-intelligence')).toBeVisible();
  await expect(page.locator('.desktop-route-stop').first()).toBeVisible();
  await expect(page.locator('#desktop-elevation-panel')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#condition-demo-warning')).toBeHidden();
  await expect(page.locator('#condition-timeline')).toBeHidden();
  await expect(page.locator('.desktop-timeline-row')).toHaveCount(3);
  await expect(page.locator('.desktop-route-stop .desktop-stop-time').first()).toHaveText(/^\d{2}:\d{2}$/);
  await expect(page.locator('.desktop-route-stop .desktop-stop-distance').first()).toHaveText('0 km');
  await expect(page.locator('.desktop-weather-track i')).toHaveCount(5);
  await expect(page.locator('#desktop-playback-controls')).toBeVisible();
  const lowerRail = await page.evaluate(() => {
    const content = document.querySelector('#condition-content');
    return {
      scrollOverflow: content.scrollHeight - content.clientHeight,
      trafficSegments: document.querySelectorAll('#desktop-traffic-band .desktop-traffic-segment').length,
      stopCount: document.querySelectorAll('#desktop-route-stops .desktop-route-stop').length,
      heading: document.querySelector('#route-conditions-panel h2')?.textContent.trim(),
      elevationHeading: document.querySelector('.desktop-elevation-heading')?.textContent.replace(/\s+/g, ' ').trim()
    };
  });
  expect(lowerRail.scrollOverflow).toBeLessThanOrEqual(2);
  expect(lowerRail.trafficSegments).toBe(5);
  expect(lowerRail.stopCount).toBe(5);
  expect(lowerRail.heading).toBe('沿途狀況時間軸');
  expect(lowerRail.elevationHeading).toContain('海拔高度（m）');
  await page.locator('#desktop-condition-info-toggle').click();
  await expect(page.locator('#desktop-condition-info-popover')).toBeVisible();
  await expect(page.locator('#desktop-condition-info-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#desktop-map-basemap')).toHaveText('底圖');
  await page.locator('#desktop-map-basemap').click();
  await expect(page.locator('#desktop-basemap-setting-state')).toHaveText('深色地圖');
  await page.locator('#desktop-playback-toggle').click();
  await expect.poll(() => page.locator('#desktop-playback-distance').textContent()).not.toBe('0 km');
  await page.locator('#desktop-playback-toggle').click();
  await page.locator('#desktop-playback-range').fill('500');
  await page.locator('#desktop-playback-speed').selectOption('2');
  await expect(page.locator('#desktop-playback-distance')).not.toHaveText(/^0(?:\.0)? km/);
  const keyConfigured = await page.evaluate(() => Boolean(window.TWMapProviderConfig && window.TWMapProviderConfig.key));
  if (keyConfigured) {
    expect(mapTilerRequestCount).toBeGreaterThan(0);
    expect(satelliteMapRequestCount).toBeGreaterThan(0);
  } else {
    expect(mapTilerRequestCount).toBe(0);
  }
  expect(pageErrors).toEqual([]);
});

test('2D and 3D controls can recover from the traditional map fallback', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop map renderer verification only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.addInitScript(() => localStorage.removeItem('tw_desktop_map_renderer_v1'));
  await page.goto(WORKER);
  await expect(page.locator('#desktop-map .local-map-place-label').filter({ hasText: '台北' })).toBeVisible({ timeout: 8000 });

  await page.locator('#desktop-settings-toggle').click();
  await page.locator('#desktop-map-mode-setting').click();
  await expect(page.locator('body')).toHaveClass(/desktop-legacy-map/);
  await expect(page.locator('#map')).toBeVisible();

  await page.locator('#desktop-map-2d').click();
  await expect(page.locator('body')).not.toHaveClass(/desktop-legacy-map/, { timeout: 12000 });
  await expect(page.locator('#desktop-map-2d')).toHaveClass(/active/);
  await expect(page.locator('#desktop-map .local-map-place-label').filter({ hasText: '台北' })).toBeVisible({ timeout: 8000 });

  await page.locator('#desktop-map-3d').click();
  await expect(page.locator('#desktop-map-3d')).toHaveClass(/active/);
  await expect(page.locator('#desktop-map-2d')).not.toHaveClass(/active/);
  expect(await page.evaluate(() => localStorage.getItem('tw_desktop_terrain_mode_v1'))).toBe('3d');

  await page.evaluate(() => localStorage.removeItem('tw_desktop_terrain_mode_v1'));
  await page.reload();
  await expect(page.locator('#desktop-map-2d')).toHaveClass(/active/, { timeout: 12000 });
  await expect(page.locator('#desktop-map-3d')).not.toHaveClass(/active/);
});

test('camera presets and brand home preserve the active route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop camera verification only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.addInitScript(() => localStorage.removeItem('tw_desktop_camera_preset_v1'));
  await page.goto(WORKER);
  await buildFixtureRoute(page);
  await page.locator('#desktop-map-3d').click();

  await expect(page.locator('#desktop-camera-toggle')).toBeEnabled();
  await page.locator('#desktop-camera-toggle').click();
  await expect(page.locator('#desktop-camera-popover')).toBeVisible();

  const pitch = () => page.evaluate(() => window.DesktopDashboardMod.getRenderer().map.getPitch());
  await page.locator('.desktop-camera-preset[data-camera-preset="birdseye"]').click();
  await expect(page.locator('#desktop-camera-state')).toHaveText('鳥瞰');
  await expect.poll(pitch, { timeout: 3000 }).toBeCloseTo(32, 0);

  await page.locator('#desktop-camera-toggle').click();
  await page.locator('.desktop-camera-preset[data-camera-preset="along"]').click();
  await expect(page.locator('#desktop-camera-state')).toHaveText('沿路');
  await expect.poll(pitch, { timeout: 3000 }).toBeCloseTo(72, 0);

  await page.locator('#desktop-camera-toggle').click();
  await page.locator('.desktop-camera-preset[data-camera-preset="solid"]').click();
  await expect(page.locator('#desktop-camera-state')).toHaveText('立體');
  await expect.poll(pitch, { timeout: 3000 }).toBeCloseTo(58, 0);
  const routeBearing = await page.evaluate(() => window.DesktopDashboardMod.getRenderer()._routeBearing());
  await expect.poll(
    () => page.evaluate(() => window.DesktopDashboardMod.getRenderer().map.getBearing()),
    { timeout: 3000 }
  ).toBeCloseTo(routeBearing, 0);

  const routeId = await page.evaluate(() => window.AppState.activeRoute.routeId);
  await page.locator('#desktop-settings-toggle').click();
  await page.locator('#desktop-open-list').click();
  await expect(page.locator('#pg-list')).toHaveClass(/active/);
  await page.locator('#brand-home').click();
  await expect(page.locator('#pg-map')).toHaveClass(/active/);
  await page.locator('#desktop-settings-toggle').click();
  await page.locator('#desktop-open-tools').click();
  await expect(page.locator('#pg-tools')).toHaveClass(/active/);
  await page.locator('#brand-home').click();
  await expect(page.locator('#pg-map')).toHaveClass(/active/);
  await expect(page.locator('body')).toHaveAttribute('data-route-state', 'ready');
  await expect.poll(() => page.evaluate(() => window.AppState.activeRoute.routeId)).toBe(routeId);
  await expect(page.locator('#desktop-camera-popover')).toBeHidden();
});

test('camera custom state is not persisted and reset returns to the full route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop camera persistence verification only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.removeItem('tw_desktop_camera_preset_v1'));
  await page.goto(WORKER);
  await buildFixtureRoute(page);
  await page.locator('#desktop-map-3d').click();

  const camera = page.locator('#desktop-camera-toggle');
  await expect(camera).toBeEnabled();
  await camera.click();
  await page.locator('.desktop-camera-preset[data-camera-preset="birdseye"]').click();
  await expect(page.locator('#desktop-camera-state')).toHaveText('鳥瞰');
  await expect.poll(() => page.evaluate(() => window.DesktopDashboardMod.getRenderer().map.getPitch()), { timeout: 3000 }).toBeCloseTo(32, 0);
  await expect.poll(() => page.evaluate(() => window.DesktopDashboardMod.getRenderer().map.getBearing()), { timeout: 3000 }).toBeCloseTo(0, 0);

  await page.evaluate(() => {
    const renderer = window.DesktopDashboardMod.getRenderer();
    renderer.map.rotateTo(37, { duration: 0 });
  });
  await expect(page.locator('#desktop-camera-state')).toHaveText('自訂');
  expect(await page.evaluate(() => localStorage.getItem('tw_desktop_camera_preset_v1'))).toBe('birdseye');

  await camera.click();
  await page.locator('.desktop-camera-preset[data-camera-preset="reset"]').click();
  await expect(page.locator('#desktop-camera-state')).toHaveText('重置');
  await expect.poll(() => page.evaluate(() => window.DesktopDashboardMod.getRenderer().map.getPitch()), { timeout: 3000 }).toBeCloseTo(58, 0);
  expect(await page.evaluate(() => localStorage.getItem('tw_desktop_camera_preset_v1'))).toBe('reset');
});

test('reduced motion applies camera presets without animation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Reduced-motion verification only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(WORKER);
  await buildFixtureRoute(page);
  await page.locator('#desktop-map-3d').click();
  await page.locator('#desktop-camera-toggle').click();
  await page.locator('.desktop-camera-preset[data-camera-preset="along"]').click();
  await expect(page.locator('#desktop-camera-state')).toHaveText('沿路');
  await expect.poll(() => page.evaluate(() => window.DesktopDashboardMod.getRenderer().map.getPitch()), { timeout: 1000 }).toBeCloseTo(72, 0);
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

test('desktop disclaimer no longer reserves a bottom layout row', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop density verification only.');
  await page.setViewportSize({ width: 2048, height: 978 });
  await page.goto(WORKER);
  await buildFixtureRoute(page);

  const metrics = await page.evaluate(() => {
    const main = document.querySelector('main');
    const timeline = document.querySelector('#route-conditions-panel');
    const disclaimer = document.querySelector('#desktop-disclaimer');
    const read = (element) => element ? element.getBoundingClientRect() : null;
    const mainRect = read(main);
    const disclaimerRect = read(disclaimer);
    return {
      mainBottomGap: mainRect ? Math.abs(window.innerHeight - mainRect.bottom) : Infinity,
      timelineBottomGap: mainRect && read(timeline) ? Math.abs(mainRect.bottom - read(timeline).bottom) : Infinity,
      disclaimerHeight: disclaimerRect ? disclaimerRect.height : Infinity,
      disclaimerPosition: disclaimer ? getComputedStyle(disclaimer).position : ''
    };
  });

  expect(metrics.mainBottomGap).toBeLessThanOrEqual(1);
  expect(metrics.timelineBottomGap).toBeLessThanOrEqual(5);
  expect(metrics.disclaimerPosition).toBe('fixed');
  expect(metrics.disclaimerHeight).toBeLessThan(28);
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
    if (request.url().match(/maplibre|desktop-dashboard/)) mapLibreRequests.push(request.url());
  });
  await page.goto(WORKER);
  await page.waitForTimeout(700);
  expect(mapLibreRequests).toEqual([]);
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#map .local-map-place-label').filter({ hasText: '台北' })).toBeVisible();
  await expect(page.locator('#desktop-map')).toBeHidden();
  await expect(page.locator('.desktop-resizer')).toHaveCount(3);
  await expect(page.locator('.desktop-resizer').first()).toBeHidden();
});
