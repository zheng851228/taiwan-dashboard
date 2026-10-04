import {
  buildOverall,
  buildFixtureProviderData,
  createRouteSections,
  fuseConditions,
  isFresh
} from './conditions.js';
import { roadEventState } from './road-events.js';
import {
  buildFixtureCameras,
  buildFixtureCountyWeather,
  buildFixtureRoute,
  buildSnapshotKvEntries,
  expandMapUrl,
  filterCameraListByBbox,
  filterSnapshotCamerasByBbox,
  geocodePlace,
  getValhallaRoute,
  loadCameras,
  loadCountyWeather,
  loadLatestCameraSnapshot,
  loadLiveProviderData,
  loadSnapshotCountyWeather,
  parseCameraBbox,
  assertBboxGuardrails,
  projectBboxCameras,
  sha256Hex,
  traceRouteAttributes
} from './providers.js';
import { buildAvoidLocations, validateRouteEdges } from './rules.js';
import {
  SNAPSHOT_HEALTH_KEY,
  SNAPSHOT_HEALTH_TTL_SECONDS,
  buildSnapshotHealthRecord,
  readSnapshotHealth
} from './snapshot-honesty.js';

const ROUTE_TTL_SECONDS = 6 * 60 * 60;
const MAX_JSON_BODY_BYTES = 32 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memoryCache = new Map();

const ALLOWED_CORS_ORIGINS = new Set([
  'https://zheng851228.github.io',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
]);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_CORS_ORIGINS.has(origin)) {
        return withCors(jsonResponse({ status: 'error', message: '不允許的來源' }, 403), request);
      }
      return withCors(new Response(null, { status: 204 }), request);
    }
    try {
      const response = await routeRequest(request, env);
      return withCors(response, request);
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Worker request failed', {
          method: request.method,
          path: new URL(request.url).pathname,
          message: error.message,
          stack: error.stack
        });
      }
      const publicMessage = status >= 500 ? '上游資料暫時無法使用，請稍後重試。' : error.message;
      const nowIso = new Date().toISOString();
      return withCors(jsonResponse({
        status: status === 422 ? 'blocked' : 'error',
        updatedAt: nowIso,
        fetchedAt: nowIso,
        data: error.data || null,
        message: publicMessage
      }, status), request);
    }
  },
  async scheduled(event, env, ctx) {
    await scheduled(event, env, ctx);
  }
};

/**
 * Cloudflare Workers Cron Trigger：每 5 分鐘重建 provider snapshot
 * 並以 diff-before-write 寫入 KV（2 個 keys：snapshot + cams）。
 * 供 wrangler.jsonc 的 triggers.crons 使用；測試也可直接呼叫。
 *
 * 誠實規則：
 * - 空快照（上游全掛或抓到空資料）絕不覆蓋 KV 裡的舊快照：該 key 跳過寫入，
 *   reader 會自動回退到較舊的 slot。
 * - 每次執行都更新健康紀錄（SNAPSHOT_HEALTH_KEY）：寫入狀態、provider 狀態、
 *   失敗清單與 lastFailureAt / lastSuccessAt，供 GET /v2/health 查詢。
 */
