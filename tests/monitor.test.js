import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduled } from '../worker/src/index.js';
import { clearJsonResponseCache } from '../worker/src/providers.js';
import { resetValhallaBreakers } from '../worker/src/valhalla.js';
import { SNAPSHOT_HEALTH_KEY } from '../worker/src/snapshot-honesty.js';
import {
  alertMessage,
  collectObservations,
  computeAlerts,
  probeDue,
  shouldWriteHealth
} from '../worker/src/monitor.js';

afterEach(() => {
  vi.unstubAllGlobals();
  clearJsonResponseCache();
  resetValhallaBreakers();
});

const T0 = '2026-10-03T00:02:00.000Z';
const at = (minutes) => new Date(Date.parse(T0) + minutes * 60 * 1000);

describe('alert state', () => {
  it('needs two fresh failures before alerting, alerts once, and announces recovery', () => {
    const fail = { 'provider:TDX': { ok: false, fresh: true } };
    const first = computeAlerts({}, fail, at(0).toISOString());
    expect(first.events).toEqual([]);
    expect(first.alerts['provider:TDX']).toEqual({ failures: 1, since: at(0).toISOString(), notified: false });

    const second = computeAlerts(first.alerts, fail, at(5).toISOString());
    expect(second.events).toEqual([{ type: 'down', component: 'provider:TDX', since: at(0).toISOString() }]);

    const sent = { 'provider:TDX': { ...second.alerts['provider:TDX'], notified: true } };
    const third = computeAlerts(sent, fail, at(10).toISOString());
    expect(third.events).toEqual([]); // already told
    expect(third.alerts['provider:TDX'].failures).toBe(2); // capped, so the record stays stable

    const recovered = computeAlerts(third.alerts, { 'provider:TDX': { ok: true, fresh: true } }, at(15).toISOString());
    expect(recovered.events).toEqual([{ type: 'up', component: 'provider:TDX', since: at(0).toISOString() }]);
    expect(recovered.alerts).toEqual({});
  });

  it('a component not observed this run (probe from an earlier hour) keeps its state', () => {
    const prev = { 'valhalla:x.test': { failures: 1, since: 'a', notified: false } };
    const next = computeAlerts(prev, { 'valhalla:x.test': { ok: false, fresh: false } }, 'b');
    expect(next).toEqual({ alerts: prev, events: [] });
  });

  it('a recovery that was never announced as down is silent', () => {
    const prev = { 'provider:CWA': { failures: 1, since: 'a', notified: false } };
    expect(computeAlerts(prev, { 'provider:CWA': { ok: true, fresh: true } }, 'b').events).toEqual([]);
  });

  it('observations: providers and snapshot every run, probes only when fresh', () => {
    const observations = collectObservations({
      ok: true,
      providers: { TDX: { status: 'failed' }, CCTV: { status: 'ok' } },
      probes: { at: 'x', results: { 'valhalla:a.test': { ok: false } } },
      probesFresh: false
    });
    expect(observations).toEqual({
      snapshot: { ok: true, fresh: true },
      'provider:TDX': { ok: false, fresh: true },
      'provider:CCTV': { ok: true, fresh: true },
      'valhalla:a.test': { ok: false, fresh: false }
    });
  });

  it('writes a readable Traditional Chinese message', () => {
    const text = alertMessage(
      [{ type: 'down', component: 'valhalla:valhalla1.openstreetmap.de', since: '2026-10-03T00:02:00.000Z' }, { type: 'up', component: 'geocode:nominatim' }],
      { results: { 'valhalla:valhalla1.openstreetmap.de': { ok: false, error: 'HTTP 503' } } }
    );
    expect(text).toBe('環島路況指揮中心\n❌ 路線引擎 valhalla1.openstreetmap.de 異常（自 10-03 08:02 起）：HTTP 503\n✅ 地址搜尋 Nominatim 已恢復');
  });
});

describe('health record writes', () => {
  const base = { ok: true, reason: null, providers: { TDX: { status: 'ok' } }, failures: [], alerts: {}, probes: { at: 'p1', results: { a: { ok: true } } } };

  it('skips an unchanged record inside 30 minutes, writes it as a heartbeat after', () => {
    const previous = { ...base, updatedAt: at(0).toISOString() };
    expect(shouldWriteHealth(previous, { ...base, updatedAt: at(5).toISOString() }, at(5))).toBe(false);
    expect(shouldWriteHealth(previous, { ...base, updatedAt: at(29).toISOString() }, at(29))).toBe(false);
    expect(shouldWriteHealth(previous, { ...base, updatedAt: at(30).toISOString() }, at(30))).toBe(true);
  });

  it('writes when status, alerts or probes change', () => {
    const previous = { ...base, updatedAt: at(0).toISOString() };
    expect(shouldWriteHealth(previous, { ...base, ok: false }, at(5))).toBe(true);
    expect(shouldWriteHealth(previous, { ...base, providers: { TDX: { status: 'failed' } } }, at(5))).toBe(true);
    expect(shouldWriteHealth(previous, { ...base, alerts: { x: { failures: 1 } } }, at(5))).toBe(true);
    expect(shouldWriteHealth(previous, { ...base, probes: { at: 'p2', results: { a: { ok: true } } } }, at(5))).toBe(true);
    expect(shouldWriteHealth(null, base, at(5))).toBe(true);
  });

  it('probes are due once an hour', () => {
    expect(probeDue(null, at(0))).toBe(true);
    expect(probeDue({ probes: { at: at(0).toISOString() } }, at(30))).toBe(false);
    expect(probeDue({ probes: { at: at(0).toISOString() } }, at(59))).toBe(true);
  });
});

