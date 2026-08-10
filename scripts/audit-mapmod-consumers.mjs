import fs from 'node:fs';
import path from 'node:path';

const roots = ['js', 'tests', 'scripts'];
const extra = ['index.html'];
const skip = new Set(['scripts/audit-mapmod-consumers.mjs']);
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
    if (line.includes('MapMod')) matches.push(`${entry}:${index + 1}:${line.trim()}`);
  });
}
roots.forEach(walk);
extra.forEach(walk);
console.log(matches.length ? matches.join('\n') : 'NO_MAPMOD_REFERENCES');
