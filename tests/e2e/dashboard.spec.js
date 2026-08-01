import { expect, test } from '@playwright/test';

async function expandConditionsIfCollapsed(page) {
  const toggle = page.locator('#condition-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

async function openRoutePlanner(page) {
  const expanded = page.locator('#route-expanded');
  if (!(await expanded.isVisible())) await page.locator('#route-toggle').click();
}

async function expectMapReady(page) {
  const desktopMap = page.locator('#desktop-map');
  if (await desktopMap.isVisible()) return;
  await expect(page.locator('#map')).toBeVisible();
}

async function expectEventMarker(page, kind) {
  if ((page.viewportSize()?.width || 0) >= 1200) {
    await expect(page.locator('.desktop-event-' + kind)).toBeVisible();
  } else {
    await expect(page.locator('.route-incident-pin.road-event-' + kind)).toBeVisible();
  }
}

async function openTools(page) {
  if (await page.locator('#desktop-map').isVisible()) {
    await page.locator('#desktop-settings-toggle').click();
    await page.locator('#desktop-open-tools').click();
  } else {
    await page.locator('#nav-tools').click();
  }
}

async function openList(page) {
  if (await page.locator('#desktop-map').isVisible()) {
    await page.locator('#desktop-settings-toggle').click();
    await page.locator('#desktop-open-list').click();
  } else {
    await page.locator('#nav-list').click();
  }
}

async function openMap(page) {
  await page.evaluate(() => NavMod.go('map'));
}

test('ignores an arbitrary Worker override and keeps the production origin', async ({ page }) => {
  await page.goto('/?worker=https://evil.example/collect');
  await expect.poll(() => page.evaluate(() => Config.WORKER_BASE)).toBe(
    'https://taiwan-dashboard-api-production.lucky851228.workers.dev'
  );
  await expect(page.locator('#route-collapsed:visible, #route-expanded:visible')).toBeVisible();
});

test('plans a validated motorcycle route and renders ordered conditions', async ({ page }) => {
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/?worker=http://127.0.0.1:8787');
  await expectMapReady(page);

  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  // Desktop keeps the single plate selector in the command header; mobile
  // keeps it inside the expanded route form.
  const desktopYellow = page.locator('.desktop-vehicle-tab[data-desktop-plate="yellow"]');
  if (await desktopYellow.isVisible()) {
    await desktopYellow.click();
  } else {
    await page.locator('.route-mode-btn[data-plate="yellow"]').click();
  }
  await page.locator('#js-route-btn').click();

  await expect(page.locator('#route-conditions-panel')).toBeVisible();
  await expandConditionsIfCollapsed(page);
  const desktopMode = await page.locator('#desktop-map').isVisible();
  if (desktopMode) {
    await expect(page.locator('#condition-demo-warning')).toBeHidden();
    await expect(page.locator('.condition-section').first()).toBeHidden();
    await expect(page.locator('#desktop-route-intelligence')).toBeVisible();
  } else {
    await expect(page.locator('#condition-demo-warning')).toBeVisible();
    await expect(page.locator('.condition-section').first()).toBeVisible();
  }
  await expect(page.locator('#condition-validation')).toContainText('安全路線');
  await expect(page.locator('#condition-coverage')).not.toHaveText('--');
  await expect(page.locator('#condition-loading')).toBeHidden();
  await expect(page.locator('#route-camera-strip')).not.toBeVisible();
  const constructionEvent = page.locator(
    '.condition-road-event[data-event-kind="construction"][data-event-impact="controlled"]'
  );
  if (desktopMode) await expect(constructionEvent).toBeHidden();
  else await expect(constructionEvent).toBeVisible();
  await expect(constructionEvent).toContainText('施工');
  await expect(constructionEvent).toContainText('交通管制');
  if (desktopMode) await expect(page.locator('.condition-section.has-road-event[data-event-kind="construction"]')).toBeHidden();
  else await expect(page.locator('.condition-section.has-road-event[data-event-kind="construction"]')).toBeVisible();
  await expectEventMarker(page, 'construction');
  await expect(page.locator('#condition-incidents')).toContainText('1處·1件');
  if (await page.locator('#desktop-map').isVisible()) {
    await expect(page.locator('.desktop-event-construction')).toBeVisible();
  } else {
    await expect(page.locator('#map-legend-event-count')).toContainText('狀況 1');
  }
  await expect(page.locator('#condition-event-coverage')).toContainText('事件來源未回報涵蓋範圍');
  expect(await page.evaluate(() => (
    MapMod.routeSectionLayers.length === AppState.routeConditions.sections.length * 2
  ))).toBe(true);
  expect(await page.evaluate(() => {
    const cue = MapMod.routeIncidentLayers.find((layer) => layer._roadEventLocationCue);
    return {
      layers: MapMod.routeIncidentLayers.length,
      kind: cue?._roadEventKind,
      impact: cue?._roadEventImpact,
      color: cue?.options?.color,
      dashArray: cue?.options?.dashArray || null,
      points: cue?.getLatLngs?.().length || 0
    };
  })).toEqual({
    layers: 2,
    kind: 'construction',
    impact: 'controlled',
    color: '#8b5cf6',
    dashArray: null,
    points: expect.any(Number)
  });
  expect(await page.evaluate(() => (
    MapMod.routeIncidentLayers.find((layer) => layer._roadEventLocationCue).getLatLngs().length
  ))).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => ({
    partial: window.getRoadEventPresentation({
      kind: 'accident',
      severity: 1
    }).impact,
    semanticEmpty: window.getRoadEventPresentation({
      kind: 'construction',
      blockedLanes: '無占用車道'
    }).impact
  }))).toEqual({
    partial: 'lane_closure',
    semanticEmpty: 'unknown'
  });
  await page.locator('#condition-clear').click();
  await expect(page.locator('#map-legend-event-item')).not.toHaveClass(/has-events/);
  await expect(page.locator('#route-conditions-panel')).toBeHidden();
  expect(await page.evaluate(() => ({
    eventLayers: MapMod.routeIncidentLayers.length,
    eventMarkers: MapMod.routeIncidentMarkers.length
  }))).toEqual({ eventLayers: 0, eventMarkers: 0 });
  expect(browserErrors.filter((message) => !/Failed to load resource.*404/.test(message))).toEqual([]);
});

