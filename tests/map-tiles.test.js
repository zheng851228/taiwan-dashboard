import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function run({ code = '200', type = 'image/png', curlExit = '0', key = "key: 'test-key',", ...env } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'map-tiles-'));
  roots.push(root);
  for (const dir of ['scripts', 'js', 'bin']) mkdirSync(join(root, dir));
  const script = resolve('scripts/check-map-tiles.sh');
  // Report a missing feature as an assertion failure before implementation.
  expect(() => readFileSync(script)).not.toThrow();
  copyFileSync(script, join(root, 'scripts/check-map-tiles.sh'));
  writeFileSync(join(root, 'js/map-provider-config.js'), key);
  writeFileSync(join(root, 'bin/curl'), `#!/bin/bash
printf '%s\\n' "$@" > "$ARGS_FILE"
printf '%s\\n%s\\n' "$TEST_CODE" "$TEST_TYPE"
exit "$TEST_EXIT"
`, { mode: 0o755 });
  const result = spawnSync('bash', [join(root, 'scripts/check-map-tiles.sh')], {
    cwd: tmpdir(), encoding: 'utf8',
    env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, ARGS_FILE: join(root, 'args'),
      TEST_CODE: code, TEST_TYPE: type, TEST_EXIT: curlExit, MAP_TILE_URL: '', MAP_TILE_REFERER: '', ...env }
  });
  return { ...result, output: result.stdout + result.stderr,
    args: result.status === 0 ? readFileSync(join(root, 'args'), 'utf8') : '' };
}

it('accepts HTTP 200 images and sends the configured key, production Referer and bounded retries', () => {
  const result = run();
  expect(result.status).toBe(0);
  expect(result.output).toContain('HTTP 200');
  expect(result.args).toContain('https://api.maptiler.com/maps/dataviz-dark/8/214/110.png?key=test-key');
  expect(result.args).toContain('https://zheng851228.github.io/taiwan-dashboard/');
  for (const option of ['--max-time', '--connect-timeout', '--retry', '--retry-delay']) expect(result.args).toContain(option);
});

it.each([['403', 'image/png'], ['200', 'text/html'], ['200', ''], ['302', 'image/png']])(
  'rejects HTTP %s with Content-Type %s', (code, type) => {
    const result = run({ code, type });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(`HTTP ${code}`);
    expect(result.output).toContain('失敗');
  }
);

it('reports transport failures with HTTP 000', () => {
  const result = run({ code: '000', type: '', curlExit: '28' });
  expect(result.status).not.toBe(0);
  expect(result.output).toContain('HTTP 000');
  expect(result.output).toContain('curl');
});

it('fails clearly when no key can be read', () => {
  const result = run({ key: "keyName: 'not-a-key'," });
  expect(result.status).not.toBe(0);
  expect(result.output).toContain('key');
  expect(result.output).toContain('HTTP 000');
});

it('supports explicit tile URL and Referer overrides', () => {
  const result = run({ MAP_TILE_URL: 'https://tiles.example/1.png', MAP_TILE_REFERER: 'https://example.invalid/' });
  expect(result.status).toBe(0);
  expect(result.args).toContain('https://tiles.example/1.png');
  expect(result.args).toContain('https://example.invalid/');
});
