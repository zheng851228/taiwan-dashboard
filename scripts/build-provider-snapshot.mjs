import fs from 'node:fs';
import path from 'node:path';
import { buildSnapshotKvEntries } from '../worker/src/providers.js';

/**
 * 手動備援：本機建置 provider snapshot 的 2 個 KV keys（snapshot + cams），
 * 輸出 JSON 可直接餵給 `wrangler kv bulk put`（格式 {key, value, expiration, metadata}）。
 *
 * 用法：
 *   node scripts/build-provider-snapshot.mjs [--now=ISO] [--vars-file=worker/.dev.vars] [--output=/tmp/...]
 *   wrangler kv bulk put --namespace-id <id> --env staging /tmp/taiwan-dashboard-provider-snapshot.json
 *
 * 注意：cron 的 scheduled() 才是主要寫入路徑（自動 diff-before-write）；
 * 此腳本是 workflow_dispatch / 手動回填用的備援。
 */
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

// 與 Worker scheduled() 共用同一份 builder：2 keys（snapshot + cams）。
const entries = await buildSnapshotKvEntries(env, now);

const output = entries.map((entry) => ({
  key: entry.key,
  value: entry.value,
  expiration: unixSeconds(now.getTime() + entry.expirationTtl * 1000),
  metadata: entry.metadata
}));

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(output));

const bytes = output.reduce((sum, entry) => sum + Buffer.byteLength(entry.value), 0);
console.log(JSON.stringify({
  output: outputFile,
  generatedAt: now.toISOString(),
  keys: output.map((entry) => ({ key: entry.key, sha256: entry.metadata.sha256 })),
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
