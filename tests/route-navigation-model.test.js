import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function loadModel() {
  const source = await readFile(path.join(root, 'js/route-navigation-model.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window, URLSearchParams });
  return window.RouteNavigationModel;
}

describe('RouteNavigationModel', () => {
  it('normalizes route locations into stable coordinate strings', async () => {
    const model = await loadModel();
    expect(model.routePoints({ locations: [
      { lat: 25.033964, lng: 121.564468 },
      { lat: 24.147736, lng: 120.673648 }
    ] })).toEqual([
      '25.033964,121.564468',
      '24.147736,120.673648'
    ]);
  });

  it('builds Google Maps targets with waypoints and white-plate avoidance', async () => {
    const model = await loadModel();
    const points = ['25.000000,121.000000', '24.500000,121.200000', '24.000000,121.500000'];
    const url = new URL(model.googleUrl(points, 'motorcycle', 'white'));
    expect(url.searchParams.get('origin')).toBe(points[0]);
    expect(url.searchParams.get('destination')).toBe(points[2]);
    expect(url.searchParams.get('waypoints')).toBe(points[1]);
    expect(url.searchParams.get('travelmode')).toBe('two-wheeler');
    expect(url.searchParams.get('avoid')).toBe('highways,tolls');
    expect(url.searchParams.get('dir_action')).toBe('navigate');
  });

  it('keeps car navigation on driving mode without motorcycle avoidance', async () => {
    const model = await loadModel();
    const url = new URL(model.googleUrl([
      '25.000000,121.000000',
      '24.000000,121.500000'
    ], 'car', 'white'));
    expect(url.searchParams.get('travelmode')).toBe('driving');
    expect(url.searchParams.has('avoid')).toBe(false);
  });

  it('splits Apple Maps multi-stop routes into ordered legs and requests a handoff', async () => {
    const model = await loadModel();
    const points = ['A', 'B', 'C'];
    const legs = model.appleLegs(points);
    expect(legs).toHaveLength(2);
    expect(legs[0].index).toBe(1);
    expect(new URL(legs[0].href).searchParams.get('saddr')).toBe('A');
    expect(new URL(legs[0].href).searchParams.get('daddr')).toBe('B');
    expect(model.appleClickIntent(points)).toEqual({
      preventDefault: true,
      revealLegs: true,
      message: 'Apple Maps 請依順序開啟各段路線'
    });
  });

  it('disables external navigation when fewer than two route points exist', async () => {
    const model = await loadModel();
    const state = model.buildNavigation({ locations: [{ lat: 25, lng: 121 }] }, 'motorcycle', 'white');
    expect(state.enabled).toBe(false);
    expect(state.googleHref).toBe('#');
    expect(state.appleHref).toBe('#');
    expect(state.appleLegs).toHaveLength(0);
    expect(model.appleClickIntent(state.points).preventDefault).toBe(true);
  });
});
