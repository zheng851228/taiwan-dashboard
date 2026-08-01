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
  expandMapUrl,
  geocodePlace,
  getValhallaRoute,
  loadCameras,
  loadCountyWeather,
  loadLiveProviderData,
  loadProviderSnapshotHttpEnvelope,
  traceRouteAttributes
} from './providers.js';
import { buildAvoidLocations, validateRouteEdges } from './rules.js';

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
      return withCors(jsonResponse({
        status: status === 422 ? 'blocked' : 'error',
        updatedAt: new Date().toISOString(),
        data: error.data || null,
        message: publicMessage
      }, status), request);
    }
  }
};

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  await enforceRateLimit(request, env, path, url);

  if (path === '/v2/routes' && request.method === 'POST') {
    const record = await createRouteRecord(await readJson(request), env);
    return jsonResponse(envelope('ok', publicRoute(record), routeMessage(record)));
  }

  const conditionsMatch = path.match(/^\/v2\/routes\/([^/]+)\/conditions$/);
  if (conditionsMatch && request.method === 'GET') {
    if (!UUID_PATTERN.test(conditionsMatch[1])) throw new HttpError(400, '路線識別碼格式錯誤');
    return handleConditions(conditionsMatch[1], env, url.searchParams.get('refresh') === '1');
  }

  if (path === '/v2/cams' && request.method === 'GET') {
    if (!isFixtureMode(env) && isSnapshotMode(env)) {
      const cached = await loadProviderSnapshotHttpEnvelope('cams', env);
      return cached
        ? jsonTextResponse(cached)
        : jsonResponse(envelope('partial', [], '攝影機快照暫時無法取得'));
    }
    const cameras = isFixtureMode(env) ? buildFixtureCameras() : await loadCameras(env);
    return jsonResponse(envelope(cameras.length ? 'ok' : 'partial', cameras, cameras.length ? '' : '目前沒有攝影機資料'));
  }

  if (path === '/v2/weather' && request.method === 'GET') {
    if (!isFixtureMode(env) && isSnapshotMode(env)) {
      const cached = await loadProviderSnapshotHttpEnvelope('weather', env);
      return cached
        ? jsonTextResponse(cached)
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
      const cached = await loadProviderSnapshotHttpEnvelope('weather', env);
      return cached
        ? jsonTextResponse(cached)
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
  const response = envelope(isPartial ? 'partial' : 'ok', conditionData, message);
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
          lastKnown: true
        }));
    }
    if (
      failedSources.has('CCTV')
      && !section.cameras.length
      && previous.cameras?.length
      && isFresh(cacheUpdatedAt, 10, now)
    ) {
      next.cameras = previous.cameras.map((camera) => ({ ...camera, lastKnown: true }));
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

function envelope(status, data, message = '') {
  return { status, updatedAt: new Date().toISOString(), data, message };
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
  headers.set('Cache-Control', 'no-store');
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
  return null;
}

async function enforceRateLimit(request, env, path, url) {
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
