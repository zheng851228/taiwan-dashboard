#!/usr/bin/env node
/**
 * scripts/build-js.mjs — 前端 JS 打包 + 單一版號來源。
 *
 * 做什麼：
 *  1. 把 index.html <script> 標籤載入順序的 13 個 js 檔，照原順序串接後用
 *     esbuild minify，輸出 js/dist/app.js + js/dist/app2.js（兩個 chunk，
 *     因為單檔會超過 GitHub API 推送的單參數上限）。
 *  2. 把 desktop-bootstrap.js 動態載入的 7 個桌機 js 檔，照原順序串接後用
 *     esbuild minify，輸出 js/dist/desktop.js（維持 ≥1200px 才動態載入）。
 *  3. 版號單一來源：`git rev-parse --short HEAD`，寫入 index.html 的
 *     `js/dist/app.js?v=` 與 sw.js 的 CACHE_VERSION / SHELL_URLS。
 *
 * 為什麼不用 esbuild 的 iife/module bundle：
 *  js/enhancements.js 在頂層（script global）宣告了 NearbyMod、HistoryMod、
 *  WaypointsMod、RouteStripMod、PlaceSuggest、haversineKm 等識別字，被
 *  main-ui.js、route-conditions.js、desktop-dashboard.js 直接裸引用。
 *  任何 module scope 包裝都會讓這些引用斷掉。因此這裡只做「照原順序串接 +
 *  minify（不包 format）」，語義與原本 13 個 <script> 標籤逐一載入完全一致。
 *  esbuild minify 不會重新命名頂層識別字，所以跨檔裸引用保持有效。
 *
 * desktop-bootstrap.js 的處理：
 *  它原本用 loadScript 逐一載入 7 個桌機檔。build 時把這段鏈改寫成只載入
 *  單一的 js/dist/desktop.js（正則嚴格錨定，找不到就直接報錯停下，不靜默）。
 *  既有的 ≥1200px gating、media 變化監聽完全保留；載入失敗或無 WebGL2 時
 *  顯示靜態降級訊息（不再維護第二套地圖）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// index.html <script> 標籤的載入順序（行動版 shell）。
// 注意：單一 bundle（app.js）會超過 128KB，無法經由 GitHub API 推送；
// 因此拆成兩個 chunk。純字串串接，拆分點不影響語義（等價於多個 <script> 標籤）。
const APP_FILES_A = [
  'js/core.js',
  'js/services.js',
  'js/data.js',
  'js/route-search-model.js',
  'js/route-summary-model.js',
  'js/main-ui.js',
  'js/share-import.js',
];
const APP_FILES_B = [
  // 快照誠實化模組放 B 段開頭：純全域 + DOMContentLoaded 初始化，
  // 與 A 段無執行期依賴；拆分點不影響語義（A 段 raw 需 <128KB）。
  'js/snapshot-honesty.js',
  'js/map-provider-config.js',
  'js/enhancements.js',
  'js/route-filmstrip.js',
  'js/route-condition-view-model.js',
  'js/route-navigation-model.js',
  'js/route-conditions.js',
  'js/ride-tools.js',
  'js/desktop-bootstrap.js',
  'js/map-geo-utils.js',
  'js/maplibre-renderer.js',
  'js/maplibre-camera-layer.js',
  'js/maplibre-route-layer.js',
  'js/maplibre-condition-layer.js',
  'js/pwa.js',
];

// desktop-bootstrap.js 動態載入的順序（桌機包）。
const DESKTOP_FILES = [
  'js/map-provider-config.js',
  'js/maplibre-renderer.js',
  'js/maplibre-camera-layer.js',
  'js/maplibre-route-layer.js',
  'js/maplibre-condition-layer.js',
  'js/desktop-dashboard.js',
  'js/desktop-layout.js',
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/**
 * 把 desktop-bootstrap.js 內「逐一載入 7 個桌機檔」的鏈，
 * 改寫成「載入單一 js/dist/desktop.js」。找不到預期的鏈就拋錯，
 * 避免上游改了 bootstrap 卻靜默打出 7 個請求的版本。
 */
function rewriteBootstrapLoadChain(src, version) {
  const chainRe =
    /loading = loadScript\('\.\/js\/map-provider-config\.js\?v=[^']*'\)(?:\s*\.then\(function\(\) \{\s*return loadScript\('[^']*'\);\s*\}\))+?\s*\.catch\(function\(\) \{\s*showMapDegradedNotice\(\);\s*\}\);/;
  if (!chainRe.test(src)) {
    throw new Error(
      'desktop-bootstrap.js: expected 7-file dynamic load chain not found; ' +
        'update rewriteBootstrapLoadChain() in scripts/build-js.mjs'
    );
  }
  return src.replace(
    chainRe,
    `loading = loadScript('./js/dist/desktop.js?v=${version}').catch(function() { showMapDegradedNotice(); });`
  );
}

