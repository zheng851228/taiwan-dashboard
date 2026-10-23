import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// Load only the report formatter: importing this CLI would run the live route audit.
const source = await readFile(new URL('../scripts/audit-taiwan-routes.mjs', import.meta.url), 'utf8');
const formatter = source.match(/function escapeCell\(value\) \{[\s\S]*?\n\}/)[0];
const escapeCell = vm.runInNewContext(`(${formatter})`);

describe('route audit Markdown cells', () => {
  it.each([
    ['a|b', 'a\\|b'],
    ['a\\|b', 'a\\\\\\|b'],
    ['a\\\\|b', 'a\\\\\\\\\\|b'],
    ['  a\n b\\c | d  ', 'a b\\\\c \\| d']
  ])('escapes backslashes before pipes: %s', (input, expected) => {
    expect(escapeCell(input)).toBe(expected);
  });
});