export async function scheduled(event, env, ctx) {
  const binding = env.PROVIDER_SNAPSHOTS || env.ROUTE_CACHE;
  if (!binding) {
    console.error('scheduled snapshot: 沒有可用的 KV binding（PROVIDER_SNAPSHOTS/ROUTE_CACHE）');
    return { ok: false, reason: 'no-kv-binding' };
  }
  // 非快照模式（PROVIDER_SNAPSHOT_MODE != kv）的環境不寫入，避免燒掉 KV 寫入額度；
  // jack 開啟該環境的 kv 模式後，下一個 cron tick 會自動開始寫入。
  if (!isSnapshotMode(env)) {
    console.log('scheduled snapshot: skipped（PROVIDER_SNAPSHOT_MODE 不是 kv）');
    return { ok: true, skipped: true, reason: 'not-snapshot-mode' };
  }
  const now = new Date(event && event.scheduledTime ? event.scheduledTime : Date.now());
  let entries = [];
  let providers = {};
  let buildError = null;
  try {
    entries = await buildSnapshotKvEntries(env, now);
    providers = entries[0]?.providers || {};
  } catch (error) {
    buildError = error;
  }
  const results = [];
  const entryStatuses = [];
  const failures = [];
  let wroteAny = false;
  let skippedUnchanged = false;
  if (buildError) {
    failures.push({ scope: 'build', message: buildError.message || 'snapshot build failed' });
  } else {
    for (const entry of entries) {
      if (entry.empty) {
        // 空快照不覆蓋舊快照：跳過寫入，只記錄告警。
        results.push(`${entry.key}: skipped-empty`);
        entryStatuses.push('skipped-empty');
        failures.push({
          scope: entry.kind || entry.key,
          message: 'snapshot empty (upstream failed or no data); kept previous snapshot'
        });
        continue;
      }
      const putResult = await putSnapshotEntryIfChanged(binding, entry, now);
      results.push(`${putResult.key}: ${putResult.status}`);
      entryStatuses.push(putResult.status);
      if (putResult.status === 'written') wroteAny = true;
      if (putResult.status === 'skipped') skippedUnchanged = true;
    }
    for (const [name, status] of Object.entries(providers)) {
      if (status && status.status === 'failed') {
        failures.push({ scope: name, message: `${name} provider fetch failed` });
      }
    }
  }
  const ok = !buildError && (wroteAny || skippedUnchanged);
  const reason = buildError
    ? 'build-error'
    : (ok ? null : 'empty-snapshot');
  const summary = {
    at: now.toISOString(),
    results: results.map((r) => `${r}`)
  };
  // 健康／告警紀錄：每次執行都寫，讓 health check 讀得到最後失敗時間。
  const previous = await readSnapshotHealth(binding);
  const healthRecord = buildSnapshotHealthRecord({
    now,
    ok,
    reason,
    entries: entries.map((entry, index) => ({
      kind: entry.kind,
      key: entry.key,
      status: entryStatuses[index] || 'unknown',
      empty: entry.empty,
      counts: entry.counts
    })),
    providers,
    failures,
    previous
  });
  try {
    await binding.put(
      SNAPSHOT_HEALTH_KEY,
      JSON.stringify(healthRecord),
      { expirationTtl: SNAPSHOT_HEALTH_TTL_SECONDS }
    );
  } catch (error) {
    console.error('scheduled snapshot: 健康紀錄寫入失敗', error.message);
  }
  console.log('scheduled snapshot complete', JSON.stringify(summary));
  return { ok, reason, ...summary };
}

/**
 * diff-before-write：用 KV metadata 的 sha256 比對內容雜湊。
 * 內容相同且上次寫入在 maxSkipAgeMs 內 → 跳過 put（省 KV 寫入額度）。
 * 超過最長跳過間隔仍會寫入，保 reader 的新鮮度視窗內一定找得到 slot。
 */
async function putSnapshotEntryIfChanged(binding, entry, now) {
  const { key, value, metadata, expirationTtl, compareKeys, maxSkipAgeMs } = entry;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  for (const compareKey of compareKeys || [key]) {
    let prevMeta = null;
    try {
      const existing = typeof binding.getWithMetadata === 'function'
        ? await binding.getWithMetadata(compareKey, { type: 'text' })
        : null;
      prevMeta = existing && existing.metadata;
    } catch {
      prevMeta = null;
    }
    if (!prevMeta || typeof prevMeta.sha256 !== 'string') continue;
    if (prevMeta.sha256 !== metadata.sha256) break; // 內容變了 → 寫入
    const builtAt = new Date(prevMeta.builtAt).getTime();
    if (Number.isFinite(builtAt) && nowMs - builtAt < maxSkipAgeMs) {
      return { key, status: 'skipped', matchedKey: compareKey };
    }
    break; // 超過最長跳過間隔 → 寫入
  }
  await binding.put(key, value, { expirationTtl, metadata });
  return { key, status: 'written' };
}

