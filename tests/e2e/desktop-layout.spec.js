import { expect, test } from '@playwright/test';

const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;
const LAYOUT_KEY = 'tw_desktop_layout_v1';

async function openReadyDesktop(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(WORKER);
  await expect(page.locator('#desktop-resize-left')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.DesktopLayoutMod))).toBe(true);
}

async function readLayout(page) {
  return page.evaluate(() => window.DesktopLayoutMod.getLayout());
}

test.describe('desktop layout owner', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop layout verification only.');
  });

  test('keyboard resizing updates ARIA state and persists after reload', async ({ page }) => {
    await openReadyDesktop(page);

    const handle = page.locator('#desktop-resize-left');
    const initial = await readLayout(page);
    await expect(handle).toHaveAttribute('aria-valuenow', String(initial.left));

    await handle.focus();
    await page.keyboard.press('ArrowRight');

    const changed = await readLayout(page);
    expect(changed.left).toBe(initial.left + 8);
    await expect(handle).toHaveAttribute('aria-valuenow', String(changed.left));

    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LAYOUT_KEY);
    expect(stored.left).toBe(changed.left);

    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.DesktopLayoutMod))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.DesktopLayoutMod.getLayout().left)).toBe(changed.left);
    await expect(page.locator('#desktop-resize-left')).toHaveAttribute('aria-valuenow', String(changed.left));
  });

  test('shift resizing and Home/End stay inside computed bounds', async ({ page }) => {
    await openReadyDesktop(page);

    const handle = page.locator('#desktop-resize-left');
    const initial = await readLayout(page);
    await handle.focus();
    await page.keyboard.press('Shift+ArrowRight');
    expect((await readLayout(page)).left).toBe(initial.left + 24);

    await page.keyboard.press('Home');
    const minimum = await readLayout(page);
    expect(minimum.left).toBe(Number(await handle.getAttribute('aria-valuemin')));

    await page.keyboard.press('End');
    const maximum = await readLayout(page);
    expect(maximum.left).toBe(Number(await handle.getAttribute('aria-valuemax')));
  });

  test('reset restores defaults and keeps the existing persisted-reset behavior', async ({ page }) => {
    await openReadyDesktop(page);

    const handle = page.locator('#desktop-resize-left');
    const defaults = await readLayout(page);
    await handle.focus();
    await page.keyboard.press('Shift+ArrowRight');
    expect((await readLayout(page)).left).not.toBe(defaults.left);

    await page.evaluate(() => window.DesktopLayoutMod.reset());
    await expect.poll(() => page.evaluate(() => window.DesktopLayoutMod.getLayout())).toEqual(defaults);

    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LAYOUT_KEY);
    expect(stored).toEqual(defaults);
  });
});