test('keeps coordinate-free road events visible without inventing a precise map segment', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Synthetic event-location verification runs once.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => {
    const originalLoad = AppServices.loadRouteConditions;
    AppServices.loadRouteConditions = async (...args) => {
      const payload = await originalLoad(...args);
      const section = payload.data.sections.find((item) => item.incidents?.length);
      const incident = section.incidents[0];
      incident.lat = null;
      incident.lng = null;
      incident.locationApproximate = true;
      return payload;
    };
  });
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();

  const event = page.locator('.condition-road-event[data-event-location="approximate"]');
  await expect(event).toBeHidden();
  await expect(event).toContainText('位置未提供');
  await expect(page.locator('.condition-alert[data-event-location="approximate"]')).toContainText('位置未提供');
  const eventSectionOrder = await event.locator('xpath=ancestor::article[contains(@class,"condition-section")]').getAttribute('data-order');
  await page.locator(`.desktop-route-stop[data-section-order="${eventSectionOrder}"]`).click();
  await expect(page.locator('#desktop-context-alerts')).toContainText('位置未提供');
  await expect(page.locator('#condition-incidents')).toContainText('未定位·1件');
  await expect(page.locator('.condition-section.has-road-event')).toHaveCount(0);
  await expect(page.locator('.route-incident-pin')).toHaveCount(0);
  expect(await page.evaluate(() => MapMod.routeIncidentLayers.length)).toBe(0);
});

test('keeps separate official event locations as separate map markers', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Synthetic multi-location verification runs once.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => {
    const originalLoad = AppServices.loadRouteConditions;
    AppServices.loadRouteConditions = async (...args) => {
      const payload = await originalLoad(...args);
      const section = payload.data.sections.find((item) => item.incidents?.length);
      const original = section.incidents[0];
      section.incidents.push({
        ...original,
        id: 'second-location',
        canonicalId: 'tdx:highway:second-location',
        title: '另一處事故',
        kind: 'accident',
        status: 'scheduled',
        lat: Number(original.lat) + 0.002,
        lng: Number(original.lng) + 0.002
      });
      return payload;
    };
  });
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();

  await expect(page.locator('.route-incident-pin')).toHaveCount(2);
  await expect(page.locator('#condition-incidents')).toContainText('1處·2件');
  await expect(page.locator('.condition-road-event')).toHaveCount(2);
  expect(await page.evaluate(() => (
    MapMod.routeIncidentLayers.filter((layer) => layer._roadEventLocationCue).length
  ))).toBe(2);
  expect(await page.evaluate(() => (
    MapMod.routeIncidentLayers
      .filter((layer) => layer._roadEventLocationCue)
      .map((layer) => ({
        kind: layer._roadEventKind,
        status: layer._roadEventStatus,
        dashArray: layer.options.dashArray || null
      }))
  ))).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'construction', dashArray: null }),
    expect.objectContaining({ kind: 'accident', status: 'scheduled', dashArray: '10 8' })
  ]));
});

