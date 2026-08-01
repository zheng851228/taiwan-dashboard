import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../worker/src/index.js';

const SNAPSHOT_PREFIX = 'provider-snapshot:v1';

afterEach(() => {
  vi.unstubAllGlobals();
});

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function createMutableKv(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    get: vi.fn(async (key) => {
      if (Array.isArray(key)) {
        return new Map(key.map((item) => [item, clone(values.get(item) ?? null)]));
      }
      return clone(values.get(key) ?? null);
    }),
    put: vi.fn(async (key, value) => {
      values.set(key, JSON.parse(value));
    })
  };
}

function liveRouteRecord(routeId) {
  return {
    routeId,
    locations: [
      { lat: 25.0478, lng: 121.517, type: 'break' },
      { lat: 25.02, lng: 121.55, type: 'break' }
    ],
    vehicle: { type: 'motorcycle', plate: 'yellow' },
    preferences: { strategy: 'balanced' },
    geometry: [
      [25.0478, 121.517],
      [25.035, 121.533],
      [25.02, 121.55]
    ],
    encodedShape: '',
    distanceKm: 5,
    durationMinutes: 8,
    edges: [{
      names: ['台9線'],
      roadClass: 'primary',
      use: 'road',
      beginShapeIndex: 0,
      endShapeIndex: 2
    }],
    validation: { status: 'safe', rerouted: false, rerouteCount: 0 },
    source: 'valhalla',
    dataMode: 'live',
    createdAt: '2026-07-27T03:50:00.000Z'
  };
}

describe('Worker provider snapshot integration', () => {
  it('returns HTTP 200 partial unknowns when a live route snapshot is missing', async () => {
    const routeId = '11111111-1111-4111-8111-111111111111';
    const kv = createMutableKv({
      [`route:${routeId}`]: liveRouteRecord(routeId)
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request(`https://worker.test/v2/routes/${routeId}/conditions?refresh=1`),
      {
        USE_FIXTURES: 'false',
        PROVIDER_SNAPSHOT_MODE: 'kv',
        ROUTE_CACHE: kv
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('partial');
    expect(body.data.dataMode).toBe('live');
    expect(body.data.overall.coveragePercent).toBe(0);
    expect(body.data.sections.length).toBeGreaterThan(0);
    expect(body.data.sections.every((section) => (
      section.traffic.level === 'unknown'
      && section.weather.condition === '未知'
    ))).toBe(true);
    expect(body.data.issues.length).toBeGreaterThan(0);
    expect(body.data.issues.join(' ')).toMatch(/snapshot/i);
    expect(body.message).toContain('未知');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps fixture conditions independent from provider snapshot KV', async () => {
    const kv = createMutableKv();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const fixtureEnv = {
      USE_FIXTURES: 'true',
      PROVIDER_SNAPSHOT_MODE: 'kv',
      ROUTE_CACHE: kv
    };
    const createdResponse = await worker.fetch(new Request('https://worker.test/v2/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [
          { lat: 25.0478, lng: 121.517 },
          { lat: 24.757, lng: 121.753 }
        ],
        vehicle: { type: 'motorcycle', plate: 'white' }
      })
    }), fixtureEnv);
    const created = await createdResponse.json();

    const conditionsResponse = await worker.fetch(
      new Request(`https://worker.test/v2/routes/${created.data.routeId}/conditions`),
      fixtureEnv
    );
    const conditions = await conditionsResponse.json();

    expect(conditionsResponse.status).toBe(200);
    expect(conditions.data.dataMode).toBe('fixture');
    expect(fetchMock).not.toHaveBeenCalled();
    const readKeys = kv.get.mock.calls.flatMap(([key]) => (
      Array.isArray(key) ? key : [key]
    ));
    expect(readKeys.some((key) => String(key).startsWith(SNAPSHOT_PREFIX))).toBe(false);
  });
});
