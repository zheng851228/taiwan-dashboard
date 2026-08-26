import { expect, test } from '@playwright/test';

const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;

async function openReadyDesktop(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(WORKER);
  await expect.poll(() => page.evaluate(() => Boolean(window.MapRenderer && window.MapRouteLayer && window.MapCameraLayer))).toBe(true);
}

test.describe('MapLibre route layer seam', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop MapLibre seam verification only.');
  });

  // Route wrapping must compose with the already-installed camera seam.
  test('new renderer instances delegate drawRoute to MapRouteLayer without losing camera seam', async ({ page }) => {
    await openReadyDesktop(page);

    const result = await page.evaluate(() => {
      const renderer = window.MapRenderer.create({});
      return {
        installed: Boolean(window.MapRenderer.__routeLayerInstalled),
        rendererInstalled: Boolean(renderer && renderer.routeLayerInstalled),
        cameraInstalled: Boolean(renderer && renderer.cameraLayerInstalled),
        hasDrawRoute: Boolean(renderer && typeof renderer.drawRoute === 'function'),
        hasDrawCameras: Boolean(renderer && typeof renderer.drawCameras === 'function')
      };
    });

    expect(result.installed).toBe(true);
    expect(result.rendererInstalled).toBe(true);
    expect(result.cameraInstalled).toBe(true);
    expect(result.hasDrawRoute).toBe(true);
    expect(result.hasDrawCameras).toBe(true);
  });

  test('draw updates route source, route state, and fit bounds', async ({ page }) => {
    await openReadyDesktop(page);

    const result = await page.evaluate(() => {
      function FakeBounds() {
        this.points = [];
      }
      FakeBounds.prototype.extend = function(point) {
        this.points.push(point);
        return this;
      };
      FakeBounds.prototype.isEmpty = function() {
        return this.points.length === 0;
      };

      let sourceUpdate = null;
      let fit = null;
      const renderer = {
        module: { LngLatBounds: FakeBounds },
        map: {
          fitBounds(bounds, options) {
            fit = { points: bounds.points.slice(), options };
          }
        },
        routeCoords: [],
        routeFitApplied: false,
        _routePadding() { return 88; },
        _setSourceData(id, data) { sourceUpdate = { id, data }; }
      };

      const coords = [[24.15, 120.68], [24.2, 120.74]];
      const drawn = window.MapRouteLayer.draw(renderer, coords);
      const rejected = window.MapRouteLayer.draw(renderer, [[24.15, 120.68]]);

      return {
        drawn,
        rejected,
        routeCoords: renderer.routeCoords,
        routeFitApplied: renderer.routeFitApplied,
        sourceId: sourceUpdate && sourceUpdate.id,
        geometry: sourceUpdate && sourceUpdate.data.features[0].geometry,
        fit
      };
    });

    expect(result.drawn).toBe(true);
    expect(result.rejected).toBe(false);
    expect(result.routeCoords).toEqual([[24.15, 120.68], [24.2, 120.74]]);
    expect(result.routeFitApplied).toBe(true);
    expect(result.sourceId).toBe('desktop-route');
    expect(result.geometry).toEqual({
      type: 'LineString',
      coordinates: [[120.68, 24.15], [120.74, 24.2]]
    });
    expect(result.fit.points).toEqual([[120.68, 24.15], [120.74, 24.2]]);
    expect(result.fit.options).toEqual({ padding: 88, maxZoom: 11, duration: 0 });
  });
});
