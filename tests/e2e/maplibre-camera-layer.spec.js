import { expect, test } from '@playwright/test';

const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;

async function openReadyDesktop(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(WORKER);
  await expect.poll(() => page.evaluate(() => Boolean(window.MapRenderer && window.MapCameraLayer))).toBe(true);
}

test.describe('MapLibre camera layer seam', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop MapLibre seam verification only.');
  });

  test('new renderer instances delegate drawCameras to MapCameraLayer', async ({ page }) => {
    await openReadyDesktop(page);

    const result = await page.evaluate(() => {
      const renderer = window.MapRenderer.create({});
      return {
        installed: Boolean(window.MapRenderer.__cameraLayerInstalled),
        rendererInstalled: Boolean(renderer && renderer.cameraLayerInstalled),
        hasDraw: Boolean(renderer && typeof renderer.drawCameras === 'function')
      };
    });

    expect(result.installed).toBe(true);
    expect(result.rendererInstalled).toBe(true);
    expect(result.hasDraw).toBe(true);
  });

  test('draw removes stale CCTV markers, ignores invalid coordinates, and opens cameras through the bus boundary', async ({ page }) => {
    await openReadyDesktop(page);

    const result = await page.evaluate(() => {
      function makeExistingMarker(className) {
        const element = document.createElement('button');
        element.className = className;
        return {
          removed: false,
          getElement() { return element; },
          remove() { this.removed = true; }
        };
      }

      function FakeMarker(options) {
        this.element = options.element;
        this.coords = null;
        this.removed = false;
      }
      FakeMarker.prototype.setLngLat = function(coords) {
        this.coords = coords;
        return this;
      };
      FakeMarker.prototype.addTo = function() { return this; };
      FakeMarker.prototype.getElement = function() { return this.element; };
      FakeMarker.prototype.remove = function() { this.removed = true; };

      const staleCamera = makeExistingMarker('desktop-map-marker desktop-cctv-marker');
      const eventMarker = makeExistingMarker('desktop-map-marker desktop-event-marker');
      let sourceUpdate = null;
      let openedCamera = null;
      window.Bus.on('camera:selected', function(cam) { openedCamera = cam && cam.id; });

      const renderer = {
        markers: [staleCamera, eventMarker],
        cameraById: {},
        module: { Marker: FakeMarker },
        map: {},
        _setSourceData(id, data) { sourceUpdate = { id, data }; }
      };

      const features = window.MapCameraLayer.draw(renderer, [
        { id: 'cam-1', name: '測試攝影機', lat: 24.15, lng: 120.68 },
        { id: 'bad', name: '無效攝影機', lat: 'not-a-number', lng: 120.7 }
      ]);

      const newCameraMarker = renderer.markers.find(marker => {
        const element = marker.getElement && marker.getElement();
        return element && element.classList.contains('desktop-cctv-marker');
      });
      const cameraElement = newCameraMarker && newCameraMarker.getElement();
      if (cameraElement) cameraElement.click();

      return {
        featureCount: features.length,
        featureCoordinates: features[0] && features[0].geometry.coordinates,
        cameraIds: Object.keys(renderer.cameraById),
        markerCount: renderer.markers.length,
        staleRemoved: staleCamera.removed,
        eventRemoved: eventMarker.removed,
        sourceId: sourceUpdate && sourceUpdate.id,
        sourceFeatureCount: sourceUpdate && sourceUpdate.data.features.length,
        ariaLabel: cameraElement && cameraElement.getAttribute('aria-label'),
        title: cameraElement && cameraElement.title,
        markerCoordinates: newCameraMarker && newCameraMarker.coords,
        openedCamera,
        infoGlobal: typeof window.InfoMod
      };
    });

    expect(result.featureCount).toBe(1);
    expect(result.featureCoordinates).toEqual([120.68, 24.15]);
    expect(result.cameraIds).toEqual(['cam-1']);
    expect(result.markerCount).toBe(2);
    expect(result.staleRemoved).toBe(true);
    expect(result.eventRemoved).toBe(false);
    expect(result.sourceId).toBe('desktop-cameras');
    expect(result.sourceFeatureCount).toBe(1);
    expect(result.ariaLabel).toBe('沿途 CCTV：測試攝影機');
    expect(result.title).toBe('測試攝影機');
    expect(result.markerCoordinates).toEqual([120.68, 24.15]);
    expect(result.openedCamera).toBe('cam-1');
    expect(result.infoGlobal).toBe('undefined');
  });
});
