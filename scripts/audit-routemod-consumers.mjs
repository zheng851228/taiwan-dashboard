import fs from 'node:fs';
import path from 'node:path';

const roots = ['js'];
const skip = new Set(['js/main-ui.js']);
const matches = [];

function walk(entry) {
  if (!fs.existsSync(entry)) return;
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    fs.readdirSync(entry).sort().forEach((name) => walk(path.join(entry, name)));
    return;
  }
  if (!entry.endsWith('.js') || skip.has(entry)) return;
  const lines = fs.readFileSync(entry, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (line.includes('RouteMod')) {
      matches.push(`${entry}:${index + 1}:${line.trim()}`);
    }
  });
}

roots.forEach(walk);
console.log(matches.length ? matches.join('\n') : 'NO_EXTERNAL_ROUTEMOD_REFERENCES');
