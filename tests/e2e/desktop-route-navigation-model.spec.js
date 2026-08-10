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

test('route-condition navigation follows vehicle bus state instead of RouteMod fields', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    window.Bus
      && window.RouteMod
      && window.RouteConditionsMod
      && window.AppServices
  ));

  await page.evaluate(() => {
    window.AppServices.loadRouteConditions = function() {
      return new Promise(function() {});
    };
    const route = {
      routeId: 'vehicle-navigation-state',
      durationMinutes: 30,
      validation: { status: 'safe' },
      locations: [
        { lat: 25.033964, lng: 121.564468 },
        { lat: 24.147736, lng: 120.673648 }
      ]
    };

    window.Bus.emit('vehicle:changed', { mode: 'car', plate: 'white' });
    window.RouteMod.mode = 'motorcycle';
    window.RouteMod.plate = 'red';
    window.RouteConditionsMod.load(route);
  });

  await expect.poll(async () => page.locator('#nav-google').getAttribute('href'))
    .toContain('travelmode=driving');
  await expect.poll(async () => page.locator('#nav-google').getAttribute('href'))
    .not.toContain('avoid=');

  await page.evaluate(() => {
    window.Bus.emit('vehicle:changed', { mode: 'motorcycle', plate: 'white' });
    window.RouteMod.mode = 'car';
    window.RouteMod.plate = 'red';
  });

  await expect.poll(async () => page.locator('#nav-google').getAttribute('href'))
    .toContain('travelmode=two-wheeler');
  await expect.poll(async () => page.locator('#nav-google').getAttribute('href'))
    .toContain('avoid=highways%2Ctolls');
});
