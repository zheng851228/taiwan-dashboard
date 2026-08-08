# Taiwan Dashboard

[![CI](https://github.com/zheng851228/taiwan-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/zheng851228/taiwan-dashboard/actions/workflows/ci.yml)

**台灣機車騎士的路線情報儀表板**：在出發前或途中停靠時，依白牌、黃牌、紅牌驗證路線，並按騎乘順序整合官方交通、氣象、道路事件與 CCTV 現場畫面。

**[開啟 Live Demo](https://zheng851228.github.io/taiwan-dashboard/)**

> 本專案不是騎乘中的持續導航，也不取代現場標誌或最新法規。灰色路段代表資料不足，不代表順暢；CCTV 僅提供現場畫面，不使用 AI 自動判定塞車或降雨。

## 專案亮點

- **機車路權感知路由**：白牌使用 Valhalla `motor_scooter`，黃牌與紅牌使用 `motorcycle`，再以道路名稱、road class、way ID 與 shape index 做額外驗證。
- **保守失敗策略**：禁行或無法確認的路段會避開重算；仍無法確認安全時回 HTTP 422，不提供可能誤導的 geometry。
- **沿途即時情報**：最多切成 12 段，整合 TDX、THB、CWA、道路事件與 CCTV，並保留來源與觀測時間。
- **資料可信度優先**：缺少、過期或格式異常的資料維持 `unknown`，不把「沒有資料」誤判成「道路順暢」。
- **多停靠點與導航交接**：支援起點、終點與多個停靠點；Google Maps 保留順序，Apple Maps 依官方能力提供分段連結。
- **桌面與行動體驗**：桌面提供可調整資訊軌與 MapLibre 地圖；行動版支援 PWA 安裝、收藏與最後成功路線快照。
- **可驗證的工程流程**：Vitest、Playwright、fixture Worker、全台 live route audit，以及 PR / main CI。

## 系統架構

```text
Browser / PWA
  |
  | Static HTML / CSS / JavaScript
  v
Cloudflare Worker /v2
  |-- Valhalla route + trace_attributes
  |-- Provider snapshots
  |    |-- TDX traffic / incidents
  |    |-- THB road traffic
  |    |-- CWA weather
  |    `-- CCTV index
  |-- Nominatim geocoding proxy
  `-- KV route cache
```

前端不保存 CWA 或 TDX 金鑰，也不直接呼叫第三方資料服務。Worker 負責路由、資料正規化、來源時效判定與快取；staging 可使用預先建立的 immutable provider snapshot，避免在熱路徑同步解析大型上游資料。

更完整的模組責任與後續重構邊界見 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 技術棧

| 層級 | 技術 |
| --- | --- |
| Frontend | HTML, JavaScript, Tailwind CSS |
| Map | MapLibre GL |
| Routing | Valhalla |
| Backend | Cloudflare Workers |
| Cache / snapshots | Cloudflare KV |
| Traffic | TDX, THB |
| Weather | CWA Open Data |
| Unit / integration tests | Vitest |
| E2E | Playwright |
| CI | GitHub Actions |
| Deployment | GitHub Pages + Cloudflare Workers |

## 主要功能

- 一次處理起點、終點與多個停靠點，計算完整距離與時間。
- 長距離、多停靠路線分段取得道路屬性，再還原為一致的全程 shape index。
- 沿途以綠、黃、紅、灰呈現順暢、車多、壅塞與資料不足。
- 每段顯示交通、天氣、事件、來源、觀測時間與相關 CCTV。
- 官方事件有座標時顯示事件位置；沒有座標時只標示「位置未提供」，不製造假的精確 marker。
- 支援途中停靠手動更新；頁面可見時最多每五分鐘自動更新一次。
- 收藏與最後成功路線快照存於 `localStorage`。
- PWA 提供可安裝、可更新的離線殼層；離線資料會明確標示為非即時。

## 專案結構

```text
.
├── index.html                 # App shell
├── css/                       # Shared / generated styles
├── js/
│   ├── core.js                # Shared state and utilities
│   ├── services.js            # Frontend API boundary
│   ├── main-ui.js             # Main route UI
│   ├── route-conditions.js    # Route condition presentation
│   ├── maplibre-renderer.js   # MapLibre renderer
│   ├── desktop-dashboard.js   # Desktop command center
│   └── pwa.js                 # PWA lifecycle
├── worker/                    # Cloudflare Worker and provider logic
├── scripts/                   # Validation, audits, snapshot tooling
├── tests/                     # Vitest + Playwright tests
└── .github/workflows/         # CI and scheduled workflows
```

目前前端仍採 framework-free JavaScript。後續重構以「先切清楚 feature / service / renderer 邊界」為原則，而不是直接重寫成 React，降低對既有路由、PWA 與地圖功能的回歸風險。

## 本機開發

需求：Node.js 20+、npm、Python 3。

```bash
npm install
npm start
```

開啟 `http://127.0.0.1:4173/`。

預設前端連接 production Worker。若只要本機或離線驗證，可另開終端啟動 fixture Worker：

```bash
npm run worker:dev:fixture
```

再開啟：

```text
http://127.0.0.1:4173/?worker=http://127.0.0.1:8787
```

Fixture 模式會明確顯示 `DEMO 示範`，不代表真實道路、交通、氣象或法規結果。

## API

- `POST /v2/routes`
- `GET /v2/routes/{routeId}/conditions`
- `GET /v2/cams`
- `GET /v2/weather`
- `GET /v2/geocode?q=...`
- `GET /v2/expand?url=...`

舊 `/route`、`/cam-list`、`/weather` 與根路徑展開端點暫時保留向後相容。

## 驗證

一般變更先執行：

```bash
npm run check
```

這會執行 JavaScript / JSON 靜態檢查、必要資產與入口驗證，以及 Vitest 測試。PR 與 `main` push 也會透過 GitHub Actions 自動執行同一組檢查。

瀏覽器 E2E：

```bash
npm run test:e2e
```

Playwright 覆蓋桌面、iPhone、Android 與小平板。全台 live route audit 另涵蓋 22 縣市、北宜、蘇花、南迴、阿里山、三離島、牌照比較與環島多停靠案例：

```bash
npm run worker:dev
npm run test:routes:live
```

## Worker 與資料快照

Staging 與 production 使用獨立的路線快取 KV。正式憑證只應存在 Git 忽略的環境檔或平台 secret，不應提交到 repository。

Staging provider snapshot：

```bash
npm run worker:snapshot:build
npm run worker:snapshot:upload:staging
```

Snapshot 依資料種類使用不同時槽與時效限制。Worker 讀取資料時仍以官方 `observedAt` 判斷新鮮度；過期資料不會被當成即時結果。

Production 部署應先 dry-run，並明確指定 environment：

```bash
npx wrangler deploy --config worker/wrangler.jsonc --env production --strict --dry-run
npm run worker:deploy -- --env production --strict --secrets-file worker/.dev.vars.production
```

## 資料來源與限制

- 路由與道路屬性：Valhalla API。
- 即時交通與道路事件：TDX。
- 省道路況與線型：交通部公路局 168 開放資料。
- 氣象：中央氣象署 CWA Open Data。
- 導航交接：Google Maps URLs、Apple Map Links。
- 機車道路規則依公路局、高速公路局及地方主管機關公開資訊維護。

道路圖資與官方資料可能缺漏、延遲或改版；Google Maps / Apple Maps 在交接後也可能自行重算路線。實際騎乘仍應以現場標誌、最新法規與道路狀況為準。

## 安裝到 iPhone 主畫面

1. 使用 Safari 開啟 [Taiwan Dashboard](https://zheng851228.github.io/taiwan-dashboard/)。
2. 點選分享按鈕。
3. 選擇「加入主畫面」。
4. 從主畫面以獨立 Web App 模式開啟。
