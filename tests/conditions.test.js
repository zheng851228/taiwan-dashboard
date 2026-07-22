import { describe, expect, it } from 'vitest';
import {
  classifyTraffic,
  createRouteSections,
  fuseConditions,
  headingDifference,
  matchPublishedTraffic,
  matchTrafficDetector
} from '../worker/src/conditions.js';

const NOW = new Date('2026-07-22T04:00:00.000Z');

describe('traffic fusion', () => {
  it('uses the specified traffic ratio boundaries', () => {
    expect(classifyTraffic(75, 100)).toBe('clear');
    expect(classifyTraffic(74.9, 100)).toBe('slow');
    expect(classifyTraffic(45, 100)).toBe('slow');
    expect(classifyTraffic(44.9, 100)).toBe('congested');
    expect(classifyTraffic(30, null)).toBe('unknown');
  });

  it('handles circular heading differences', () => {
    expect(headingDifference(350, 10)).toBe(20);
    expect(headingDifference(20, 200)).toBe(180);
  });

  it('does not match an opposite-direction or stale detector', () => {
    const section = { sample: [25, 121.5], heading: 90, roadRef: '台9' };
    const detectors = [
      { lat: 25, lng: 121.501, heading: 270, observedAt: NOW.toISOString(), roadRef: '台9' },
      { lat: 25, lng: 121.501, heading: 90, observedAt: '2026-07-22T03:49:59.000Z', roadRef: '台9' }
    ];
    expect(matchTrafficDetector(section, detectors, NOW)).toBeNull();
  });

  it('matches a fresh detector within one kilometre and sixty degrees', () => {
    const section = { sample: [25, 121.5], heading: 90, roadRef: '台9' };
    const detector = {
      lat: 25,
      lng: 121.505,
      heading: 140,
      observedAt: '2026-07-22T03:51:00.000Z',
      roadRef: '台9',
      speedKph: 45,
      referenceSpeedKph: 80
    };
    expect(matchTrafficDetector(section, [detector], NOW)?.detector).toBe(detector);
  });

  it('rejects a detector without a usable speed and reference speed', () => {
    const section = { sample: [25, 121.5], heading: 90, roadRef: '台9' };
    const detector = {
      lat: 25,
      lng: 121.505,
      heading: 90,
      observedAt: NOW.toISOString(),
      roadRef: '台9',
      speedKph: null,
      referenceSpeedKph: 80
    };
    expect(matchTrafficDetector(section, [detector], NOW)).toBeNull();
  });

  it('matches a fresh official published section on the same road and direction', () => {
    const section = { sample: [25, 121.5], heading: 90, roadRef: '台9' };
    const published = {
      id: 'section-1',
      roadRef: '台9線',
      heading: 90,
      geometry: [[25, 121.495], [25, 121.505]],
      speedKph: 45,
      referenceSpeedKph: 80,
      observedAt: '2026-07-22T03:55:00.000Z'
    };
    expect(matchPublishedTraffic(section, [published], NOW)?.published).toBe(published);
  });

  it('does not match an opposite, stale, or distant published section', () => {
    const section = { sample: [25, 121.5], heading: 90, roadRef: '台9' };
    const base = {
      roadRef: '台9線',
      speedKph: 45,
      referenceSpeedKph: 80,
      observedAt: NOW.toISOString()
    };
    const published = [
      { ...base, id: 'opposite', heading: 270, geometry: [[25, 121.5], [25, 121.51]] },
      { ...base, id: 'stale', heading: 90, observedAt: '2026-07-22T03:49:59.000Z', geometry: [[25, 121.5], [25, 121.51]] },
      { ...base, id: 'distant', heading: 90, geometry: [[25.02, 121.5], [25.02, 121.51]] }
    ];
    expect(matchPublishedTraffic(section, published, NOW)).toBeNull();
  });

  it('falls back to official published traffic when no valid VD is available', () => {
    const route = {
      geometry: [[25, 121.5], [25, 121.51]],
      distanceKm: 1,
      edges: [{ names: ['台9線'], beginShapeIndex: 0, endShapeIndex: 1 }]
    };
    const result = fuseConditions(route, {
      detectors: [{
        lat: 25,
        lng: 121.505,
        heading: 90,
        roadRef: '台9',
        speedKph: null,
        referenceSpeedKph: 80,
        observedAt: NOW.toISOString()
      }],
      publishedTraffic: [{
        id: 'section-1',
        roadRef: '台9線',
        heading: 90,
        geometry: [[25, 121.5], [25, 121.51]],
        speedKph: 45,
        referenceSpeedKph: 80,
        observedAt: NOW.toISOString(),
        source: 'TDX'
      }],
      weather: [],
      incidents: [],
      cameras: [],
      trafficSource: 'TDX'
    }, NOW);

    expect(result.sections[0].traffic).toMatchObject({
      level: 'slow',
      speedKph: 45,
      referenceSpeedKph: 80,
      method: 'published-section',
      sectionId: 'section-1'
    });
    expect(result.overall.coveragePercent).toBe(100);
  });

  it('keeps unknown traffic gray and reports actual coverage', () => {
    const route = {
      geometry: [[25, 121.5], [24.95, 121.55], [24.9, 121.6]],
      distanceKm: 15,
      edges: [{ names: ['台9線'], beginShapeIndex: 0, endShapeIndex: 2 }]
    };
    const result = fuseConditions(route, {
      detectors: [],
      weather: [],
      incidents: [],
      cameras: [],
      trafficSource: 'TDX'
    }, NOW);
    expect(result.sections.every((section) => section.traffic.level === 'unknown')).toBe(true);
    expect(result.overall.coveragePercent).toBe(0);
  });
});

