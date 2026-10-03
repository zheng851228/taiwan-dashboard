import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduled } from '../worker/src/index.js';
import { providerCameraSnapshotSlotKey, providerSnapshotSlotKey } from '../worker/src/provider-snapshot.js';

afterEach(() => {
  vi.unstubAllGlobals();
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

// 上游全部失敗 → 空 provider 資料（具確定性，雜湊穩定）
function stubFetchFail() {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('upstream down');
  }));
}

// 只有 twipcam 回傳 1 台攝影機，其餘上游失敗
function stubFetchOneCamera() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('twipcam')) {
      return new Response(JSON.stringify([{
        id: 'cam-x1', name: '測試攝影機', lat: 25.05, lng: 121.52,
        roadRef: '台1線', cam_url: 'https://example.com/x1.jpg', status: 'online'
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('upstream down');
  }));
}

const EVENT_TIME = '2026-10-03T00:02:00.000Z';

describe('scheduled snapshot', () => {
  it('寫入 2 個 keys 並帶 sha256 metadata 與 TTL', async () => {
    stubFetchFail();
    const kv = createSnapshotKv();
    const now = new Date(EVENT_TIME);

    const result = await scheduled({ scheduledTime: Date.parse(EVENT_TIME) }, kvEnv(kv), {});

    expect(result.ok).toBe(true);
    expect(kv.put).toHaveBeenCalledTimes(2);
    const snapshotKey = providerSnapshotSlotKey(now);
    const cameraKey = providerCameraSnapshotSlotKey(now);
    const snapshotEntry = kv.store.get(snapshotKey);
    const cameraEntry = kv.store.get(cameraKey);
    expect(snapshotEntry).toBeDefined();
    expect(cameraEntry).toBeDefined();
    expect(snapshotEntry.expirationTtl).toBe(2 * 60 * 60);
    expect(cameraEntry.expirationTtl).toBe(18 * 60 * 60);
    for (const entry of [snapshotEntry, cameraEntry]) {
      expect(entry.metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.metadata.builtAt).toBe(now.toISOString());
    }
    expect(result.results).toHaveLength(2);
  });

  it('內容不變時跳過寫入（diff-before-write）', async () => {
    stubFetchFail();
    const kv = createSnapshotKv();
    const event = { scheduledTime: Date.parse(EVENT_TIME) };

    await scheduled(event, kvEnv(kv), {});
    kv.put.mockClear();
    // 下一個 5 分鐘 slot：比對上一 slot 的 metadata，內容相同 → 跳過
    const result = await scheduled(
      { scheduledTime: Date.parse('2026-10-03T00:07:00.000Z') },
      kvEnv(kv),
      {}
    );

    expect(result.ok).toBe(true);
    expect(kv.put).not.toHaveBeenCalled();
    expect(result.results.every((line) => line.endsWith(': skipped'))).toBe(true);
  });

  it('內容變化時重新寫入', async () => {
    stubFetchFail();
    const kv = createSnapshotKv();

    await scheduled({ scheduledTime: Date.parse(EVENT_TIME) }, kvEnv(kv), {});
    kv.put.mockClear();

    stubFetchOneCamera();
    const result = await scheduled(
      { scheduledTime: Date.parse('2026-10-03T00:07:00.000Z') },
      kvEnv(kv),
      {}
    );

    expect(kv.put).toHaveBeenCalledTimes(2);
    expect(result.results.every((line) => line.endsWith(': written'))).toBe(true);
  });

  it('超過最長跳過間隔仍會寫入（保 reader 新鮮度）', async () => {
    stubFetchFail();
    const kv = createSnapshotKv();

    await scheduled({ scheduledTime: Date.parse(EVENT_TIME) }, kvEnv(kv), {});
    kv.put.mockClear();

    // 把 metadata 的 builtAt 改為 11 分鐘前（超過 snapshot 的 10 分鐘上限）
    const now = new Date(EVENT_TIME);
    for (const key of [providerSnapshotSlotKey(now), providerCameraSnapshotSlotKey(now)]) {
      const entry = kv.store.get(key);
      entry.metadata = { ...entry.metadata, builtAt: new Date(Date.parse(EVENT_TIME) - 11 * 60 * 1000).toISOString() };
    }

    const result = await scheduled(
      { scheduledTime: Date.parse('2026-10-03T00:07:00.000Z') },
      kvEnv(kv),
      {}
    );
    // snapshot key（10 分鐘上限）會重寫；cams key（6 小時上限）仍跳過
    const writtenKeys = kv.put.mock.calls.map((call) => call[0]);
    expect(writtenKeys).toContain(providerSnapshotSlotKey(new Date('2026-10-03T00:07:00.000Z')));
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
