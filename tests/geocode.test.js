import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearJsonResponseCache, geocodePlace } from '../worker/src/providers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  clearJsonResponseCache();
});

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

const PHOTON_TAIPEI = {
  type: 'FeatureCollection',
  features: [
    {
      geometry: { type: 'Point', coordinates: [121.5170, 25.0478] },
      properties: { name: '臺北車站', city: '臺北市', district: '中正區', country: '臺灣', countrycode: 'TW', osm_value: 'station' }
    },
    {
      geometry: { type: 'Point', coordinates: [119.3, 26.1] },
      properties: { name: '台北路', city: '福州市', country: '中国', countrycode: 'CN' }
    }
  ]
};

describe('geocoding resilience', () => {
  it('falls back to Photon when Nominatim fails, keeping only Taiwan results', async () => {
    const hosts = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const host = new URL(url).hostname;
      hosts.push(host);
      if (host === 'nominatim.openstreetmap.org') return json({ error: 'busy' }, 503);
      return json(PHOTON_TAIPEI);
    }));
    const places = await geocodePlace('台北車站');
    expect(hosts).toEqual(['nominatim.openstreetmap.org', 'photon.komoot.io']);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ name: '臺北車站', lat: 25.0478, lng: 121.517 });
    expect(places[0].displayName).toContain('臺北市');
  });

  it('skips Nominatim entirely while the global limiter says no', async () => {
    const hosts = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      hosts.push(new URL(url).hostname);
      return json(PHOTON_TAIPEI);
    }));
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const places = await geocodePlace('台北車站', { NOMINATIM_RATE_LIMITER: limiter });
    expect(limiter.limit).toHaveBeenCalledWith({ key: 'nominatim' });
    expect(hosts).toEqual(['photon.komoot.io']);
    expect(places[0].name).toBe('臺北車站');
  });

  it('asks Photon when Nominatim finds nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (
      new URL(url).hostname === 'nominatim.openstreetmap.org' ? json([]) : json(PHOTON_TAIPEI)
    )));
    const places = await geocodePlace('台北車站');
    expect(places.map((place) => place.name)).toEqual(['臺北車站']);
  });

  it('identifies itself to Nominatim and Photon', async () => {
    const agents = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      agents.push(init.headers && init.headers['User-Agent']);
      return new URL(url).hostname === 'nominatim.openstreetmap.org' ? json([]) : json({ features: [] });
    }));
    await geocodePlace('不存在的地方');
    expect(agents).toHaveLength(2);
    agents.forEach((agent) => expect(agent).toMatch(/^taiwan-dashboard-worker\/2\.0 \(\+https:\/\/zheng851228\.github\.io/));
  });

  it('fails only when both geocoders fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 503)));
    await expect(geocodePlace('台北車站')).rejects.toThrow('HTTP 503');
  });
});
