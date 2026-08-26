import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

test('route search runtime delegates endpoint preparation to the extracted model', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.RouteSearchModel && window.RouteMod
  ))).toBe(true);

  const result = await page.evaluate(() => {
    const start = document.getElementById('js-route-start');
    const end = document.getElementById('js-route-end');
    start.value = '  台北車站  ';
    end.value = '';

    let calls = 0;
    const original = window.RouteSearchModel.prepareEndpoints;
    window.RouteSearchModel.prepareEndpoints = function(startValue, endValue) {
      calls += 1;
      return original(startValue, endValue);
    };

    window.RouteMod.analyze();

    return {
      calls,
      analyzing: window.RouteMod.analyzing,
      routeState: window.RouteUiMod && window.RouteUiMod.getState()
    };
  });

  expect(result.calls).toBe(1);
  expect(result.analyzing).toBe(false);
  expect(result.routeState).toBe('empty');
});