/**
 * GET /v2/cams?bbox=minLng,minLat,maxLng,maxLat[&zoom=]:
 * 用 cams snapshot 的格子索引做記憶體過濾，回傳欄位投影。
 * 護欄：zoom < 10 拒絕、bbox 面積 > 4 平方度拒絕、回應上限 2000 點、
 * public 快取 + ETag（沿用既有慣例）。
 * KV miss 時 fallback 即時抓取（沿用 loadCameras）。
 */
async function handleCamsBbox(bboxParam, env, request, url) {
  let bbox;
  try {
    bbox = parseCameraBbox(bboxParam);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  try {
    assertBboxGuardrails(bbox, url.searchParams.get('zoom'));
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  let cameras = null;
  let etagSeed = null;
  let fetchedAt = new Date().toISOString();
  if (!isFixtureMode(env) && isSnapshotMode(env)) {
    const snapshot = await loadLatestCameraSnapshot(env);
    if (snapshot) {
      cameras = filterSnapshotCamerasByBbox(snapshot.decoded, bbox);
      etagSeed = snapshot.sha256;
      fetchedAt = snapshot.decoded.header.fetched_at
        || snapshot.decoded.header.generatedAt
        || fetchedAt;
    }
  }
  if (!cameras) {
    const list = isFixtureMode(env) ? buildFixtureCameras() : await loadCameras(env);
    cameras = filterCameraListByBbox(list, bbox);
  }
  const { items, total, truncated } = projectBboxCameras(cameras);
  const etag = `"${etagSeed || await sha256Hex(JSON.stringify(items))}"`;
  const cacheHeaders = {
    'Cache-Control': 'public, max-age=60, s-maxage=300',
    ETag: etag
  };
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch.split(',').map((part) => part.trim()).includes(etag)) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }
  const body = envelope('ok', { cameras: items, total, truncated, bbox }, '', { fetchedAt });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cacheHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/**
 * 快照模式下讀取全量攝影機清單（供無 bbox 的 /v2/cams）。
 * KV miss 或 slot 過期時回傳 null，由呼叫端降級。
 * 回傳 { cameras, fetchedAt }。
 */
async function loadSnapshotCamerasFull(env) {
  const snapshot = await loadLatestCameraSnapshot(env);
  if (!snapshot) return null;
  const cameras = collectSnapshotCameras(snapshot.decoded);
  const projected = [];
  for (const camera of cameras) {
    projected.push({
      id: camera.id,
      lat: camera.lat,
      lng: camera.lng,
      name: camera.name,
      status: camera.status || 'unknown',
      roadRef: camera.roadRef || '',
      imageUrl: camera.imageUrl || '',
      source: camera.source || 'CCTV'
    });
  }
  return {
    cameras: projected,
    fetchedAt: snapshot.decoded.header.fetched_at
      || snapshot.decoded.header.generatedAt
      || new Date().toISOString()
  };
}

/**
 * GET /v2/health：排程健康檢查。
 * 讀取 cron 每次執行寫入的 SNAPSHOT_HEALTH_KEY：寫入狀態、provider 狀態、
 * 失敗清單、lastFailureAt / lastSuccessAt。無紀錄時回 partial（不偽造）。
 */
async function handleHealth(env) {
  const binding = env.PROVIDER_SNAPSHOTS || env.ROUTE_CACHE;
  const record = await readSnapshotHealth(binding);
  const data = {
    snapshotMode: isSnapshotMode(env),
    fetchedAt: new Date().toISOString(),
    ...(record || {
      ok: null,
      reason: 'no-health-record',
      entries: [],
      providers: {},
      failures: [],
      lastFailureAt: null,
      lastSuccessAt: null
    })
  };
  return jsonResponse(envelope(
    record ? 'ok' : 'partial',
    data,
    record ? '' : '尚無排程健康紀錄'
  ));
}

/**
 * 走訪 snapshot 文件的所有格子，收集全部攝影機（expanded 物件）。
 */
function collectSnapshotCameras(decoded) {
  const header = decoded.header || {};
  const cellIds = header.cellIndex && typeof header.cellIndex === 'object'
    ? Object.keys(header.cellIndex)
    : (header.cells && typeof header.cells === 'object' ? Object.keys(header.cells) : []);
  const cameras = [];
  for (const cellId of cellIds) {
    let cell;
    try {
      cell = decoded.readCell(cellId);
    } catch {
      continue;
    }
    if (cell && Array.isArray(cell.cameras)) cameras.push(...cell.cameras);
  }
  return cameras;
}

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  await enforceRateLimit(request, env, path, url);

  if (path === '/v2/routes' && request.method === 'POST') {
    const record = await createRouteRecord(await readJson(request), env);
    const data = publicRoute(record);
    if (record.dataMode === 'fixture') data.isProxy = true;
    return jsonResponse(envelope('ok', data, routeMessage(record)));
  }

  const conditionsMatch = path.match(/^\/v2\/routes\/([^/]+)\/conditions$/);
  if (conditionsMatch && request.method === 'GET') {
    if (!UUID_PATTERN.test(conditionsMatch[1])) throw new HttpError(400, '路線識別碼格式錯誤');
    return handleConditions(conditionsMatch[1], env, url.searchParams.get('refresh') === '1');
  }

  if (path === '/v2/cams' && request.method === 'GET') {
    const bboxParam = url.searchParams.get('bbox');
    if (bboxParam !== null && bboxParam !== '') {
      return handleCamsBbox(bboxParam, env, request, url);
    }
    // 快照模式：改讀 2MB cams KV value（全量攝影機清單），取代 HTTP envelope。
    if (!isFixtureMode(env) && isSnapshotMode(env)) {
      const full = await loadSnapshotCamerasFull(env);
      return full
        ? jsonResponse(envelope('ok', full.cameras, '', { fetchedAt: full.fetchedAt }))
        : jsonResponse(envelope('partial', [], '攝影機快照暫時無法取得'));
    }
    const cameras = isFixtureMode(env) ? buildFixtureCameras() : await loadCameras(env);
    return jsonResponse(envelope(cameras.length ? 'ok' : 'partial', cameras, cameras.length ? '' : '目前沒有攝影機資料'));
  }

  if (path === '/v2/health' && request.method === 'GET') {
    return handleHealth(env);
  }

  if (path === '/v2/weather' && request.method === 'GET') {
    // 快照模式：縣市氣象已併入 provider snapshot value，改讀 header.countyWeather。
    if (!isFixtureMode(env) && isSnapshotMode(env)) {
      const loaded = await loadSnapshotCountyWeather(env);
      return loaded
        ? jsonResponse(envelope('ok', loaded.countyWeather, '', { fetchedAt: loaded.fetchedAt }))
        : jsonResponse(envelope('partial', {}, '氣象快照暫時無法取得'));
    }
    const weather = isFixtureMode(env) ? buildFixtureCountyWeather() : await loadCountyWeather(env);
    return jsonResponse(envelope(Object.keys(weather).length ? 'ok' : 'partial', weather, Object.keys(weather).length ? '' : 'CWA 金鑰尚未設定'));
  }

  if (path === '/v2/geocode' && request.method === 'GET') {
    const query = String(url.searchParams.get('q') || '').trim();
    if (!query) throw new HttpError(400, '請提供搜尋關鍵字');
    if (query.length > 120) throw new HttpError(400, '搜尋關鍵字過長');
    const places = await geocodePlace(query);
    return jsonResponse(envelope(places.length ? 'ok' : 'partial', places, places.length ? '' : '找不到相符地點'));
  }

  if (path === '/v2/expand' && request.method === 'GET') {
    const rawUrl = url.searchParams.get('url');
    if (!rawUrl) throw new HttpError(400, '請提供地圖網址');
    const finalUrl = await expandMapUrl(rawUrl);
    return jsonResponse(envelope('ok', { finalUrl }));
  }

  // One-version compatibility bridge for the existing frontend.
  if (path === '/cam-list' && request.method === 'GET') {
    if (!isFixtureMode(env) && isSnapshotMode(env)) {
      return jsonResponse(envelope(
        'partial',
        [],
        '舊版攝影機端點不在低 CPU 快照模式提供，請改用 /v2/cams'
      ));
    }
    const cameras = isFixtureMode(env) ? buildFixtureCameras() : await loadCameras(env);
    return jsonResponse(envelope('ok', cameras.map(legacyCamera)));
  }
  if (path === '/weather' && request.method === 'GET') {
    if (!isFixtureMode(env) && isSnapshotMode(env)) {
      const loaded = await loadSnapshotCountyWeather(env);
      return loaded
        ? jsonResponse(envelope('ok', loaded.countyWeather, '', { fetchedAt: loaded.fetchedAt }))
        : jsonResponse(envelope('partial', {}, '氣象快照暫時無法取得'));
    }
    const weather = isFixtureMode(env) ? buildFixtureCountyWeather() : await loadCountyWeather(env);
    return jsonResponse(envelope('ok', weather));
  }
  if (path === '/route' && request.method === 'POST') {
    const old = await readJson(request);
    const record = await createRouteRecord({
      locations: [
        { lat: old.startLat, lng: old.startLng, type: 'break' },
        { lat: old.endLat, lng: old.endLng, type: 'break' }
      ],
      vehicle: old.mode === 'car' ? { type: 'car' } : { type: 'motorcycle', plate: 'white' },
      preferences: { strategy: 'balanced' }
    }, env);
    return jsonResponse(envelope('ok', {
      source: record.source,
      shape: record.encodedShape,
      distance: record.distanceKm,
      duration: record.durationMinutes,
      validation: record.validation
    }));
  }
  if (path === '/' && url.searchParams.has('url')) {
    const finalUrl = await expandMapUrl(url.searchParams.get('url'));
    return jsonResponse(envelope('ok', { finalUrl }));
  }

  throw new HttpError(404, '找不到 API 端點');
}

