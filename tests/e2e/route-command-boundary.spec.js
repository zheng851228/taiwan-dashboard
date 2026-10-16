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

test('a saved route is restored through route:request and the vehicle UI follows it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(window.Bus && window.RouteMod))).toBe(true);

  const result = await page.evaluate(() => {
    const vehicleEvents = [];
    window.Bus.on('vehicle:changed', (event) => vehicleEvents.push([event.mode, event.plate]));
    const coords = [[25.04, 121.51], [24.75, 121.75]];
    const activeButtons = () => [...document.querySelectorAll('.desktop-vehicle-tab.active, .route-mode-btn.active')]
      .map((button) => button.dataset.desktopPlate || button.dataset.plate || button.dataset.desktopMode || button.dataset.mode);

    window.Bus.emit('route:request', { action: 'restore', route: { vehicle: { type: 'car' } }, coords });
    const car = { active: window.RouteMod.active, mode: window.RouteMod.mode, coords: window.RouteMod.routeCoords, cams: window.RouteMod.filteredCams.length, buttons: activeButtons() };

    // snapshots saved before the yellow plate was removed come back as red (the Worker treats them alike)
    window.Bus.emit('route:request', { action: 'restore', route: { vehicle: { type: 'motorcycle', plate: 'yellow' } }, coords });
    const yellow = { mode: window.RouteMod.mode, plate: window.RouteMod.plate, buttons: activeButtons() };

    // incomplete input changes nothing
    window.Bus.emit('route:request', { action: 'restore', route: null, coords });
    window.Bus.emit('route:request', { action: 'restore', route: { vehicle: { type: 'car' } }, coords: [[25, 121]] });
    const untouched = { mode: window.RouteMod.mode, plate: window.RouteMod.plate };
    return { car, yellow, untouched, vehicleEvents };
  });

  expect(result.car).toEqual({ active: true, mode: 'car', coords: [[25.04, 121.51], [24.75, 121.75]], cams: 0, buttons: ['car', 'car'] });
  expect(result.yellow).toEqual({ mode: 'motorcycle', plate: 'red', buttons: ['red', 'red'] });
  expect(result.untouched).toEqual({ mode: 'motorcycle', plate: 'red' });
  // car keeps the previous plate (white); then the restored motorcycle with yellow -> red
  expect(result.vehicleEvents).toEqual([['car', 'white'], ['motorcycle', 'red']]);
});
