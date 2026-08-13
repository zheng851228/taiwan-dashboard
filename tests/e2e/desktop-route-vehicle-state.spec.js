import { expect, test } from '@playwright/test';

const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;

test('desktop vehicle state follows bus events instead of RouteMod fields', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop runtime integration only.');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(WORKER);

  await expect.poll(() => page.evaluate(() => Boolean(
    window.Bus
      && window.RouteMod
      && window.DesktopDashboardMod
      && window.DesktopDashboardMod.state
  ))).toBe(true);

  const result = await page.evaluate(() => {
    window.Bus.emit('vehicle:changed', { mode: 'car', plate: 'white' });
    const afterEvent = { ...window.DesktopDashboardMod.state.vehicle };

    window.RouteMod.mode = 'motorcycle';
    window.RouteMod.plate = 'red';

    const afterLegacyMutation = { ...window.DesktopDashboardMod.state.vehicle };
    const activeAfterLegacyMutation = Array.from(document.querySelectorAll('.desktop-vehicle-tab'))
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => ({ mode: button.dataset.desktopMode, plate: button.dataset.desktopPlate || '' }));

    window.Bus.emit('vehicle:changed', { mode: 'motorcycle', plate: 'red' });
    const afterSecondEvent = { ...window.DesktopDashboardMod.state.vehicle };
    const activeAfterSecondEvent = Array.from(document.querySelectorAll('.desktop-vehicle-tab'))
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => ({ mode: button.dataset.desktopMode, plate: button.dataset.desktopPlate || '' }));

    return { afterEvent, afterLegacyMutation, activeAfterLegacyMutation, afterSecondEvent, activeAfterSecondEvent };
  });

  expect(result.afterEvent).toEqual({ mode: 'car', plate: 'white' });
  expect(result.afterLegacyMutation).toEqual({ mode: 'car', plate: 'white' });
  expect(result.activeAfterLegacyMutation).toEqual([{ mode: 'car', plate: '' }]);
  expect(result.afterSecondEvent).toEqual({ mode: 'motorcycle', plate: 'red' });
  expect(result.activeAfterSecondEvent).toEqual([{ mode: 'motorcycle', plate: 'red' }]);
});