describe('route segmentation', () => {
  it('caps long routes at twelve ordered sections', () => {
    const geometry = Array.from({ length: 121 }, (_, index) => [25 - index * 0.01, 121.5]);
    const sections = createRouteSections({
      geometry,
      distanceKm: 160,
      edges: [{ names: ['台1線'], beginShapeIndex: 0, endShapeIndex: 120 }]
    });
    expect(sections).toHaveLength(12);
    expect(sections.map((section) => section.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(sections[11].toKm).toBe(160);
  });
});

describe('weather fusion', () => {
  const route = {
    geometry: [[25, 121.5], [24.99, 121.51]],
    distanceKm: 2,
    edges: [{ names: ['台9線'], beginShapeIndex: 0, endShapeIndex: 1 }]
  };

  function weatherFor(sample) {
    return fuseConditions(route, {
      detectors: [],
      weather: [sample],
      incidents: [],
      cameras: [],
      trafficSource: 'TDX'
    }, NOW).sections[0].weather;
  }

  it('uses a fresh nearby observation with its forecast details', () => {
    const weather = weatherFor({
      lat: 24.995,
      lng: 121.505,
      condition: '短暫雨',
      temperatureC: 25,
      rainChance: 60,
      observedAt: '2026-07-22T03:30:00.000Z',
      forecastAt: '2026-07-22T06:00:00.000Z',
      source: 'CWA'
    });
    expect(weather.condition).toBe('短暫雨');
    expect(weather.rainChance).toBe(60);
    expect(weather.stationDistanceKm).toBeLessThan(2);
  });

  it('marks observations older than ninety minutes as unknown', () => {
    const weather = weatherFor({
      lat: 24.995,
      lng: 121.505,
      condition: '晴',
      observedAt: '2026-07-22T02:29:59.000Z',
      source: 'CWA'
    });
    expect(weather.condition).toBe('未知');
    expect(weather.observedAt).toBeNull();
  });

  it('marks observations farther than fifty kilometres as unknown', () => {
    const weather = weatherFor({
      lat: 23.5,
      lng: 120.4,
      condition: '晴',
      observedAt: NOW.toISOString(),
      source: 'CWA'
    });
    expect(weather.condition).toBe('未知');
    expect(weather.observedAt).toBeNull();
  });
});

describe('camera fusion', () => {
  const route = {
    geometry: [[25, 121.5], [24.99, 121.51]],
    distanceKm: 2,
    vehicle: { type: 'motorcycle', plate: 'white' },
    edges: [{ names: ['台9線'], beginShapeIndex: 0, endShapeIndex: 1 }]
  };

  it('prioritizes the same road, excludes prohibited roads, and keeps offline status', () => {
    const result = fuseConditions(route, {
      detectors: [],
      weather: [],
      incidents: [],
      trafficSource: 'TDX',
      cameras: [
        { id: 'near-other', name: '附近道路', roadRef: '台2線', lat: 24.995, lng: 121.505 },
        { id: 'same-road', name: '台9線故障鏡頭', roadRef: '台9線', lat: 24.98, lng: 121.52, status: 'offline' },
        { id: 'prohibited', name: '國道5號鏡頭', roadRef: '國道5號', lat: 24.995, lng: 121.505 }
      ]
    }, NOW);
    const cameras = result.sections[0].cameras;
    expect(cameras.map((camera) => camera.id)).toEqual(['same-road', 'near-other']);
    expect(cameras[0].status).toBe('offline');
    expect(cameras.some((camera) => camera.id === 'prohibited')).toBe(false);
  });
});