async function createRouteRecord(body, env) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, '請提供有效的路線內容');
  }
  const locations = validateLocations(body.locations);
  const vehicle = validateVehicle(body.vehicle || {});
  const strategy = body.preferences?.strategy || 'balanced';
  if (strategy !== 'balanced') throw new HttpError(400, '不支援的路線策略');
  const costing = vehicle.type === 'car'
    ? 'auto'
    : (vehicle.plate === 'white' ? 'motor_scooter' : 'motorcycle');
  const fixtureMode = isFixtureMode(env);

  let route = fixtureMode
    ? buildFixtureRoute(locations)
    : await getValhallaRoute(locations, costing, env);
  let edges = fixtureMode ? route.edges : await traceRouteAttributes(route, costing, env);
  let validation = validateRouteEdges(edges, vehicle);
  let rerouteCount = 0;

  if (validation.status !== 'safe' && !fixtureMode) {
    const avoidLocations = buildAvoidLocations(validation.violations, route.geometry);
    if (avoidLocations.length) {
      rerouteCount = 1;
      route = await getValhallaRoute(locations, costing, env, avoidLocations);
      edges = await traceRouteAttributes(route, costing, env);
      validation = validateRouteEdges(edges, vehicle);
    }
  }

  if (validation.status !== 'safe') {
    throw new HttpError(422, '找不到可確認合法的機車路線，請調整停靠點或改用其他道路。', {
      validation: { ...validation, rerouted: rerouteCount > 0, rerouteCount }
    });
  }

  const routeId = crypto.randomUUID();
  const record = {
    routeId,
    locations,
    vehicle,
    preferences: { strategy },
    geometry: route.geometry,
    encodedShape: route.encodedShape,
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes,
    edges,
    validation: { ...validation, rerouted: rerouteCount > 0, rerouteCount },
    source: route.source,
    dataMode: fixtureMode ? 'fixture' : 'live',
    createdAt: new Date().toISOString()
  };
  await cachePut(env, `route:${routeId}`, record, ROUTE_TTL_SECONDS);
  return record;
}

