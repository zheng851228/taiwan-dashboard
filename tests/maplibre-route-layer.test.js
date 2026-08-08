import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

class FakeBounds {
  constructor() {
    this.points = [];
  }

  extend(point) {
    this.points.push(point);
    return this;
  }

  isEmpty() {
    return this.points.length === 0;
  }
}

async function loadRouteLayer() {
  const source = await readFile(path.join(root, 'js/maplibre-route-layer.js'), 'utf8');
  const originalCreate = vi.fn(() => ({
    module: { LngLatBounds: FakeBounds },
    map: { fitBounds: vi.fn() },
    routeCoords: [],
    routeFitApplied: false,
    _routePadding: vi.fn(() => 88),
    _setSourceData: vi.fn()
  }));
  const window = { MapRenderer: { create: originalCreate } };
  vm.runInNewContext(source, { window });
  return { window, originalCreate };
}

describe('MapLibre route overlay seam', () => {
  it('patches new renderer instances without changing the public drawRoute API', async () => {
    const { window, originalCreate } = await loadRouteLayer();
    const renderer = window.MapRenderer.create({ container: 'desktop-map' });

    expect(originalCreate).toHaveBeenCalledOnce();
    expect(renderer.routeLayerInstalled).toBe(true);
    expect(typeof renderer.drawRoute).toBe('function');
    expect(window.MapRenderer.__routeLayerInstalled).toBe(true);
  });

  it('writes route GeoJSON, stores coordinates, and preserves fitBounds behavior', async () => {
    const { window } = await loadRouteLayer();
    const renderer = window.MapRenderer.create({});
    const coords = [[25.0478, 121.5170], [24.7570, 121.7530]];

    const rendered = renderer.drawRoute(coords);

    expect(rendered).toBe(true);
    expect(renderer.routeCoords).toEqual(coords);
    expect(renderer.routeCoords).not.toBe(coords);
    expect(renderer.routeFitApplied).toBe(true);
    expect(renderer._setSourceData).toHaveBeenCalledWith('desktop-route', {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [[121.5170, 25.0478], [121.7530, 24.7570]]
        }
      }]
    });
    expect(renderer._routePadding).toHaveBeenCalledOnce();
    expect(renderer.map.fitBounds).toHaveBeenCalledOnce();
    const [bounds, options] = renderer.map.fitBounds.mock.calls[0];
    expect(bounds.points).toEqual([[121.5170, 25.0478], [121.7530, 24.7570]]);
    expect(options).toEqual({ padding: 88, maxZoom: 11, duration: 0 });
  });

  it('does not mutate route state for an incomplete line', async () => {
    const { window } = await loadRouteLayer();
    const renderer = window.MapRenderer.create({});

    expect(renderer.drawRoute([[25.0478, 121.5170]])).toBe(false);
    expect(renderer.routeCoords).toEqual([]);
    expect(renderer.routeFitApplied).toBe(false);
    expect(renderer._setSourceData).not.toHaveBeenCalled();
    expect(renderer.map.fitBounds).not.toHaveBeenCalled();
  });
});