test('removes old event colors before drawing a replacement route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Map layer lifecycle verification runs once.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expectEventMarker(page, 'construction');

  expect(await page.evaluate(() => MapMod.routeIncidentLayers.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => {
    MapMod.drawRoute([
      [25.0478, 121.5170],
      [25.0350, 121.5400]
    ], 'motorcycle');
    return {
      routeLayers: Array.isArray(MapMod.routeLayer) ? MapMod.routeLayer.length : 0,
      eventLayers: MapMod.routeIncidentLayers.length,
      eventMarkers: MapMod.routeIncidentMarkers.length,
      weatherMarkers: MapMod.routeWeatherMarkers.length
    };
  })).toEqual({
    routeLayers: 3,
    eventLayers: 0,
    eventMarkers: 0,
    weatherMarkers: 0
  });
});

test('keeps traffic unknown semantics and safety guidance visible', async ({ page }) => {
  await page.goto('/?worker=http://127.0.0.1:8787');
  if (await page.locator('#desktop-map').isVisible()) {
    await expect(page.locator('#desktop-source-note')).toContainText('資料不足');
  } else {
    await expect(page.getByText('資料不足', { exact: true })).toBeVisible();
  }
  if (await page.locator('#desktop-map').isVisible()) {
    await page.locator('#desktop-settings-toggle').click();
    await page.locator('#desktop-open-tools').click();
  } else {
    await page.locator('#nav-tools').click();
  }
  await expect(page.getByText(/灰色路段代表資料不足/)).toBeVisible();
});

test('distinguishes a checked route with no incidents from unavailable event sources', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Synthetic coverage semantics run once.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => {
    const originalLoad = AppServices.loadRouteConditions;
    AppServices.loadRouteConditions = async (...args) => {
      const payload = await originalLoad(...args);
      payload.data.sections.forEach((section) => {
        section.incidents = [];
      });
      payload.data.overall.incidentSections = 0;
      payload.data.incidentCoverage = {
        requestedScopes: ['highway:live', 'highway:scheduled', 'freeway:live'],
        readyScopes: ['highway:live', 'highway:scheduled', 'freeway:live'],
        failedScopes: [],
        unsupportedScopes: ['freeway:scheduled'],
        notRequestedScopes: ['city']
      };
      return payload;
    };
  });
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await page.locator('#condition-toggle').click();

  await expect(page.locator('#condition-collapsed-summary')).toHaveText('沿途未發現狀況');
  await expect(page.locator('#condition-collapsed-summary')).not.toContainText('未回報');
  await expect(page.locator('#condition-incidents')).toHaveText('0 處');
  await expect(page.locator('#condition-event-coverage')).toContainText('高速公路即時');
  await expect(page.locator('#condition-event-status')).toContainText('在已回報來源中');
});

test('keeps legacy Worker event failures partial and unknown', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Legacy Worker compatibility semantics run once.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => {
    const originalLoad = AppServices.loadRouteConditions;
    AppServices.loadRouteConditions = async (...args) => {
      const payload = await originalLoad(...args);
      payload.status = 'ok';
      payload.data.dataMode = 'live';
      payload.data.issues = ['TDX: road events unavailable'];
      delete payload.data.incidentCoverage;
      payload.data.sections.forEach((section) => {
        section.incidents = [];
      });
      payload.data.overall.incidentSections = 0;
      return payload;
    };
  });
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();

  await expect(page.locator('#condition-source-badge')).toHaveText('部分即時');
  await expect(page.locator('#condition-event-coverage')).toContainText('事件來源未回報涵蓋範圍');
  await expect(page.locator('#condition-event-status')).toContainText('未將缺少資料視為「沿途無事件」');
  await expect(page.locator('#condition-event-status')).not.toContainText('沿途未配對到道路事件');
  await expect(page.locator('#condition-incidents')).toHaveText('未回報');
  await expect(page.locator('#condition-collapsed-summary')).toHaveText('事件來源未回報');
});

