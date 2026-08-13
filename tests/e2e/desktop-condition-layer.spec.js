import { expect, test } from '@playwright/test';

const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;

test('extracted MapLibre condition overlay writes traffic, event and weather outputs', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop condition overlay verification only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(window.MapConditionLayer))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(
    window.DesktopDashboardMod
      && window.DesktopDashboardMod.getRenderer()
      && window.DesktopDashboardMod.getRenderer().conditionLayerInstalled
  ))).toBe(true);

  const result = await page.evaluate(() => {
    const renderer = window.DesktopDashboardMod.getRenderer();
    const writes = {};
    const originalSetSourceData = renderer._setSourceData.bind(renderer);
    renderer._setSourceData = (id, data) => {
      writes[id] = data;
      originalSetSourceData(id, data);
    };
    renderer.routeCoords = [];
    renderer.routeFitApplied = false;

    const output = renderer.drawConditionSections([{
      order: 9,
      roadRef: '測試道路',
      geometry: [[24.10, 120.65], [24.11, 120.66], [24.12, 120.67], [24.13, 120.68]],
      traffic: { level: 'slow' },
      incidents: [{ title: '道路施工', lat: 24.12, lng: 120.67, locationApproximate: false }],
      weather: { condition: '陣雨', rainChance: 80 }
    }]);

    const eventMarker = renderer.markers.find(marker => {
      const element = marker.getElement && marker.getElement();
      return element && element.classList.contains('desktop-event-marker');
    });

    let selectedOrder = null;
    const originalEmit = window.Bus.emit;
    window.Bus.emit = function(name, payload) {
      if (name === 'condition:select') selectedOrder = payload;
      return originalEmit.apply(this, arguments);
    };
    if (eventMarker) eventMarker.getElement().click();
    window.Bus.emit = originalEmit;

    return {
      sections: writes['desktop-sections']?.features?.length || 0,
      events: writes['desktop-events']?.features?.length || 0,
      weather: writes['desktop-weather']?.features?.length || 0,
      eventMarkerCount: output.eventMarkerCount,
      routeCoords: renderer.routeCoords.length,
      routeFitApplied: renderer.routeFitApplied,
      selectedOrder
    };
  });

  expect(result.sections).toBe(1);
  expect(result.events).toBe(1);
  expect(result.weather).toBe(1);
  expect(result.eventMarkerCount).toBe(1);
  expect(result.routeCoords).toBeGreaterThan(1);
  expect(result.routeFitApplied).toBe(true);
  expect(result.selectedOrder).toBe(9);
});
