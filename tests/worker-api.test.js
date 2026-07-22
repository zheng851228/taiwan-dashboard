import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { mergeLastKnownConditions } from '../worker/src/index.js';
import { encodePolyline6 } from '../worker/src/polyline.js';

const env = { USE_FIXTURES: 'true' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Worker v2 fixture API', () => {
  it('creates one validated multi-stop route and loads ordered conditions', async () => {
    const createRequest = new Request('https://worker.test/v2/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [
          { lat: 25.0478, lng: 121.517, type: 'break' },
          { lat: 24.95, lng: 121.62, type: 'break' },
          { lat: 24.757, lng: 121.753, type: 'break' }
        ],
        vehicle: { type: 'motorcycle', plate: 'white' },
        preferences: { strategy: 'balanced' }
      })
    });
    const createResponse = await worker.fetch(createRequest, env);
    const created = await createResponse.json();
    expect(createResponse.status).toBe(200);
    expect(created.data.validation.status).toBe('safe');
    expect(created.data.dataMode).toBe('fixture');
    expect(created.data.geometry.coordinates.length).toBeGreaterThan(10);

    const conditionsResponse = await worker.fetch(
      new Request(`https://worker.test/v2/routes/${created.data.routeId}/conditions`),
      env
    );
    const conditions = await conditionsResponse.json();
    expect(conditions.status).toBe('partial');
    expect(conditions.data.dataMode).toBe('fixture');
    expect(conditions.data.sections[0].order).toBe(1);
    expect(conditions.data.overall.totalSections).toBe(conditions.data.sections.length);
    expect(conditions.message).toContain('示範資料');
  });

  it('rejects coordinates outside Taiwan without returning geometry', async () => {
    const response = await worker.fetch(new Request('https://worker.test/v2/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [{ lat: 35, lng: 139 }, { lat: 24.7, lng: 121.7 }],
        vehicle: { type: 'motorcycle', plate: 'white' }
      })
    }), env);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.data).toBeNull();
  });

  it('serves deterministic fixture cameras and county weather without upstream access', async () => {
    const camsResponse = await worker.fetch(new Request('https://worker.test/v2/cams'), env);
    const cams = await camsResponse.json();
    const weatherResponse = await worker.fetch(new Request('https://worker.test/v2/weather'), env);
    const weather = await weatherResponse.json();
    expect(cams.status).toBe('ok');
    expect(cams.data[0].source).toBe('DEMO');
    expect(weather.status).toBe('ok');
    expect(weather.data['\u5b9c\u862d\u7e23'].source).toBe('DEMO');
  });

  it('returns 422 without geometry when the rerouted path is still prohibited', async () => {
    const shape = encodePolyline6([[25.0478, 121.517], [24.95, 121.65], [24.757, 121.753]]);
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/route')) {
        return new Response(JSON.stringify({
          trip: {
            summary: { length: 60, time: 4200 },
            legs: [{ shape, summary: { length: 60, time: 4200 } }]
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(url).endsWith('/trace_attributes')) {
        return new Response(JSON.stringify({
          edges: [{
            names: ['\u570b\u90535\u865f'],
            way_id: 5,
            road_class: 'motorway',
            use: 'road',
            length: 60,
            begin_shape_index: 0,
            end_shape_index: 2
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }));

    const response = await worker.fetch(new Request('https://worker.test/v2/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [{ lat: 25.0478, lng: 121.517 }, { lat: 24.757, lng: 121.753 }],
        vehicle: { type: 'motorcycle', plate: 'white' }
      })
    }), { USE_FIXTURES: 'false', VALHALLA_BASE_URL: 'https://valhalla.test' });
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.status).toBe('blocked');
    expect(body.data.validation.rerouted).toBe(true);
    expect(body.data.geometry).toBeUndefined();
  });
});

describe('last-known condition fallback', () => {
  function conditionData() {
    return {
      overall: {},
      sections: [{
        order: 1,
        traffic: { level: 'unknown', observedAt: null, source: 'TDX' },
        weather: { condition: '\u672a\u77e5', observedAt: null, source: 'CWA' },
        incidents: [],
        cameras: []
      }]
    };
  }

  function cachedAt(trafficAt, weatherAt) {
    return {
      updatedAt: '2026-07-22T03:55:00.000Z',
      data: {
        sections: [{
          order: 1,
          traffic: { level: 'clear', observedAt: trafficAt, source: 'TDX' },
          weather: { condition: '\u77ed\u66ab\u96e8', observedAt: weatherAt, source: 'CWA' },
          incidents: [{ title: '\u9053\u8def\u65bd\u5de5', source: 'TDX' }],
          cameras: [{ id: 'cam-1', source: 'CCTV' }]
        }]
      }
    };
  }

  it('reuses fresh last-known data and marks it explicitly', () => {
    const merged = mergeLastKnownConditions(
      conditionData(),
      cachedAt('2026-07-22T03:52:00.000Z', '2026-07-22T03:00:00.000Z'),
      ['TDX: unavailable', 'CWA: unavailable', 'CCTV: unavailable'],
      new Date('2026-07-22T04:00:00.000Z')
    );
    expect(merged.sections[0].traffic.lastKnown).toBe(true);
    expect(merged.sections[0].weather.lastKnown).toBe(true);
    expect(merged.sections[0].incidents[0].lastKnown).toBe(true);
    expect(merged.sections[0].cameras[0].lastKnown).toBe(true);
    expect(merged.overall.coveragePercent).toBe(100);
  });

  it('does not reuse data after its freshness limit', () => {
    const merged = mergeLastKnownConditions(
      conditionData(),
      cachedAt('2026-07-22T03:49:59.000Z', '2026-07-22T02:29:59.000Z'),
      ['TDX: unavailable', 'CWA: unavailable'],
      new Date('2026-07-22T04:00:00.000Z')
    );
    expect(merged.sections[0].traffic.level).toBe('unknown');
    expect(merged.sections[0].weather.condition).toBe('\u672a\u77e5');
    expect(merged.sections[0].traffic.lastKnown).toBeUndefined();
    expect(merged.sections[0].weather.lastKnown).toBeUndefined();
  });
});
