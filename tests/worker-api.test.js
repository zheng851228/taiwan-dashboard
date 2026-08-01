import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, {
  isCachedConditionsFresh,
  mergeLastKnownConditions
} from '../worker/src/index.js';
import { encodePolyline6 } from '../worker/src/polyline.js';

const env = { USE_FIXTURES: 'true' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Worker v2 fixture API', () => {
  it('reflects only allowlisted CORS origins and keeps CLI responses originless', async () => {
    const allowed = await worker.fetch(new Request('https://worker.test/v2/weather', {
      headers: { Origin: 'http://127.0.0.1:4173' }
    }), env);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4173');
    const rejected = await worker.fetch(new Request('https://worker.test/v2/weather', {
      headers: { Origin: 'https://evil.example' }
    }), env);
    expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const cli = await worker.fetch(new Request('https://worker.test/v2/weather'), env);
    expect(cli.status).toBe(200);
    expect(cli.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects oversized JSON bodies before route processing', async () => {
    const response = await worker.fetch(new Request('https://worker.test/v2/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: [{ lat: 25, lng: 121 }, { lat: 24, lng: 121 }], padding: 'x'.repeat(33000) })
    }), env);
    expect(response.status).toBe(413);
  });

  it('returns 429 and Retry-After when an expensive endpoint exceeds its limit', async () => {
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const response = await worker.fetch(new Request('https://worker.test/v2/geocode?q=台北'), {
      USE_FIXTURES: 'false',
      LOOKUP_RATE_LIMITER: limiter
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(limiter.limit).toHaveBeenCalledTimes(1);
  });

  it('rejects non-UUID route identifiers', async () => {
    const response = await worker.fetch(new Request('https://worker.test/v2/routes/not-a-uuid/conditions'), env);
    expect(response.status).toBe(400);
  });

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

  it('rejects oversized geocode queries before calling an upstream service', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const query = encodeURIComponent('地'.repeat(121));
    const response = await worker.fetch(new Request(`https://worker.test/v2/geocode?q=${query}`), env);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toContain('過長');
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(body.data.validation.rerouteCount).toBe(1);
    expect(body.data.geometry).toBeUndefined();
  });

  it('keeps live conditions partial when an optional upstream source is unavailable', async () => {
    const shape = encodePolyline6([[25.0478, 121.517], [25.02, 121.55], [24.99, 121.58]]);
    const observedAt = new Date().toISOString();
    const upstreamUrls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url);
      upstreamUrls.push(value);
      if (value.endsWith('/route')) {
        return new Response(JSON.stringify({
          trip: {
            summary: { length: 12, time: 1200 },
            legs: [{ shape, summary: { length: 12, time: 1200 } }]
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (value.endsWith('/trace_attributes')) {
        return new Response(JSON.stringify({
          edges: [{
            names: ['\u53f09\u7dda'],
            way_id: 9,
            road_class: 'primary',
            use: 'road',
            length: 12,
            begin_shape_index: 0,
            end_shape_index: 2
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (value.includes('/openid-connect/token')) {
        return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 900 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (value.includes('/Road/Traffic/VD/Highway')) {
        return new Response(JSON.stringify({ VDs: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (value.includes('/Road/Traffic/Live/VD/Highway')) {
        return new Response(JSON.stringify({ VDLives: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
        if (value.includes('/Road/Traffic/Section/Highway')) {
          return new Response(JSON.stringify({ Sections: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (value.includes('/Road/Traffic/SectionShape/Highway')) {
          return new Response(JSON.stringify({ SectionShapes: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      if (value.includes('/Road/Traffic/Live/Highway')) {
        return new Response(JSON.stringify({ LiveTraffics: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (value.includes('/Road/Traffic/CongestionLevel/Highway')) {
        return new Response(JSON.stringify({ CongestionLevels: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
        if (value.includes('/Traffic/RoadEvent/LiveEvent/Highway')) {
          return new Response(JSON.stringify({ LiveEvents: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (value.includes('/Traffic/RoadEvent/Event/Highway')) {
          return new Response(JSON.stringify({ Events: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (value.includes('/Traffic/RoadEvent/LiveEvent/Freeway')) {
          return new Response(JSON.stringify({ LiveEvents: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (value.includes('/section/sectioninfo/SectionList.xml')) {
          return new Response(`
            <SectionList><Sections><Section><SectionID>section-1</SectionID>
            <SectionName>route</SectionName><RoadID>300090</RoadID><RoadName>\u53f09\u7dda</RoadName>
            <RoadClass>3</RoadClass><RoadDirection>SE</RoadDirection></Section></Sections></SectionList>
          `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
        }
        if (value.includes('/section/sectionshapeinfo/SectionShapeList.xml')) {
          return new Response(`
            <SectionShapeList><SectionShapes><SectionShape><SectionID>section-1</SectionID>
            <Geometry>LINESTRING(121.517 25.0478,121.55 25.02,121.58 24.99)</Geometry>
            </SectionShape></SectionShapes></SectionShapeList>
          `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
        }
        if (value.includes('/section/livetrafficdata/LiveTrafficList.xml')) {
          return new Response(`
            <LiveTrafficList><UpdateTime>${observedAt}</UpdateTime><LiveTraffics><LiveTraffic>
            <SectionID>section-1</SectionID><TravelTime>80</TravelTime><TravelSpeed>45</TravelSpeed>
            <CongestionLevelID>D</CongestionLevelID><CongestionLevel>2</CongestionLevel>
            <DataCollectTime>${observedAt}</DataCollectTime></LiveTraffic></LiveTraffics></LiveTrafficList>
          `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
        }
        if (value.includes('/section/congetioninfo/CongestionLevelList.xml')) {
          return new Response(`
            <CongestionLevelList><CongestionLevels><CongestionLevel><CongestionLevelID>D</CongestionLevelID>
            <CongestionLevelName>group</CongestionLevelName><MeasureIndex>Speed</MeasureIndex><Levels>
            <Level><Level>1</Level><LevelName>clear</LevelName><LowValue>60</LowValue></Level>
            </Levels></CongestionLevel></CongestionLevels></CongestionLevelList>
          `, { status: 200, headers: { 'Content-Type': 'application/xml' } });
        }
        if (value === 'https://camera.test/list') {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }));

    const liveEnv = {
      USE_FIXTURES: 'false',
      VALHALLA_BASE_URL: 'https://valhalla.test',
      CAMERA_SOURCE_URL: 'https://camera.test/list',
      TDX_CLIENT_ID: 'test-id',
      TDX_CLIENT_SECRET: 'test-secret'
    };
    const createResponse = await worker.fetch(new Request('https://worker.test/v2/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [{ lat: 25.0478, lng: 121.517 }, { lat: 24.99, lng: 121.58 }],
        vehicle: { type: 'motorcycle', plate: 'yellow' }
      })
    }), liveEnv);
    const created = await createResponse.json();

    const conditionsResponse = await worker.fetch(new Request(
      `https://worker.test/v2/routes/${created.data.routeId}/conditions?refresh=1`
    ), liveEnv);
    const conditions = await conditionsResponse.json();
    expect(conditionsResponse.status).toBe(200);
      expect(conditions.status).toBe('partial');
      expect(conditions.data.issues).toContain('CWA: API key not configured');
      expect(conditions.data.sections[0].traffic).toMatchObject({
        level: 'slow',
        method: 'published-section',
        source: 'THB'
      });
      const roadEventUrls = [
        '/Traffic/RoadEvent/LiveEvent/Highway',
        '/Traffic/RoadEvent/Event/Highway',
        '/Traffic/RoadEvent/LiveEvent/Freeway'
      ].map((path) => new URL(upstreamUrls.find((url) => url.includes(path))));
      roadEventUrls.forEach((url) => {
        expect(url.searchParams.get('$top')).toBe('1000');
        expect(url.searchParams.get('$count')).toBe('true');
      });
      expect(conditions.data.incidentCoverage).toMatchObject({
        readyScopes: ['highway:live', 'highway:scheduled', 'freeway:live'],
        failedScopes: []
      });
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

describe('conditions cache freshness', () => {
  function cachedEnvelope(overrides = {}) {
    return {
      updatedAt: '2026-07-27T04:00:00.000Z',
      data: {
        snapshotGeneratedAt: '2026-07-27T03:55:00.000Z',
        sections: [{
          traffic: {
            level: 'clear',
            observedAt: '2026-07-27T03:50:00.000Z'
          },
          weather: {
            condition: '多雲',
            observedAt: '2026-07-27T03:00:00.000Z'
          }
        }],
        ...overrides
      }
    };
  }

  it('accepts known values exactly at their freshness boundaries', () => {
    expect(isCachedConditionsFresh(
      cachedEnvelope(),
      new Date('2026-07-27T04:00:00.000Z')
    )).toBe(true);
  });

  it('rejects a recently cached envelope after its traffic observation expires', () => {
    expect(isCachedConditionsFresh(
      cachedEnvelope(),
      new Date('2026-07-27T04:00:00.001Z')
    )).toBe(false);
  });

  it('rejects a stale provider snapshot even when all sections are unknown', () => {
    expect(isCachedConditionsFresh(
      cachedEnvelope({
        snapshotGeneratedAt: '2026-07-27T03:44:59.999Z',
        sections: [{
          traffic: { level: 'unknown', observedAt: null },
          weather: { condition: '未知', observedAt: null }
        }]
      }),
      new Date('2026-07-27T04:00:00.000Z')
    )).toBe(false);
  });

  it('refreshes when a scheduled event becomes active', () => {
    expect(isCachedConditionsFresh(
      cachedEnvelope({
        sections: [{
          traffic: { level: 'unknown', observedAt: null },
          weather: { condition: '未知', observedAt: null },
          incidents: [{
            id: 'scheduled-work',
            status: 'scheduled',
            effectiveAt: '2026-07-27T04:00:00.000Z'
          }]
        }]
      }),
      new Date('2026-07-27T04:00:00.000Z')
    )).toBe(false);
  });

  it('does not serve a cached event after its expiry time', () => {
    expect(isCachedConditionsFresh(
      cachedEnvelope({
        sections: [{
          traffic: { level: 'unknown', observedAt: null },
          weather: { condition: '未知', observedAt: null },
          incidents: [{
            id: 'expired-work',
            status: 'active',
            expiresAt: '2026-07-27T04:00:00.000Z'
          }]
        }]
      }),
      new Date('2026-07-27T04:00:00.000Z')
    )).toBe(false);
  });
});
