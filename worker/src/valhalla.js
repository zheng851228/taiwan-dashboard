// Valhalla engines in priority order, with fallback.
//
//   1. VALHALLA_PRIMARY_URL  - the self-hosted Cloud Run service (private; called with a Google
//      ID token minted from GCP_SERVICE_ACCOUNT_KEY).  Optional.
//   2. VALHALLA_BASE_URL     - the public FOSSGIS server (default), always kept as a fallback.
//   3. VALHALLA_FALLBACK_URLS - optional extra comma-separated public engines.
//
// A request goes to the first engine that is not "open" in the circuit breaker.  Network
// errors, timeouts, HTTP 5xx, 429 and auth failures (401/403) move on to the next engine and
// open that engine's breaker for CIRCUIT_OPEN_MS (in memory, per isolate: no KV writes).
// Any other 4xx (e.g. 400 "no route found") is a real answer from a healthy engine and is
// thrown straight away - another engine with the same OSM data would say the same.
// `prefer` pins an engine first (trace_attributes uses the engine that produced the route, so
// both see the same OSM edges); the others stay as fallback.

import { getIdToken } from './gcp-auth.js';

export const DEFAULT_VALHALLA_URL = 'https://valhalla1.openstreetmap.de';
const CIRCUIT_OPEN_MS = 60 * 1000;
const breaker = new Map(); // engine id -> open-until epoch ms

function trimUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function engineId(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function valhallaEngines(env = {}) {
  const engines = [];
  const seen = new Set();
  const add = (url, extra = {}) => {
    const clean = trimUrl(url);
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    engines.push({ id: engineId(clean), url: clean, auth: null, ...extra });
  };
  if (env.VALHALLA_PRIMARY_URL) add(env.VALHALLA_PRIMARY_URL, { auth: 'gcp', primary: true });
  add(env.VALHALLA_BASE_URL || DEFAULT_VALHALLA_URL);
  String(env.VALHALLA_FALLBACK_URLS || '').split(',').forEach((url) => add(url));
  return engines;
}

function isOpen(engine, now) {
  const until = breaker.get(engine.id);
  return Boolean(until && until > now);
}

function shouldFallback(error) {
  if (!error) return false;
  if (error.name === 'AbortError' || error.timeout) return true;
  const status = Number(error.status);
  if (!Number.isFinite(status) || status === 0) return true; // network / DNS / TLS
  return status >= 500 || status === 429 || status === 401 || status === 403 || status === 408;
}

async function postToEngine(engine, path, body, env, timeoutMs) {
  const headers = { 'Content-Type': 'application/json' };
  if (engine.auth === 'gcp') {
    const token = await getIdToken(env, engine.url);
    if (!token) {
      const error = new Error(`no GCP_SERVICE_ACCOUNT_KEY for ${engine.id}`);
      error.status = 401;
      throw error;
    }
    headers.Authorization = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(`${engine.url}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (cause) {
      const error = new Error(`${engine.id}${path}: ${cause && cause.name === 'AbortError' ? 'timeout' : (cause && cause.message) || 'network error'}`);
      error.status = 0;
      error.timeout = Boolean(cause && cause.name === 'AbortError');
      throw error;
    }
    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      let detail = raw.slice(0, 300);
      try {
        const parsed = JSON.parse(raw);
        detail = parsed.error || parsed.message || parsed.error_code || detail;
      } catch {
        // keep the bounded text
      }
      const error = new Error(`HTTP ${response.status} from ${engine.id}${detail ? `: ${detail}` : ''}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST `body` to `path` on the first healthy engine.  Resolves { result, engine } where
 * engine is the id that answered.  `prefer` is an engine id to try first.
 */
export async function valhallaPost(path, body, env = {}, { timeoutMs = 20000, primaryTimeoutMs = 15000, prefer = null } = {}) {
  let engines = valhallaEngines(env);
  if (prefer) {
    const pinned = engines.find((engine) => engine.id === prefer);
    if (pinned) engines = [pinned, ...engines.filter((engine) => engine !== pinned)];
  }
  const now = Date.now();
  const available = engines.filter((engine) => !isOpen(engine, now));
  // Every engine tripped: still try them all rather than fail without asking anyone.
  const order = available.length ? available : engines;
  const errors = [];
  for (const engine of order) {
    try {
      const result = await postToEngine(engine, path, body, env, engine.primary ? primaryTimeoutMs : timeoutMs);
      breaker.delete(engine.id);
      return { result, engine: engine.id };
    } catch (error) {
      if (!shouldFallback(error)) throw error;
      breaker.set(engine.id, Date.now() + CIRCUIT_OPEN_MS);
      errors.push(error.message);
      console.warn(`valhalla fallback: ${error.message}`);
    }
  }
  const error = new Error(`All Valhalla engines failed: ${errors.join(' | ')}`);
  error.status = 502;
  throw error;
}

// A short Taipei route (Main Station -> Taipei 101) on one specific engine, for the hourly probe.
const PROBE_ROUTE = {
  locations: [{ lat: 25.0478, lon: 121.5170, type: 'break' }, { lat: 25.0340, lon: 121.5645, type: 'break' }],
  costing: 'motor_scooter',
  units: 'kilometers'
};

export async function probeEngine(engine, env = {}, timeoutMs = 20000) {
  const started = Date.now();
  try {
    const result = await postToEngine(engine, '/route', PROBE_ROUTE, env, timeoutMs);
    const legs = result && result.trip && Array.isArray(result.trip.legs) ? result.trip.legs.length : 0;
    if (!legs) throw new Error('no route legs');
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: String(error.message || error).slice(0, 160) };
  }
}

/** Test / probe helper: close every breaker. */
export function resetValhallaBreakers() {
  breaker.clear();
}
