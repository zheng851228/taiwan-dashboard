import { test as base, expect } from '@playwright/test';

// Hermetic map-provider stubs.
//
// The MapLibre renderer (js/maplibre-renderer.js) loads raster basemap tiles
// from api.maptiler.com and, outside "simple" mode, a raster-dem TileJSON from
// tiles.mapterhorn.com. MapLibre only fires `load` once every style source has
// resolved, so with the network blocked the renderer never reports ready and
// every marker / camera / label assertion fails for a reason unrelated to the
// behaviour under test. These fulfilments make the map load deterministically
// without touching the network.

const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

// 512x512 terrarium-encoded DEM tile.
const DEM_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIAAQMAAADOtka5AAAAA1BMVEWAAABGTyZaAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAANklEQVR42u3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8G4IAAAFjdVCkAAAAAElFTkSuQmCC',
  'base64'
);

const CORS = { 'access-control-allow-origin': '*' };

const TERRAIN_TILEJSON = {
  tilejson: '3.0.0',
  tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
  minzoom: 0,
  maxzoom: 12,
  encoding: 'terrarium',
  bounds: [117.5, 20.5, 123.4, 26.7]
};

// Terrain: the TileJSON answers at once; DEM tiles answer after `tileDelayMs` (a slow provider)
// or, with `tileGate` (a promise), only once the test resolves it (a provider the test controls).
export async function stubTerrain(page, { tileDelayMs = 0, tileGate = null } = {}) {
  await page.route('https://tiles.mapterhorn.com/**', async route => {
    if (new URL(route.request().url()).pathname === '/tilejson.json') {
      return route.fulfill({
        status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(TERRAIN_TILEJSON)
      });
    }
    if (tileDelayMs) await new Promise(resolve => setTimeout(resolve, tileDelayMs));
    if (tileGate) await tileGate;
    return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: DEM_PNG }).catch(() => {});
  });
}

export async function stubMapProviders(page) {
  await page.route('https://api.maptiler.com/**', route => route.fulfill({
    status: 200, contentType: 'image/png', headers: CORS, body: TILE_PNG
  }));
  await page.route('https://*.basemaps.cartocdn.com/**', route => route.fulfill({
    status: 200, contentType: 'image/png', headers: CORS, body: TILE_PNG
  }));
  await stubTerrain(page);
}

// The renderer gives a provider 8 s (wall clock) to deliver the DEM tiles of a 3D switch, or the
// satellite tiles of a satellite basemap, before it falls back to 2D / the dark basemap and says
// so (js/maplibre-renderer.js). Software WebGL needs one to three seconds per terrain frame, so
// in this environment the tiles are routinely "late" for reasons that have nothing to do with the
// provider, and a test that merely wants the map in 3D would flip back to 2D mid-test.
//
// So tests do not race that clock: the renderer's two budget timers are held instead of
// scheduled, and a test lets one expire explicitly (`rendererBudgets(page).expire(...)`) when it
// is the thing under test. Every other timer is untouched.
async function holdRendererBudgets(page) {
  await page.addInitScript(() => {
    const realSetTimeout = window.setTimeout.bind(window);
    const realClearTimeout = window.clearTimeout.bind(window);
    const held = new Map();
    let sequence = 0;
    const kindOf = (callback, delay) => {
      if (delay !== 8000 || typeof callback !== 'function') return null;
      const source = Function.prototype.toString.call(callback);
      if (/isSourceLoaded\(\s*["']terrainSource["']\s*\)/.test(source)) return 'terrain';
      if (/isSourceLoaded\(\s*["']satellite["']\s*\)/.test(source)) return 'satellite';
      return null;
    };
    window.setTimeout = function(callback, delay, ...args) {
      const kind = kindOf(callback, delay);
      if (!kind) return realSetTimeout(callback, delay, ...args);
      const id = -(++sequence);
      held.set(id, { kind, sequence, callback, args });
      return id;
    };
    window.clearTimeout = function(id) {
      if (held.delete(id)) return undefined;
      return realClearTimeout(id);
    };
    window.__rendererBudgets = {
      pending: () => Array.from(held.values()).map(entry => entry.kind),
      mark: () => sequence,
      expire: ({ kind = null, through = Infinity } = {}) => {
        const due = Array.from(held.entries())
          .filter(([, entry]) => (!kind || entry.kind === kind) && entry.sequence <= through);
        due.forEach(([id, entry]) => {
          held.delete(id);
          entry.callback(...entry.args);
        });
        return due.length;
      }
    };
  });
}

// Test-side handle on the held budgets (see holdRendererBudgets).
export function rendererBudgets(page) {
  return {
    pending: () => page.evaluate(() => window.__rendererBudgets.pending()),
    // Watermark: everything armed so far has a sequence <= the returned number.
    mark: () => page.evaluate(() => window.__rendererBudgets.mark()),
    // Let the held budgets run out now: only `kind` ('terrain' | 'satellite'), only those armed
    // up to `through` (a mark); returns how many fired.
    expire: (options = {}) => page.evaluate((opts) => window.__rendererBudgets.expire(opts), options)
  };
}

// Drop-in replacement for `test` from @playwright/test: every test gets the
// provider stubs before navigation, and may still override a route itself.
export const test = base.extend({
  page: async ({ page }, use) => {
    await holdRendererBudgets(page);
    await stubMapProviders(page);
    await use(page);
  }
});

export { expect };
