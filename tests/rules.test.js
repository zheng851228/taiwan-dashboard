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

  it('blocks a direction-specific access restriction only in the traversed direction', () => {
    const blocked = validateRouteEdges([
      edge('台9線', 'primary', { forward: true, traversability: 'backward' })
    ], { type: 'motorcycle', plate: 'white' });
    const allowed = validateRouteEdges([
      edge('台9線', 'primary', { forward: false, traversability: 'backward' })
    ], { type: 'motorcycle', plate: 'white' });
    expect(blocked.violations[0].code).toBe('directional-motorcycle-restriction');
    expect(allowed.status).toBe('safe');
  });

  it('returns deduplicated avoid points from violations', () => {
    const violations = [
      { beginShapeIndex: 0, endShapeIndex: 2 },
      { beginShapeIndex: 0, endShapeIndex: 2 }
    ];
    expect(buildAvoidLocations(violations, [[25, 121], [24.9, 121.1], [24.8, 121.2]])).toEqual([
      { lat: 24.9, lon: 121.1 }
    ]);
  });
});
