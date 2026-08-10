import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

test('route summary runtime delegates presentation copy to the extracted model', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.RouteSummaryModel
      && window.RouteMod
      && window.AppState
      && typeof window.RouteMod.updateRouteUi === 'function'
  ))).toBe(true);

  const modelCopy = await page.evaluate(() => {
    window.AppState.lastRouteInfo = { distance: '88.8', duration: 123 };
    window.RouteMod.mode = 'motorcycle';
    window.RouteMod.updateRouteUi(3);
    return {
      direct: window.RouteSummaryModel.routeUiCopy(3, window.AppState.lastRouteInfo, 'motorcycle'),
      status: document.getElementById('js-route-status')?.textContent || '',
      listCount: document.getElementById('js-list-route-count')?.textContent || '',
      summary: document.getElementById('route-summary')?.textContent || ''
    };
  });

  expect(modelCopy.status).toBe(modelCopy.direct.statusText);
  expect(modelCopy.listCount).toBe(modelCopy.direct.listCountText);
  expect(modelCopy.summary).toBe(modelCopy.direct.summaryText);
});
