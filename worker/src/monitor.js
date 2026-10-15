// Monitoring for the cron run: hourly probes of the routing / geocoding services, alert state
// with Telegram notifications, and the rule for when the health record is worth a KV write.
//
// Alerting: a component must fail ALERT_AFTER_FAILURES fresh observations in a row before a
// "down" message is sent, and a "recovered" message follows when it is next seen healthy.
// The alert state lives inside the existing health record (no extra KV keys / writes).
// Telegram is optional: without TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID nothing is sent and a
// pending "down" alert simply stays pending.

import { probeEngine, valhallaEngines } from './valhalla.js';

export const ALERT_AFTER_FAILURES = 2;
export const PROBE_INTERVAL_MS = 60 * 60 * 1000;
export const HEALTH_WRITE_INTERVAL_MS = 30 * 60 * 1000;
const PROBE_SLACK_MS = 60 * 1000; // cron ticks drift a little; a 59-minute-old probe is due
const GEOCODER_USER_AGENT = 'taiwan-dashboard-worker/2.0 (+https://zheng851228.github.io/taiwan-dashboard/)';

const PROVIDER_LABELS = {
  TDX: '路況資料 TDX',
  THB: '公路局路況',
  CWA: '氣象署天氣',
  CCTV: '攝影機清單'
};

export function componentLabel(component) {
  if (component === 'snapshot') return '路況快照排程';
  if (component.startsWith('valhalla:')) return `路線引擎 ${component.slice('valhalla:'.length)}`;
  if (component === 'geocode:nominatim') return '地址搜尋 Nominatim';
  if (component === 'geocode:photon') return '地址搜尋備援 Photon';
  if (component.startsWith('provider:')) {
    const name = component.slice('provider:'.length);
    return PROVIDER_LABELS[name] || name;
  }
  return component;
}

export function probeDue(previous, now) {
  const at = previous && previous.probes && Date.parse(previous.probes.at);
  return !Number.isFinite(at) || now.getTime() - at >= PROBE_INTERVAL_MS - PROBE_SLACK_MS;
}

async function probeGeocoder(url, timeoutMs, isOk) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': GEOCODER_USER_AGENT }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!isOk(payload)) throw new Error('no results');
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: String(error.message || error).slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

/** One probe per Valhalla engine and per geocoder, run in parallel. */
export async function runProbes(env, now, timeoutMs = 20000) {
  const results = {};
  const tasks = valhallaEngines(env).map(async (engine) => {
    results[`valhalla:${engine.id}`] = await probeEngine(engine, env, timeoutMs);
  });
  tasks.push((async () => {
    const url = 'https://nominatim.openstreetmap.org/search?q=%E8%87%BA%E5%8C%97%E8%BB%8A%E7%AB%99&format=jsonv2&limit=1&countrycodes=tw';
    results['geocode:nominatim'] = await probeGeocoder(url, timeoutMs, (payload) => Array.isArray(payload) && payload.length > 0);
  })());
  tasks.push((async () => {
    const url = 'https://photon.komoot.io/api/?q=%E8%87%BA%E5%8C%97%E8%BB%8A%E7%AB%99&limit=1&bbox=117,20,124,27';
    results['geocode:photon'] = await probeGeocoder(url, timeoutMs, (payload) => payload && Array.isArray(payload.features) && payload.features.length > 0);
  })());
  await Promise.all(tasks);
  return { at: now.toISOString(), results };
}

/**
 * Observations for this run: { component: { ok, fresh } }.  `fresh` is false for components
 * that were not observed this run (probe results carried over from an earlier hour); their
 * alert state is left exactly as it was.
 */
export function collectObservations({ ok, providers = {}, probes = null, probesFresh = false }) {
  const observations = { snapshot: { ok: ok !== false, fresh: true } };
  Object.entries(providers || {}).forEach(([name, status]) => {
    observations[`provider:${name}`] = { ok: !(status && status.status === 'failed'), fresh: true };
  });
  Object.entries((probes && probes.results) || {}).forEach(([component, result]) => {
    observations[component] = { ok: Boolean(result && result.ok), fresh: probesFresh };
  });
  return observations;
}

/**
 * Next alert state + the notifications it calls for.
 * alerts: { component: { failures, since, notified } } - only failing components are kept.
 */
export function computeAlerts(previousAlerts = {}, observations = {}, nowIso) {
  const alerts = {};
  const events = [];
  const components = new Set([...Object.keys(previousAlerts || {}), ...Object.keys(observations)]);
  components.forEach((component) => {
    const prev = (previousAlerts || {})[component] || null;
    const seen = observations[component];
    if (!seen || !seen.fresh) {
      if (prev) alerts[component] = prev;
      return;
    }
    if (seen.ok) {
      if (prev && prev.notified) events.push({ type: 'up', component, since: prev.since });
      return;
    }
    const failures = Math.min(ALERT_AFTER_FAILURES, (prev ? prev.failures : 0) + 1);
    const next = { failures, since: (prev && prev.since) || nowIso, notified: Boolean(prev && prev.notified) };
    alerts[component] = next;
    if (failures >= ALERT_AFTER_FAILURES && !next.notified) events.push({ type: 'down', component, since: next.since });
  });
  return { alerts, events };
}

function taipeiTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(5, 16).replace('T', ' ');
}

export function alertMessage(events, probes) {
  const lines = events.map((event) => {
    const label = componentLabel(event.component);
    const detail = probes && probes.results && probes.results[event.component] && probes.results[event.component].error;
    return event.type === 'down'
      ? `❌ ${label} 異常（自 ${taipeiTime(event.since)} 起）${detail ? `：${detail}` : ''}`
      : `✅ ${label} 已恢復`;
  });
  return `環島路況指揮中心\n${lines.join('\n')}`;
}

export async function sendTelegram(env, text, timeoutMs = 8000) {
  if (!env || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Sends the events; marks "down" alerts as notified only when Telegram accepted them. */
export async function notify(env, alerts, events, probes) {
  if (!events.length) return alerts;
  const sent = await sendTelegram(env, alertMessage(events, probes));
  if (!sent) return alerts;
  const next = { ...alerts };
  events.forEach((event) => {
    if (event.type === 'down' && next[event.component]) next[event.component] = { ...next[event.component], notified: true };
  });
  return next;
}

function signature(record) {
  if (!record) return '';
  const providers = {};
  Object.entries(record.providers || {}).forEach(([name, status]) => { providers[name] = status && status.status; });
  const probes = {};
  Object.entries((record.probes && record.probes.results) || {}).forEach(([name, result]) => { probes[name] = Boolean(result && result.ok); });
  return JSON.stringify({
    ok: record.ok,
    reason: record.reason,
    providers,
    failures: (record.failures || []).map((failure) => failure.scope).sort(),
    alerts: record.alerts || {},
    probes,
    probesAt: record.probes && record.probes.at
  });
}

/**
 * The health record costs one KV write.  Write it when something changed (status, alerts,
 * a new probe) or every HEALTH_WRITE_INTERVAL_MS as a heartbeat - not on every 5-minute tick.
 */
export function shouldWriteHealth(previous, next, now) {
  if (!previous) return true;
  if (signature(previous) !== signature(next)) return true;
  const last = Date.parse(previous.updatedAt);
  return !Number.isFinite(last) || now.getTime() - last >= HEALTH_WRITE_INTERVAL_MS;
}
