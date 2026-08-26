import { expect, test } from '@playwright/test';

const workerPort = process.env.E2E_WORKER_PORT || '8787';
const WORKER = `/?worker=http://127.0.0.1:${workerPort}`;

async function openReadyDesktop(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(WORKER);
  await expect.poll(() => page.evaluate(() => Boolean(
    window.MapRenderer && window.MapCameraLayer && window.MapRouteLayer && window.MapConditionLayer
  ))).toBe(true);
}

test.describe('MapLibre condition layer seam', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop MapLibre seam verification only.');
  });

  test('new renderer instances compose condition, route, and camera seams', async ({ page }) => {
    await openReadyDesktop(page);

    const result = await page.evaluate(() => {
      const renderer = window.MapRenderer.create({});
      return {
        installed: Boolean(window.MapRenderer.__conditionLayerInstalled),
        conditionInstalled: Boolean(renderer && renderer.conditionLayerInstalled),
        routeInstalled: Boolean(renderer && renderer.routeLayerInstalled),
        cameraInstalled: Boolean(renderer && renderer.cameraLayerInstalled),
        hasConditions: Boolean(renderer && typeof renderer.drawConditionSections === 'function'),
        hasRoute: Boolean(renderer && typeof renderer.drawRoute === 'function'),
        hasCameras: Boolean(renderer && typeof renderer.drawCameras === 'function')
      };
    });

    expect(result).toEqual({
      installed: true,
      conditionInstalled: true,
      routeInstalled: true,
      cameraInstalled: true,
      hasConditions: true,
      hasRoute: true,
      hasCameras: true
    });
  });

  test('draw updates section, event, weather sources and preserves marker isolation', async ({ page }) => {
    await openReadyDesktop(page);

    const result = await page.evaluate(() => {
      function FakeBounds() { this.points = []; }
      FakeBounds.prototype.extend = function(point) { this.points.push(point); return this; };
      FakeBounds.prototype.isEmpty = function() { return this.points.length === 0; };

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
      FakeMarker.prototype.setLngLat = function(coords) { this.coords = coords; return this; };
      FakeMarker.prototype.addTo = function() { return this; };
      FakeMarker.prototype.getElement = function() { return this.element; };
      FakeMarker.prototype.remove = function() { this.removed = true; };

      const staleEvent = makeExistingMarker('desktop-map-marker desktop-event-marker');
      const cameraMarker = makeExistingMarker('desktop-map-marker desktop-cctv-marker');
      const sourceUpdates = {};
      let fit = null;
      let selectedOrder = null;
      const originalEmit = window.Bus.emit;
      window.Bus.emit = function(name, value) {
        if (name === 'condition:select') selectedOrder = value;
      };

      const renderer = {
        markers: [staleEvent, cameraMarker],
        module: { Marker: FakeMarker, LngLatBounds: FakeBounds },
        map: {
          fitBounds(bounds, options) { fit = { points: bounds.points.slice(), options }; }
        },
        routeCoords: [],
        routeFitApplied: false,
        eventMarkerCount: 0,
        _routePadding() { return 77; },
        _setSourceData(id, data) { sourceUpdates[id] = data; }
      };
      window.MapConditionLayer.install(renderer);

      const output = renderer.drawConditionSections([
        {
          order: 2,
          roadRef: '台9線',
          geometry: [[24.10, 121.60], [24.11, 121.61], [24.12, 121.62], [24.13, 121.63]],
          traffic: { level: 'slow' },
          incidents: [
            { title: '<img src=x onerror=alert(1)>施工', description: '道路施工', lat: 24.12, lng: 121.62 },
            { title: '位置概略事故', description: '車禍', lat: 24.11, lng: 121.61, locationApproximate: true }
          ],
          weather: { condition: '短暫雨', rainChance: 40 }
        },
        {
          order: 3,
          roadName: '測試路段',
          geometry: [[24.20, 121.70], [24.21, 121.71]],
          traffic: { level: 'not-known' },
          incidents: [],
          weather: { condition: '晴', rainChance: 10 }
        },
        {
          order: 4,
          geometry: [[24.30, 121.80]],
          traffic: { level: 'clear' },
          incidents: [],
          weather: { condition: '雨', rainChance: 100 }
        }
      ]);

      const eventMarker = renderer.markers.find(marker => {
        const element = marker.getElement && marker.getElement();
        return element && element.classList.contains('desktop-event-marker');
      });
      const eventElement = eventMarker && eventMarker.getElement();
      if (eventElement) eventElement.click();

      const resultValue = {
        sectionCount: output.sections.length,
        sectionLevels: output.sections.map(feature => feature.properties.level),
        eventCount: output.events.length,
        eventKind: output.events[0] && output.events[0].properties.kind,
        weatherCount: output.weather.length,
        weatherCoordinates: output.weather[0] && output.weather[0].geometry.coordinates,
        eventMarkerCount: output.eventMarkerCount,
        markerCount: renderer.markers.length,
        staleRemoved: staleEvent.removed,
        cameraRemoved: cameraMarker.removed,
        eventMarkerCoordinates: eventMarker && eventMarker.coords,
        eventHtml: eventElement && eventElement.innerHTML,
        eventAria: eventElement && eventElement.getAttribute('aria-label'),
        selectedOrder,
        sourceCounts: {
          sections: sourceUpdates['desktop-sections'] && sourceUpdates['desktop-sections'].features.length,
          events: sourceUpdates['desktop-events'] && sourceUpdates['desktop-events'].features.length,
          weather: sourceUpdates['desktop-weather'] && sourceUpdates['desktop-weather'].features.length
        },
        routeCoords: renderer.routeCoords,
        routeFitApplied: renderer.routeFitApplied,
        fit
      };

      window.Bus.emit = originalEmit;
      return resultValue;
    });

    expect(result.sectionCount).toBe(2);
    expect(result.sectionLevels).toEqual(['slow', 'unknown']);
    expect(result.eventCount).toBe(1);
    expect(result.eventKind).toBe('construction');
    expect(result.weatherCount).toBe(1);
    expect(result.weatherCoordinates).toEqual([121.62, 24.12]);
    expect(result.eventMarkerCount).toBe(1);
    expect(result.markerCount).toBe(2);
    expect(result.staleRemoved).toBe(true);
    expect(result.cameraRemoved).toBe(false);
    expect(result.eventMarkerCoordinates).toEqual([121.62, 24.12]);
    expect(result.eventHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(result.eventHtml).not.toContain('<img');
    expect(result.eventAria).toContain('台9線');
    expect(result.selectedOrder).toBe(2);
    expect(result.sourceCounts).toEqual({ sections: 2, events: 1, weather: 1 });
    expect(result.routeCoords).toEqual([
      [24.10, 121.60], [24.11, 121.61], [24.12, 121.62], [24.13, 121.63],
      [24.20, 121.70], [24.21, 121.71]
    ]);
    expect(result.routeFitApplied).toBe(true);
    expect(result.fit.options).toEqual({ padding: 77, maxZoom: 11, duration: 0 });
  });

  test('condition fallback fit does not override an existing route fit and event markers are capped', async ({ page }) => {
    await openReadyDesktop(page);

    const result = await page.evaluate(() => {
      function FakeMarker(options) { this.element = options.element; }
      FakeMarker.prototype.setLngLat = function() { return this; };
      FakeMarker.prototype.addTo = function() { return this; };
      FakeMarker.prototype.getElement = function() { return this.element; };
      FakeMarker.prototype.remove = function() {};

      let fitCalls = 0;
      const renderer = {
        markers: [],
        module: { Marker: FakeMarker },
        map: { fitBounds() { fitCalls += 1; } },
        routeCoords: [[23.9, 121.0], [24.0, 121.1]],
        routeFitApplied: true,
        eventMarkerCount: 0,
        _routePadding() { return 70; },
        _setSourceData() {}
      };
      window.MapConditionLayer.install(renderer);

      const incidents = Array.from({ length: 8 }, (_, index) => ({
        title: `施工 ${index}`,
        description: '道路施工',
        lat: 24.10 + index * 0.001,
        lng: 121.60 + index * 0.001
      }));
      const output = renderer.drawConditionSections([{
        order: 8,
        roadRef: '台8線',
        geometry: [[24.10, 121.60], [24.12, 121.62], [24.14, 121.64]],
        traffic: { level: 'clear' },
        incidents,
        weather: { condition: '晴', rainChance: 0 }
      }]);

      return {
        fitCalls,
        routeCoords: renderer.routeCoords,
        routeFitApplied: renderer.routeFitApplied,
        eventMarkerCount: output.eventMarkerCount,
        markerCount: renderer.markers.length,
        eventFeatureCount: output.events.length
      };
    });

    expect(result.fitCalls).toBe(0);
    expect(result.routeCoords).toEqual([[23.9, 121.0], [24.0, 121.1]]);
    expect(result.routeFitApplied).toBe(true);
    expect(result.eventMarkerCount).toBe(6);
    expect(result.markerCount).toBe(6);
    expect(result.eventFeatureCount).toBe(8);
  });
});
