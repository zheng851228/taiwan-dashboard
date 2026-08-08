import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

async function buildFixtureRoute(page) {
  if (!(await page.locator('#route-expanded').isVisible())) {
    await page.locator('#route-toggle').click();
  }
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect(page.locator('#route-conditions-panel')).toBeVisible();
}

test('extracted MapLibre route overlay keeps route source and fitted state intact', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop route overlay verification only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(window.MapRouteLayer))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(
    window.DesktopDashboardMod
      && window.DesktopDashboardMod.getRenderer()
      && window.DesktopDashboardMod.getRenderer().routeLayerInstalled
  ))).toBe(true);

  await buildFixtureRoute(page);

  const state = await page.evaluate(() => {
    const renderer = window.DesktopDashboardMod.getRenderer();
    const source = renderer && renderer.map && renderer.map.getSource('desktop-route');
    const data = source && source._data;
    const feature = data && data.features && data.features[0];
    return {
      routeCoords: renderer && renderer.routeCoords ? renderer.routeCoords.length : 0,
      routeFitApplied: Boolean(renderer && renderer.routeFitApplied),
      sourceFeatureCount: data && data.features ? data.features.length : 0,
      geometryPointCount: feature && feature.geometry && feature.geometry.coordinates
        ? feature.geometry.coordinates.length
        : 0
    };
  });

  expect(state.routeCoords).toBeGreaterThan(1);
  expect(state.routeFitApplied).toBe(true);
  expect(state.sourceFeatureCount).toBe(1);
  expect(state.geometryPointCount).toBeGreaterThan(1);
});
