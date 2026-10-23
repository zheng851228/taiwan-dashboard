import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('filmstrip refresh accepts absolute HTTP(S) URLs and preserves invalid sources', async ({ page }, testInfo) => {
  // Capture only the five-minute refresh timer; keep all other application timers intact.
  await page.addInitScript(() => {
    const original = window.setInterval;
    window.setInterval = function(callback, delay, ...args) {
      if (delay === 300000) window.refreshFilmstripForTest = callback;
      return original.call(this, callback, delay, ...args);
    };
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.refreshFilmstripForTest)).toBe(true);
  const result = await page.evaluate(() => {
    const strip = document.getElementById('route-camera-strip');
    const scroll = document.getElementById('route-camera-strip-scroll');
    strip.classList.add('visible');
    const sources = ['https://camera.test/image.jpg', 'http://camera.test/image.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'not a URL', '/relative.jpg'];
    const images = sources.map(source => {
      const card = document.createElement('div');
      card.className = 'strip-cam';
      const img = document.createElement('img');
      img.setAttribute('src', 'https://camera.test/old.jpg');
      img.setAttribute('data-src', source);
      card.appendChild(img);
      scroll.appendChild(card);
      return img;
    });
    window.refreshFilmstripForTest();
    return images.map(img => img.getAttribute('src'));
  });
  expect(result[0]).toMatch(/^https:\/\/camera\.test\/image\.jpg\?t=\d+$/);
  expect(result[1]).toMatch(/^http:\/\/camera\.test\/image\.jpg\?t=\d+$/);
  expect(result.slice(2)).toEqual(Array(4).fill('https://camera.test/old.jpg'));
  await page.screenshot({ path: testInfo.outputPath('filmstrip.png'), fullPage: true });
});
