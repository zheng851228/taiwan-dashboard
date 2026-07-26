import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProviderSnapshotDocument,
  isProviderSnapshotFresh,
  loadSnapshotProviderData,
  packProviderSnapshot,
  providerCameraSnapshotSlotKey,
  providerSnapshotSlotKey,
  selectRouteSnapshotBucketKeys
} from '../worker/src/providers.js';

const SNAPSHOT_SLOT_PREFIX = 'provider-snapshot:v1:live:';
const NOW = new Date('2026-07-27T04:00:00.000Z');
const MAX_AGE_MS = 10 * 60 * 1000;
const ROUTE_SECTIONS = [{
  order: 1,
  sample: [25.0001, 121.0001],
  roadRef: '台9',
  heading: 90
}];

afterEach(() => {
  vi.unstubAllGlobals();
});

function emptyProviderCell(overrides = {}) {
  return {
    detectors: [],
    publishedTraffic: [],
    incidents: [],
    weather: [],
    cameras: [],
    ...overrides
  };
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function createKv(entries = {}, slotValue = undefined) {
  const values = new Map(Object.entries(entries));
  const slotResult = (key) => (
    typeof slotValue === 'function' ? slotValue(key) : slotValue
  );
  return {
    get: vi.fn(async (key) => {
      if (Array.isArray(key)) {
        return new Map(key.map((item) => [
          item,
          clone(
            values.get(item)
            ?? (String(item).startsWith(SNAPSHOT_SLOT_PREFIX) ? slotResult(item) : null)
          )
        ]));
      }
      return clone(
        values.get(key)
        ?? (String(key).startsWith(SNAPSHOT_SLOT_PREFIX) ? slotResult(key) : null)
      );
    })
  };
}

function freshSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-27T03:55:00.000Z',
    gridDegrees: 0.1,
    cells: {},
    ...overrides
  };
}

function providerArrays(data) {
  return {
    detectors: data.detectors,
    publishedTraffic: data.publishedTraffic,
    incidents: data.incidents,
    weather: data.weather,
    cameras: data.cameras
  };
}

