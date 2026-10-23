import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';

function setup() {
  const window = { setTimeout: vi.fn(), clearTimeout: vi.fn() };
  const context = { window, Config: {}, Dom: { byId: () => null } };
  // Keep the red phase an assertion failure when the embedded style is not here yet.
  expect(existsSync('js/openfreemap-basemap.js')).toBe(true);
  for (const file of ['openfreemap-basemap', 'maplibre-renderer']) {
    vm.runInNewContext(readFileSync(`js/${file}.js`, 'utf8'), context);
  }
  return window;
}

it('recognizes only MapTiler basemap failures, including mobile light', () => {
  const { OpenFreeMapBasemap: ofm } = setup();
  for (const sourceId of ['base', 'mobile-base-light']) {
    for (const status of [401, 403]) expect(ofm.isBaseError({ sourceId, error: { status } })).toBe(true);
    for (const status of [undefined, 404, 500, 503]) expect(ofm.isBaseError({ sourceId, error: { status } })).toBe(false);
  }
  expect(ofm.isBaseError({ error: { status: 403, message: '403 https://api.maptiler.com/maps/dataviz-dark/8/1/1.png' } })).toBe(true);
  expect(ofm.isBaseError({ error: { status: 403, message: '403 https://api.maptiler.com/maps/dataviz-light/8/1/1.png' } })).toBe(true);
  for (const event of [null, {}, { sourceId: 'satellite' }, { error: { message: 'mapterhorn terrain error' } },
    { error: { message: 'https://api.maptiler.com/maps/satellite-v4/1.jpg' } }, { sourceId: 'ofm' }]) {
    expect(ofm.isBaseError(event)).toBe(false);
  }
});

it('switches once, keeps overlays above the basemap and persists across renderers in a session', () => {
  const window = setup();
  const renderer = window.MapRenderer.create({ simple: true, onStatus: vi.fn() });
  const layers = [{ id: 'base' }, { id: 'mobile-base-light' }, { id: 'desktop-route-core' }];
  const sources = {};
  const addSource = vi.fn((id, value) => { sources[id] = value; });
  renderer.map = {
    getSource: id => sources[id], addSource,
    getLayer: id => layers.find(l => l.id === id),
    addLayer: (layer, before) => layers.splice(layers.findIndex(l => l.id === before), 0, layer),
    setLayoutProperty: (id, key, value) => { const l = layers.find(l => l.id === id); l.layout = { ...l.layout, [key]: value }; }
  };
  renderer._useBasemapFallback();
  renderer._useBasemapFallback();
  expect(renderer.onStatus).toHaveBeenCalledTimes(1);
  expect(addSource).toHaveBeenCalledTimes(1);
  expect(sources.ofm.type).toBe('vector');
  expect(layers.filter(l => l.id === 'ofm-dark-background')).toHaveLength(1);
  expect(layers.findIndex(l => l.id === 'ofm-dark-background')).toBeLessThan(layers.findIndex(l => l.id === 'base'));
  renderer.setBaseTheme(true);
  expect(layers.find(l => l.id === 'base').layout.visibility).toBe('none');
  expect(layers.find(l => l.id === 'mobile-base-light').layout.visibility).toBe('none');
  expect(layers.find(l => l.id === 'ofm-positron-background').layout.visibility).toBe('visible');
  renderer.setBasemap('dark');
  expect(layers.find(l => l.id === 'base').layout.visibility).toBe('none');
  expect(window.OpenFreeMapBasemap.active).toBe(true);
});

