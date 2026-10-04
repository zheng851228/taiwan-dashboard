/**
 * 快照誠實化（snapshot honesty）共用模組。
 *
 * 三條硬規則，測試會把它們鎖死（tests/worker-snapshot-honesty.test.js）：
 * 1. 寫入 KV 的 snapshot 必須帶 fetched_at（ISO）、source（資料來源名）、
 *    stale_after（過期秒數）；讀取端做版本 gate，缺任一欄位一律拒絕使用。
 * 2. 任何 proxy / 推估資料（lastKnown、fixture/demo）必須帶 isProxy: true。
 * 3. 所有對外 JSON 回應頂層必須帶 fetched_at（資料實際取得時間，非回應時間）。
 */

export const SNAPSHOT_HONESTY_FIELDS = ['fetched_at', 'source', 'stale_after'];

/** 排程健康／失敗告警紀錄的 KV key（health check 可查詢）。 */
export const SNAPSHOT_HEALTH_KEY = 'provider-snapshot:v1:health';
export const SNAPSHOT_HEALTH_TTL_SECONDS = 2 * 60 * 60;

export class SnapshotHonestyError extends Error {
  constructor(message, missing = []) {
    super(message);
    this.name = 'SnapshotHonestyError';
    this.missing = missing;
  }
}

function isValidIsoTimestamp(value) {
  if (typeof value !== 'string' || !value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time);
}

/**
 * 驗證 snapshot header 是否帶齊誠實欄位。
 * 回傳 { ok: true } 或 { ok: false, missing: [...], reason }。
 */
export function validateSnapshotHonesty(header) {
  const missing = [];
  if (!header || typeof header !== 'object') {
    return { ok: false, missing: [...SNAPSHOT_HONESTY_FIELDS], reason: 'header missing' };
  }
  if (!isValidIsoTimestamp(header.fetched_at)) missing.push('fetched_at');
  if (typeof header.source !== 'string' || !header.source.trim()) missing.push('source');
  const staleAfter = Number(header.stale_after);
  if (!Number.isFinite(staleAfter) || staleAfter <= 0) missing.push('stale_after');
  if (missing.length) {
    return {
      ok: false,
      missing,
      reason: `snapshot honesty gate: missing/invalid [${missing.join(', ')}]`
    };
  }
  return { ok: true, missing: [], reason: '' };
}

/**
 * 寫入路徑的強制斷言：欄位缺任一就丟錯，不讓不誠實的快照進 KV。
 */
export function assertSnapshotHonestForWrite(document) {
  const header = document && typeof document === 'object' ? document : {};
  const result = validateSnapshotHonesty(header);
  if (!result.ok) {
    throw new SnapshotHonestyError(
      `拒絕寫入不誠實的快照：${result.reason}`,
      result.missing
    );
  }
  return true;
}

/**
 * 對外回應的 proxy 標記契約：遞迴檢查，任何帶 lastKnown: true 的物件
 * 若沒有 isProxy: true 就丟錯。測試用它把規則鎖死。
 */
export function assertNoUnmarkedProxy(value, path = 'data') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnmarkedProxy(item, `${path}[${index}]`));
    return true;
  }
  if (value && typeof value === 'object') {
    if (value.lastKnown === true && value.isProxy !== true) {
      throw new SnapshotHonestyError(
        `對外回應含未標記的 proxy 資料（缺 isProxy）：${path}`
      );
    }
    for (const [key, item] of Object.entries(value)) {
      assertNoUnmarkedProxy(item, `${path}.${key}`);
    }
  }
  return true;
}

/**
 * 讀取排程健康紀錄（cron 每次執行都會更新；失敗時含 lastFailureAt）。
 * KV miss / 解析失敗時回傳 null，由呼叫端降級為 partial。
 */
export async function readSnapshotHealth(binding) {
  if (!binding || typeof binding.get !== 'function') return null;
  let raw;
  try {
    raw = await binding.get(SNAPSHOT_HEALTH_KEY, { type: 'text' });
  } catch {
    return null;
  }
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 組出要寫入 SNAPSHOT_HEALTH_KEY 的健康紀錄。
 * previous：上一次的健康紀錄（用於延續 lastFailureAt / lastSuccessAt）。
 */
export function buildSnapshotHealthRecord({
  now = new Date(),
  ok,
  reason = null,
  entries = [],
  providers = {},
  failures = [],
  previous = null
}) {
  const at = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const succeeded = ok === true;
  const failed = failures.length > 0;
  return {
    schemaVersion: 1,
    updatedAt: at,
    runAt: at,
    ok: Boolean(ok),
    reason,
    entries: entries.map((entry) => ({
      kind: entry.kind || null,
      key: entry.key,
      status: entry.status,
      empty: Boolean(entry.empty),
      counts: entry.counts || null
    })),
    providers,
    failures: failures.map((failure) => ({
      scope: failure.scope || failure.provider || 'unknown',
      message: String(failure.message || 'unknown failure'),
      at
    })),
    lastFailureAt: failed
      ? at
      : (previous && previous.lastFailureAt) || null,
    lastSuccessAt: succeeded
      ? at
      : (previous && previous.lastSuccessAt) || null
  };
}