test('keeps missing legacy coverage partial even without explicit issues', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Missing legacy coverage semantics run once.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => {
    const originalLoad = AppServices.loadRouteConditions;
    AppServices.loadRouteConditions = async (...args) => {
      const payload = await originalLoad(...args);
      payload.status = 'ok';
      payload.data.dataMode = 'live';
      payload.data.issues = [];
      delete payload.data.incidentCoverage;
      payload.data.sections.forEach((section) => {
        section.incidents = [];
      });
      payload.data.overall.incidentSections = 0;
      return payload;
    };
  });
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();

  await expect(page.locator('#condition-source-badge')).toHaveText('部分即時');
  await expect(page.locator('#condition-event-coverage')).toContainText('事件來源未回報涵蓋範圍');
  await expect(page.locator('#condition-event-status')).not.toContainText('沿途未配對到道路事件');
  await expect(page.locator('#condition-incidents')).toHaveText('未回報');
  await expect(page.locator('#condition-collapsed-summary')).toHaveText('事件來源未回報');
});

test('does not claim no incidents when every reported event scope failed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Failed event-scope semantics run once.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => {
    const originalLoad = AppServices.loadRouteConditions;
    AppServices.loadRouteConditions = async (...args) => {
      const payload = await originalLoad(...args);
      payload.status = 'ok';
      payload.data.dataMode = 'live';
      payload.data.issues = [];
      payload.data.incidentCoverage = {
        requestedScopes: ['highway:live', 'highway:scheduled', 'freeway:live'],
        readyScopes: [],
        failedScopes: ['highway:live', 'highway:scheduled', 'freeway:live'],
        unsupportedScopes: ['freeway:scheduled'],
        notRequestedScopes: ['city']
      };
      payload.data.sections.forEach((section) => {
        section.incidents = [];
      });
      payload.data.overall.incidentSections = 0;
      return payload;
    };
  });
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();

  await expect(page.locator('#condition-source-badge')).toHaveText('部分即時');
  await expect(page.locator('#condition-event-coverage')).toContainText('道路事件來源目前無法取得');
  await expect(page.locator('#condition-event-status')).not.toContainText('沿途未配對到道路事件');
  await expect(page.locator('#condition-incidents')).toHaveText('未回報');
  await expect(page.locator('#condition-collapsed-summary')).toHaveText('事件來源未回報');
});

test('marks a zero incident count as partially unknown when some event scopes failed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Partial event-scope semantics run once.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => {
    const originalLoad = AppServices.loadRouteConditions;
    AppServices.loadRouteConditions = async (...args) => {
      const payload = await originalLoad(...args);
      payload.status = 'ok';
      payload.data.dataMode = 'live';
      payload.data.issues = [];
      payload.data.incidentCoverage = {
        requestedScopes: ['highway:live', 'highway:scheduled', 'freeway:live'],
        readyScopes: ['highway:live'],
        failedScopes: ['highway:scheduled', 'freeway:live'],
        unsupportedScopes: ['freeway:scheduled'],
        notRequestedScopes: ['city']
      };
      payload.data.sections.forEach((section) => {
        section.incidents = [];
      });
      payload.data.overall.incidentSections = 0;
      return payload;
    };
  });
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();

  await expect(page.locator('#condition-source-badge')).toHaveText('部分即時');
  await expect(page.locator('#condition-incidents')).toHaveText('部分未知');
  await expect(page.locator('#condition-event-coverage')).toContainText('暫時失效');
  await expect(page.locator('#condition-collapsed-summary')).toHaveText('部分事件來源未回報');
  await expect(page.locator('#condition-event-status')).toContainText('在已回報來源中');
});

test('keeps the mobile route planner focused on the active task', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 640, 'Mobile density verification only.');

  await page.goto('/?worker=http://127.0.0.1:8787');
  await openRoutePlanner(page);

  await expect(page.locator('#route-expanded')).toBeVisible();
  await expect(page.locator('#ride-status-card')).toBeHidden();
  await expect(page.locator('.map-legend-item').filter({ hasText: '資料不足' })).toBeVisible();
  await expect(page.locator('.route-title-kicker')).toBeHidden();

  const plannerBox = await page.locator('#route-expanded').boundingBox();
  const navBox = await page.locator('.bottom-navigation').boundingBox();
  expect(plannerBox?.height).toBeLessThanOrEqual(390);
  expect(navBox?.height).toBeLessThanOrEqual(70);
});