function bundle(files, outRel, version) {
  const parts = files.map((rel) => {
    let src = read(rel);
    if (rel === 'js/desktop-bootstrap.js') src = rewriteBootstrapLoadChain(src, version);
    return src;
  });
  // 檔與檔之間用 '\n;\n' 隔開，避免 ASI 把上個檔的結尾和下個檔的開頭黏在一起。
  const code = parts.join('\n;\n');
  // 注意：刻意不設 format（不包 iife/module），保持與 <script> 逐一載入相同的
  // global scope 語義；只做 minify。
  const { code: minified } = transformSync(code, { minify: true, charset: 'utf8' });
  const out = path.join(ROOT, outRel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, minified + '\n');
  return {
    out: outRel,
    rawBytes: Buffer.byteLength(code, 'utf8'),
    bytes: Buffer.byteLength(minified, 'utf8'),
  };
}

function injectIndexHtml(version) {
  const file = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  // 同時相容「尚未打包（多個 ?v=…）」與「已打包過（兩個 ?v=<sha>）」兩種狀態，
  // 讓重複執行 build 是冪等的。（Leaflet 已移除，不再以其 script 標籤為錨點。）
  const blockRe =
    /(?:<script src="js\/(?:[A-Za-z0-9-]+\.js|dist\/app2?\.js)\?v=[^"]*"><\/script>\r?\n)+/;
  const m = html.match(blockRe);
  if (!m) {
    throw new Error('index.html: script block not found; update injectIndexHtml() in scripts/build-js.mjs');
  }
  const replacement =
    `<script src="js/dist/app.js?v=${version}"></script>\n` +
    `<script src="js/dist/app2.js?v=${version}"></script>\n`;
  fs.writeFileSync(file, html.slice(0, m.index) + replacement + html.slice(m.index + m[0].length));
}

function injectServiceWorker(version) {
  const file = path.join(ROOT, 'sw.js');
  let sw = fs.readFileSync(file, 'utf8');

  const cacheVerRe = /const CACHE_VERSION = "[^"]*";/g;
  const cacheVerMatches = sw.match(cacheVerRe) || [];
  if (cacheVerMatches.length !== 1) {
    throw new Error(`sw.js: expected exactly one CACHE_VERSION, found ${cacheVerMatches.length}`);
  }
  sw = sw.replace(cacheVerRe, `const CACHE_VERSION = "${version}";`);

  const legacyJsBlock =
    /  "\.\/js\/core\.js\?v=[^"]*",\n(?:  "\.\/js\/[A-Za-z0-9-]+\.js\?v=[^"]*",?\n)+/;
  const distJsBlock =
    /  "\.\/js\/dist\/app\.js\?v=[^"]*",\n(?:  "\.\/js\/dist\/app2\.js\?v=[^"]*",\n)?  "\.\/js\/dist\/desktop\.js\?v=[^"]*",\n/;
  const m = sw.match(legacyJsBlock) || sw.match(distJsBlock);
  if (!m) {
    throw new Error('sw.js: SHELL_URLS js block not found; update injectServiceWorker() in scripts/build-js.mjs');
  }
  const replacement =
    `  "./js/dist/app.js?v=${version}",\n` +
    `  "./js/dist/app2.js?v=${version}",\n` +
    `  "./js/dist/desktop.js?v=${version}",\n`;
  sw = sw.slice(0, m.index) + replacement + sw.slice(m.index + m[0].length);
  fs.writeFileSync(file, sw);
}

function main() {
  const version = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{7,40}$/.test(version)) {
    throw new Error(`unexpected version from git rev-parse: ${version}`);
  }

  const appA = bundle(APP_FILES_A, 'js/dist/app.js', version);
  const appB = bundle(APP_FILES_B, 'js/dist/app2.js', version);
  const desktop = bundle(DESKTOP_FILES, 'js/dist/desktop.js', version);
  injectIndexHtml(version);
  injectServiceWorker(version);

  console.log(
    JSON.stringify(
      {
        version,
        app: { file: appA.out, rawBytes: appA.rawBytes, minBytes: appA.bytes },
        app2: { file: appB.out, rawBytes: appB.rawBytes, minBytes: appB.bytes },
        desktop: { file: desktop.out, rawBytes: desktop.rawBytes, minBytes: desktop.bytes },
      },
      null,
      2
    )
  );
}

main();
