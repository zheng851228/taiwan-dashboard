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
    const [html, pwaScript, styles, serviceWorker, developerChangelog, maplibreRenderer, desktopBootstrap, providerConfig] = await Promise.all([
      readFile(path.join(root, 'index.html'), 'utf8'),
      readFile(path.join(root, 'js/pwa.js'), 'utf8'),
      readFile(path.join(root, 'css/style.css'), 'utf8'),
      readFile(path.join(root, 'sw.js'), 'utf8'),
      readFile(path.join(root, '.github/DEVELOPER_CHANGELOG.md'), 'utf8'),
      readFile(path.join(root, 'js/maplibre-renderer.js'), 'utf8'),
      readFile(path.join(root, 'js/desktop-bootstrap.js'), 'utf8'),
      readFile(path.join(root, 'js/map-provider-config.js'), 'utf8')
    ]);
    expect(html).not.toMatch(/(?:unpkg|cdnjs|fonts\.googleapis)\.com/);
    expect(html).toContain('js/pwa.js');
    expect(serviceWorker).toContain('./assets/vendor/leaflet/leaflet.js');
    expect(serviceWorker).toContain('./assets/vendor/fontawesome/css/all.min.css');
    expect(serviceWorker).toContain('./assets/icons/apple-touch-icon.png');
    expect(serviceWorker).toContain('cache: "reload"');
    expect(serviceWorker).toContain('SKIP_WAITING');
    expect(serviceWorker).toContain('const CACHE_VERSION = "v43"');
    expect(serviceWorker).toContain('./css/tailwind.generated.css?v=43');
    expect(serviceWorker).toContain('./css/style.css?v=43');
    expect(html).toContain('js/core.js?v=43');
    expect(html).toContain('js/pwa.js?v=43');
    expect(serviceWorker).toContain('./js/core.js?v=43');
    expect(serviceWorker).toContain('./js/pwa.js?v=43');
    expect(serviceWorker).toContain('/\\/cam-list\\.json$/');
    expect(html).toContain('id="tailwind-style-recovery" class="hidden"');
    expect(html).toContain('id="app-style-recovery" class="app-style-sentinel"');
    expect(html).toContain('js/desktop-bootstrap.js');
    expect(serviceWorker).toContain('./js/desktop-bootstrap.js');
    expect(serviceWorker).not.toContain('./js/maplibre-renderer.js');
    expect(serviceWorker).not.toContain('./js/desktop-dashboard.js');
    expect(serviceWorker).not.toContain('twdash-shell-v24');
    expect(pwaScript).toContain('tw_pwa_install_prompted_v2');
    expect(pwaScript).toContain('conditions:updated');
    expect(pwaScript).toContain('isIPhone()');
    expect(pwaScript).toContain('isSafari()');
    expect(pwaScript).toContain('installGuideWouldInterrupt()');
    expect(styles).toContain('body:has(#pwa-update-banner:not(.hidden)) .map-top-panel');
    expect(developerChangelog).toContain('PWA v34');
    expect(maplibreRenderer).toContain('var TERRAIN_BOUNDS = [117.5, 20.5, 123.4, 26.7]');
    expect(maplibreRenderer).toContain('bounds: TERRAIN_BOUNDS');
    expect(maplibreRenderer).toContain('dark_nolabels');
    expect(maplibreRenderer).toContain('_addPlaceLabels');
    expect(maplibreRenderer).toContain('setCameraPreset');
    expect(maplibreRenderer).toContain('setBasemap');
    expect(maplibreRenderer).toContain('satelliteTiles');
    expect(maplibreRenderer).toContain('setWorkerUrl');
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("worker-src 'self'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("base-uri 'self'");
    expect(html).not.toContain('onclick=');
    const mainUi = await readFile(path.join(root, 'js/main-ui.js'), 'utf8');
    expect(mainUi).toContain('youtube-nocookie.com');
    expect(mainUi).toContain('allow-scripts allow-same-origin allow-presentation');
    expect(desktopBootstrap).toContain('DESKTOP_QUERY');
    expect(desktopBootstrap).toContain('maplibre-renderer.js');
    expect(desktopBootstrap).toContain('map-provider-config.js');
    expect(providerConfig).toContain("keyName: 'taiwan-dashboard-pages'");
    expect(providerConfig).toContain("tileset: 'satellite-v4'");
    expect(providerConfig).toMatch(/key:\s*['\"][^'\"]+['\"]/);
    expect(html).not.toContain('DEVELOPER_CHANGELOG');
    expect(serviceWorker).not.toContain('DEVELOPER_CHANGELOG');
  });
});
