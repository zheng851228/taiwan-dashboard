import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../worker/src/index.js';
import {
  buildProviderSnapshotDocument,
  decodeProviderSnapshot,
  packProviderSnapshot,
  providerCameraSnapshotSlotKey
} from '../worker/src/provider-snapshot.js';
import {
  filterCameraListByBbox,
  filterSnapshotCamerasByBbox,
  parseCameraBbox,
  projectBboxCameras
} from '../worker/src/providers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const SAMPLE_CAMERAS = [
  { id: 'cam-tpe', name: '台北車站', lat: 25.0478, lng: 121.517, roadRef: '台1線', imageUrl: 'https://example.com/tpe.jpg', status: 'online', source: 'CCTV' },
  { id: 'cam-tpe2', name: '台北101', lat: 25.033, lng: 121.565, roadRef: '信義路', imageUrl: '', status: 'online', source: 'CCTV' },
  { id: 'cam-ks', name: '高雄車站', lat: 22.639, lng: 120.302, roadRef: '台1線', imageUrl: '', status: 'offline', source: 'CCTV' },
  { id: 'cam-out', name: '框外', lat: 24.0, lng: 119.0, roadRef: '', imageUrl: '', status: 'online', source: 'CCTV' }
];

function packCameras(cameras, generatedAt = '2026-10-03T00:00:00.000Z') {
  const document = buildProviderSnapshotDocument(
    { detectors: [], publishedTraffic: [], incidents: [], weather: [], cameras },
    { generatedAt, gridDegrees: 0.05, routeHalo: 1, providers: { CCTV: 'twipcam' }, issues: [] }
  );
  return packProviderSnapshot(document);
}

function createSnapshotKv() {
  const store = new Map();
  return {
    store,
    get: vi.fn(async (key) => (store.has(key) ? store.get(key).value : null)),
    getWithMetadata: vi.fn(async (key) => {
      const entry = store.get(key);
      return entry ? { value: entry.value, metadata: entry.metadata } : null;
    }),
    put: vi.fn(async (key, value, options) => {
      store.set(key, {
        value,
        metadata: options && options.metadata,
        expirationTtl: options && options.expirationTtl
      });
    })
  };
}

describe('parseCameraBbox', () => {
  it('解析合法的 bbox', () => {
    expect(parseCameraBbox('120,22,122,25')).toEqual({
      minLng: 120, minLat: 22, maxLng: 122, maxLat: 25
    });
  });

  it('拒絕格式錯誤', () => {
    expect(() => parseCameraBbox('120,22,122')).toThrow();
    expect(() => parseCameraBbox('a,b,c,d')).toThrow();
    expect(() => parseCameraBbox('')).toThrow();
  });

  it('拒絕 min >= max', () => {
    expect(() => parseCameraBbox('122,22,120,25')).toThrow('minLng < maxLng');
    expect(() => parseCameraBbox('120,25,122,22')).toThrow('minLat < maxLat');
  });

  it('clamp 到台灣範圍', () => {
    expect(parseCameraBbox('0,0,200,90')).toEqual({
      minLng: 119.5, minLat: 21.8, maxLng: 122.5, maxLat: 25.4
    });
  });

  it('clamp 後為空則拒絕', () => {
    expect(() => parseCameraBbox('130,30,131,31')).toThrow();
  });
});

describe('filterSnapshotCamerasByBbox', () => {
  it('只回傳 bbox 內的攝影機（走格子索引）', () => {
    const decoded = decodeProviderSnapshot(packCameras(SAMPLE_CAMERAS));
    const result = filterSnapshotCamerasByBbox(
      decoded,
      { minLng: 121.4, minLat: 25.0, maxLng: 121.6, maxLat: 25.1 }
    );
    expect(result.map((c) => c.id).sort()).toEqual(['cam-tpe', 'cam-tpe2']);
  });

  it('跨多個格子時不遺漏', () => {
    const decoded = decodeProviderSnapshot(packCameras(SAMPLE_CAMERAS));
    const result = filterSnapshotCamerasByBbox(
      decoded,
      { minLng: 120.2, minLat: 22.5, maxLng: 120.4, maxLat: 22.7 }
    );
    expect(result.map((c) => c.id)).toEqual(['cam-ks']);
  });

  it('空結果回傳空陣列', () => {
    const decoded = decodeProviderSnapshot(packCameras(SAMPLE_CAMERAS));
    const result = filterSnapshotCamerasByBbox(
      decoded,
      { minLng: 121.9, minLat: 25.2, maxLng: 122.0, maxLat: 25.3 }
    );
    expect(result).toEqual([]);
  });
});

