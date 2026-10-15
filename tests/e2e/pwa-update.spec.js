import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { startStaticOrigin } from './helpers/static-origin.js';

// 「有新版本」 must mean an update really exists: an older service worker controlled the page and
// a different sw.js was deployed.  WebKit can deliver the first worker's 'installed' statechange
// after it has already claimed the page, which used to show the notice on a first visit.
// The app is served from a throwaway `localhost` origin: the worker treats 127.0.0.1 as API traffic.
const workerPort = process.env.E2E_WORKER_PORT || '8787';
const workerOrigin = `http://127.0.0.1:${workerPort}`;
const SW_SOURCE = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');

test.describe('service worker update notice', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!['desktop-chromium', 'iphone'].includes(testInfo.project.name), 'Runs in Chrome and in WebKit (iPhone).');
    await page.addInitScript(() => localStorage.setItem('tw_pwa_install_dismissed_v1', '1'));
  });

  test('a first visit never shows the update notice', async ({ page }) => {
    const site = await startStaticOrigin();
    try {
      await page.goto(`${site.origin}/?worker=${workerOrigin}`);
      await page.evaluate(() => navigator.serviceWorker.ready);
      // the new worker has activated and claimed this page: every late statechange has fired
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15000 }).toBe(true);
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
      await expect(page.locator('#pwa-update-banner')).toBeHidden();
    } finally {
      await site.stop();
    }
  });

  test('a newly deployed service worker shows the update notice on a controlled page', async ({ page }) => {
    const site = await startStaticOrigin({ overrides: { '/sw.js': SW_SOURCE } });
    try {
      await page.goto(`${site.origin}/?worker=${workerOrigin}`);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15000 }).toBe(true);
      await page.reload(); // now loaded under the installed worker
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15000 }).toBe(true);
      await expect(page.locator('#pwa-update-banner')).toBeHidden();

      // deploy: a byte-different sw.js; the app's own registration.update() on load picks it up
      site.overrides['/sw.js'] = SW_SOURCE.replace('const CACHE_VERSION = "', 'const CACHE_VERSION = "next-');
      await page.reload();
      await expect(page.locator('#pwa-update-banner')).toBeVisible({ timeout: 15000 });
    } finally {
      await site.stop();
    }
  });
});
