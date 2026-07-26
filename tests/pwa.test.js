import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');

describe('PWA install and offline assets', () => {
  it('declares standalone iPhone-ready manifest metadata', async () => {
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait-primary');
    expect(manifest.start_url).toBe('./');
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'maskable' })
    ]));
  });

  it.each([
    ['assets/icons/apple-touch-icon.png', 180],
    ['assets/icons/icon-192.png', 192],
    ['assets/icons/icon-512.png', 512],
    ['assets/icons/maskable-512.png', 512]
  ])('ships a correctly sized %s', async (relativePath, size) => {
    const metadata = await sharp(path.join(root, relativePath)).metadata();
    expect(metadata.width).toBe(size);
    expect(metadata.height).toBe(size);
    expect(metadata.format).toBe('png');
  });

  it('keeps the complete app shell local and cacheable', async () => {
    const [html, serviceWorker] = await Promise.all([
      readFile(path.join(root, 'index.html'), 'utf8'),
      readFile(path.join(root, 'sw.js'), 'utf8')
    ]);
    expect(html).not.toMatch(/(?:unpkg|cdnjs|fonts\.googleapis)\.com/);
    expect(html).toContain('js/pwa.js');
    expect(serviceWorker).toContain('./assets/vendor/leaflet/leaflet.js');
    expect(serviceWorker).toContain('./assets/vendor/fontawesome/css/all.min.css');
    expect(serviceWorker).toContain('./assets/icons/apple-touch-icon.png');
    expect(serviceWorker).toContain('cache: "reload"');
    expect(serviceWorker).toContain('SKIP_WAITING');
    expect(serviceWorker).toContain('twdash-shell-v12');
  });
});