it('uses the eight-second budget for the active source and cancels it on destroy', () => {
  const window = setup();
  const renderer = window.MapRenderer.create({ simple: true });
  const use = vi.spyOn(renderer, '_useBasemapFallback').mockImplementation(() => {});
  renderer._recordBaseTile({ sourceId: 'base', tile: { state: 'loaded' } });
  renderer.map = {
    getSource: () => ({}), getLayer: () => ({}),
    getLayoutProperty: id => id === (renderer.baseLight ? 'mobile-base-light' : 'base') ? 'visible' : 'none',
    isSourceLoaded: vi.fn(() => true), remove: vi.fn()
  };
  window.setTimeout.mockReturnValue(7);
  renderer._armBaseFallback();
  expect(window.setTimeout.mock.calls[0][1]).toBe(8000);
  window.setTimeout.mock.calls[0][0]();
  expect(use).not.toHaveBeenCalled();
  renderer.baseLight = true;
  renderer.map.isSourceLoaded.mockReturnValue(false);
  renderer._armBaseFallback();
  window.setTimeout.mock.calls[1][0]();
  expect(use).toHaveBeenCalledTimes(1);
  renderer._armBaseFallback();
  renderer.destroy();
  expect(window.clearTimeout).toHaveBeenCalledWith(7);
});

it('embeds only supported non-symbol layers without external resources', () => {
  const { OpenFreeMapBasemap: ofm } = setup();
  for (const layers of Object.values(ofm.layers)) {
    expect(layers[0].type).toBe('background');
    expect(new Set(layers.map(l => l.id)).size).toBe(layers.length);
    for (const layer of layers) {
      expect(['background', 'fill', 'line']).toContain(layer.type);
      if (layer.source) expect(layer.source).toBe('openmaptiles');
      expect(JSON.stringify(layer)).not.toMatch(/pattern|icon-image|text-field/);
    }
  }
});

it('passes the installed MapLibre style specification for both themes', () => {
  const { OpenFreeMapBasemap: ofm } = setup();
  for (const layers of Object.values(ofm.layers)) {
    expect(validateStyleMin({ version: 8, sources: {
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' }
    }, layers }).map(error => error.message)).toEqual([]);
  }
});

it('ignores a hidden basemap and does not inspect it when the budget expires', () => {
  const window = setup();
  const renderer = window.MapRenderer.create({ simple: true });
  renderer.map = {
    getSource: () => ({}), getLayer: () => ({}),
    getLayoutProperty: () => 'none', isSourceLoaded: vi.fn(() => false)
  };
  renderer._armBaseFallback();
  expect(window.setTimeout).not.toHaveBeenCalled();
});

it('checks the visible layer instead of a stale theme flag', () => {
  const window = setup();
  const renderer = window.MapRenderer.create({ simple: true });
  const use = vi.spyOn(renderer, '_useBasemapFallback').mockImplementation(() => {});
  renderer.baseLight = false;
  renderer._recordBaseTile({ sourceId: 'mobile-base-light', tile: { state: 'loaded' } });
  renderer.map = {
    getSource: () => ({}), getLayer: () => ({}),
    getLayoutProperty: id => id === 'mobile-base-light' ? 'visible' : 'none',
    isSourceLoaded: vi.fn(id => id === 'mobile-base-light')
  };
  renderer._armBaseFallback();
  window.setTimeout.mock.calls[0][0]();
  expect(use).not.toHaveBeenCalled();
});

it('stores a theme before map/style creation without mutating unloaded layers', () => {
  const window = setup();
  const renderer = window.MapRenderer.create({ simple: true });
  expect(() => renderer.setBaseTheme(true)).not.toThrow();
  const setLayoutProperty = vi.fn(() => { throw new Error('Style is not done loading'); });
  renderer.map = { getLayer: () => undefined, setLayoutProperty };
  expect(() => renderer.setBaseTheme(true)).not.toThrow();
  expect(setLayoutProperty).not.toHaveBeenCalled();
  expect(renderer.baseLight).toBe(true);
});

it('defers total tile failure to the budget even when MapLibre reports the source loaded', () => {
  const window = setup();
  const renderer = window.MapRenderer.create({ simple: true });
  const use = vi.spyOn(renderer, '_useBasemapFallback').mockImplementation(() => {});
  renderer.map = {
    getSource: () => ({}), getLayer: () => ({}),
    getLayoutProperty: id => id === 'base' ? 'visible' : 'none', isSourceLoaded: () => true
  };
  renderer._recordBaseTile({ sourceId: 'base', tile: { state: 'errored' } });
  renderer._armBaseFallback();
  expect(use).not.toHaveBeenCalled();
  window.setTimeout.mock.calls[0][0]();
  expect(use).toHaveBeenCalledTimes(1);
});
