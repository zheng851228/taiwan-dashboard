import { describe, expect, it } from 'vitest';
import {
  assignRoadEvents,
  buildOverall,
  classifyTraffic,
  compactGeometry,
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

  it('bounds condition overlay geometry while preserving both endpoints', () => {
    const geometry = Array.from({ length: 1000 }, (_, index) => [25 - index * 0.001, 121.5]);
    const compacted = compactGeometry(geometry, 96);
    expect(compacted).toHaveLength(96);
    expect(compacted[0]).toEqual(geometry[0]);
    expect(compacted.at(-1)).toEqual(geometry.at(-1));
  });
});

describe('road event assignment', () => {
  const sections = [
    {
      order: 1,
      roadRef: '台9',
      sample: [24.95, 121.5],
      geometry: [[25, 121.5], [24.9, 121.5]]
    },
    {
      order: 2,
      roadRef: '台9',
      sample: [24.8, 121.5],
      geometry: [[24.9, 121.5], [24.7, 121.5]]
    }
  ];

  it('matches an event near the start of a long section using the complete geometry', () => {
    const assignments = assignRoadEvents(sections, [{
      id: 'work-1',
      title: '施工',
      typeCode: 2,
      severityCode: 1,
      regulationCodes: [2],
      roadRef: '台9線',
      lat: 24.999,
      lng: 121.5,
      effectiveAt: '2026-07-27T03:00:00.000Z',
      expiresAt: '2026-07-27T05:00:00.000Z',
      source: 'TDX'
    }], new Date('2026-07-27T04:00:00.000Z'));

    expect(assignments.get(1)).toHaveLength(1);
    expect(assignments.get(1)[0]).toMatchObject({
      kind: 'construction',
      impact: 'lane_closure',
      status: 'active'
    });
    expect(assignments.get(2)).toEqual([]);
  });

  it('shows near-term scheduled work but excludes distant and expired events', () => {
    const assignments = assignRoadEvents(sections, [
      {
        id: 'scheduled-near',
        title: '預定施工',
        typeCode: 2,
        roadRef: '台9',
        lat: 24.95,
        lng: 121.5,
        effectiveAt: '2026-07-29T04:00:00.000Z'
      },
      {
        id: 'scheduled-far',
        title: '遠期施工',
        typeCode: 2,
        roadRef: '台9',
        lat: 24.95,
        lng: 121.5,
        effectiveAt: '2026-08-10T04:00:00.000Z'
      },
      {
        id: 'expired',
        title: '已結束施工',
        typeCode: 2,
        roadRef: '台9',
        lat: 24.95,
        lng: 121.5,
        expiresAt: '2026-07-27T03:59:59.000Z'
      }
    ], new Date('2026-07-27T04:00:00.000Z'));

    expect(assignments.get(1).map((event) => event.id)).toEqual(['scheduled-near']);
    expect(assignments.get(1)[0].status).toBe('scheduled');
  });

  it('attaches a coordinate-free same-road event once and marks the location approximate', () => {
    const assignments = assignRoadEvents(sections, [{
      id: 'no-point',
      title: '台9線施工',
      typeCode: 2,
      roadRef: '台9'
    }], NOW);

    expect(assignments.get(1)[0]).toMatchObject({
      id: 'no-point',
      locationApproximate: true
    });
    expect(assignments.get(2)).toEqual([]);
  });

  it('reports unique events separately from affected sections', () => {
    const shared = {
      id: 'same-event',
      kind: 'construction',
      impact: 'full_closure',
      status: 'active',
      lat: 24.95,
      lng: 121.5
    };
    const scheduled = {
      id: 'scheduled-closure',
      kind: 'construction',
      impact: 'full_closure',
      status: 'scheduled',
      lat: 24.9,
      lng: 121.5
    };
    const section = (incidents) => ({
      traffic: { level: 'unknown' },
      weather: { condition: '未知' },
      incidents
    });
    const overall = buildOverall([section([shared]), section([shared, scheduled])]);

    expect(overall.incidentCount).toBe(2);
    expect(overall.affectedIncidentSections).toBe(2);
    expect(overall.incidentCounts).toEqual({ construction: 2 });
    expect(overall.fullClosureCount).toBe(2);
    expect(overall.activeFullClosureCount).toBe(1);
    expect(overall.scheduledFullClosureCount).toBe(1);
  });

  it('counts a coordinate-free warning without claiming an affected section', () => {
    const overall = buildOverall([{
      traffic: { level: 'unknown' },
      weather: { condition: '未知' },
      incidents: [{
        id: 'road-level-only',
        kind: 'construction',
        impact: 'unknown',
        status: 'unknown',
        locationApproximate: true
      }]
    }]);

    expect(overall.incidentCount).toBe(1);
    expect(overall.affectedIncidentSections).toBe(0);
    expect(overall.roadLevelIncidentCount).toBe(1);
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

  it('rejects distant cameras before reading road metadata', () => {
    const distantCamera = { id: 'distant', name: '遠端鏡頭', lat: 23.5, lng: 120.4 };
    Object.defineProperty(distantCamera, 'roadRef', {
      get() {
        throw new Error('distant camera road metadata should not be inspected');
      }
    });

    const result = fuseConditions(route, {
      detectors: [],
      weather: [],
      incidents: [],
      trafficSource: 'TDX',
      cameras: [distantCamera]
    }, NOW);

    expect(result.sections[0].cameras).toEqual([]);
  });

  it('queries adjacent spatial buckets without scanning distant camera metadata', () => {
    const farCameras = Array.from({ length: 5000 }, (_, index) => {
      const camera = {
        id: `far-${index}`,
        name: `遠端-${index}`,
        lat: 22 + (index % 100) * 0.001,
        lng: 120 + (index % 80) * 0.001
      };
      Object.defineProperty(camera, 'roadRef', {
        get() {
          throw new Error('distant camera road metadata should not be inspected');
        }
      });
      return camera;
    });
    const result = fuseConditions(route, {
      detectors: [],
      weather: [],
      incidents: [],
      trafficSource: 'TDX',
      cameras: farCameras.concat([
        {
          id: 'across-cell',
          name: '台9線相鄰格',
          roadRef: '台9線',
          lat: 25,
          lng: 121.549
        }
      ])
    }, NOW);

    expect(result.sections[0].cameras.map((camera) => camera.id)).toEqual(['across-cell']);
  });

  it('does not treat a longer provincial road number as the same road', () => {
    const routeOnTai1 = {
      ...route,
      edges: [{ names: ['台1線'], beginShapeIndex: 0, endShapeIndex: 1 }]
    };
    const result = fuseConditions(routeOnTai1, {
      detectors: [],
      weather: [],
      incidents: [],
      trafficSource: 'TDX',
      cameras: [
        { id: 'tai10-near', name: '台10線近端', roadRef: '台10線', lat: 24.994, lng: 121.506 },
        { id: 'tai1-far', name: '台1線遠端', roadRef: '台1線', lat: 24.975, lng: 121.525 }
      ]
    }, NOW);

    expect(result.sections[0].cameras.map((camera) => camera.id)).toEqual(['tai1-far', 'tai10-near']);
  });

  it('deduplicates repeated camera ids before selecting the nearest two', () => {
    const result = fuseConditions(route, {
      detectors: [],
      weather: [],
      incidents: [],
      trafficSource: 'TDX',
      cameras: [
        { id: 'duplicate', name: '台9線鏡頭', roadRef: '台9線', lat: 24.994, lng: 121.506 },
        { id: 'duplicate', name: '台9線鏡頭副本', roadRef: '台9線', lat: 24.993, lng: 121.507 },
        { id: 'second', name: '台9線第二鏡頭', roadRef: '台9線', lat: 24.992, lng: 121.508 }
      ]
    }, NOW);

    const cameraIds = result.sections[0].cameras.map((camera) => camera.id);
    expect(cameraIds).toEqual(['second', 'duplicate']);
    expect(new Set(cameraIds).size).toBe(2);
  });
});
