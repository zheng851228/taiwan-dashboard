import { describe, expect, it } from 'vitest';
import { buildAvoidLocations, validateRouteEdges } from '../worker/src/rules.js';

function edge(name, roadClass = 'primary', extra = {}) {
  return {
    names: [name],
    roadClass,
    use: 'road',
    beginShapeIndex: 0,
    endShapeIndex: 2,
    ...extra
  };
}

describe('Taiwan motorcycle route rules', () => {
  it.each(['white', 'yellow', 'red'])('blocks national freeways for %s plates', (plate) => {
    const result = validateRouteEdges([edge('國道5號', 'motorway')], { type: 'motorcycle', plate });
    expect(result.status).toBe('blocked');
    expect(result.violations[0].code).toBe('national-freeway');
  });

  it('blocks expressways for white plates', () => {
    const result = validateRouteEdges([edge('台61線 西濱快速公路', 'trunk')], {
      type: 'motorcycle',
      plate: 'white'
    });
    expect(result.status).toBe('blocked');
    expect(result.violations[0].code).toBe('white-plate-expressway');
  });

  it.each([
    '堤頂大道',
    '環東大道',
    '建國高架道路',
    '市民大道高架道路',
    '基隆高架道路',
    '新生北路高架橋'
  ])('blocks the named Taipei elevated road %s for white plates', (roadName) => {
    const result = validateRouteEdges([edge(roadName, 'trunk')], {
      type: 'motorcycle',
      plate: 'white'
    });
    expect(result.status).toBe('blocked');
    expect(result.violations[0].code).toBe('white-plate-expressway');
  });

  it('does not confuse Civic Boulevard surface streets with the elevated road', () => {
    const result = validateRouteEdges([edge('市民大道', 'primary')], {
      type: 'motorcycle',
      plate: 'white'
    });
    expect(result.status).toBe('safe');
  });

  it.each(['yellow', 'red'])('allows Taipei elevated roads and their ramps for %s plates', (plate) => {
    const result = validateRouteEdges([
      edge('市民大道高架道路', 'trunk', { beginShapeIndex: 0, endShapeIndex: 1 }),
      edge('重慶南路出口匝道', 'trunk', { use: 'ramp', beginShapeIndex: 1, endShapeIndex: 2 })
    ], { type: 'motorcycle', plate });
    expect(result.status).toBe('safe');
  });

  it('allows an ordinary open expressway for yellow and red plates', () => {
    expect(validateRouteEdges([edge('台61線')], { type: 'motorcycle', plate: 'yellow' }).status).toBe('safe');
    expect(validateRouteEdges([edge('台61線')], { type: 'motorcycle', plate: 'red' }).status).toBe('safe');
  });

  it('allows National 3A only for heavy motorcycles', () => {
    expect(validateRouteEdges([edge('國道3甲', 'motorway')], { type: 'motorcycle', plate: 'yellow' }).status).toBe('safe');
    expect(validateRouteEdges([edge('國道3甲', 'motorway')], { type: 'motorcycle', plate: 'white' }).status).toBe('blocked');
  });

  it.each([
    '台65線 土城一交流道',
    '台74線 草湖交流道',
    '台76線 八卦山隧道',
    '台78線 古坑系統交流道',
    '台82線 水上系統交流道',
    '台88線 五甲系統交流道'
  ])('blocks the officially restricted heavy-motorcycle section at %s', (roadName) => {
    const result = validateRouteEdges([edge(roadName)], { type: 'motorcycle', plate: 'red' });
    expect(result.status).toBe('blocked');
    expect(result.violations[0].code).toBe('heavy-motorcycle-restricted-section');
  });

  it('blocks the southbound Taiwan 2-Ji exception for heavy motorcycles', () => {
    const result = validateRouteEdges([edge('台2己線 南下')], {
      type: 'motorcycle',
      plate: 'yellow'
    });
    expect(result.status).toBe('blocked');
    expect(result.violations[0].code).toBe('directional-motorcycle-restriction');
  });

  it('fails closed for an unidentified motorway', () => {
    const result = validateRouteEdges([edge('交流道匝道', 'motorway')], {
      type: 'motorcycle',
      plate: 'yellow'
    });
    expect(result.status).toBe('blocked');
    expect(result.violations[0].confidence).toBe('uncertain');
  });

  it('does not reinterpret graph digitization direction as a motorcycle restriction', () => {
    const result = validateRouteEdges([
      edge('台9線', 'primary', { forward: false, traversability: 'backward' })
    ], { type: 'motorcycle', plate: 'white' });
    expect(result.status).toBe('safe');
  });

  it('does not treat endpoint traversability metadata as an access restriction', () => {
    const result = validateRouteEdges([
      edge('莒光路', 'residential', { traversability: 'none' })
    ], { type: 'motorcycle', plate: 'white' });
    expect(result.status).toBe('safe');
  });

  it('blocks an explicit motorcycle access restriction', () => {
    const result = validateRouteEdges([
      edge('台9線', 'primary', { motorcycleAccess: 'no' })
    ], { type: 'motorcycle', plate: 'white' });
    expect(result.violations[0].code).toBe('directional-motorcycle-restriction');
  });

  it('returns deduplicated avoid points from violations', () => {
    const violations = [
      { beginShapeIndex: 0, endShapeIndex: 2 },
      { beginShapeIndex: 0, endShapeIndex: 2 }
    ];
    expect(buildAvoidLocations(violations, [[25, 121], [24.9, 121.1], [24.8, 121.2]])).toEqual([
      {
        lat: 24.9,
        lon: 121.1,
        heading: 138,
        heading_tolerance: 20,
        radius: 10
      }
    ]);
  });

  it('spreads up to 50 avoid points across a long controlled-road segment', () => {
    const coordinates = Array.from({ length: 101 }, (_, index) => [25 - index / 1000, 121 + index / 1000]);
    const violations = coordinates.map((_, index) => ({
      beginShapeIndex: index,
      endShapeIndex: index
    }));
    const locations = buildAvoidLocations(violations, coordinates);
    expect(locations).toHaveLength(50);
    expect(locations[0]).toMatchObject({ lat: 25, lon: 121, heading_tolerance: 20, radius: 10 });
    expect(locations.at(-1)).toMatchObject({ lat: 24.9, lon: 121.1, heading_tolerance: 20, radius: 10 });
  });
});