function isFixtureMode(env) {
  return String(env.USE_FIXTURES || '').toLowerCase() === 'true';
}

function isSnapshotMode(env) {
  return String(env.PROVIDER_SNAPSHOT_MODE || '').toLowerCase() === 'kv';
}

async function handleConditions(routeId, env, forceRefresh) {
  const record = await cacheGet(env, `route:${routeId}`);
  if (!record) throw new HttpError(404, '路線已過期，請重新規劃');
  const cachedKey = `conditions:${routeId}`;
  const cached = await cacheGet(env, cachedKey);
  const now = new Date();
  if (
    !forceRefresh
    && cached
    && now.getTime() - new Date(cached.updatedAt).getTime() < 5 * 60 * 1000
    && isCachedConditionsFresh(cached, now)
  ) {
    return jsonResponse(cached);
  }

  const baseSections = createRouteSections(record);
  const fixtureMode = record.dataMode === 'fixture';
  const providerData = fixtureMode
    ? { ...buildFixtureProviderData(baseSections), issues: [] }
    : await loadLiveProviderData(baseSections, env, { vehicle: record.vehicle });
  let conditionData = fuseConditions(record, providerData);
  if (!fixtureMode && providerData.issues?.length && cached) {
    conditionData = mergeLastKnownConditions(conditionData, cached, providerData.issues);
  }
  conditionData.routeId = routeId;
  conditionData.dataMode = fixtureMode ? 'fixture' : 'live';
  conditionData.sources = fixtureMode ? ['DEMO'] : ['TDX', 'THB', 'CWA', 'CCTV'];
  conditionData.issues = providerData.issues || [];
  if (!fixtureMode && providerData.incidentCoverage) {
    conditionData.incidentCoverage = providerData.incidentCoverage;
  }
  if (!fixtureMode && providerData.snapshotGeneratedAt) {
    conditionData.snapshotGeneratedAt = providerData.snapshotGeneratedAt;
  }
  const isPartial = conditionData.sections.some((section) => (
    section.traffic.level === 'unknown' || section.weather.condition === '未知'
  )) || Boolean(providerData.issues?.length);
  const message = fixtureMode
    ? '示範資料模式：僅供介面測試，不代表即時路況或合法導航。'
    : (providerData.issues?.length ? '部分官方資料暫時無法取得，未知路段已保留灰色。' : '');
  if (fixtureMode) conditionData.isProxy = true;
  // fetched_at：快照模式用快照實際抓取時間；即時／示範模式用本次取得時間。
  const fetchedAt = providerData.snapshotGeneratedAt || now.toISOString();
  const response = envelope(isPartial ? 'partial' : 'ok', conditionData, message, { fetchedAt });
  await cachePut(env, cachedKey, response, ROUTE_TTL_SECONDS);
  return jsonResponse(response);
}

