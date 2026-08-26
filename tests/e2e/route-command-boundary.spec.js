import { expect, test } from '@playwright/test';

test('route commands flow through route:request without moving RouteMod state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus && window.RouteMod && typeof window.Bus.emit === 'function'
  ))).toBe(true);

  const result = await page.evaluate(() => {
    const originalSetVehicle = window.RouteMod.setVehicle;
    const originalAnalyze = window.RouteMod.analyze;
    const originalClear = window.RouteMod.clear;
    const calls = { setVehicle: [], analyze: 0, clear: 0 };

    window.RouteMod.setVehicle = function(mode, plate) {
      calls.setVehicle.push([mode, plate]);
    };
    window.RouteMod.analyze = function() {
      calls.analyze += 1;
    };
    window.RouteMod.clear = function() {
      calls.clear += 1;
    };

    window.Bus.emit('route:request', { action: 'set-vehicle', mode: 'car', plate: 'white' });
    window.Bus.emit('route:request', { action: 'analyze' });
    window.Bus.emit('route:request', { action: 'clear' });
    window.Bus.emit('route:request', { action: 'unknown' });

    const stateShape = {
      active: typeof window.RouteMod.active,
      mode: typeof window.RouteMod.mode,
      plate: typeof window.RouteMod.plate,
      filteredCams: Array.isArray(window.RouteMod.filteredCams),
      routeCoords: Array.isArray(window.RouteMod.routeCoords)
    };

    window.RouteMod.setVehicle = originalSetVehicle;
    window.RouteMod.analyze = originalAnalyze;
    window.RouteMod.clear = originalClear;

    return { calls, stateShape };
  });

  expect(result.calls).toEqual({
    setVehicle: [['car', 'white']],
    analyze: 1,
    clear: 1
  });
  expect(result.stateShape).toEqual({
    active: 'boolean',
    mode: 'string',
    plate: 'string',
    filteredCams: true,
    routeCoords: true
  });
});
