import { expect, test } from '@playwright/test';

// iOS standalone (viewport-fit=cover + black-translucent) leaves the layout viewport one status-bar
// inset short of the screen, and WebKit paints nothing below it (WebKit bug 237961; measured on the
// owner's iPhone 390x844: content cut at 797pt, the body background showing in the 47pt band).
// Real devices cannot be emulated; this pins the logic: when exactly that gap is measured the shell
// stays inside the painted area, the nav drops its safe-bottom padding (the home indicator is in the
// band) and the body - what shows in the band - is painted with the nav surface.
const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;

async function open(page, { standalone, innerHeight, screenHeight = 844, safeTop = 47, light = false }) {
  await page.setViewportSize({ width: 390, height: innerHeight });
  await page.addInitScript(({ isStandalone, screenH, top, isLight }) => {
    localStorage.setItem('tw_pwa_install_dismissed_v1', '1');
    if (isLight) localStorage.setItem('tw_theme', 'light');
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => isStandalone });
    Object.defineProperty(window.screen, 'width', { configurable: true, get: () => 390 });
    Object.defineProperty(window.screen, 'height', { configurable: true, get: () => screenH });
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      // Chromium reports env(safe-area-inset-*) as 0; emulate the iPhone insets.  Not !important, so
      // the html.vp-gap override of --safe-bottom still applies, as it does on the device.
      style.textContent = `:root{--safe-top:${top}px;--safe-bottom:34px}`;
      document.head.appendChild(style);
    });
  }, { isStandalone: standalone, screenH: screenHeight, top: safeTop, isLight: light });
  await page.goto(WORKER);
  await expect(page.locator('.bottom-navigation')).toBeVisible();
}

const asIphone = (page) => page.evaluate(() => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'iPhone' });
  window.dispatchEvent(new Event('resize'));
});

const measure = (page) => page.evaluate(() => {
  const nav = document.querySelector('.bottom-navigation');
  const box = nav.getBoundingClientRect();
  const inner = document.querySelector('.bottom-navigation-inner').getBoundingClientRect();
  return {
    gapClass: document.documentElement.classList.contains('vp-gap'),
    appH: Math.round(document.querySelector('#app').getBoundingClientRect().height),
    navBottom: Math.round(box.bottom),
    navTop: Math.round(box.top),
    innerBottom: Math.round(inner.bottom),
    innerHeight: window.innerHeight,
    appHVar: document.documentElement.style.getPropertyValue('--app-h'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    navBg: getComputedStyle(nav).backgroundColor
  };
});

test.describe('mobile shell bottom edge', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Phone-viewport shell checks run once, in Chromium.');
  });

  test('iOS standalone with the status-bar gap: everything stays inside the painted area', async ({ page }) => {
    await open(page, { standalone: true, innerHeight: 797 }); // 844 - 47, as measured on the device
    await asIphone(page);
    const m = await measure(page);
    expect(m.gapClass).toBe(true);
    expect(m.appHVar).toBe('797px');
    expect(m.appH).toBe(797);                 // never taller than what WebKit paints
    expect(m.navBottom).toBe(797);            // the nav ends exactly where painting ends
    expect(m.innerBottom).toBe(797);          // no safe-bottom padding: the home indicator is in the band
    expect(m.navTop).toBe(797 - 52);          // labels fully visible
    expect(m.bodyBg).toBe(m.navBg);           // the band below reads as part of the nav
  });

  test('the same gap in the light theme paints the band white like the nav', async ({ page }) => {
    await open(page, { standalone: true, innerHeight: 797, light: true });
    await asIphone(page);
    const m = await measure(page);
    expect(m.gapClass).toBe(true);
    expect(m.bodyBg).toBe('rgb(255, 255, 255)');
    expect(m.bodyBg).toBe(m.navBg);
  });

  test('Safari tab / Android: nothing is resized and the nav keeps its safe-bottom padding', async ({ page }) => {
    await open(page, { standalone: false, innerHeight: 844 });
    const m = await measure(page);
    expect(m.gapClass).toBe(false);
    expect(m.appHVar).toBe('');
    expect(m.navBottom).toBe(m.innerHeight);
    expect(m.innerBottom).toBe(m.innerHeight - 34);
    expect(m.navTop).toBe(m.innerHeight - (52 + 34));
  });

  test('standalone without a gap (fixed future iOS) keeps the normal layout', async ({ page }) => {
    await open(page, { standalone: true, innerHeight: 844 });
    await asIphone(page);
    const m = await measure(page);
    expect(m.gapClass).toBe(false);
    expect(m.appHVar).toBe('');
    expect(m.navBottom).toBe(844);
    expect(m.innerBottom).toBe(844 - 34);
  });

  test('a much larger gap (keyboard open) is not mistaken for the status-bar gap', async ({ page }) => {
    await open(page, { standalone: true, innerHeight: 500 });
    await asIphone(page);
    const m = await measure(page);
    expect(m.gapClass).toBe(false);
    expect(m.appHVar).toBe('');
  });
});
