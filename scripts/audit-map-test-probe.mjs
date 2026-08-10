import fs from 'node:fs';
import path from 'node:path';

const roots = ['tests/e2e', 'js', 'scripts'];
const skip = new Set(['scripts/audit-map-test-probe.mjs']);
const matches = [];

function walk(entry) {
  if (!fs.existsSync(entry)) return;
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    fs.readdirSync(entry).forEach((name) => walk(path.join(entry, name)));
    return;
  }
  if (skip.has(entry)) return;
  const text = fs.readFileSync(entry, 'utf8');
  text.split('\n').forEach((line, index) => {
    if (line.includes('__MapTestProbe') || line.includes('MapMod')) {
      matches.push(`${entry}:${index + 1}:${line.trim()}`);
    }
  });
}

roots.forEach(walk);
console.log(matches.length ? matches.join('\n') : 'NO_MAP_TEST_REFERENCES');
