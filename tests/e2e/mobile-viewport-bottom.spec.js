import { expect, test } from '@playwright/test';

// iOS standalone (viewport-fit=cover + black-translucent) can leave the layout viewport one status-bar
// inset short of the screen (WebKit bug 237961), so a nav pinned to the viewport floats above a band.
// Real devices cannot be emulated; this pins the logic: the shell is only resized when exactly that gap
// is measured, and the nav is pinned to the shell and reaches its bottom edge.
const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function open(page, { standalone, innerHeight }) {
  await page.setViewportSize({ width: 393, height: innerHeight });
  await page.addInitScript((isStandalone) => {
    localStorage.setItem('tw_pwa_install_dismissed_v1', '1');
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => isStandalone });
    Object.defineProperty(window.screen, 'width', { configurable: true, get: () => 393 });
    Object.defineProperty(window.screen, 'height', { configurable: true, get: () => 852 });
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = ':root{--safe-top:59px !important;--safe-bottom:34px !important}';
      document.head.appendChild(style);
    });
  }, standalone);
  await page.goto(WORKER);
  await expect(page.locator('.bottom-navigation')).toBeVisible();
}

const measure = (page) => page.evaluate(() => {
  const nav = document.querySelector('.bottom-navigation');
  const box = nav.getBoundingClientRect();
  const inner = document.querySelector('.bottom-navigation-inner').getBoundingClientRect();
  return {
    appH: Math.round(document.querySelector('#app').getBoundingClientRect().height),
    navBottom: Math.round(box.bottom),
    navTop: Math.round(box.top),
    innerBottom: Math.round(inner.bottom),
    innerHeight: window.innerHeight,
    appHVar: document.documentElement.style.getPropertyValue('--app-h'),
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    navBg: getComputedStyle(nav).backgroundColor
  };
});

test.describe('mobile shell bottom edge', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Phone-viewport shell checks run once, in Chromium.');
  });

  test('iOS standalone with the status-bar gap: shell and nav are sized to the screen', async ({ page }) => {
    await open(page, { standalone: true, innerHeight: 793 }); // 852 - 59
    await page.evaluate(() => { Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'iPhone' }); window.dispatchEvent(new Event('resize')); });
    const m = await measure(page);
    expect(m.appHVar).toBe('852px');
    expect(m.appH).toBe(852);
    expect(m.navBottom).toBe(852);          // the nav surface reaches the physical bottom
    expect(m.innerBottom).toBe(852 - 34);   // its content sits safe-bottom above it, nothing more
  });

  test('Safari tab / Android: nothing is resized and the nav sits on the viewport bottom', async ({ page }) => {
    await open(page, { standalone: false, innerHeight: 852 });
    const m = await measure(page);
    expect(m.appHVar).toBe('');
    expect(m.navBottom).toBe(m.innerHeight);
    expect(m.innerBottom).toBe(m.innerHeight - 34);
    expect(m.navTop).toBe(m.innerHeight - (52 + 34));
  });

  test('standalone without a status-bar gap is left alone; html is painted like the nav', async ({ page }) => {
    await open(page, { standalone: true, innerHeight: 852 });
    await page.evaluate(() => { Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'iPhone' }); window.dispatchEvent(new Event('resize')); });
    const m = await measure(page);
    expect(m.appHVar).toBe('');
    expect(m.navBottom).toBe(852);
    expect(m.htmlBg).toBe('rgb(22, 33, 45)'); // --c-surface (the nav surface) in the dark theme
  });
});