test('keeps the fresh mobile screen focused on route planning', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 640, 'Mobile first-screen verification only.');

  await page.goto('/?worker=http://127.0.0.1:8787');
  await expect(page.locator('body')).toHaveAttribute('data-route-state', 'empty');
  await expect(page.locator('#route-collapsed')).toBeVisible();
  await expect(page.locator('#ride-status-card')).toBeHidden();
  await expect(page.locator('#route-conditions-panel')).toBeHidden();
  await expect(page.locator('#route-camera-strip')).toBeHidden();
  await expect(page.locator('#route-toggle')).toHaveText('輸入起終點');
  await expect(page.locator('#js-gmaps-parse')).toHaveText('解析路線');
  await expect(page.locator('#js-route-btn')).toContainText('建立安全路線');
  await expect(page.locator('.bottom-navigation .nav-it').nth(0)).toContainText('規劃');
  await expect(page.locator('.bottom-navigation .nav-it').nth(1)).toContainText('路況');
  await expect(page.locator('.bottom-navigation .nav-it').nth(2)).toContainText('工具');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('lets users optionally hide and restore the top clock and route banner', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('tw_ui_clock_hidden_v1');
    localStorage.removeItem('tw_ui_route_banner_hidden_v1');
  });
  await page.goto('/?worker=http://127.0.0.1:8787');

  await expect(page.locator('#js-clock-wrap')).toBeVisible();
  await page.locator('#js-clock-hide').click();
  await expect(page.locator('#js-clock-wrap')).toBeHidden();

  await openTools(page);
  await expect(page.locator('#js-clock-setting')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#js-clock-setting-state')).toHaveText('已隱藏');
  await page.locator('#js-clock-setting').click();
  await expect(page.locator('#js-clock-wrap')).toBeVisible();

  if ((page.viewportSize()?.width || 0) >= 1200) {
    await page.locator('#desktop-settings-toggle').click();
    await expect(page.locator('#desktop-banner-setting')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#desktop-banner-setting').click();
    await expect(page.locator('#desktop-banner-setting')).toHaveAttribute('aria-pressed', 'true');
    return;
  }

  await openMap(page);
  await page.evaluate(() => {
    const banner = document.querySelector('#js-route-banner');
    banner?.classList.remove('hidden');
    banner?.classList.add('flex');
  });
  await expect(page.locator('#js-route-banner')).toBeVisible();
  await page.locator('#js-rb-hide').click();
  await expect(page.locator('#js-route-banner')).toBeHidden();

  await openTools(page);
  await expect(page.locator('#js-route-banner-setting')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#js-route-banner-setting').click();
  await openMap(page);
  await page.evaluate(() => {
    const banner = document.querySelector('#js-route-banner');
    banner?.classList.remove('hidden');
    banner?.classList.add('flex');
  });
  await expect(page.locator('#js-route-banner')).toBeVisible();
});

test('makes tool empty states actionable without changing the three-page navigation', async ({ page }) => {
  await page.goto('/?worker=http://127.0.0.1:8787');
  await openTools(page);

  const startRoute = page.locator('#ride-checklist [data-route-action="start-route"]');
  await expect(startRoute).toBeVisible();
  await startRoute.click();
  await expect(page.locator('#pg-map')).toHaveClass(/active/);
  await expect(page.locator('#route-expanded')).toBeVisible();
  await expect(page.locator('#js-route-start')).toBeFocused();

  await openTools(page);
  await page.locator('#favorites-tools-list [data-route-action="browse-cameras"]').click();
  await expect(page.locator('#pg-list')).toHaveClass(/active/);
  await expect(page.locator('#js-search')).toBeFocused();
});

test('mobile logo returns from tools without clearing the active route', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 640, 'Mobile logo verification only.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect(page.locator('#route-conditions-panel')).toBeVisible();
  const routeId = await page.evaluate(() => AppState.activeRoute.routeId);
  await openTools(page);
  await page.locator('#brand-home').click();
  await expect(page.locator('#pg-map')).toHaveClass(/active/);
  await expect(page.locator('body')).toHaveAttribute('data-route-state', 'ready');
  await expect.poll(() => page.evaluate(() => AppState.activeRoute.routeId)).toBe(routeId);
});

