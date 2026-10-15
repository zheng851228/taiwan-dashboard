import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduled } from '../worker/src/index.js';
import { warmPrimaryEngine } from '../worker/src/valhalla.js';

vi.mock('../worker/src/valhalla.js', async (importOriginal) => ({
  ...await importOriginal(),
  warmPrimaryEngine: vi.fn()
}));

afterEach(() => vi.restoreAllMocks());

describe('scheduled primary warmup', () => {
  it.each([
    ['no KV', {}, { ok: false, reason: 'no-kv-binding' }],
    ['snapshot mode disabled', { ROUTE_CACHE: { put: vi.fn() } }, { skipped: true, reason: 'not-snapshot-mode' }]
  ])('registers background work before %s early return without waiting for it', async (_, env, expected) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let finish;
    const pending = new Promise((resolve) => { finish = resolve; });
    vi.mocked(warmPrimaryEngine).mockReturnValueOnce(pending);
    const ctx = { waitUntil: vi.fn() };
    try {
      expect(await scheduled({}, env, ctx)).toMatchObject(expected);
      expect(warmPrimaryEngine).toHaveBeenLastCalledWith(env);
      expect(ctx.waitUntil).toHaveBeenCalledExactlyOnceWith(pending);
      if (env.ROUTE_CACHE) expect(env.ROUTE_CACHE.put).not.toHaveBeenCalled();
    } finally {
      finish();
      await pending;
    }
  });
});
