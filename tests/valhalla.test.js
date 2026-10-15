import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetValhallaBreakers, valhallaEngines, valhallaPost, warmPrimaryEngine } from '../worker/src/valhalla.js';
import { clearIdTokenCache, signServiceAccountJwt } from '../worker/src/gcp-auth.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetValhallaBreakers();
  clearIdTokenCache();
});

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

function toPem(buffer) {
  const base64 = Buffer.from(buffer).toString('base64');
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
}

async function serviceAccount() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    publicKey: pair.publicKey,
    key: { client_email: 'invoker@demo.iam.gserviceaccount.com', private_key: toPem(pkcs8), private_key_id: 'kid-1' }
  };
}

describe('Valhalla engine chain', () => {
  it('orders the private Cloud Run engine first, then the public server, without duplicates', () => {
    const engines = valhallaEngines({
      VALHALLA_PRIMARY_URL: 'https://valhalla-tw-abc.a.run.app/',
      VALHALLA_BASE_URL: 'https://valhalla1.openstreetmap.de',
      VALHALLA_FALLBACK_URLS: 'https://valhalla1.openstreetmap.de, https://extra.example'
    });
    expect(engines.map((engine) => [engine.id, engine.auth])).toEqual([
      ['valhalla-tw-abc.a.run.app', 'gcp'],
      ['valhalla1.openstreetmap.de', null],
      ['extra.example', null]
    ]);
    expect(valhallaEngines({}).map((engine) => engine.id)).toEqual(['valhalla1.openstreetmap.de']);
  });

  it('falls back on 5xx and skips the failed engine while its breaker is open', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(new URL(url).hostname);
      if (String(url).startsWith('https://primary.test')) return json({ error: 'overloaded' }, 503);
      return json({ trip: { legs: [] } });
    }));
    const env = { VALHALLA_BASE_URL: 'https://primary.test', VALHALLA_FALLBACK_URLS: 'https://backup.test' };

    const first = await valhallaPost('/route', {}, env);
    expect(first.engine).toBe('backup.test');
    expect(calls).toEqual(['primary.test', 'backup.test']);

    calls.length = 0;
    const second = await valhallaPost('/route', {}, env);
    expect(second.engine).toBe('backup.test');
    expect(calls).toEqual(['backup.test']); // primary skipped for a minute
  });

  it('falls back on network errors and timeouts', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).startsWith('https://down.test')) throw new TypeError('fetch failed');
      return json({ ok: true });
    }));
    const result = await valhallaPost('/route', {}, { VALHALLA_BASE_URL: 'https://down.test', VALHALLA_FALLBACK_URLS: 'https://up.test' });
    expect(result).toEqual({ result: { ok: true }, engine: 'up.test' });
  });

  it('does not fall back on a 400 (a real "no route" answer)', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'No path could be found for input' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    await expect(valhallaPost('/route', {}, { VALHALLA_BASE_URL: 'https://a.test', VALHALLA_FALLBACK_URLS: 'https://b.test' }))
      .rejects.toThrow('HTTP 400 from a.test: No path could be found for input');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports every engine when all of them fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 502)));
    await expect(valhallaPost('/route', {}, { VALHALLA_BASE_URL: 'https://a.test', VALHALLA_FALLBACK_URLS: 'https://b.test' }))
      .rejects.toThrow('All Valhalla engines failed');
  });

  it('tries the preferred engine first (trace on the engine that made the route)', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(new URL(url).hostname);
      return json({ edges: [] });
    }));
    await valhallaPost('/trace_attributes', {}, { VALHALLA_BASE_URL: 'https://a.test', VALHALLA_FALLBACK_URLS: 'https://b.test' }, { prefer: 'b.test' });
    expect(calls).toEqual(['b.test']);
  });

  it('calls the private engine with a Google ID token and falls back when no key is configured', async () => {
    const { key, publicKey } = await serviceAccount();
    const seen = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const target = String(url);
      if (target === 'https://oauth2.googleapis.com/token') {
        const assertion = decodeURIComponent(String(init.body).split('assertion=')[1]);
        seen.push(['token', assertion]);
        return json({ id_token: 'id-token-123' });
      }
      seen.push(['engine', new URL(target).hostname, init.headers && init.headers.Authorization]);
      return json({ trip: { legs: [{}] } });
    }));
    const env = {
      VALHALLA_PRIMARY_URL: 'https://valhalla-tw.a.run.app',
      VALHALLA_BASE_URL: 'https://public.test',
      GCP_SERVICE_ACCOUNT_KEY: JSON.stringify(key)
    };
    const result = await valhallaPost('/route', {}, env);
    expect(result.engine).toBe('valhalla-tw.a.run.app');
    expect(seen[1]).toEqual(['engine', 'valhalla-tw.a.run.app', 'Bearer id-token-123']);

    // the JWT is RS256-signed by the service account for the Cloud Run audience
    const [header, claims, signature] = seen[0][1].split('.');
    const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'kid-1' });
    expect(decode(claims)).toMatchObject({
      iss: key.client_email,
      sub: key.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      target_audience: 'https://valhalla-tw.a.run.app'
    });
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${claims}`)
    );
    expect(valid).toBe(true);

    // the token is cached: a second call does not exchange again
    await valhallaPost('/route', {}, env);
    expect(seen.filter((entry) => entry[0] === 'token')).toHaveLength(1);

    // without a key the private engine is skipped (401) and the public one answers
    resetValhallaBreakers();
    clearIdTokenCache();
    const fallback = await valhallaPost('/route', {}, { VALHALLA_PRIMARY_URL: 'https://valhalla-tw.a.run.app', VALHALLA_BASE_URL: 'https://public.test' });
    expect(fallback.engine).toBe('public.test');
  });

  it('calls a key-protected engine (VM behind a Cloudflare Tunnel) with the shared secret', async () => {
    const seen = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      seen.push([new URL(url).hostname, init.headers['X-Valhalla-Key'], init.headers.Authorization]);
      return json({ trip: { legs: [{}] } });
    }));
    const env = { VALHALLA_PRIMARY_URL: 'https://valhalla.caotaapps.com', VALHALLA_PRIMARY_KEY: 's3cret', VALHALLA_BASE_URL: 'https://public.test' };
    expect(valhallaEngines(env)[0]).toMatchObject({ id: 'valhalla.caotaapps.com', auth: 'key', primary: true });
    const result = await valhallaPost('/route', {}, env);
    expect(result.engine).toBe('valhalla.caotaapps.com');
    expect(seen).toEqual([['valhalla.caotaapps.com', 's3cret', undefined]]);
  });

  it('a wrong key (403) falls back to the public engine', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (
      new URL(url).hostname === 'valhalla.caotaapps.com' ? json({ error: 'forbidden' }, 403) : json({ trip: { legs: [{}] } })
    )));
    const result = await valhallaPost('/route', {}, { VALHALLA_PRIMARY_URL: 'https://valhalla.caotaapps.com', VALHALLA_PRIMARY_KEY: 'wrong', VALHALLA_BASE_URL: 'https://public.test' });
    expect(result.engine).toBe('public.test');
  });

  it('signs a JWT whose expiry is one hour after issue', async () => {
    const { key } = await serviceAccount();
    const jwt = await signServiceAccountJwt(key, 'https://x.a.run.app', 1000);
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    expect([claims.iat, claims.exp]).toEqual([1000, 4600]);
  });
});


describe('Cloud Run primary warmup', () => {
  const primary = 'https://valhalla-tw.a.run.app';

  async function cloudRunEnv() {
    const { key } = await serviceAccount();
    return { VALHALLA_PRIMARY_URL: `${primary}/`, GCP_SERVICE_ACCOUNT_KEY: JSON.stringify(key) };
  }

  function stubWarmup(statusFetch) {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === 'https://oauth2.googleapis.com/token') return json({ id_token: 'warm-token' });
      return statusFetch(url, init);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('sends exactly one authenticated GET /status and reuses the ID token cache', async () => {
    const env = await cloudRunEnv();
    const statusFetch = vi.fn(async () => json({ version: 'test' }));
    const fetchMock = stubWarmup(statusFetch);
    await warmPrimaryEngine(env);
    expect(statusFetch).toHaveBeenCalledExactlyOnceWith(`${primary}/status`, expect.objectContaining({
      method: 'GET', headers: { Authorization: 'Bearer warm-token' }, signal: expect.any(AbortSignal)
    }));
    await warmPrimaryEngine(env);
    expect(fetchMock.mock.calls.filter(([url]) => url === 'https://oauth2.googleapis.com/token')).toHaveLength(1);
  });

  it.each([
    ['VM mode even with a GCP key', { VALHALLA_PRIMARY_URL: primary, VALHALLA_PRIMARY_KEY: 'vm-key', GCP_SERVICE_ACCOUNT_KEY: '{}' }],
    ['no primary', { GCP_SERVICE_ACCOUNT_KEY: '{}' }],
    ['blank primary', { VALHALLA_PRIMARY_URL: '  ', GCP_SERVICE_ACCOUNT_KEY: '{}' }],
    ['no GCP key', { VALHALLA_PRIMARY_URL: primary }],
    ['invalid GCP key', { VALHALLA_PRIMARY_URL: primary, GCP_SERVICE_ACCOUNT_KEY: '{}' }]
  ])('makes no requests with %s', async (_, env) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(warmPrimaryEngine(env)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['network', 'http', 'auth'])('warns without throwing on %s failure', async (failure) => {
    const env = await cloudRunEnv();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = stubWarmup(async () => {
      if (failure === 'network') throw new TypeError('fetch failed');
      return json({}, 503);
    });
    if (failure === 'auth') fetchMock.mockResolvedValue(json({}, 403));
    await expect(warmPrimaryEngine(env)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('aborts /status after 10 seconds without rejecting', async () => {
    const env = await cloudRunEnv();
    // Cache a real test ID token before starting fake timers / the hanging request.
    stubWarmup(async () => json({}));
    await warmPrimaryEngine(env);
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let signal;
    stubWarmup(async (_, init) => new Promise((resolve, reject) => {
      signal = init.signal;
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = warmPrimaryEngine(env);
    await vi.advanceTimersByTimeAsync(9999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeUndefined();
    expect(signal.aborted).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not open or clear route breakers, on either failed or successful warmup', async () => {
    const env = await cloudRunEnv();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const statusFetch = vi.fn(async () => json({}, 503));
    const fetchMock = stubWarmup(statusFetch);
    await warmPrimaryEngine(env);
    statusFetch.mockResolvedValue(json({ trip: { legs: [{}] } }));
    expect((await valhallaPost('/route', {}, env)).engine).toBe('valhalla-tw.a.run.app');
    // A user route failure opens the primary breaker and falls back to public.
    statusFetch.mockImplementation(async (url) => json({}, url.startsWith(primary) ? 503 : 200));
    await valhallaPost('/route', {}, env);
    for (const status of [503, 200]) {
      statusFetch.mockImplementation(async (url) => json({}, url === `${primary}/status` ? status : 200));
      await warmPrimaryEngine(env);
      fetchMock.mockClear();
      expect((await valhallaPost('/route', {}, env)).engine).toBe('valhalla1.openstreetmap.de');
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['https://valhalla1.openstreetmap.de/route']);
    }
  });
});
