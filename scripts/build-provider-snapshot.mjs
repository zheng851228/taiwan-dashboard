import fs from 'node:fs';
import path from 'node:path';
import {
  buildLiveProviderSnapshot,
  loadCountyWeather,
  packProviderSnapshotHttpEnvelope,
  providerSnapshotHttpSlotKey
} from '../worker/src/providers.js';

const options = parseArgs(process.argv.slice(2));
const now = options.now ? new Date(options.now) : new Date();
if (Number.isNaN(now.getTime())) throw new Error('Invalid --now value');

const varsFile = path.resolve(options.varsFile || 'worker/.dev.vars');
const outputFile = path.resolve(
  options.output || '/tmp/taiwan-dashboard-provider-snapshot.json'
);
if (!fs.existsSync(varsFile)) {
  throw new Error(`Variables file not found: ${varsFile}`);
}

const env = {
  ...process.env,
  ...parseVarsFile(fs.readFileSync(varsFile, 'utf8'))
};

const live = await buildLiveProviderSnapshot(env, now);
let countyWeather = {};
let weatherIssue = '';
try {
  countyWeather = await loadCountyWeather(env);
} catch (error) {
  weatherIssue = error.message || 'unavailable';
}

const updatedAt = now.toISOString();
const camerasEnvelope = {
  status: live.providerData.cameras.length ? 'ok' : 'partial',
  updatedAt,
  data: live.providerData.cameras,
  message: live.providerData.cameras.length ? '' : '攝影機快照暫時沒有資料'
};
const weatherEnvelope = {
  status: Object.keys(countyWeather).length ? 'ok' : 'partial',
  updatedAt,
  data: countyWeather,
  message: Object.keys(countyWeather).length
    ? ''
    : `氣象快照暫時沒有資料${weatherIssue ? `：${weatherIssue}` : ''}`
};

const entries = [
  {
    key: live.key,
    value: live.value,
    expiration: unixSeconds(now.getTime() + 2 * 60 * 60 * 1000)
  },
  {
    key: live.cameraKey,
    value: live.cameraValue,
    expiration: unixSeconds(now.getTime() + 18 * 60 * 60 * 1000)
  },
  {
    key: providerSnapshotHttpSlotKey('cams', now),
    value: packProviderSnapshotHttpEnvelope(camerasEnvelope, updatedAt),
    expiration: unixSeconds(now.getTime() + 18 * 60 * 60 * 1000)
  },
  {
    key: providerSnapshotHttpSlotKey('weather', now),
    value: packProviderSnapshotHttpEnvelope(weatherEnvelope, updatedAt),
    expiration: unixSeconds(now.getTime() + 3 * 60 * 60 * 1000)
  }
];

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(entries));

const bytes = entries.reduce((sum, entry) => sum + Buffer.byteLength(entry.value), 0);
console.log(JSON.stringify({
  output: outputFile,
  generatedAt: updatedAt,
  keys: entries.map((entry) => entry.key),
  counts: live.counts,
  issues: live.providerData.issues,
  bytes
}, null, 2));

function parseArgs(args) {
  const result = {};
  for (const arg of args) {
    const match = String(arg).match(/^--([a-z-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, value) => value.toUpperCase());
    result[key] = match[2];
  }
  return result;
}

function parseVarsFile(value) {
  const result = {};
  for (const rawLine of String(value).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let item = line.slice(separator + 1).trim();
    if (
      (item.startsWith('"') && item.endsWith('"'))
      || (item.startsWith("'") && item.endsWith("'"))
    ) {
      item = item.slice(1, -1);
    }
    result[key] = item;
  }
  return result;
}

function unixSeconds(milliseconds) {
  return Math.floor(milliseconds / 1000);
}