export function isCachedConditionsFresh(cachedEnvelope, now = new Date()) {
  const data = cachedEnvelope?.data;
  if (!data || !Array.isArray(data.sections)) return false;
  if (data.snapshotGeneratedAt && !isFresh(data.snapshotGeneratedAt, 15, now)) return false;
  return data.sections.every((section) => {
    const trafficFresh = section.traffic?.level === 'unknown'
      || isFresh(section.traffic?.observedAt, 10, now);
    const weatherFresh = section.weather?.condition === '未知'
      || isFresh(section.weather?.observedAt, 90, now);
    const incidentsFresh = (section.incidents || []).every((incident) => {
      const currentState = roadEventState(incident, now);
      return currentState !== 'expired'
        && !(incident.status === 'scheduled' && currentState === 'active');
    });
    return trafficFresh && weatherFresh && incidentsFresh;
  });
}

export function mergeLastKnownConditions(current, cachedEnvelope, issues, now = new Date()) {
  const cachedData = cachedEnvelope && cachedEnvelope.data;
  if (!cachedData || !Array.isArray(cachedData.sections)) return current;
  const failedSources = new Set((issues || []).map((issue) => String(issue).split(':')[0]));
  const cachedByOrder = new Map(cachedData.sections.map((section) => [Number(section.order), section]));
  const cacheUpdatedAt = cachedEnvelope.updatedAt;
  const trafficSourceFailed = failedSources.has('TDX') || failedSources.has('THB');

  const sections = current.sections.map((section) => {
    const previous = cachedByOrder.get(Number(section.order));
    if (!previous) return section;
    const next = { ...section };

    if (
      trafficSourceFailed
      && section.traffic.level === 'unknown'
      && previous.traffic?.level !== 'unknown'
      && isFresh(previous.traffic?.observedAt, 10, now)
    ) {
      next.traffic = {
        ...previous.traffic,
        lastKnown: true,
        isProxy: true,
        message: '\u4e0a\u6e38\u66ab\u6642\u5931\u6548\uff0c\u986f\u793a\u5341\u5206\u9418\u5167\u7684\u6700\u5f8c\u6210\u529f\u8cc7\u6599'
      };
    }
    if (
      failedSources.has('CWA')
      && section.weather.condition === '\u672a\u77e5'
      && previous.weather?.condition !== '\u672a\u77e5'
      && isFresh(previous.weather?.observedAt, 90, now)
    ) {
      next.weather = {
        ...previous.weather,
        lastKnown: true,
        isProxy: true,
        message: '\u4e0a\u6e38\u66ab\u6642\u5931\u6548\uff0c\u986f\u793a\u6700\u5f8c\u6210\u529f\u7684\u6c23\u8c61\u8cc7\u6599'
      };
    }
    if (
      failedSources.has('TDX')
      && !section.incidents.length
      && previous.incidents?.length
      && isFresh(cacheUpdatedAt, 10, now)
    ) {
      next.incidents = previous.incidents
        .filter((incident) => roadEventState(incident, now) !== 'expired')
        .map((incident) => ({
          ...incident,
          status: roadEventState(incident, now),
          lastKnown: true,
          isProxy: true
        }));
    }
    if (
      failedSources.has('CCTV')
      && !section.cameras.length
      && previous.cameras?.length
      && isFresh(cacheUpdatedAt, 10, now)
    ) {
      next.cameras = previous.cameras.map((camera) => ({ ...camera, lastKnown: true, isProxy: true }));
    }
    return next;
  });

  return { ...current, sections, overall: buildOverall(sections) };
}

