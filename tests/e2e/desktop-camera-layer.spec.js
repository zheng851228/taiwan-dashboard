import { expect, test } from '@playwright/test';

const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;

async function buildFixtureRoute(page) {
  if (!(await page.locator('#route-expanded').isVisible())) {
    await page.locator('#route-toggle').click();
  }
  await page.locator('#js-route-start').fill('25.0478,121.5170');
  await page.locator('#js-route-end').fill('24.7570,121.7530');
  await page.locator('#js-route-btn').click();
  await expect(page.locator('#route-conditions-panel')).toBeVisible();
}

test('extracted MapLibre camera overlay keeps route CCTV interactive', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop camera overlay verification only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(window.MapCameraLayer))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(
    window.DesktopDashboardMod
      && window.DesktopDashboardMod.getRenderer()
      && window.DesktopDashboardMod.getRenderer().cameraLayerInstalled
  ))).toBe(true);

  await buildFixtureRoute(page);

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
});
