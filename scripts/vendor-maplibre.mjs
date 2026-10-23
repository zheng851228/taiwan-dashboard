import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const installed = new URL('node_modules/maplibre-gl/', root);
const target = new URL('assets/vendor/maplibre-gl/', root);
const pinned = JSON.parse(readFileSync(new URL('package.json', root))).devDependencies['maplibre-gl'];
const version = JSON.parse(readFileSync(new URL('package.json', installed))).version;
if (pinned !== version) throw new Error(`MapLibre version mismatch: package.json ${pinned}, installed ${version}`);
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Usage: node scripts/vendor-maplibre.mjs [--check]');
const check = args[0] === '--check';
const files = ['LICENSE.txt', 'maplibre-gl.css', 'maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs'];
// Read every upstream file before writing, so a changed dist layout fails first.
const contents = files.map(file => readFileSync(new URL(file === 'LICENSE.txt' ? file : `dist/${file}`, installed)));
if (!check) mkdirSync(target, { recursive: true });
files.forEach((file, index) => {
  const destination = new URL(file, target);
  if (check) {
    if (!existsSync(destination)) throw new Error(`MapLibre vendor missing: ${file}; run npm run vendor:maplibre`);
    if (!readFileSync(destination).equals(contents[index])) throw new Error(`MapLibre vendor mismatch: ${file}; run npm run vendor:maplibre`);
  } else {
    writeFileSync(destination, contents[index]);
  }
});
console.log(`MapLibre ${version}: vendor ${check ? 'verified' : 'updated'}`);
