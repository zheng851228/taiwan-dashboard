import { expect, test } from '@playwright/test';

test('desktop vehicle UI follows vehicle:changed snapshots instead of RouteMod state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus
      && window.RouteMod
      && window.DesktopDashboardMod
      && document.querySelector('.desktop-vehicle-tab[data-desktop-mode="car"]')
      && document.querySelector('.desktop-vehicle-tab[data-desktop-mode="motorcycle"][data-desktop-plate="yellow"]')
  ))).toBe(true);

  const result = await page.evaluate(() => {
    const original = { mode: RouteMod.mode, plate: RouteMod.plate };
    const car = document.querySelector('.desktop-vehicle-tab[data-desktop-mode="car"]');
    const yellow = document.querySelector('.desktop-vehicle-tab[data-desktop-mode="motorcycle"][data-desktop-plate="yellow"]');

    RouteMod.mode = 'motorcycle';
    RouteMod.plate = 'white';
    Bus.emit('vehicle:changed', { mode: 'car', plate: 'white' });
    const carSnapshot = {
      carActive: car.classList.contains('active'),
      carPressed: car.getAttribute('aria-pressed'),
      legacyMode: RouteMod.mode
    };

    RouteMod.mode = 'car';
    RouteMod.plate = 'white';
    Bus.emit('vehicle:changed', { mode: 'motorcycle', plate: 'yellow' });
    const motorcycleSnapshot = {
      yellowActive: yellow.classList.contains('active'),
      yellowPressed: yellow.getAttribute('aria-pressed'),
      legacyMode: RouteMod.mode,
      legacyPlate: RouteMod.plate
    };

    RouteMod.mode = original.mode;
    RouteMod.plate = original.plate;
    Bus.emit('vehicle:changed', original);

    return { carSnapshot, motorcycleSnapshot };
  });

  expect(result.carSnapshot).toEqual({
    carActive: true,
    carPressed: 'true',
    legacyMode: 'motorcycle'
  });
  expect(result.motorcycleSnapshot).toEqual({
    yellowActive: true,
    yellowPressed: 'true',
    legacyMode: 'car',
    legacyPlate: 'white'
  });
});