describe('KV provider snapshot contract', () => {
  it('accepts only a valid snapshot inside its freshness window', () => {
    expect(isProviderSnapshotFresh(freshSnapshot(), NOW, MAX_AGE_MS)).toBe(true);
    expect(isProviderSnapshotFresh(
      freshSnapshot({ generatedAt: '2026-07-27T03:49:59.999Z' }),
      NOW,
      MAX_AGE_MS
    )).toBe(false);
    expect(isProviderSnapshotFresh(
      freshSnapshot({ generatedAt: 'not-a-date' }),
      NOW,
      MAX_AGE_MS
    )).toBe(false);
    expect(isProviderSnapshotFresh(null, NOW, MAX_AGE_MS)).toBe(false);
    expect(isProviderSnapshotFresh(
      freshSnapshot({ generatedAt: '2026-07-27T04:00:01.000Z' }),
      NOW,
      MAX_AGE_MS
    )).toBe(false);
  });

  it('selects deterministic, unique route cells including a one-cell halo', () => {
    const config = { gridDegrees: 0.1, halo: 1 };
    const first = selectRouteSnapshotBucketKeys(ROUTE_SECTIONS, config);
    const second = selectRouteSnapshotBucketKeys(
      [ROUTE_SECTIONS[0], { ...ROUTE_SECTIONS[0], order: 2 }],
      config
    );

    expect(first).toEqual([...first].sort());
    expect(new Set(first).size).toBe(first.length);
    expect(second).toEqual(first);
    expect(first).toHaveLength(9);
    expect(first).toEqual(expect.arrayContaining([
      '249:1209',
      '250:1210',
      '251:1211'
    ]));
  });

  it('loads and deduplicates a fresh route-scoped snapshot without upstream fetches', async () => {
    const bucketKeys = selectRouteSnapshotBucketKeys(
      ROUTE_SECTIONS,
      { gridDegrees: 0.1, halo: 1 }
    );
    const observedAt = '2026-07-27T03:55:00.000Z';
    const detector = {
      id: 'vd-1',
      lat: 25.0001,
      lng: 121.0001,
      heading: 90,
      roadRef: '台9',
      speedKph: 45,
      referenceSpeedKph: 70,
      observedAt,
      source: 'TDX'
    };
    const cells = Object.fromEntries(
      bucketKeys.map((key) => [key, emptyProviderCell()])
    );
    cells['250:1210'] = emptyProviderCell({
      detectors: [detector, detector]
    });
    const kv = createKv({}, freshSnapshot({ cells }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadSnapshotProviderData(
      ROUTE_SECTIONS,
      { ROUTE_CACHE: kv },
      { now: NOW, maxAgeMs: MAX_AGE_MS }
    );

    expect(result.detectors).toEqual([detector]);
    expect(result.publishedTraffic).toEqual([]);
    expect(result.snapshotGeneratedAt).toBe('2026-07-27T03:55:00.000Z');
    expect(result.issues).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads only selected cells from the compact indexed snapshot format', async () => {
    const detector = {
      id: 'compact-vd',
      lat: 25.0001,
      lng: 121.0001,
      heading: 90,
      roadRef: '台9',
      speedKph: 50,
      referenceSpeedKph: 70,
      observedAt: '2026-07-27T03:55:00.000Z',
      source: 'TDX'
    };
    const published = {
      id: 'compact-thb',
      roadRef: '台9',
      heading: 90,
      geometry: [[25.0001, 121.0001], [25.0002, 121.0002]],
      speedKph: 45,
      referenceSpeedKph: 70,
      observedAt: '2026-07-27T03:55:00.000Z',
      available: true,
      source: 'THB',
      method: 'published-section'
    };
    const document = buildProviderSnapshotDocument({
      detectors: [detector],
      publishedTraffic: [published],
      incidents: [],
      weather: [],
      cameras: []
    }, { generatedAt: '2026-07-27T03:55:00.000Z' });
    const kv = createKv({}, packProviderSnapshot(document));

    const result = await loadSnapshotProviderData(
      ROUTE_SECTIONS,
      { ROUTE_CACHE: kv },
      { now: NOW, maxAgeMs: MAX_AGE_MS }
    );

    expect(result.detectors).toEqual([detector]);
    expect(result.publishedTraffic).toHaveLength(1);
    expect(result.publishedTraffic[0].geometry).toEqual(published.geometry);
  });

  it('restores published geometry fragments in their original route order', async () => {
    const geometry = [
      [25.0001, 121.0901],
      [25.0001, 121.0601],
      [25.0001, 121.0101]
    ];
    const published = {
      id: 'ordered-thb',
      roadRef: '台9',
      heading: 270,
      geometry,
      speedKph: 45,
      referenceSpeedKph: 70,
      observedAt: '2026-07-27T03:55:00.000Z',
      available: true,
      source: 'THB'
    };
    const document = buildProviderSnapshotDocument({
      detectors: [],
      publishedTraffic: [published],
      incidents: [],
      weather: [],
      cameras: []
    }, { generatedAt: '2026-07-27T03:55:00.000Z', gridDegrees: 0.05 });
    const kv = createKv({}, packProviderSnapshot(document));
    const sections = [
      { order: 1, sample: geometry[0], roadRef: '台9', heading: 270 },
      { order: 2, sample: geometry.at(-1), roadRef: '台9', heading: 270 }
    ];

    const result = await loadSnapshotProviderData(
      sections,
      { ROUTE_CACHE: kv },
      { now: NOW, maxAgeMs: MAX_AGE_MS }
    );

    expect(result.publishedTraffic[0].geometry).toEqual(geometry);
  });

  it('joins the slower camera snapshot and honors precomputed plate restrictions', async () => {
    const generatedAt = '2026-07-27T03:55:00.000Z';
    const liveDocument = buildProviderSnapshotDocument({
      detectors: [],
      publishedTraffic: [],
      incidents: [],
      weather: [{
        lat: 25.0001,
        lng: 121.0001,
        condition: '多雲',
        temperatureC: 28,
        rainChance: 20,
        observedAt: generatedAt,
        source: 'CWA'
      }],
      cameras: []
    }, { generatedAt, cameraSnapshotRequired: true });
    const camera = {
      id: 'camera-1',
      name: '坪林路口鏡頭',
      roadRef: '台9線',
      lat: 25.0001,
      lng: 121.0001,
      imageUrl: 'https://camera.test/1.jpg',
      status: 'unknown',
      source: 'CCTV',
      prohibitedFor: ['white']
    };
    const cameraDocument = buildProviderSnapshotDocument({
      detectors: [],
      publishedTraffic: [],
      incidents: [],
      weather: [],
      cameras: [camera]
    }, { generatedAt, gridDegrees: 0.05, routeHalo: 1 });
    const kv = createKv({
      [providerSnapshotSlotKey(NOW)]: packProviderSnapshot(liveDocument),
      [providerCameraSnapshotSlotKey(NOW)]: packProviderSnapshot(cameraDocument)
    });

    const yellow = await loadSnapshotProviderData(
      ROUTE_SECTIONS,
      { ROUTE_CACHE: kv },
      { now: NOW, maxAgeMs: MAX_AGE_MS, vehicle: { type: 'motorcycle', plate: 'yellow' } }
    );
    const white = await loadSnapshotProviderData(
      ROUTE_SECTIONS,
      { ROUTE_CACHE: kv },
      { now: NOW, maxAgeMs: MAX_AGE_MS, vehicle: { type: 'motorcycle', plate: 'white' } }
    );

    expect(yellow.weather).toHaveLength(1);
    expect(yellow.cameras.map((item) => item.id)).toEqual(['camera-1']);
    expect(yellow.cameras[0].roadRef).toBe('台9線');
    expect(white.cameras).toEqual([]);
  });

  it('falls back to the previous immutable slot during KV propagation delay', async () => {
    let slotReads = 0;
    const kv = createKv({}, () => {
      slotReads += 1;
      return slotReads === 1 ? null : freshSnapshot();
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadSnapshotProviderData(
      ROUTE_SECTIONS,
      { ROUTE_CACHE: kv },
      { now: NOW, maxAgeMs: MAX_AGE_MS }
    );

    expect(slotReads).toBe(2);
    expect(result.snapshotGeneratedAt).toBe('2026-07-27T03:55:00.000Z');
    expect(result.issues).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['malformed', freshSnapshot({ generatedAt: 'not-a-date' })],
    ['unsupported', freshSnapshot({ schemaVersion: 999 })],
    ['stale', freshSnapshot({ generatedAt: '2026-07-27T03:49:59.999Z' })]
  ])('fails safe for a %s snapshot without falling back to upstream', async (_label, snapshot) => {
    const kv = createKv({}, snapshot);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadSnapshotProviderData(
      ROUTE_SECTIONS,
      { ROUTE_CACHE: kv },
      { now: NOW, maxAgeMs: MAX_AGE_MS }
    );

    expect(providerArrays(result)).toEqual(emptyProviderCell());
    expect(result.trafficSource).toBe('TDX/THB');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.join(' ')).toMatch(/snapshot/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('isolates a malformed cell and returns an explicit partial-data issue', async () => {
    const bucketKeys = selectRouteSnapshotBucketKeys(
      ROUTE_SECTIONS,
      { gridDegrees: 0.1, halo: 1 }
    );
    const cells = Object.fromEntries(
      bucketKeys.map((key) => [key, emptyProviderCell()])
    );
    cells['250:1210'] = { unexpected: true };
    const kv = createKv({}, freshSnapshot({ cells }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadSnapshotProviderData(
      ROUTE_SECTIONS,
      { ROUTE_CACHE: kv },
      { now: NOW, maxAgeMs: MAX_AGE_MS }
    );

    expect(providerArrays(result)).toEqual(emptyProviderCell());
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.join(' ')).toMatch(/snapshot/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
