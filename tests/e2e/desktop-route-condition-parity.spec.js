import { expect, test } from '@playwright/test';

const WORKER = '/?worker=http://127.0.0.1:8787';

test('extracted route-condition view model matches legacy presentation helpers', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop parity verification only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.RouteConditionViewModel && window.RouteConditionParity
  ))).toBe(true);

  const result = await page.evaluate(() => window.RouteConditionParity.auditSections([{
    order: 1,
    incidents: [
      { title: '道路施工，封閉外側車道', lat: 24.12, lng: 120.67, status: 'active' },
      { title: '全線封閉預告', description: '道路全線封閉', lat: 24.13, lng: 120.68, status: 'scheduled' },
      { title: '故障車', locationApproximate: true, status: 'active' }
    ]
  }]));

  expect(result.checked).toBeGreaterThan(0);
  expect(result.mismatches).toEqual([]);
  expect(result.ok).toBe(true);
});