test('keeps the completed mobile route map-first with compact controls', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 640, 'Mobile density verification only.');

  await page.addInitScript(() => localStorage.setItem('tw_pwa_install_dismissed_v1', '1'));
  await page.goto('/?worker=http://127.0.0.1:8787');
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect(page.locator('#route-conditions-panel')).toBeVisible();
  await expect(page.locator('#condition-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#route-toggle')).toHaveText('調整');
  await page.evaluate(() => {
    document.querySelector('#pwa-update-banner')?.classList.remove('hidden');
  });
  await expect(page.locator('#condition-collapsed-summary')).toContainText('狀況 1處');
  await expect(page.locator('.condition-road-event')).toBeHidden();

  const status = page.locator('#ride-status-card');
  await expect(status).toBeHidden();
  await expect(page.locator('#js-route-status')).toBeHidden();
  await expect(page.locator('#js-route-banner')).toBeHidden();
  const [routeBox, conditionsBox, navBox] = await Promise.all([
    page.locator('#route-collapsed').boundingBox(),
    page.locator('#route-conditions-panel').boundingBox(),
    page.locator('.bottom-navigation').boundingBox()
  ]);
  expect(routeBox?.height).toBeLessThanOrEqual(48);
  expect(conditionsBox?.height).toBeLessThanOrEqual(52);
  expect(
    routeBox && conditionsBox && conditionsBox.y - (routeBox.y + routeBox.height)
  ).toBeGreaterThanOrEqual(350);
  expect(navBox && conditionsBox && conditionsBox.y + conditionsBox.height <= navBox.y).toBe(true);

  await page.locator('#condition-toggle').click();
  await expect(page.locator('#condition-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.condition-road-event[data-event-kind="construction"]')).toBeVisible();
  await expect(status).toBeHidden();
  await page.locator('#condition-clear').click();
  await expect(page.locator('body')).toHaveAttribute('data-route-state', 'empty');
  await expect(status).toBeHidden();
});

test('keeps collapsed route actions and summary inside a short 320px screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Small-viewport geometry runs once.');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => localStorage.setItem('tw_pwa_install_dismissed_v1', '1'));
  await page.goto('/?worker=http://127.0.0.1:8787');
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();

  await expect(page.locator('#condition-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#condition-collapsed-summary')).toBeVisible();
  await expect(page.locator('#condition-refresh')).toBeHidden();
  const [panelBox, headBox, clearBox, toggleBox] = await Promise.all([
    page.locator('#route-conditions-panel').boundingBox(),
    page.locator('.condition-panel-head').boundingBox(),
    page.locator('#condition-clear').boundingBox(),
    page.locator('#condition-toggle').boundingBox()
  ]);
  expect(panelBox && headBox && headBox.y + headBox.height <= panelBox.y + panelBox.height + 1).toBe(true);
  expect(panelBox && clearBox && clearBox.y + clearBox.height <= panelBox.y + panelBox.height + 1).toBe(true);
  expect(panelBox && toggleBox && toggleBox.y + toggleBox.height <= panelBox.y + panelBox.height + 1).toBe(true);
});

test('surfaces a conditions refresh failure even when the mobile panel was collapsed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'Collapsed failure visibility verification runs on iPhone.');
  await page.addInitScript(() => localStorage.setItem('tw_pwa_install_dismissed_v1', '1'));
  await page.goto('/?worker=http://127.0.0.1:8787');
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect(page.locator('#route-conditions-panel')).toBeVisible();
  await expect(page.locator('#condition-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => {
    AppServices.loadRouteConditions = () => Promise.reject(new Error('測試更新失敗'));
    RouteConditionsMod.refresh();
  });

  await expect(page.locator('#route-conditions-panel')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('#condition-error')).toBeVisible();
  await expect(page.locator('#condition-error')).toContainText('測試更新失敗');
  await expect(page.locator('#condition-source-badge')).toHaveText('更新失敗');
  await expect(page.locator('#condition-toggle')).toHaveAttribute('aria-expanded', 'true');
});

