import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { mergeLastKnownConditions, scheduled } from '../worker/src/index.js';
import {
  buildProviderSnapshotDocument,
  decodeProviderSnapshot,
  loadSnapshotProviderData,
  packProviderSnapshot,
  providerSnapshotSlotKey
} from '../worker/src/provider-snapshot.js';
import {
  assertBboxGuardrails,
  BBOX_MAX_AREA_DEG2,
  BBOX_MIN_ZOOM
} from '../worker/src/providers.js';
import {
  assertNoUnmarkedProxy,
  assertSnapshotHonestForWrite,
  SNAPSHOT_HEALTH_KEY,
  SnapshotHonestyError,
  validateSnapshotHonesty
} from '../worker/src/snapshot-honesty.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const NOW = new Date('2026-10-03T00:02:00.000Z');
const SECTIONS = [{ order: 1, sample: [25.0001, 121.0001], roadRef: '台9', heading: 90 }];

function dishonestKv(raw) {
  return {
    get: vi.fn(async (key) => (
      String(key).startsWith('provider-snapshot:v1:live:') ? raw : null
    ))
  };
}

function honestDocument(overrides = {}) {
  return buildProviderSnapshotDocument(
    { detectors: [], publishedTraffic: [], incidents: [], weather: [], cameras: [] },
    {
      generatedAt: '2026-10-03T00:00:00.000Z',
      fetchedAt: '2026-10-03T00:00:00.000Z',
      source: 'TDX/THB/CWA',
      staleAfterSeconds: 900,
      ...overrides
    }
  );
}

describe('snapshot honesty：寫入強制', () => {
  it('文件預設帶齊 fetched_at / source / stale_after', () => {
    const document = honestDocument();
    expect(document.fetched_at).toBe('2026-10-03T00:00:00.000Z');
    expect(document.source).toBe('TDX/THB/CWA');
    expect(document.stale_after).toBe(900);
  });

  it('pack 後 header 帶齊三欄位', () => {
    const header = decodeProviderSnapshot(packProviderSnapshot(honestDocument())).header;
    expect(validateSnapshotHonesty(header).ok).toBe(true);
    expect(header.fetched_at).toBe('2026-10-03T00:00:00.000Z');
    expect(header.source).toBe('TDX/THB/CWA');
    expect(header.stale_after).toBe(900);
  });

  it('缺任一欄位就拒絕寫入（assertSnapshotHonestForWrite 丟錯）', () => {
    const base = honestDocument();
    for (const missing of ['fetched_at', 'source', 'stale_after']) {
      const broken = { ...base };
      delete broken[missing];
      expect(() => assertSnapshotHonestForWrite(broken))
        .toThrowError(SnapshotHonestyError);
      try {
        assertSnapshotHonestForWrite(broken);
      } catch (error) {
        expect(error.missing).toContain(missing);
      }
    }
    expect(assertSnapshotHonestForWrite(base)).toBe(true);
  });

  it('stale_after 非正數或 fetched_at 非 ISO 也拒絕', () => {
    expect(() => assertSnapshotHonestForWrite(
      { ...honestDocument(), stale_after: 0 }
    )).toThrowError(SnapshotHonestyError);
    expect(() => assertSnapshotHonestForWrite(
      { ...honestDocument(), fetched_at: 'not-a-date' }
    )).toThrowError(SnapshotHonestyError);
    expect(() => assertSnapshotHonestForWrite(
      { ...honestDocument(), source: '  ' }
    )).toThrowError(SnapshotHonestyError);
  });
});

describe('snapshot honesty：讀取端版本 gate', () => {
  it('缺三欄位的舊快照一律拒絕使用（不拼裝回應）', async () => {
    const legacy = {
      schemaVersion: 1,
      generatedAt: '2026-10-03T00:00:00.000Z',
      gridDegrees: 0.05,
      cells: {}
    };
    const result = await loadSnapshotProviderData(
      SECTIONS,
      { ROUTE_CACHE: dishonestKv(legacy) },
      { now: NOW, maxAgeMs: 10 * 60 * 1000 }
    );
    expect(result.detectors).toEqual([]);
    expect(result.snapshotGeneratedAt).toBeNull();
    expect(result.issues.join(' ')).toMatch(/honesty gate/);
  });

  it('缺其中一個欄位也拒絕', async () => {
    const header = decodeProviderSnapshot(packProviderSnapshot(honestDocument())).header;
    for (const missing of ['fetched_at', 'source', 'stale_after']) {
      const broken = { ...header };
      delete broken[missing];
      const result = await loadSnapshotProviderData(
        SECTIONS,
        { ROUTE_CACHE: dishonestKv(broken) },
        { now: NOW, maxAgeMs: 10 * 60 * 1000 }
      );
      expect(result.detectors).toEqual([]);
      expect(result.issues.join(' ')).toMatch(/honesty gate/);
    }
  });

  it('帶齊欄位的快照正常使用', async () => {
    const packed = packProviderSnapshot(honestDocument());
    const kv = {
      get: vi.fn(async (key) => (
        String(key).startsWith('provider-snapshot:v1:live:') ? packed : null
      ))
    };
    const result = await loadSnapshotProviderData(
      SECTIONS,
      { ROUTE_CACHE: kv },
      { now: NOW, maxAgeMs: 10 * 60 * 1000 }
    );
    expect(result.issues).toEqual([]);
    expect(result.snapshotGeneratedAt).toBe('2026-10-03T00:00:00.000Z');
  });
});

