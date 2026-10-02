import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function loadModule() {
  const source = await readFile(path.join(root, 'js/route-filmstrip.js'), 'utf8');
  const window = {};
  // DOM 不存在於測試環境：init 必須優雅 no-op
  const document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const sandbox = {
    window,
    document,
    navigator: {},
    setInterval() { return 0; },
    clearInterval() {},
    MutationObserver: undefined
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.RouteFilmstrip;
}

describe('RouteFilmstrip.formatFreshness', () => {
  it('formats elapsed time in Traditional Chinese', async () => {
    const m = await loadModule();
    const now = 1_700_000_000_000;
    expect(m.formatFreshness(now - 10 * 1000, now)).toBe('剛剛');
    expect(m.formatFreshness(now - 59 * 1000, now)).toBe('剛剛');
    expect(m.formatFreshness(now - 60 * 1000, now)).toBe('1 分鐘前');
    expect(m.formatFreshness(now - 5 * 60 * 1000, now)).toBe('5 分鐘前');
    expect(m.formatFreshness(now - 59 * 60 * 1000, now)).toBe('59 分鐘前');
    expect(m.formatFreshness(now - 60 * 60 * 1000, now)).toBe('1 小時前');
    expect(m.formatFreshness(now - 3 * 60 * 60 * 1000, now)).toBe('3 小時前');
  });

  it('treats future or invalid timestamps as 剛剛', async () => {
    const m = await loadModule();
    const now = 1_700_000_000_000;
    expect(m.formatFreshness(now + 60 * 1000, now)).toBe('剛剛');
    expect(m.formatFreshness(NaN, now)).toBe('剛剛');
  });
});

describe('RouteFilmstrip.isStale', () => {
  it('marks images older than 15 minutes as stale', async () => {
    const m = await loadModule();
    const now = 1_700_000_000_000;
    expect(m.isStale(now - 14 * 60 * 1000, now)).toBe(false);
    expect(m.isStale(now - 15 * 60 * 1000, now)).toBe(false); // 邊界：超過才算
    expect(m.isStale(now - 15 * 60 * 1000 - 1, now)).toBe(true);
    expect(m.isStale(now - 60 * 60 * 1000, now)).toBe(true);
  });
});

describe('RouteFilmstrip.withCacheBuster', () => {
  it('appends minute-granularity t param', async () => {
    const m = await loadModule();
    const ts = 1_700_000_000_000; // t = 28333333
    const t = Math.floor(ts / 60000);
    expect(m.withCacheBuster('https://x.test/cam.jpg', ts)).toBe(
      'https://x.test/cam.jpg?t=' + t
    );
    expect(m.withCacheBuster('https://x.test/cam.jpg?foo=1', ts)).toBe(
      'https://x.test/cam.jpg?foo=1&t=' + t
    );
  });

  it('replaces an existing t param instead of stacking', async () => {
    const m = await loadModule();
    const ts = 1_700_000_000_000;
    const t = Math.floor(ts / 60000);
    expect(m.withCacheBuster('https://x.test/cam.jpg?t=123', ts)).toBe(
      'https://x.test/cam.jpg?t=' + t
    );
    expect(m.withCacheBuster('https://x.test/cam.jpg?foo=1&t=123&bar=2', ts)).toBe(
      'https://x.test/cam.jpg?foo=1&bar=2&t=' + t
    );
  });

  it('returns empty input unchanged', async () => {
    const m = await loadModule();
    expect(m.withCacheBuster('', 123)).toBe('');
  });
});

describe('RouteFilmstrip.formatLatLng', () => {
  it('produces a lat,lng string parseable by extractPointFromUrl', async () => {
    const m = await loadModule();
    const s = m.formatLatLng(25.04776, 121.53185);
    expect(s).toBe('25.04776,121.53185');
    expect(s).toMatch(/^-?\d+\.?\d+,\s*-?\d+\.?\d+$/);
  });
});

describe('RouteFilmstrip.geoErrorMessage', () => {
  it('maps geolocation error codes to Traditional Chinese copy', async () => {
    const m = await loadModule();
    expect(m.geoErrorMessage({ code: 1 })).toContain('權限');
    expect(m.geoErrorMessage({ code: 2 })).toContain('GPS');
    expect(m.geoErrorMessage({ code: 3 })).toContain('逾時');
    expect(m.geoErrorMessage({ code: 99 })).toContain('再試一次');
    expect(m.geoErrorMessage(null)).toContain('再試一次');
  });
});
