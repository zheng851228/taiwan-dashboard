import { test, expect } from '@playwright/test';

const workerOrigin = `http://127.0.0.1:${process.env.E2E_WORKER_PORT || '8787'}`;
test.use({ serviceWorkers: 'block' });

for (const host of ['maps.apple.com', 'apple.com']) {
  test(`imports Apple Maps route from ${host}`, async ({ page }) => {
    await page.goto(`/?worker=${workerOrigin}`);
    await expect.poll(() => page.evaluate(() => !!window.autoFillRoute)).toBe(true);
    if (!(await page.locator('#route-expanded').isVisible())) await page.locator('#route-toggle').click();
    await page.locator('#js-gmaps-url').fill(`https://${host}/?saddr=25.0478,121.5170&daddr=24.7570,121.7530`);
    await page.locator('#js-gmaps-parse').click();
    await expect(page.locator('#js-route-start')).toHaveValue('25.0478,121.5170');
    await expect(page.locator('#js-route-end')).toHaveValue('24.7570,121.7530');
  });
}

test('rejects Apple lookalike hosts in the bundled Apple parser', async ({ page }) => {
  await page.goto(`/?worker=${workerOrigin}`);
  await expect.poll(() => page.evaluate(() => !!window.parseAppleMapsRoute)).toBe(true);
  const results = await page.evaluate(() => ['evil-apple.com', 'apple.com.evil.test'].map(host =>
    parseAppleMapsRoute(`https://${host}/?saddr=Taipei&daddr=Tainan`)
  ));
  expect(results).toEqual([null, null]);
});

test('preserves country-domain expansion and explanatory-text fast import', async ({ page }) => {
  await page.goto(`/?worker=${workerOrigin}`);
  await expect.poll(() => page.evaluate(() => !!window.autoFillRoute)).toBe(true);
  const result = await page.evaluate(async () => {
    const expanded = [];
    const errors = [];
    const filled = [];
    const original = AppServices.expandShortUrl;
    AppServices.expandShortUrl = async url => {
      expanded.push(url);
      return { data: { finalUrl: url } };
    };
    try {
      const country = 'https://www.google.com.tw/maps/dir/台北車站/台北101';
      const countryAccepted = autoFillRoute(country, (...args) => filled.push(args), error => errors.push(error));
      // Let the expand promise and importer continuation settle before checking the fast path.
      await new Promise(resolve => setTimeout(resolve, 0));
      const countryFilled = filled.slice();
      filled.length = 0;
      const textAccepted = autoFillRoute('分享路線：https://www.google.com/maps/dir/台北車站/台北101', (...args) => filled.push(args), error => errors.push(error));
      return { countryAccepted, countryFilled, textAccepted, textFilled: filled, expanded, errors };
    } finally {
      AppServices.expandShortUrl = original;
    }
  });
  expect(result).toEqual({
    countryAccepted: true,
    countryFilled: [['台北車站', '台北101', []]],
    textAccepted: true,
    textFilled: [['台北車站', '台北101', []]],
    expanded: ['https://www.google.com.tw/maps/dir/台北車站/台北101'],
    errors: []
  });
});
