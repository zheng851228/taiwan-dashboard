import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

function createElement() {
  const listeners = {};
  const attributes = {};
  const element = {
    type: '',
    className: '',
    title: '',
    innerHTML: '',
    listeners,
    attributes,
    style: { setProperty: vi.fn() },
    setAttribute(name, value) { attributes[name] = String(value); },
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  element.classList = {
    contains(token) {
      return element.className.split(/\s+/).includes(token);
    }
  };
  return element;
}

class FakeMarker {
  constructor(options) {
    this.element = options.element;
    this.anchor = options.anchor;
    this.removed = false;
  }

  setLngLat(value) {
    this.lngLat = value;
    return this;
  }

  addTo(map) {
    this.map = map;
    return this;
  }

  getElement() {
    return this.element;
  }

  remove() {
    this.removed = true;
  }
}

async function loadCameraLayer() {
  const source = await readFile(path.join(root, 'js/maplibre-camera-layer.js'), 'utf8');
  const infoOpen = vi.fn();
  const originalCreate = vi.fn(() => ({
    markers: [],
    module: { Marker: FakeMarker },
    map: { id: 'map' },
    _setSourceData: vi.fn()
  }));
  const window = {
    InfoMod: { open: infoOpen },
    MapRenderer: { create: originalCreate }
  };
  const document = { createElement: vi.fn(createElement) };
  vm.runInNewContext(source, { window, document });
  return { window, document, infoOpen, originalCreate };
}

describe('MapLibre camera overlay seam', () => {
  it('patches new renderer instances without changing the public drawCameras API', async () => {
    const { window, originalCreate } = await loadCameraLayer();
    const renderer = window.MapRenderer.create({ container: 'desktop-map' });

    expect(originalCreate).toHaveBeenCalledOnce();
    expect(renderer.cameraLayerInstalled).toBe(true);
    expect(typeof renderer.drawCameras).toBe('function');
    expect(window.MapRenderer.__cameraLayerInstalled).toBe(true);
  });

  it('renders valid CCTV markers, updates GeoJSON, and opens camera info', async () => {
    const { window, infoOpen } = await loadCameraLayer();
    const renderer = window.MapRenderer.create({});
    const valid = { id: 'cam-1', name: '測試攝影機', lat: 24.15, lng: 120.67 };
    const invalid = { id: 'cam-bad', name: '缺座標', lat: null, lng: 120.7 };

    const features = renderer.drawCameras([valid, invalid]);

    expect(features).toHaveLength(1);
    expect(features[0].properties.id).toBe('cam-1');
    expect(features[0].geometry.coordinates).toEqual([120.67, 24.15]);
    expect(renderer.cameraById['cam-1']).toEqual(valid);
    expect(renderer.cameraById['cam-bad']).toBeUndefined();
    expect(renderer.markers).toHaveLength(1);
    expect(renderer._setSourceData).toHaveBeenCalledWith('desktop-cameras', {
      type: 'FeatureCollection',
      features
    });

    const marker = renderer.markers[0];
    const element = marker.getElement();
    expect(element.classList.contains('desktop-cctv-marker')).toBe(true);
    expect(element.attributes['aria-label']).toContain('測試攝影機');
    expect(marker.lngLat).toEqual([120.67, 24.15]);

    const stopPropagation = vi.fn();
    element.listeners.click({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(infoOpen).toHaveBeenCalledWith(valid);
  });

  it('replaces only prior CCTV markers and preserves unrelated renderer markers', async () => {
    const { window } = await loadCameraLayer();
    const renderer = window.MapRenderer.create({});
    const unrelatedElement = createElement();
    unrelatedElement.className = 'desktop-map-marker desktop-start-marker';
    const cameraElement = createElement();
    cameraElement.className = 'desktop-map-marker desktop-cctv-marker';
    const unrelated = new FakeMarker({ element: unrelatedElement, anchor: 'center' });
    const previousCamera = new FakeMarker({ element: cameraElement, anchor: 'center' });
    renderer.markers.push(unrelated, previousCamera);

    renderer.drawCameras([{ id: 'cam-2', lat: 25.03, lng: 121.56 }]);

    expect(previousCamera.removed).toBe(true);
    expect(unrelated.removed).toBe(false);
    expect(renderer.markers).toHaveLength(2);
    expect(renderer.markers).toContain(unrelated);
    expect(renderer.markers.some(marker => marker.getElement().classList.contains('desktop-cctv-marker'))).toBe(true);
  });
});
