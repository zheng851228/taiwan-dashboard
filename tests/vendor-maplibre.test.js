import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = [];
const files = ['LICENSE.txt', 'maplibre-gl.css', 'maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs'];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vendor-maplibre-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'));
  copyFileSync('scripts/vendor-maplibre.mjs', join(root, 'scripts/vendor-maplibre.mjs'));
  mkdirSync(join(root, 'node_modules/maplibre-gl/dist'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { 'maplibre-gl': '6.15.0' } }));
  writeFileSync(join(root, 'node_modules/maplibre-gl/package.json'), JSON.stringify({ version: '6.15.0' }));
  for (const file of files) writeFileSync(join(root, 'node_modules/maplibre-gl', file === 'LICENSE.txt' ? file : 'dist/' + file), file.includes('shared') ? '' : file);
  return root;
}
function run(root, ...args) {
  return spawnSync(process.execPath, [join(root, 'scripts/vendor-maplibre.mjs'), ...args], { encoding: 'utf8' });
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

test('copies the license and dist files, including the empty compatibility module', () => {
  const root = fixture();
  expect(run(root).status).toBe(0);
  expect(run(root, '--check').status).toBe(0);
  for (const file of files) expect(readFileSync(join(root, 'assets/vendor/maplibre-gl', file), 'utf8')).toBe(file.includes('shared') ? '' : file);
});

test('check rejects stale vendor content without overwriting it', () => {
  const root = fixture();
  expect(run(root).status).toBe(0);
  const target = join(root, 'assets/vendor/maplibre-gl/maplibre-gl.mjs');
  writeFileSync(target, 'stale');
  const result = run(root, '--check');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('maplibre-gl.mjs');
  expect(readFileSync(target, 'utf8')).toBe('stale');
});

test('rejects an installed version different from the pinned dependency', () => {
  const root = fixture();
  writeFileSync(join(root, 'node_modules/maplibre-gl/package.json'), JSON.stringify({ version: '6.0.0' }));
  expect(run(root).status).not.toBe(0);
  expect(run(root).stderr).toContain('version mismatch');
});

test('check names a missing vendor file and how to restore it', () => {
  const root = fixture();
  expect(run(root).status).toBe(0);
  rmSync(join(root, 'assets/vendor/maplibre-gl/maplibre-gl.css'));
  const result = run(root, '--check');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('MapLibre vendor missing: maplibre-gl.css; run npm run vendor:maplibre');
});
