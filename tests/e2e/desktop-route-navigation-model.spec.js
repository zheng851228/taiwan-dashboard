import { expect, test } from '@playwright/test';

test('route navigation model is available before route conditions and preserves external targets', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.RouteNavigationModel && window.RouteConditionsMod));

  const result = await page.evaluate(() => {
    const route = {
      locations: [
        { lat: 25.033964, lng: 121.564468 },
        { lat: 24.500000, lng: 121.200000 },
        { lat: 24.147736, lng: 120.673648 }
      ]
    };
    const state = window.RouteNavigationModel.buildNavigation(route, 'motorcycle', 'white');
    return {
      state,
      appleIntent: window.RouteNavigationModel.appleClickIntent(state.points)
    };
  });

  expect(result.state.enabled).toBe(true);
  expect(result.state.points).toHaveLength(3);
  expect(result.state.googleHref).toContain('travelmode=two-wheeler');
  expect(result.state.googleHref).toContain('avoid=highways%2Ctolls');
  expect(result.state.appleHref).toContain('maps.apple.com');
  expect(result.state.appleLegs).toHaveLength(2);
  expect(result.state.appleRequiresLegHandoff).toBe(true);
  expect(result.appleIntent).toEqual({
    preventDefault: true,
    revealLegs: true,
    message: 'Apple Maps 請依順序開啟各段路線'
  });
});
