import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

async function loadCore() {
  const sandbox = {
    URL, URLSearchParams, console,
    location: { search: '', hostname: 'localhost', href: 'http://localhost/' },
    document: { getElementById() { return null; }, addEventListener() {} },
    AppServices: { expandShortUrl: vi.fn(async (url) => ({ data: { finalUrl: url } })) }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(await readFile(new URL('../js/core.js', import.meta.url), 'utf8'), sandbox);
  return sandbox;
}

describe('map URL host boundaries', () => {
  it.each(['maps.apple.com', 'apple.com'])('accepts Apple host %s', async (host) => {
    const core = await loadCore();
    expect(core.parseAppleMapsRoute(`https://${host}/?saddr=Taipei&daddr=Tainan`))
      .toEqual({ start: 'Taipei', end: 'Tainan' });
  });
  it.each(['evil-apple.com', 'apple.com.evil.test'])('rejects Apple lookalike %s', async (host) => {
    const core = await loadCore();
    expect(core.parseAppleMapsRoute(`https://${host}/?saddr=Taipei&daddr=Tainan`)).toBeNull();
  });
  it.each(['google.com', 'www.google.com', 'maps.google.com', 'goo.gl', 'maps.app.goo.gl'])('accepts Google host %s', async (host) => {
    const core = await loadCore();
    const fill = vi.fn();
    expect(core.autoFillRoute(`https://${host}/maps/dir/Taipei/Tainan`, fill, vi.fn())).toBe(true);
    await new Promise(setImmediate);
    expect(fill).toHaveBeenCalledWith('Taipei', 'Tainan', []);
  });
  it.each(['www.google.com.tw', 'www.google.co.jp'])('expands country-domain Google URL %s without rejecting it', async (host) => {
    const core = await loadCore();
    const fill = vi.fn();
    const error = vi.fn();
    const url = `https://${host}/maps/dir/台北車站/台北101`;
    expect(core.autoFillRoute(url, fill, error)).toBe(true);
    expect(core.AppServices.expandShortUrl).toHaveBeenCalledWith(url);
    await new Promise(setImmediate);
    expect(error).not.toHaveBeenCalled();
    expect(fill).toHaveBeenCalledWith('台北車站', '台北101', []);
  });
  it('fills a route from explanatory text through the synchronous fast path', async () => {
    const core = await loadCore();
    const fill = vi.fn();
    const error = vi.fn();
    expect(core.autoFillRoute('分享路線：https://www.google.com/maps/dir/台北車站/台北101', fill, error)).toBe(true);
    expect(fill).toHaveBeenCalledWith('台北車站', '台北101', []);
    expect(core.AppServices.expandShortUrl).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