function publicRoute(record) {
  const refs = [];
  record.edges.forEach((edge) => {
    const name = edge.names?.[0];
    if (name && !refs.includes(name)) refs.push(name);
  });
  return {
    routeId: record.routeId,
    geometry: {
      type: 'LineString',
      coordinates: record.geometry.map(([lat, lng]) => [lng, lat])
    },
    encodedPolyline: record.encodedShape,
    distanceKm: record.distanceKm,
    durationMinutes: record.durationMinutes,
    roadSummary: refs.slice(0, 12),
    validation: record.validation,
    locations: record.locations,
    vehicle: record.vehicle,
    dataMode: record.dataMode,
    source: record.source
  };
}

function routeMessage(record) {
  if (record.dataMode === 'fixture') return '示範路線模式：不可作為實際騎乘或法規判斷依據。';
  return record.validation.rerouted ? '原路線含禁行或不確定路段，已自動避開並重新驗證。' : '';
}

function validateLocations(rawLocations) {
  if (!Array.isArray(rawLocations) || rawLocations.length < 2 || rawLocations.length > 10) {
    throw new HttpError(400, '路線需要 2 至 10 個地點');
  }
  return rawLocations.map((location, index) => {
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 20 || lat > 27 || lng < 117 || lng > 124) {
      throw new HttpError(400, `第 ${index + 1} 個地點不在可支援範圍`);
    }
    return { lat, lng, type: location.type || 'break' };
  });
}

function validateVehicle(rawVehicle) {
  const type = rawVehicle.type || 'motorcycle';
  if (type === 'car') return { type: 'car', plate: null };
  const plate = rawVehicle.plate || 'white';
  if (!['white', 'yellow', 'red'].includes(plate)) throw new HttpError(400, '不支援的機車牌照類型');
  return { type: 'motorcycle', plate };
}

