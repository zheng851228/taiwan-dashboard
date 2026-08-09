import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

test('route-condition runtime delegates presentation decisions to the extracted view model', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.RouteConditionViewModel
      && typeof window.getRoadEventPresentation === 'function'
      && typeof window.getPrimaryRoadEvent === 'function'
  ))).toBe(true);

  const result = await page.evaluate(() => {
    const construction = window.getRoadEventPresentation({
      title: '道路施工，封閉外側車道',
      lat: 24.12,
      lng: 120.67,
      status: 'active'
    });
    const primary = window.getPrimaryRoadEvent([
      { title: '道路施工，封閉外側車道', lat: 24.12, lng: 120.67, status: 'active' },
      { title: '全線封閉預告', description: '道路全線封閉', lat: 24.13, lng: 120.68, status: 'scheduled' }
    ]);
    return {
      construction,
      primary: primary && primary.presentation,
      direct: window.RouteConditionViewModel.roadEventPresentation({
        title: '道路施工，封閉外側車道',
        lat: 24.12,
        lng: 120.67,
        status: 'active'
      })
    };
  });

  expect(result.construction).toEqual(result.direct);
  expect(result.construction.kind).toBe('construction');
  expect(result.construction.impact).toBe('lane_closure');
  expect(result.primary.impact).toBe('full_closure');
  expect(result.primary.status).toBe('scheduled');
});
