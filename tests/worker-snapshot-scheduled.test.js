import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduled } from '../worker/src/index.js';
import { providerCameraSnapshotSlotKey, providerSnapshotSlotKey } from '../worker/src/provider-snapshot.js';
import { clearJsonResponseCache } from '../worker/src/providers.js';
import { SNAPSHOT_HEALTH_KEY } from '../worker/src/snapshot-honesty.js';

afterEach(() => {
  vi.unstubAllGlobals();
  clearJsonResponseCache();
});

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

function kvEnv(kv, extra = {}) {
  return {
    USE_FIXTURES: 'false',
    PROVIDER_SNAPSHOT_MODE: 'kv',
    ROUTE_CACHE: kv,
    ...extra
  };
}

// 上游全部失敗 → 空 provider 資料
function stubFetchFail() {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('upstream down');
  }));
}

// 只有 twipcam 回傳 N 台攝影機，其餘上游失敗
function stubFetchCameras(count) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('twipcam')) {
      const cameras = Array.from({ length: count }, (_, i) => ({
        id: `cam-x${i + 1}`,
        name: `測試攝影機${i + 1}`,
        lat: 25.05,
        lng: 121.52,
        roadRef: '台1線',
        cam_url: `https://example.com/x${i + 1}.jpg`,
        status: 'online'
      }));
      return new Response(JSON.stringify(cameras), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error('upstream down');
  }));
}

function healthRecord(kv) {
  const entry = kv.store.get(SNAPSHOT_HEALTH_KEY);
  expect(entry).toBeDefined();
  return JSON.parse(entry.value);
}

function putKeys(kv) {
  return kv.put.mock.calls.map((call) => call[0]);
}

const EVENT_TIME = '2026-10-03T00:02:00.000Z';