describe('filterCameraListByBbox', () => {
  it('過濾一般攝影機清單', () => {
    const result = filterCameraListByBbox(
      SAMPLE_CAMERAS,
      { minLng: 121.4, minLat: 25.0, maxLng: 121.6, maxLat: 25.1 }
    );
    expect(result.map((c) => c.id).sort()).toEqual(['cam-tpe', 'cam-tpe2']);
  });
});

describe('projectBboxCameras', () => {
  it('投影欄位並保留來源資訊', () => {
    const { items, total, truncated } = projectBboxCameras(SAMPLE_CAMERAS.slice(0, 1));
    expect(items[0]).toEqual({
      id: 'cam-tpe',
      lat: 25.0478,
      lng: 121.517,
      name: '台北車站',
      status: 'online',
      roadRef: '台1線',
      imageUrl: 'https://example.com/tpe.jpg',
      source: 'CCTV'
    });
    expect(total).toBe(1);
    expect(truncated).toBe(false);
  });

  it('超過 2000 點時截斷並標註 truncated', () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({
      id: `cam-${i}`, lat: 25, lng: 121, name: `cam ${i}`, status: 'online'
    }));
    const { items, total, truncated } = projectBboxCameras(many);
    expect(items).toHaveLength(2000);
    expect(total).toBe(2500);
    expect(truncated).toBe(true);
  });
});

describe('GET /v2/cams?bbox=', () => {
  function snapshotEnv(kv, extra = {}) {
    return {
      USE_FIXTURES: 'false',
      PROVIDER_SNAPSHOT_MODE: 'kv',
      ROUTE_CACHE: kv,
      ...extra
    };
  }

  function seedCameraSnapshot(kv, sha256 = 'deadbeef') {
    // 用當前時間 seed，slot key 才會命中 loadLatestCameraSnapshot 的回看視窗
    const now = new Date();
    const key = providerCameraSnapshotSlotKey(now);
    kv.store.set(key, {
      value: packCameras(SAMPLE_CAMERAS, now.toISOString()),
      metadata: { sha256, builtAt: now.toISOString() },
      expirationTtl: 18 * 60 * 60
    });
    return key;
  }

  it('回傳 bbox 內攝影機並帶 public 快取與 ETag', async () => {
    const kv = createSnapshotKv();
    seedCameraSnapshot(kv, 'snap-sha-1');

    const response = await worker.fetch(
      new Request('https://worker.test/v2/cams?bbox=121.4,25.0,121.6,25.1'),
      snapshotEnv(kv)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.data.cameras.map((c) => c.id).sort()).toEqual(['cam-tpe', 'cam-tpe2']);
    expect(body.data.total).toBe(2);
    expect(body.data.truncated).toBe(false);
    expect(body.data.bbox).toEqual({ minLng: 121.4, minLat: 25.0, maxLng: 121.6, maxLat: 25.1 });
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=300');
    expect(response.headers.get('ETag')).toBe('"snap-sha-1"');
  });

  it('If-None-Match 命中時回 304', async () => {
    const kv = createSnapshotKv();
    seedCameraSnapshot(kv, 'snap-sha-1');

    const response = await worker.fetch(
      new Request('https://worker.test/v2/cams?bbox=121.4,25.0,121.6,25.1', {
        headers: { 'If-None-Match': '"snap-sha-1"' }
      }),
      snapshotEnv(kv)
    );
    expect(response.status).toBe(304);
    expect(response.headers.get('ETag')).toBe('"snap-sha-1"');
  });

  it('非法 bbox 回 400', async () => {
    const kv = createSnapshotKv();
    const response = await worker.fetch(
      new Request('https://worker.test/v2/cams?bbox=not-a-bbox'),
      snapshotEnv(kv)
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe('error');
  });

  it('無 bbox 的 /v2/cams 在快照模式讀全量攝影機', async () => {
    const kv = createSnapshotKv();
    seedCameraSnapshot(kv);

    const response = await worker.fetch(
      new Request('https://worker.test/v2/cams'),
      snapshotEnv(kv)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.data).toHaveLength(4);
    expect(body.data.map((c) => c.id).sort()).toEqual(['cam-ks', 'cam-out', 'cam-tpe', 'cam-tpe2']);
    expect(body.data[0]).toMatchObject({ source: 'CCTV' });
  });

  it('快照 miss 時無 bbox 回 partial', async () => {
    const kv = createSnapshotKv();
    const response = await worker.fetch(
      new Request('https://worker.test/v2/cams'),
      snapshotEnv(kv)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('partial');
  });

  it('fixture 模式下 bbox 過濾 fixture 攝影機', async () => {
    const kv = createSnapshotKv();
    const response = await worker.fetch(
      new Request('https://worker.test/v2/cams?bbox=121.4,25.0,121.6,25.1'),
      { USE_FIXTURES: 'true', ROUTE_CACHE: kv }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(Array.isArray(body.data.cameras)).toBe(true);
  });
});
