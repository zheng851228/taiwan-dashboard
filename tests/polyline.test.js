import { describe, expect, it } from 'vitest';
import {
  decodePolyline6,
  encodePolyline6,
  haversineKm,
  mergeLegShapes
} from '../worker/src/polyline.js';

describe('polyline6 helpers', () => {
  it('round trips Taiwan coordinates without meaningful drift', () => {
    const coordinates = [
      [25.0478, 121.517],
      [24.9957, 121.5409],
      [24.757, 121.753]
    ];
    expect(decodePolyline6(encodePolyline6(coordinates))).toEqual(coordinates);
  });

  it('merges legs without duplicating the shared waypoint', () => {
    const first = encodePolyline6([[25, 121.5], [24.9, 121.6]]);
    const second = encodePolyline6([[24.9, 121.6], [24.8, 121.7]]);
    expect(mergeLegShapes([first, second])).toEqual([
      [25, 121.5],
      [24.9, 121.6],
      [24.8, 121.7]
    ]);
  });

  it('computes plausible distance', () => {
    expect(haversineKm([25.0478, 121.517], [24.757, 121.753])).toBeGreaterThan(35);
  });
});