function createKv() {
  const store = new Map();
  return {
    store,
    get: vi.fn(async (key) => (store.has(key) ? store.get(key).value : null)),
    getWithMetadata: vi.fn(async (key) => {
      const entry = store.get(key);
      return entry ? { value: entry.value, metadata: entry.metadata } : null;
    }),
    put: vi.fn(async (key, value, options) => {
      store.set(key, { value, metadata: options && options.metadata });
    })
  };
}

// Cameras answer, the other data providers are down; Valhalla / geocoders configurable.
function stubUpstreams({ valhallaUp = true, telegram = [] } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const target = String(url);
    if (target.includes('twipcam')) {
      return new Response(JSON.stringify([{ id: 'cam-1', name: '測試', lat: 25.05, lng: 121.52, roadRef: '台1線', cam_url: 'https://example.com/1.jpg', status: 'online' }]), { status: 200 });
    }
    if (target.startsWith('https://api.telegram.org/')) {
      telegram.push(JSON.parse(init.body).text);
      return new Response('{"ok":true}', { status: 200 });
    }
    if (target.includes('/route')) {
      return valhallaUp
        ? new Response(JSON.stringify({ trip: { legs: [{ shape: '' }] } }), { status: 200 })
        : new Response('{"error":"down"}', { status: 503 });
    }
    if (target.includes('nominatim')) return new Response('[{"lat":"25.04","lon":"121.51"}]', { status: 200 });
    if (target.includes('photon')) return new Response('{"features":[{}]}', { status: 200 });
    throw new Error('upstream down');
  }));
}

const env = (kv, extra = {}) => ({
  USE_FIXTURES: 'false',
  PROVIDER_SNAPSHOT_MODE: 'kv',
  ROUTE_CACHE: kv,
  VALHALLA_BASE_URL: 'https://valhalla.test',
  ...extra
});
const healthWrites = (kv) => kv.put.mock.calls.filter((call) => call[0] === SNAPSHOT_HEALTH_KEY).length;
const health = (kv) => JSON.parse(kv.store.get(SNAPSHOT_HEALTH_KEY).value);
const tick = (minutes, e) => scheduled({ scheduledTime: at(minutes).getTime() }, e, {});

describe('scheduled monitoring', () => {
  it('stops rewriting the health record once the state is stable; heartbeat every 30 minutes', async () => {
    stubUpstreams();
    const kv = createKv();
    const e = env(kv);
    await tick(0, e);   // first record + probes
    await tick(5, e);   // TDX/CWA/THB fail a 2nd time -> alert state changes -> write
    const settled = healthWrites(kv);
    await tick(10, e);
    await tick(15, e);
    expect(healthWrites(kv)).toBe(settled); // nothing changed: no KV writes
    await tick(40, e);
    expect(healthWrites(kv)).toBe(settled + 1); // 30-minute heartbeat
    expect(health(kv).probes.results['valhalla:valhalla.test']).toMatchObject({ ok: true });
    expect(health(kv).probes.results['geocode:nominatim']).toMatchObject({ ok: true });
  });

  it('sends one Telegram alert after two failures and one when it recovers', async () => {
    const telegram = [];
    const kv = createKv();
    const e = env(kv, { TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '42' });

    stubUpstreams({ valhallaUp: false, telegram });
    await tick(0, e);   // probe 1: Valhalla down (1st failure); providers down (1st)
    await tick(5, e);   // providers 2nd failure -> provider alert
    await tick(61, e);  // probe 2: Valhalla down again -> Valhalla alert
    await tick(66, e);  // nothing new
    const downs = telegram.join('\n');
    expect(downs).toContain('❌ 路況資料 TDX 異常');
    expect(downs).toContain('❌ 路線引擎 valhalla.test 異常');
    expect((downs.match(/路線引擎 valhalla\.test 異常/g) || [])).toHaveLength(1);
    expect(health(kv).alerts['valhalla:valhalla.test']).toMatchObject({ failures: 2, notified: true });

    telegram.length = 0;
    stubUpstreams({ valhallaUp: true, telegram });
    await tick(122, e); // probe 3: Valhalla back
    expect(telegram.join('\n')).toContain('✅ 路線引擎 valhalla.test 已恢復');
    expect(health(kv).alerts['valhalla:valhalla.test']).toBeUndefined();
  });

  it('without Telegram configured the alert stays pending and nothing is sent', async () => {
    stubUpstreams({ valhallaUp: false });
    const kv = createKv();
    const e = env(kv);
    await tick(0, e);
    await tick(61, e);
    const calls = globalThis.fetch.mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes('telegram'))).toBe(false);
    expect(health(kv).alerts['valhalla:valhalla.test']).toMatchObject({ failures: 2, notified: false });
  });
});