describe('proxy 標記契約 assertNoUnmarkedProxy', () => {
  it('lastKnown 無 isProxy 就丟錯（含巢狀）', () => {
    expect(() => assertNoUnmarkedProxy({ lastKnown: true }))
      .toThrowError(SnapshotHonestyError);
    expect(() => assertNoUnmarkedProxy({ sections: [{ traffic: { lastKnown: true } }] }))
      .toThrowError(/sections\[0\]\.traffic/);
    expect(() => assertNoUnmarkedProxy([{ lastKnown: true, isProxy: false }]))
      .toThrowError(SnapshotHonestyError);
  });

  it('標記正確就通過', () => {
    expect(assertNoUnmarkedProxy({ lastKnown: true, isProxy: true })).toBe(true);
    expect(assertNoUnmarkedProxy({ sections: [{ traffic: { lastKnown: true, isProxy: true } }] }))
      .toBe(true);
    expect(assertNoUnmarkedProxy(null)).toBe(true);
  });

  it('mergeLastKnownConditions 的輸出全部帶 isProxy', () => {
    const at = '2026-10-03T00:00:00.000Z';
    const merged = mergeLastKnownConditions(
      {
        sections: [{
          order: 1,
          traffic: { level: 'unknown' },
          weather: { condition: '未知' },
          incidents: [],
          cameras: []
        }]
      },
      {
        updatedAt: at,
        data: {
          sections: [{
            order: 1,
            traffic: { level: 'smooth', observedAt: at, source: 'TDX' },
            weather: { condition: '晴', observedAt: at, source: 'CWA' },
            incidents: [],
            cameras: [{ id: 'cam-1', source: 'CCTV' }]
          }]
        }
      },
      ['TDX: unavailable', 'CWA: unavailable', 'CCTV: unavailable'],
      new Date('2026-10-03T00:05:00.000Z')
    );
    expect(merged.sections[0].traffic.lastKnown).toBe(true);
    expect(merged.sections[0].traffic.isProxy).toBe(true);
    expect(merged.sections[0].weather.isProxy).toBe(true);
    expect(merged.sections[0].cameras[0].isProxy).toBe(true);
    expect(() => assertNoUnmarkedProxy(merged)).not.toThrow();
  });
});

describe('bbox 護欄 assertBboxGuardrails', () => {
  const small = { minLng: 121.4, minLat: 25.0, maxLng: 121.6, maxLat: 25.1 };

  it('小範圍＋zoom 10 通過', () => {
    expect(assertBboxGuardrails(small, '10')).toMatchObject({ zoom: 10 });
    expect(assertBboxGuardrails(small, null).zoom).toBeNull();
  });

  it('zoom 太小拒絕', () => {
    expect(() => assertBboxGuardrails(small, '9')).toThrow(/zoom 太小/);
    expect(() => assertBboxGuardrails(small, 'abc')).toThrow(/zoom 必須是數字/);
  });

  it('面積超過上限拒絕（全台約 10.8 平方度）', () => {
    const taiwan = { minLng: 119.5, minLat: 21.8, maxLng: 122.5, maxLat: 25.4 };
    expect(() => assertBboxGuardrails(taiwan, null)).toThrow(/範圍過大/);
    expect(BBOX_MAX_AREA_DEG2).toBe(4.0);
    expect(BBOX_MIN_ZOOM).toBe(10);
  });
});

