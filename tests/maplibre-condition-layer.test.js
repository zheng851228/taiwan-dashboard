import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

function createElement() {
  const listeners = {};
  const attributes = {};
  const element = {
    type: '', className: '', innerHTML: '', listeners, attributes,
    style: { setProperty: vi.fn() },
    setAttribute(name, value) { attributes[name] = String(value); },
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  element.classList = { contains(token) { return element.className.split(/\s+/).includes(token); } };
  return element;
}

class FakeBounds {
  constructor() { this.points = []; }
  extend(point) { this.points.push(point); return this; }
  isEmpty() { return this.points.length === 0; }
}

class FakeMarker {
  constructor(options) { this.element = options.element; this.removed = false; }
  setLngLat(value) { this.lngLat = value; return this; }
  addTo(map) { this.map = map; return this; }
  getElement() { return this.element; }
  remove() { this.removed = true; }
}

async function loadLayer() {
  const source = await readFile(path.join(root, 'js/maplibre-condition-layer.js'), 'utf8');
  const emit = vi.fn();
  const renderer = {
    markers: [],
    module: { Marker: FakeMarker, LngLatBounds: FakeBounds },
    map: { fitBounds: vi.fn() },
    routeCoords: [],
    routeFitApplied: false,
    eventMarkerCount: 0,
    _setSourceData: vi.fn(),
    _routePadding: vi.fn(() => 72)
  };
  const window = {
    Bus: { emit },
    escapeHtml: value => String(value),
    MapRenderer: { create: vi.fn(() => renderer) }
  };
  const document = { createElement: vi.fn(createElement) };
  vm.runInNewContext(source, { window, document });
  return { window, renderer, emit };
}

describe('MapLibre condition overlay seam', () => {
  it('classifies traffic, incident, and rainy weather into stable GeoJSON outputs', async () => {
    const { window, renderer } = await loadLayer();
    const instance = window.MapRenderer.create({});
    const sections = [{
      order: 2,
      roadRef: '台74線',
      geometry: [[24.10, 120.65], [24.11, 120.66], [24.12, 120.67], [24.13, 120.68]],
      traffic: { level: 'congested' },
      incidents: [{ title: '道路施工', lat: 24.12, lng: 120.67, locationApproximate: false }],
      weather: { condition: '陣雨', rainChance: 70 }
    }];

    const result = instance.drawConditionSections(sections);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].properties.level).toBe('congested');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].properties.kind).toBe('construction');
    expect(result.weather).toHaveLength(1);
    expect(result.eventMarkerCount).toBe(1);

    const writes = renderer._setSourceData.mock.calls.map(([id, data]) => ({ id, featureCount: data.features.length }));
    expect(writes).toEqual([
      { id: 'desktop-sections', featureCount: 1 },
      { id: 'desktop-events', featureCount: 1 },
      { id: 'desktop-weather', featureCount: 1 }
    ]);
    expect(renderer.routeCoords.length).toBeGreaterThan(1);
    expect(renderer.routeFitApplied).toBe(true);
    expect(renderer.map.fitBounds).toHaveBeenCalledOnce();
  });

  it('keeps approximate incidents off-map and caps event markers at six', async () => {
    const { window } = await loadLayer();
    const instance = window.MapRenderer.create({});
    const incidents = Array.from({ length: 8 }, (_, index) => ({
      title: '事故 ' + index,
      lat: 24.11 + index * 0.001,
      lng: 120.66 + index * 0.001,
      locationApproximate: false
    }));
    incidents.push({ title: '位置不明事故', lat: 24.2, lng: 120.7, locationApproximate: true });

    const result = instance.drawConditionSections([{
      order: 1,
      geometry: [[24.10, 120.65], [24.11, 120.66], [24.12, 120.67], [24.13, 120.68]],
      traffic: { level: 'clear' },
      incidents,
      weather: { condition: '晴', rainChance: 10 }
    }]);

    expect(result.eventMarkerCount).toBe(6);
    expect(instance.markers.filter(marker => marker.getElement().classList.contains('desktop-event-marker'))).toHaveLength(6);
    expect(result.weather).toHaveLength(0);
  });

  it('event marker selection preserves the existing condition:select contract', async () => {
    const { window, emit } = await loadLayer();
    const instance = window.MapRenderer.create({});
    instance.drawConditionSections([{
      order: 7,
      roadName: '測試道路',
      geometry: [[24.10, 120.65], [24.11, 120.66], [24.12, 120.67]],
      traffic: { level: 'slow' },
      incidents: [{ title: '車禍', lat: 24.11, lng: 120.66, locationApproximate: false }],
      weather: {}
    }]);

    const marker = instance.markers[0];
    marker.getElement().listeners.click();
    expect(emit).toHaveBeenCalledWith('condition:select', 7);
  });
});
