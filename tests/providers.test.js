import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReferenceSpeedByLink,
  expandMapUrl,
  geocodePlace,
  loadTdxRoadEvents,
  mergeTdxDetectors,
  mergePublishedSections,
  normalizeCwaForecasts,
  normalizeTdxIncidents,
  parseThbCongestionXml,
  parseThbLiveTrafficXml,
  parseThbSectionsXml,
  parseThbSectionShapesXml,
  requestJsonCached,
  splitTraceGeometry,
  traceRouteAttributes
} from '../worker/src/providers.js';

const NOW = new Date('2026-07-22T04:00:00.000Z');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shared provider snapshots', () => {
  it('deduplicates concurrent requests and reuses a fresh response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: 42 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://snapshot.test/shared-success';

    const [first, second] = await Promise.all([
      requestJsonCached(url, {}, 1000, 60000),
      requestJsonCached(url, {}, 1000, 60000)
    ]);
    const third = await requestJsonCached(url, {}, 1000, 60000);

    expect(first).toEqual({ value: 42 });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed upstream response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recovered: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://snapshot.test/retry-after-failure';

    await expect(requestJsonCached(url, {}, 1000, 60000)).rejects.toThrow('HTTP 503');
    await expect(requestJsonCached(url, {}, 1000, 60000)).resolves.toEqual({ recovered: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest cached response when the bounded cache is full', async () => {
    const fetchMock = vi.fn(async (url) => new Response(JSON.stringify({ url: String(url) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const oldestUrl = 'https://snapshot.test/lru-oldest';

    await requestJsonCached(oldestUrl, {}, 1000, 60000);
    for (let index = 0; index < 260; index += 1) {
      await requestJsonCached(`https://snapshot.test/lru-${index}`, {}, 1000, 60000);
    }
    await requestJsonCached(oldestUrl, {}, 1000, 60000);

    expect(fetchMock).toHaveBeenCalledTimes(262);
  });
});

describe('Taiwan place geocoding', () => {
  it('keeps a city-government search inside the requested municipality', async () => {
    const fetchMock = vi.fn(async (url) => {
      expect(new URL(url).searchParams.get('q')).toBe('市政府 臺中市 台灣');
      return new Response(JSON.stringify([
        {
          name: '成功高中',
          display_name: '成功高中, 中正區, 臺北市, 臺灣',
          lat: '25.0427054',
          lon: '121.5236934',
          type: 'school',
          importance: 0.9
        },
        {
          name: '市政府',
          display_name: '市政府, 西屯區, 臺中市, 臺灣',
          lat: '24.1620975',
          lon: '120.6492346',
          type: 'station',
          importance: 0.3
        }
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const places = await geocodePlace('台中市政府');

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      name: '市政府',
      lat: 24.1620975,
      lng: 120.6492346
    });
  });
});

describe('map URL boundary validation', () => {
  it('rejects non-HTTPS, credentials, and unapproved redirect hosts', async () => {
    await expect(expandMapUrl('http://maps.google.com/?q=24,121')).rejects.toMatchObject({ status: 400 });
    await expect(expandMapUrl('https://user:pass@maps.google.com/?q=24,121')).rejects.toMatchObject({ status: 400 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'https://example.com/redirect' }
    })));
    await expect(expandMapUrl('https://maps.google.com/?q=24,121')).rejects.toMatchObject({ status: 400 });
  });
});

describe('Valhalla route attribution', () => {
  it('splits long route geometry below the trace service distance limit', () => {
    const chunks = splitTraceGeometry([
      [25, 121],
      [24, 121],
      [23, 121],
      [22, 121]
    ], 150);

    expect(chunks.map((chunk) => chunk.startShapeIndex)).toEqual([0, 1, 2]);
    expect(chunks.map((chunk) => chunk.geometry.length)).toEqual([2, 2, 2]);
    expect(chunks[1].geometry[0]).toEqual(chunks[0].geometry.at(-1));
  });

  it('overlaps one complete segment between dense trace chunks', () => {
    const chunks = splitTraceGeometry([
      [25, 121],
      [24.5, 121],
      [24, 121],
      [23.5, 121]
    ], 150);

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.startShapeIndex)).toEqual([0, 1]);
    expect(chunks[0].geometry.slice(-2)).toEqual(chunks[1].geometry.slice(0, 2));
  });

  it('merges chunk-relative shape indexes into the full route', async () => {
    let requestIndex = 0;
    const fetchMock = vi.fn(async () => {
      requestIndex += 1;
      return new Response(JSON.stringify({
        edges: [{
          names: [`road-${requestIndex}`],
          way_id: requestIndex,
          road_class: 'primary',
          use: 'road',
          forward: true,
          traversability: 'both',
          length: 100,
          begin_shape_index: 0,
          end_shape_index: 1
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const edges = await traceRouteAttributes({
      geometry: [[25, 121], [24, 121], [23, 121]],
      encodedShape: 'unused'
    }, 'motorcycle', { VALHALLA_BASE_URL: 'https://valhalla.test' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(edges.map((edge) => [edge.beginShapeIndex, edge.endShapeIndex])).toEqual([[0, 1], [1, 2]]);
    const payloads = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(payloads.every((payload) => payload.shape_match === 'walk_or_snap')).toBe(true);
  });

  it('traces at most two chunks concurrently and preserves route order', async () => {
    let active = 0;
    let maxActive = 0;
    let requestIndex = 0;
    const fetchMock = vi.fn(async () => {
      const currentIndex = requestIndex;
      requestIndex += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, currentIndex === 0 ? 30 : 5));
      active -= 1;
      return new Response(JSON.stringify({
        edges: [{
          names: [`road-${currentIndex}`],
          way_id: currentIndex + 1,
          road_class: 'primary',
          use: 'road',
          forward: true,
          traversability: 'both',
          length: 100,
          begin_shape_index: 0,
          end_shape_index: 1
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const edges = await traceRouteAttributes({
      geometry: [[25, 121], [24, 121], [23, 121], [22, 121]],
      encodedShape: 'unused'
    }, 'motorcycle', { VALHALLA_BASE_URL: 'https://valhalla.test' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(maxActive).toBe(2);
    expect(edges.map((edge) => edge.names[0])).toEqual(['road-0', 'road-1', 'road-2']);
    expect(edges.map((edge) => [edge.beginShapeIndex, edge.endShapeIndex]))
      .toEqual([[0, 1], [1, 2], [2, 3]]);
  });

  it('rejects a route when any trace chunk has no attributed road edges', async () => {
    let requestIndex = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      const currentIndex = requestIndex;
      requestIndex += 1;
      return new Response(JSON.stringify({
        edges: currentIndex === 1 ? [] : [{
          names: [`road-${currentIndex}`],
          way_id: currentIndex + 1,
          road_class: 'primary',
          use: 'road',
          forward: true,
          traversability: 'both',
          length: 100,
          begin_shape_index: 0,
          end_shape_index: 1
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(traceRouteAttributes({
      geometry: [[25, 121], [24, 121], [23, 121], [22, 121]],
      encodedShape: 'unused'
    }, 'motorcycle', { VALHALLA_BASE_URL: 'https://valhalla.test' }))
      .rejects.toThrow('no road edges for chunk');
  });

  it('rejects a non-empty trace chunk that does not cover its full shape', async () => {
    let requestIndex = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      const currentIndex = requestIndex;
      requestIndex += 1;
      return new Response(JSON.stringify({
        edges: [{
          names: [`road-${currentIndex}`],
          way_id: currentIndex + 1,
          road_class: 'primary',
          use: 'road',
          forward: true,
          traversability: 'both',
          length: 100,
          begin_shape_index: 0,
          end_shape_index: currentIndex === 1 ? 0 : 1
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(traceRouteAttributes({
      geometry: [[25, 121], [24, 121], [23, 121], [22, 121]],
      encodedShape: 'unused'
    }, 'motorcycle', { VALHALLA_BASE_URL: 'https://valhalla.test' }))
      .rejects.toThrow(/partial road coverage|attribution gap/);
  });

  it('rejects an internal gap between attributed shape ranges', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      edges: [
        {
          names: ['before-gap'],
          way_id: 1,
          road_class: 'primary',
          use: 'road',
          forward: true,
          traversability: 'both',
          length: 0,
          begin_shape_index: 0,
          end_shape_index: 0
        },
        {
          names: ['after-gap'],
          way_id: 2,
          road_class: 'primary',
          use: 'road',
          forward: true,
          traversability: 'both',
          length: 0,
          begin_shape_index: 1,
          end_shape_index: 2
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(traceRouteAttributes({
      geometry: [[25, 121], [24.999, 121], [24.998, 121]],
      encodedShape: 'unused'
    }, 'motorcycle', { VALHALLA_BASE_URL: 'https://valhalla.test' }))
      .rejects.toThrow('attribution gap');
  });

  it('accepts Valhalla terminal-exclusive end indices and clamps them to the route shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      edges: [{
        names: ['terminal edge'],
        way_id: 1,
        road_class: 'primary',
        use: 'road',
        forward: true,
        traversability: 'both',
        length: 1,
        begin_shape_index: 0,
        end_shape_index: 3
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const edges = await traceRouteAttributes({
      geometry: [[25, 121], [24.999, 121], [24.998, 121]],
      encodedShape: 'unused'
    }, 'motorcycle', { VALHALLA_BASE_URL: 'https://valhalla.test' });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ beginShapeIndex: 0, endShapeIndex: 2 });
  });

  it('uses the overlapped next chunk to cover one omitted terminal segment', async () => {
    let requestIndex = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      const currentIndex = requestIndex;
      requestIndex += 1;
      return new Response(JSON.stringify({
        edges: [{
          names: [`overlap-${currentIndex}`],
          way_id: currentIndex + 1,
          road_class: 'primary',
          use: 'road',
          forward: true,
          traversability: 'both',
          length: 1,
          begin_shape_index: 0,
          end_shape_index: currentIndex === 0 ? 1 : 2
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const edges = await traceRouteAttributes({
      geometry: [[25, 121], [24.5, 121], [24, 121], [23.5, 121]],
      encodedShape: 'unused'
    }, 'motorcycle', { VALHALLA_BASE_URL: 'https://valhalla.test' });

    expect(edges.map((edge) => [edge.beginShapeIndex, edge.endShapeIndex]))
      .toEqual([[0, 1], [1, 3]]);
  });

  it('does not start queued trace chunks after the first request fails', async () => {
    let requestCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      const currentIndex = requestCount;
      requestCount += 1;
      if (currentIndex === 0) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Response('{}', { status: 503 });
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(JSON.stringify({
        edges: [{
          names: ['road'],
          way_id: currentIndex + 1,
          road_class: 'primary',
          use: 'road',
          forward: true,
          traversability: 'both',
          length: 100,
          begin_shape_index: 0,
          end_shape_index: 1
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(traceRouteAttributes({
      geometry: [[25, 121], [24, 121], [23, 121], [22, 121], [21, 121]],
      encodedShape: 'unused'
    }, 'motorcycle', { VALHALLA_BASE_URL: 'https://valhalla.test' }))
      .rejects.toThrow('HTTP 503');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requestCount).toBe(2);
  });
});

describe('CWA township forecast normalization', () => {
  it('selects the forecast period that overlaps the next three hours', () => {
    const payload = {
      records: {
        Locations: [{
          LocationsName: '\u81fa\u5317\u5e02',
          Update: '2026-07-22T11:30:00+08:00',
          Location: [{
            LocationName: '\u4e2d\u6b63\u5340',
            Latitude: '25.0324',
            Longitude: '121.5199',
            WeatherElement: [
              {
                ElementName: '\u6eab\u5ea6',
                Time: [
                  { DataTime: '2026-07-22T03:00:00.000Z', ElementValue: [{ Temperature: '26' }] },
                  { DataTime: '2026-07-22T06:00:00.000Z', ElementValue: [{ Temperature: '28' }] }
                ]
              },
              {
                ElementName: '3\u5c0f\u6642\u964d\u96e8\u6a5f\u7387',
                Time: [
                  {
                    StartTime: '2026-07-22T03:00:00.000Z',
                    EndTime: '2026-07-22T06:00:00.000Z',
                    ElementValue: [{ ProbabilityOfPrecipitation: '70' }]
                  }
                ]
              },
              {
                ElementName: '\u5929\u6c23\u73fe\u8c61',
                Time: [{
                  StartTime: '2026-07-22T03:00:00.000Z',
                  EndTime: '2026-07-22T06:00:00.000Z',
                  ElementValue: [{ Weather: '\u77ed\u66ab\u96e8' }]
                }]
              }
            ]
          }]
        }]
      }
    };

    const [forecast] = normalizeCwaForecasts(payload, NOW);
    expect(forecast.county).toBe('\u53f0\u5317\u5e02');
    expect(forecast.town).toBe('\u4e2d\u6b63\u5340');
    expect(forecast.temperatureC).toBe(28);
    expect(forecast.rainChance).toBe(70);
    expect(forecast.condition).toBe('\u77ed\u66ab\u96e8');
    expect(forecast.forecastAt).toBe('2026-07-22T03:00:00.000Z');
  });

  it('keeps the legacy county forecast format compatible', () => {
    const payload = {
      records: {
        location: [{
          locationName: '\u81fa\u5317\u5e02',
          weatherElement: [
            { elementName: 'Wx', time: [{ startTime: '2026-07-22T06:00:00.000Z', parameter: { parameterName: '\u591a\u96f2' } }] },
            { elementName: 'PoP', time: [{ parameter: { parameterName: '20' } }] },
            { elementName: 'MinT', time: [{ parameter: { parameterName: '24' } }] },
            { elementName: 'MaxT', time: [{ parameter: { parameterName: '30' } }] }
          ]
        }]
      }
    };

    const [forecast] = normalizeCwaForecasts(payload, NOW);
    expect(forecast.county).toBe('\u53f0\u5317\u5e02');
    expect(forecast.condition).toBe('\u591a\u96f2');
    expect(forecast.temperatureC).toBe(27);
    expect(forecast.rainChance).toBe(20);
  });
});

describe('TDX road-event normalization', () => {
  it('aggregates national feeds without merging identical ids across road scopes', async () => {
    const env = {
      TDX_INCIDENT_ENDPOINT: 'https://events.test/highway-live?case=scope',
      TDX_SCHEDULED_INCIDENT_ENDPOINT: 'https://events.test/highway-scheduled?case=scope',
      TDX_FREEWAY_INCIDENT_ENDPOINT: 'https://events.test/freeway-live?case=scope'
    };
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const value = String(url);
      if (value.includes('highway-live')) {
        return new Response(JSON.stringify({
          LiveEvents: [{ EventID: 'shared', EventTitle: '省道施工', EventType: 2 }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (value.includes('highway-scheduled')) {
        return new Response(JSON.stringify({
          Events: [{ EventID: 'shared', EventTitle: '同一省道預告', EventType: 2 }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        LiveEvents: [{ EventID: 'shared', EventTitle: '國道事故', EventType: 1 }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const result = await loadTdxRoadEvents(env, { Authorization: 'Bearer test' });

    expect(result.incidents).toHaveLength(2);
    expect(result.incidents.map((incident) => incident.canonicalId).sort()).toEqual([
      'tdx:freeway:shared',
      'tdx:highway:shared'
    ]);
    expect(result.incidentCoverage).toMatchObject({
      readyScopes: ['highway:live', 'highway:scheduled', 'freeway:live'],
      failedScopes: []
    });
    expect(result.issues).toEqual([]);
  });

  it('loads every road-event page before marking a source ready', async () => {
    const env = {
      TDX_INCIDENT_ENDPOINT: 'https://events.test/highway-live?case=paged&$top=2',
      TDX_SCHEDULED_INCIDENT_ENDPOINT: 'https://events.test/highway-scheduled?case=paged&$top=2',
      TDX_FREEWAY_INCIDENT_ENDPOINT: 'https://events.test/freeway-live?case=paged&$top=2'
    };
    const fetchMock = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.includes('highway-live')) {
        const skip = Number(parsed.searchParams.get('$skip') || 0);
        return new Response(JSON.stringify({
          Count: 3,
          LiveEvents: skip
            ? [{ EventID: 'page-3', EventTitle: '第三件事件', EventType: 1 }]
            : [
              { EventID: 'page-1', EventTitle: '第一件事件', EventType: 1 },
              { EventID: 'page-2', EventTitle: '第二件事件', EventType: 2 }
            ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        Count: 0,
        [parsed.pathname.includes('highway-scheduled') ? 'Events' : 'LiveEvents']: []
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadTdxRoadEvents(env, { Authorization: 'Bearer test' });

    expect(result.incidents.map((incident) => incident.id)).toEqual([
      'page-1',
      'page-2',
      'page-3'
    ]);
    expect(result.incidentCoverage.failedScopes).toEqual([]);
    expect(fetchMock.mock.calls.some(([url]) => (
      new URL(String(url)).searchParams.get('$skip') === '2'
    ))).toBe(true);
    expect(fetchMock.mock.calls.every(([url]) => (
      new URL(String(url)).searchParams.get('$count') === 'true'
    ))).toBe(true);
  });

  it('marks a truncated road-event page as failed instead of reporting zero missing events', async () => {
    const env = {
      TDX_INCIDENT_ENDPOINT: 'https://events.test/highway-live?case=truncated&$top=2',
      TDX_SCHEDULED_INCIDENT_ENDPOINT: 'https://events.test/highway-scheduled?case=truncated&$top=2',
      TDX_FREEWAY_INCIDENT_ENDPOINT: 'https://events.test/freeway-live?case=truncated&$top=2'
    };
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.includes('highway-live')) {
        const skip = Number(parsed.searchParams.get('$skip') || 0);
        return new Response(JSON.stringify({
          Count: 3,
          LiveEvents: skip
            ? []
            : [
              { EventID: 'partial-1', EventTitle: '第一件事件', EventType: 1 },
              { EventID: 'partial-2', EventTitle: '第二件事件', EventType: 2 }
            ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ Count: 0, LiveEvents: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }));

    const result = await loadTdxRoadEvents(env, { Authorization: 'Bearer test' });

    expect(result.incidents).toEqual([]);
    expect(result.incidentCoverage.readyScopes).toEqual([
      'highway:scheduled',
      'freeway:live'
    ]);
    expect(result.incidentCoverage.failedScopes).toEqual(['highway:live']);
    expect(result.issues[0]).toMatch(/truncated feed/);
  });

  it('keeps successful road-event feeds when Freeway is temporarily unavailable', async () => {
    const env = {
      TDX_INCIDENT_ENDPOINT: 'https://events.test/highway-live?case=partial',
      TDX_SCHEDULED_INCIDENT_ENDPOINT: 'https://events.test/highway-scheduled?case=partial',
      TDX_FREEWAY_INCIDENT_ENDPOINT: 'https://events.test/freeway-live?case=partial'
    };
    vi.stubGlobal('fetch', vi.fn(async (url) => (
      String(url).includes('freeway-live')
        ? new Response('{}', { status: 503 })
        : new Response(JSON.stringify({ LiveEvents: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    )));

    const result = await loadTdxRoadEvents(env, { Authorization: 'Bearer test' });

    expect(result.incidents).toEqual([]);
    expect(result.incidentCoverage).toMatchObject({
      readyScopes: ['highway:live', 'highway:scheduled'],
      failedScopes: ['freeway:live']
    });
    expect(result.issues[0]).toMatch(/freeway road events unavailable: HTTP 503/);
  });

  it('maps the current LiveEvent schema and WKT coordinates', () => {
    const [incident] = normalizeTdxIncidents({
      UpdateTime: '2026-07-23T00:20:00+08:00',
      LiveEvents: [{
        EventID: 'event-1',
        EventTitle: '道路施工',
        Description: '外側車道施工',
        EventType: 2,
        EventSubType: 207,
        EffectiveTime: '2026-07-23T00:00:00+08:00',
        Positions: 'POINT (120.7055929 24.2005723)',
        Location: { FreeExpressHighway: { Road: '台74' } },
        Impact: {
          Severity: 1,
          Regulations: [2],
          BlockWay: 1,
          BlockedLanes: '外側車道',
          Duration: { DurationEndTime: '2026-07-23T02:00:00+08:00' }
        },
        LastUpdateTime: '2026-07-23T00:15:01+08:00'
      }]
    });

    expect(incident).toMatchObject({
      id: 'event-1',
      title: '道路施工',
      roadRef: '台74',
      lat: 24.2005723,
      lng: 120.7055929,
      severity: 1,
      severityCode: 1,
      typeCode: 2,
      subtypeCode: 207,
      kind: 'construction',
      impact: 'lane_closure',
      effectiveAt: '2026-07-23T00:00:00+08:00',
      regulationCodes: [2],
      blockWay: 1,
      blockedLanes: '外側車道',
      updatedAt: '2026-07-23T00:15:01+08:00',
      expiresAt: '2026-07-23T02:00:00+08:00',
      canonicalId: 'tdx:highway:event-1',
      sourceScope: 'highway',
      feedType: 'live',
      source: 'TDX'
    });
  });

  it('accepts the scheduled Events wrapper while preserving the legacy severity field', () => {
    const incidents = normalizeTdxIncidents({
      Events: [
        {
          EventID: 'scheduled-1',
          EventTitle: '預告施工',
          EventType: 2,
          Severity: 'warning',
          EffectiveTime: '2026-07-28T20:00:00+08:00',
          Location: { FreeExpressHighway: { Road: '台9' } }
        },
        {
          EventID: 'scheduled-2',
          EventTitle: '預告活動',
          EventType: 7,
          Location: { FreeExpressHighway: { Road: '台9' } }
        }
      ]
    });

    expect(incidents[0]).toMatchObject({
      id: 'scheduled-1',
      severity: 'warning',
      severityCode: null,
      kind: 'construction',
      sourceScope: 'highway',
      feedType: 'scheduled'
    });
    expect(incidents[1]).toMatchObject({
      id: 'scheduled-2',
      severity: 'warning',
      severityCode: null,
      kind: 'activity',
      sourceScope: 'highway',
      feedType: 'scheduled'
    });
  });

  it('preserves a City roadway name and provenance', () => {
    const [incident] = normalizeTdxIncidents({
      LiveEvents: [{
        EventID: 'city-1',
        EventTitle: '市區道路施工',
        EventType: 2,
        Positions: 'POINT (120.6500 24.1600)',
        Location: {
          CityRoad: {
            Roadways: [{
              City: '臺中市',
              Town: '西屯區',
              Road: '臺灣大道',
              Direction: 0
            }]
          }
        }
      }]
    }, {
      sourceScope: 'city:Taichung',
      feedType: 'live',
      cityCode: 'Taichung'
    });

    expect(incident).toMatchObject({
      id: 'city-1',
      canonicalId: 'tdx:city:taichung:city-1',
      roadRef: '臺灣大道',
      sourceScope: 'city:Taichung',
      feedType: 'live',
      cityCode: 'Taichung'
    });
  });
});

describe('TDX directional detector fusion', () => {
  it('uses DetectionLink bearing and official congestion thresholds as the reference speed', () => {
    const referenceByLink = buildReferenceSpeedByLink(
      { Sections: [{ SectionID: 'section-1', LinkIDs: [{ LinkID: 'link-1' }] }] },
      { LiveTraffics: [{ SectionID: 'section-1', CongestionLevelID: 'D' }] },
      {
        CongestionLevels: [{
          CongestionLevelID: 'D',
          MeasureIndex: 'Speed',
          Levels: [{ Level: 1, LowValue: 60 }]
        }]
      }
    );
    const [detector] = mergeTdxDetectors(
      {
        VDs: [{
          VDID: 'vd-1',
          PositionLat: 25.05,
          PositionLon: 121.52,
          RoadName: '\u53f09\u7dda',
          DetectionLinks: [{ LinkID: 'link-1', Bearing: 'E' }]
        }]
      },
      {
        VDLives: [{
          VDID: 'vd-1',
          DataCollectTime: '2026-07-23T00:20:00+08:00',
          LinkFlows: [{
            LinkID: 'link-1',
            Lanes: [
              { Speed: 60, Vehicles: [{ Volume: 2 }] },
              { Speed: 30, Vehicles: [{ Volume: 2 }] },
              { Speed: 0, Vehicles: [{ Volume: 0 }] }
            ]
          }]
        }]
      },
      referenceByLink
    );

    expect(detector).toMatchObject({
      id: 'vd-1:link-1',
      heading: 90,
      roadRef: '\u53f09\u7dda',
      speedKph: 45,
      referenceSpeedKph: 80,
      source: 'TDX'
    });
  });

  it('keeps a missing reference speed unknown instead of coercing null to zero', () => {
    const [detector] = mergeTdxDetectors(
      {
        VDs: [{
          VDID: 'vd-null',
          PositionLat: 25.05,
          PositionLon: 121.52,
          SpeedLimit: null,
          DetectionLinks: [{ LinkID: 'link-null', Bearing: 0 }]
        }]
      },
      {
        VDLives: [{
          VDID: 'vd-null',
          Status: 0,
          LinkFlows: [{
            LinkID: 'link-null',
            Lanes: [{ Speed: 40, Vehicles: [{ Volume: 1 }] }]
          }]
        }]
      }
    );

    expect(detector).toMatchObject({ heading: 0, referenceSpeedKph: null });
  });
});

describe('TDX published-section fusion', () => {
  it('joins official metadata, line geometry, live speed, and congestion thresholds', () => {
    const [published] = mergePublishedSections(
      {
        Sections: [{
          SectionID: 'section-1',
          RoadName: '\u53f09\u7dda',
          RoadDirection: 'E'
        }]
      },
      {
        SectionShapes: [{
          SectionID: 'section-1',
          Geometry: 'LINESTRING(121.5000 25.0000,121.5100 25.0000)'
        }]
      },
      {
        UpdateTime: '2026-07-22T03:55:00.000Z',
        LiveTraffics: [{
          SectionID: 'section-1',
          TravelSpeed: 45,
          CongestionLevelID: 'D',
          CongestionLevel: 2,
          DataCollectTime: '2026-07-22T03:54:00.000Z'
        }]
      },
      {
        CongestionLevels: [{
          CongestionLevelID: 'D',
          MeasureIndex: 'Speed',
          Levels: [{ Level: 1, LowValue: 60 }]
        }]
      },
      [{ roadRef: '\u53f09' }]
    );

    expect(published).toMatchObject({
      id: 'section-1',
      roadRef: '\u53f09\u7dda',
      heading: 90,
      speedKph: 45,
      referenceSpeedKph: 80,
      congestionLevel: 2,
      observedAt: '2026-07-22T03:54:00.000Z',
      available: true,
      source: 'TDX',
      method: 'published-section'
    });
    expect(published.geometry).toEqual([[25, 121.5], [25, 121.51]]);
  });

  it('keeps unavailable official segments from being treated as live traffic', () => {
    const [published] = mergePublishedSections(
      { Sections: [{ SectionID: 'section-1', RoadName: '\u53f09\u7dda', RoadDirection: 'S' }] },
      { SectionShapes: [{ SectionID: 'section-1', Geometry: 'LINESTRING(121.5 25,121.5 24.9)' }] },
      {
        LiveTraffics: [{
          SectionID: 'section-1',
          TravelSpeed: 0,
          CongestionLevelID: 'D',
          CongestionLevel: -1,
          DataCollectTime: NOW.toISOString()
        }]
      },
      {
        CongestionLevels: [{
          CongestionLevelID: 'D',
          MeasureIndex: 'Speed',
          Levels: [{ Level: 1, LowValue: 60 }]
        }]
      },
      [{ roadRef: '\u53f09' }]
    );

    expect(published.available).toBe(false);
  });
});

describe('THB 168 open-data parsing', () => {
  it('normalizes the official section, shape, live traffic, and congestion XML feeds', () => {
    const sections = parseThbSectionsXml(`
      <SectionList><UpdateTime>${NOW.toISOString()}</UpdateTime><Sections><Section>
        <SectionID>section-1</SectionID><SectionName>route</SectionName><RoadID>300090</RoadID>
        <RoadName>\u53f09\u7dda</RoadName><RoadClass>3</RoadClass><RoadDirection>E</RoadDirection>
      </Section></Sections></SectionList>
    `);
    const shapes = parseThbSectionShapesXml(`
      <SectionShapeList><SectionShapes><SectionShape><SectionID>section-1</SectionID>
        <Geometry>LINESTRING(121.5 25,121.51 25)</Geometry>
      </SectionShape></SectionShapes></SectionShapeList>
    `);
    const live = parseThbLiveTrafficXml(`
      <LiveTrafficList><UpdateTime>2026-07-23 01:13:58.464136+08:00</UpdateTime><LiveTraffics><LiveTraffic>
        <SectionID>section-1</SectionID><TravelTime>80</TravelTime><TravelSpeed>45</TravelSpeed>
        <CongestionLevelID>D</CongestionLevelID><CongestionLevel>2</CongestionLevel>
        <DataCollectTime>2026-07-23 01:13:58.464136+08:00</DataCollectTime>
      </LiveTraffic></LiveTraffics></LiveTrafficList>
    `);
    const congestion = parseThbCongestionXml(`
      <CongestionLevelList><CongestionLevels><CongestionLevel>
        <CongestionLevelID>D</CongestionLevelID><CongestionLevelName>group</CongestionLevelName>
        <MeasureIndex>Speed</MeasureIndex><Levels><Level><Level>1</Level>
        <LevelName>clear</LevelName><LowValue>60</LowValue></Level></Levels>
      </CongestionLevel></CongestionLevels></CongestionLevelList>
    `);

    expect(sections.Sections[0]).toMatchObject({
      SectionID: 'section-1',
      RoadName: '\u53f09\u7dda',
      RoadClass: 3,
      RoadDirection: 'E'
    });
    expect(shapes.SectionShapes[0].Geometry).toContain('LINESTRING');
    expect(live.LiveTraffics[0]).toMatchObject({
      TravelSpeed: 45,
      CongestionLevel: 2,
      DataCollectTime: '2026-07-22T17:13:58.464Z'
    });
    expect(congestion.CongestionLevels[0].Levels[0]).toMatchObject({ Level: 1, LowValue: 60 });
  });
});