describe('對外回應契約（HTTP）：fetchedAt＋proxy 標記', () => {
  const fixtureEnv = { USE_FIXTURES: 'true' };

  async function createFixtureRoute() {
    const created = await (await worker.fetch(new Request('https://worker.test/v2/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [
          { lat: 25.0478, lng: 121.517 },
          { lat: 24.757, lng: 121.753 }
        ],
        vehicle: { type: 'motorcycle', plate: 'white' }
      })
    }), fixtureEnv)).json();
    return created.data.routeId;
  }

  it('POST /v2/routes：頂層 fetchedAt＋示範資料標 isProxy', async () => {
    const response = await worker.fetch(new Request('https://worker.test/v2/routes', {
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
    const body = await response.json();
    expect(body.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data.isProxy).toBe(true);
    expect(() => assertNoUnmarkedProxy(body.data)).not.toThrow();
  });

  it('GET conditions：頂層 fetchedAt＋示範資料標 isProxy', async () => {
    const routeId = await createFixtureRoute();
    const body = await (await worker.fetch(
      new Request(`https://worker.test/v2/routes/${routeId}/conditions`),
      fixtureEnv
    )).json();
    expect(body.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data.isProxy).toBe(true);
    expect(() => assertNoUnmarkedProxy(body.data)).not.toThrow();
  });

  it('GET /v2/cams?bbox=：頂層 fetchedAt，示範攝影機帶 isProxy', async () => {
    const body = await (await worker.fetch(
      new Request('https://worker.test/v2/cams?bbox=121.4,25.0,121.6,25.1'),
      fixtureEnv
    )).json();
    expect(body.status).toBe('ok');
    expect(body.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data.cameras.length).toBeGreaterThan(0);
    expect(body.data.cameras.every((c) => c.isProxy === true)).toBe(true);
    expect(() => assertNoUnmarkedProxy(body.data)).not.toThrow();
  });

  it('GET /v2/cams?bbox= 拒絕過小 zoom 與過大範圍', async () => {
    const zoom9 = await worker.fetch(
      new Request('https://worker.test/v2/cams?bbox=121.4,25.0,121.6,25.1&zoom=9'),
      fixtureEnv
    );
    expect(zoom9.status).toBe(400);
    const zoom9Body = await zoom9.json();
    expect(zoom9Body.message).toMatch(/zoom 太小/);

    const wide = await worker.fetch(
      new Request('https://worker.test/v2/cams?bbox=119.5,21.8,122.5,25.4'),
      fixtureEnv
    );
    expect(wide.status).toBe(400);
    expect((await wide.json()).message).toMatch(/範圍過大/);
  });

  it('GET /v2/cams：頂層 fetchedAt，示範資料帶 isProxy', async () => {
    const body = await (await worker.fetch(
      new Request('https://worker.test/v2/cams'),
      fixtureEnv
    )).json();
    expect(body.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data[0].isProxy).toBe(true);
    expect(() => assertNoUnmarkedProxy(body.data)).not.toThrow();
  });

  it('GET /v2/weather：頂層 fetchedAt，示範資料帶 isProxy', async () => {
    const body = await (await worker.fetch(
      new Request('https://worker.test/v2/weather'),
      fixtureEnv
    )).json();
    expect(body.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Object.values(body.data).every((entry) => entry.isProxy === true)).toBe(true);
    expect(() => assertNoUnmarkedProxy(body.data)).not.toThrow();
  });
});

describe('GET /v2/health', () => {
  function healthKv() {
    const store = new Map();
    return {
      store,
      get: vi.fn(async (key) => (store.has(key) ? store.get(key).value : null)),
      getWithMetadata: vi.fn(async () => null),
      put: vi.fn(async (key, value, options) => {
        store.set(key, { value, metadata: options && options.metadata });
      })
    };
  }

  it('無排程紀錄時回 partial（不偽造），仍帶 fetchedAt', async () => {
    const kv = healthKv();
    const body = await (await worker.fetch(
      new Request('https://worker.test/v2/health'),
      { USE_FIXTURES: 'false', PROVIDER_SNAPSHOT_MODE: 'kv', ROUTE_CACHE: kv }
    )).json();
    expect(body.status).toBe('partial');
    expect(body.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data.lastFailureAt).toBeNull();
    expect(body.data.lastSuccessAt).toBeNull();
  });

  it('排程失敗後 health 讀得到最後失敗時間戳', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('upstream down'); }));
    const kv = healthKv();
    const env = {
      USE_FIXTURES: 'false',
      PROVIDER_SNAPSHOT_MODE: 'kv',
      ROUTE_CACHE: kv
    };
    const scheduledResult = await scheduled(
      { scheduledTime: Date.parse('2026-10-03T00:02:00.000Z') },
      env,
      {}
    );
    expect(scheduledResult.ok).toBe(false);

    const body = await (await worker.fetch(
      new Request('https://worker.test/v2/health'),
      env
    )).json();
    expect(body.status).toBe('ok');
    expect(body.data.ok).toBe(false);
    expect(body.data.reason).toBe('empty-snapshot');
    expect(body.data.lastFailureAt).toBe('2026-10-03T00:02:00.000Z');
    expect(body.data.failures.length).toBeGreaterThan(0);
    expect(kv.store.has(SNAPSHOT_HEALTH_KEY)).toBe(true);
  });

  it('providerSnapshotSlotKey 仍可用（regression）', () => {
    expect(providerSnapshotSlotKey(new Date('2026-10-03T00:02:00.000Z')))
      .toMatch(/^provider-snapshot:v1:live:/);
  });

  it('錯誤回應也帶頂層 fetchedAt', async () => {
    const body = await (await worker.fetch(
      new Request('https://worker.test/v2/nope'),
      { USE_FIXTURES: 'true' }
    )).json();
    expect(body.status).toBe('error');
    expect(body.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