function legacyCamera(camera) {
  return {
    id: camera.id,
    name: camera.name,
    lat: camera.lat,
    lon: camera.lng,
    cam_url: camera.imageUrl,
    status: camera.status,
    source: camera.source
  };
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, '請求內容過大');
  }
  try {
    if (!request.body) return JSON.parse(await request.text());
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, '請求內容過大');
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'JSON 格式錯誤');
  }
}

function envelope(status, data, message = '', options = {}) {
  const body = { status, updatedAt: new Date().toISOString(), data, message };
  // 對外回應契約：頂層 fetched_at 為資料實際取得時間（非回應時間）；
  // 未指定時預設為回應時間（適用即時運算／即時查詢端點）。
  const fetchedAt = options.fetchedAt || body.updatedAt;
  body.fetchedAt = fetchedAt;
  return body;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function jsonTextResponse(value, status = 200) {
  return new Response(value, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function withCors(response, request) {
  const headers = new Headers(response.headers);
  const origin = request && request.headers.get('Origin');
  if (origin && ALLOWED_CORS_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Vary', 'Origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  // 個別路由已設定 public 快取時（如 /v2/cams?bbox=）予以保留，
  // 否則預設 no-store（API 資料預設不快取）。
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  if (response.status === 429) headers.set('Retry-After', '60');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function rateLimitDescriptor(path, method, url) {
  if (method === 'POST' && (path === '/v2/routes' || path === '/route')) {
    return { binding: 'ROUTE_RATE_LIMITER', group: 'route-create', limit: 12 };
  }
  if (method === 'GET' && /^\/v2\/routes\/[^/]+\/conditions$/.test(path) && url.searchParams.get('refresh') === '1') {
    return { binding: 'ROUTE_RATE_LIMITER', group: 'conditions-refresh', limit: 12 };
  }
  if (method === 'GET' && (path === '/v2/geocode')) {
    return { binding: 'LOOKUP_RATE_LIMITER', group: 'geocode', limit: 60 };
  }
  if (method === 'GET' && (path === '/v2/expand' || (path === '/' && url.searchParams.has('url')))) {
    return { binding: 'LOOKUP_RATE_LIMITER', group: 'map-expand', limit: 60 };
  }
  if (method === 'GET' && path === '/v2/cams') {
    return { binding: 'LOOKUP_RATE_LIMITER', group: 'cams', limit: 60 };
  }
  if (method === 'GET' && path === '/v2/weather') {
    return { binding: 'LOOKUP_RATE_LIMITER', group: 'weather', limit: 60 };
  }
  if (method === 'GET' && path === '/v2/health') {
    return { binding: 'LOOKUP_RATE_LIMITER', group: 'health', limit: 60 };
  }
  if (method === 'GET' && /^\/v2\/routes\/[^/]+\/conditions$/.test(path) && url.searchParams.get('refresh') !== '1') {
    return { binding: 'LOOKUP_RATE_LIMITER', group: 'conditions', limit: 60 };
  }
  return null;
}

async function enforceRateLimit(request, env, path, url) {
  // Fixture mode is an in-process test data source; keep the production
  // abuse guard out of deterministic local E2E runs. Configured bindings
  // remain active for staging/production and for explicit limiter tests.
  if (isFixtureMode(env)) return;
  const descriptor = rateLimitDescriptor(path, request.method, url);
  if (!descriptor) return;
  const limiter = env[descriptor.binding];
  if (!limiter || typeof limiter.limit !== 'function') return;
  const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
  const result = await limiter.limit({ key: descriptor.group + ':' + ip });
  if (!result.success) {
    console.warn('rate-limit', { group: descriptor.group, result: 'blocked' });
    throw new HttpError(429, '請求過於頻繁，請稍後再試');
  }
}

async function cachePut(env, key, value, ttlSeconds) {
  if (env.ROUTE_CACHE) {
    await env.ROUTE_CACHE.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
    return;
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function cacheGet(env, key) {
  if (env.ROUTE_CACHE) return env.ROUTE_CACHE.get(key, { type: 'json' });
  const entry = memoryCache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

class HttpError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}