test('turns a hanging conditions request into an actionable timeout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'Conditions timeout UX runs on iPhone.');
  await page.addInitScript(() => localStorage.setItem('tw_pwa_install_dismissed_v1', '1'));
  await page.goto('/?worker=http://127.0.0.1:8787');
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect(page.locator('#route-conditions-panel')).toBeVisible();
  await page.evaluate(() => {
    Config.CONDITIONS_TIMEOUT_MS = 40;
    const originalFetch = window.fetch;
    window.fetch = (input, options) => String(input).includes('/conditions')
      ? new Promise(() => {})
      : originalFetch(input, options);
    RouteConditionsMod.refresh();
  });

  await expect(page.locator('#condition-error')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#condition-error')).toContainText('逾時');
  await expect(page.locator('#condition-source-badge')).toHaveText('更新失敗');
  await expect(page.locator('#condition-event-status')).toContainText('目前不是即時資料');
});

test('keeps the light theme and map tiles consistent after reload', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) >= 1200, 'Desktop MapLibre uses its own raster style.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.locator('#js-theme').click();
  await expect(page.locator('body')).toHaveClass(/light/);
  await expect.poll(() => page.evaluate(() => MapMod.tileLayer && MapMod.tileLayer._url)).toBe(
    'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
  );
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/light/);
  await expect.poll(() => page.evaluate(() => MapMod.tileLayer && MapMod.tileLayer._url)).toBe(
    'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
  );
});

test('shows useful route suggestions from the first character without remote autocomplete', async ({ page }) => {
  let geocodeRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/v2/geocode') geocodeRequests += 1;
  });
  await page.goto('/?worker=http://127.0.0.1:8787');
  await openRoutePlanner(page);

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
  await openRoutePlanner(page);

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
  await openRoutePlanner(page);

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
  await openRoutePlanner(page);
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
  await openRoutePlanner(page);
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
  await openRoutePlanner(page);
  await page.locator('#js-gmaps-url').fill(
    'https://www.google.com/maps/dir/25.0478,121.5170/24.9500,121.6200/24.7570,121.7530'
  );
  await page.locator('#js-gmaps-parse').click();
  await expect(page.locator('#js-route-start')).toHaveValue('25.0478,121.5170');
  await expect(page.locator('#js-route-end')).toHaveValue('24.7570,121.7530');
  await expect(page.locator('.wp-input')).toHaveCount(1);
  await expect(page.locator('.wp-input')).toHaveValue('24.9500,121.6200');
  await expandConditionsIfCollapsed(page);
  if (await page.locator('#desktop-map').isVisible()) {
    await expect(page.locator('.condition-section').first()).toBeHidden();
    await expect(page.locator('#desktop-route-intelligence')).toBeVisible();
  } else {
    await expect(page.locator('.condition-section').first()).toBeVisible();
  }
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
  if (await page.locator('#desktop-map').isVisible()) {
    await page.locator('#desktop-condition-info-toggle').click();
    await page.locator('#desktop-nav-apple').click();
  } else {
    await appleLink.click();
  }
  await expect(page.locator('.apple-leg-button')).toHaveCount(2);
  await expect(page.locator('.apple-leg-button').first()).toHaveAttribute(
    'href',
    /saddr=25\.047800%2C121\.517000&daddr=24\.950000%2C121\.620000/
  );
});

test('keeps a saved camera after reload', async ({ page }) => {
  await page.goto('/?worker=http://127.0.0.1:8787');
  await openList(page);
  const firstCard = page.locator('.cam-card').first();
  await expect(firstCard).toBeVisible();
  const cameraId = await firstCard.getAttribute('data-id');
  await firstCard.locator('.card-favorite-btn').click();
  await expect.poll(async () => page.evaluate(() => {
    return JSON.parse(localStorage.getItem('tw_favorites_v2') || '[]').length;
  })).toBe(1);

  await page.reload();
  await openTools(page);
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
  await openList(page);

  await expect(page.locator('.cam-card')).toHaveCount(200);
  await expect(page.locator('.list-load-more')).toContainText('200 / 205');
  await page.locator('.list-load-more').click();
  await expect(page.locator('.cam-card')).toHaveCount(205);
  await expect(page.locator('.list-load-more')).toHaveCount(0);
});

