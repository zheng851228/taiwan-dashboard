import { describe, expect, it } from 'vitest';
import { TAIWAN_REGIONS, TAIWAN_ROUTE_CASES } from '../scripts/taiwan-route-cases.mjs';

describe('Taiwan live route matrix', () => {
  it('covers all 22 Taiwan regions', () => {
    const covered = new Set(TAIWAN_ROUTE_CASES.flatMap((testCase) => testCase.regions));
    expect([...TAIWAN_REGIONS].sort()).toEqual([...covered].sort());
  });

  it('contains unique cases for mainland corridors, islands, plates, and stress testing', () => {
    const ids = TAIWAN_ROUTE_CASES.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(TAIWAN_ROUTE_CASES.map((testCase) => testCase.category))).toEqual(
      new Set(['regional', 'critical', 'island', 'plate', 'stress'])
    );
    expect(new Set(TAIWAN_ROUTE_CASES.map((testCase) => testCase.plate))).toEqual(
      new Set(['white', 'yellow', 'red'])
    );
  });

  it('keeps every stop inside the supported Taiwan coordinate bounds', () => {
    TAIWAN_ROUTE_CASES.forEach((testCase) => {
      expect(testCase.locations.length).toBeGreaterThanOrEqual(2);
      testCase.locations.forEach((location) => {
        expect(location.lat).toBeGreaterThanOrEqual(21);
        expect(location.lat).toBeLessThanOrEqual(26.5);
        expect(location.lng).toBeGreaterThanOrEqual(118);
        expect(location.lng).toBeLessThanOrEqual(123.5);
      });
      expect(testCase.distanceKm[0]).toBeGreaterThan(0);
      expect(testCase.distanceKm[1]).toBeGreaterThan(testCase.distanceKm[0]);
    });
  });
});