describe('scheduled snapshot', () => {
  it('上游全掛時不寫空快照，只寫健康告警', async () => {
    stubFetchFail();
    const kv = createSnapshotKv();
    const now = new Date(EVENT_TIME);

    const result = await scheduled({ scheduledTime: Date.parse(EVENT_TIME) }, kvEnv(kv), {});

    // 空快照不得覆蓋舊快照：兩個 snapshot key 都沒寫
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty-snapshot');
    expect(kv.store.has(providerSnapshotSlotKey(now))).toBe(false);
    expect(kv.store.has(providerCameraSnapshotSlotKey(now))).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((line) => line.endsWith(': skipped-empty'))).toBe(true);

    // 但健康／告警紀錄一定要寫，讓 health check 讀得到最後失敗時間
    const health = healthRecord(kv);
    expect(health.ok).toBe(false);
    expect(health.reason).toBe('empty-snapshot');
    expect(health.lastFailureAt).toBe(now.toISOString());
    expect(health.lastSuccessAt).toBeNull();
    expect(health.failures.length).toBeGreaterThan(0);
    expect(health.failures.map((f) => f.scope)).toContain('TDX');
    expect(health.entries).toHaveLength(2);
    expect(health.entries.every((entry) => entry.status === 'skipped-empty')).toBe(true);
    expect(putKeys(kv)).toEqual([SNAPSHOT_HEALTH_KEY]);
  });

  it('部分成功時只寫非空快照並記錄告警', async () => {
    stubFetchCameras(1);
    const kv = createSnapshotKv();
    const now = new Date(EVENT_TIME);

    const result = await scheduled({ scheduledTime: Date.parse(EVENT_TIME) }, kvEnv(kv), {});

    expect(result.ok).toBe(true);
    // cams 有資料 → 寫入；snapshot 空 → 跳過不覆蓋
    expect(kv.store.has(providerCameraSnapshotSlotKey(now))).toBe(true);
    expect(kv.store.has(providerSnapshotSlotKey(now))).toBe(false);
    expect(result.results.find((line) => line.includes('cameras'))).toMatch(/written$/);

    const health = healthRecord(kv);
    expect(health.ok).toBe(true);
    expect(health.lastFailureAt).toBe(now.toISOString());
    expect(health.lastSuccessAt).toBe(now.toISOString());
    expect(health.failures.map((f) => f.scope)).toContain('snapshot');
    expect(health.providers.CCTV.status).toBe('ok');
    expect(health.providers.TDX.status).toBe('failed');
  });

  it('內容不變時跳過寫入（diff-before-write），但健康紀錄照寫', async () => {
    stubFetchCameras(1);
    const kv = createSnapshotKv();
    const event = { scheduledTime: Date.parse(EVENT_TIME) };

    await scheduled(event, kvEnv(kv), {});
    kv.put.mockClear();
    clearJsonResponseCache();
    // 下一個 5 分鐘 slot：cams 仍在同一個 6 小時 slot，內容相同 → 跳過
    const result = await scheduled(
      { scheduledTime: Date.parse('2026-10-03T00:07:00.000Z') },
      kvEnv(kv),
      {}
    );

    expect(result.ok).toBe(true);
    const keys = putKeys(kv);
    expect(keys).not.toContain(providerCameraSnapshotSlotKey(new Date('2026-10-03T00:07:00.000Z')));
    // 健康紀錄每次執行都更新
    expect(keys).toEqual([SNAPSHOT_HEALTH_KEY]);
    expect(result.results.some((line) => line.endsWith(': skipped'))).toBe(true);
    expect(result.results.some((line) => line.endsWith(': skipped-empty'))).toBe(true);
  });

  it('內容變化時重新寫入', async () => {
    stubFetchCameras(1);
    const kv = createSnapshotKv();

    await scheduled({ scheduledTime: Date.parse(EVENT_TIME) }, kvEnv(kv), {});
    kv.put.mockClear();
    clearJsonResponseCache();

    stubFetchCameras(2);
    const result = await scheduled(
      { scheduledTime: Date.parse('2026-10-03T00:07:00.000Z') },
      kvEnv(kv),
      {}
    );

    const cameraKey = providerCameraSnapshotSlotKey(new Date('2026-10-03T00:07:00.000Z'));
    expect(putKeys(kv)).toContain(cameraKey);
    expect(result.results.find((line) => line.startsWith(cameraKey))).toMatch(/written$/);
    expect(result.ok).toBe(true);
  });

  it('超過最長跳過間隔仍會寫入（保 reader 新鮮度）', async () => {
    stubFetchCameras(1);
    const kv = createSnapshotKv();

    await scheduled({ scheduledTime: Date.parse(EVENT_TIME) }, kvEnv(kv), {});
    kv.put.mockClear();

    // 把 cams metadata 的 builtAt 改為 7 小時前（超過 cams 的 6 小時上限）
    const cameraKey = providerCameraSnapshotSlotKey(new Date(EVENT_TIME));
    const entry = kv.store.get(cameraKey);
    entry.metadata = {
      ...entry.metadata,
      builtAt: new Date(Date.parse(EVENT_TIME) - 7 * 60 * 60 * 1000).toISOString()
    };

    const result = await scheduled(
      { scheduledTime: Date.parse('2026-10-03T00:07:00.000Z') },
      kvEnv(kv),
      {}
    );
    expect(putKeys(kv)).toContain(cameraKey);
    expect(result.results.find((line) => line.startsWith(cameraKey))).toMatch(/written$/);
    expect(result.ok).toBe(true);
  });

  it('沒有 KV binding 時回報失敗', async () => {
    stubFetchFail();
    const result = await scheduled(
      { scheduledTime: Date.parse(EVENT_TIME) },
      { PROVIDER_SNAPSHOT_MODE: 'kv' },
      {}
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-kv-binding');
  });

  it('非快照模式的環境不寫入', async () => {
    stubFetchFail();
    const kv = createSnapshotKv();
    const result = await scheduled(
      { scheduledTime: Date.parse(EVENT_TIME) },
      { USE_FIXTURES: 'false', ROUTE_CACHE: kv },
      {}
    );
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(kv.put).not.toHaveBeenCalled();
  });
});