test('does not interrupt first load and keeps a fixed iPhone install entry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'iPhone Safari install guidance verification only.');
  await page.addInitScript(() => {
    if (sessionStorage.getItem('pwa-test-initialized')) return;
    localStorage.removeItem('tw_pwa_install_dismissed_v1');
    localStorage.removeItem('tw_pwa_install_prompted_v2');
    sessionStorage.setItem('pwa-test-initialized', '1');
  });
  await page.goto('/?worker=http://127.0.0.1:8787');

  const sheet = page.locator('#pwa-install-sheet');
  await expect(page.locator('#pwa-install-nudge')).toBeHidden();
  await expect(sheet).toBeHidden();

  await page.locator('#nav-tools').click();
  await expect(page.locator('#pwa-install-open')).toBeVisible();
  await page.locator('#pwa-install-open').click();
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('加入主畫面');
  await page.locator('#pwa-install-done').click();
  await expect(sheet).toBeHidden();
});

test('shows one non-blocking install nudge after the first live safe route', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'iPhone Safari install guidance verification only.');
  await page.addInitScript(() => {
    if (sessionStorage.getItem('pwa-live-test-initialized')) return;
    localStorage.removeItem('tw_pwa_install_dismissed_v1');
    localStorage.removeItem('tw_pwa_install_prompted_v2');
    sessionStorage.setItem('pwa-live-test-initialized', '1');
  });
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => {
    const originalLoad = AppServices.loadRouteConditions;
    AppServices.loadRouteConditions = async (...args) => {
      const payload = await originalLoad(...args);
      payload.data = { ...payload.data, dataMode: 'live' };
      return payload;
    };
  });
  await expect(page.locator('#pwa-install-nudge')).toBeHidden();
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();

  const nudge = page.locator('#pwa-install-nudge');
  const sheet = page.locator('#pwa-install-sheet');
  await expect(page.locator('#condition-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(nudge).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(page.locator('#pwa-install-nudge-open')).toBeVisible();
  await page.locator('#pwa-install-nudge-open').click();
  await expect(nudge).toBeHidden();
  await expect(sheet).toBeVisible();
  await page.locator('#pwa-install-done').click();
  await page.reload();
  await expect(nudge).toBeHidden();
  await expect(sheet).toBeHidden();
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('tw_pwa_install_prompted_v2')))).toBe(true);
});

test('does not prompt for fixture conditions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'iPhone Safari install guidance verification only.');
  await page.addInitScript(() => {
    localStorage.removeItem('tw_pwa_install_dismissed_v1');
    localStorage.removeItem('tw_pwa_install_prompted_v2');
  });
  await page.goto('/?worker=http://127.0.0.1:8787');
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expandConditionsIfCollapsed(page);
  await expect(page.locator('#condition-demo-warning')).toBeVisible();
  await expect(page.locator('#pwa-install-nudge')).toBeHidden();
  await expect(page.locator('#pwa-install-sheet')).toBeHidden();
});

test('does not auto prompt outside iPhone Safari or standalone mode', async ({ page }, testInfo) => {
  await page.addInitScript((standalone) => {
    localStorage.removeItem('tw_pwa_install_dismissed_v1');
    localStorage.removeItem('tw_pwa_install_prompted_v2');
    if (standalone) {
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    }
  }, testInfo.project.name === 'iphone');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await expect(page.locator('#pwa-install-nudge')).toBeHidden();
  await expect(page.locator('#pwa-install-sheet')).toBeHidden();
});

test('keeps install guidance absent on tablet use', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', 'Automatic install guidance is intentionally iPhone-only.');
  await page.addInitScript(() => {
    localStorage.removeItem('tw_pwa_install_dismissed_v1');
    localStorage.removeItem('tw_pwa_install_prompted_v2');
  });
  await page.goto('/?worker=http://127.0.0.1:8787');
  await expect(page.locator('#pwa-install-nudge')).toBeHidden();
  await expect(page.locator('#pwa-install-sheet')).toBeHidden();
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
  await openRoutePlanner(page);
  await page.locator('#js-route-start').fill('台中市政府');
  await expect(page.locator('#js-route-start')).toHaveValue('台中市政府');
});

test('keeps the PWA shell offline without serving stale API data', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Offline service-worker verification runs in Chromium.');
  await page.goto('/?worker=http://127.0.0.1:8787');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await openRoutePlanner(page);
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
  await expect(page.locator('#pwa-install-nudge')).toBeHidden();
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
