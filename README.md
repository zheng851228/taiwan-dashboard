# Taiwan Dashboard

[Live Demo](https://zheng851228.github.io/taiwan-dashboard/) · [Architecture](docs/ARCHITECTURE.md) · [Validation](#驗證)

給台灣機車騎士在出發前或途中停靠時使用的沿途天氣與路況助手。系統會先依白牌、黃牌、紅牌驗證路線，再依騎乘順序整理官方交通、氣象、道路事件與 CCTV 現場畫面。

本專案不是騎乘中的持續導航，也不保證取代現場標誌或法規。灰色路段代表資料不足，不代表順暢；攝影機只提供現場畫面，不使用 AI 自動判定塞車或降雨。

## 工程亮點

- **機車路權驗證**：白牌使用 Valhalla `motor_scooter`，黃牌與紅牌使用 `motorcycle`，並以道路名稱、road class、way ID 與 shape index 進一步檢查禁行路段。
- **保守失敗策略**：資料缺失、過期、格式錯誤或道路資格無法確認時維持 `unknown` / `partial`，不把未知狀態當成順暢或安全。
- **多來源資料整合**：整合 TDX、THB、CWA、CCTV 與 Valhalla，透過 Cloudflare Worker 統一代理、正規化與快取。
- **長距離路線處理**：多停靠與長距離路線可分段取得道路屬性，再還原為同一組全程 shape index。
- **PWA 與離線殼層**：可安裝到 iPhone 主畫面；離線時保留收藏與最後成功路線，且明確標示非即時內容。
- **桌面 / 行動分流**：MapLibre 桌面模組採動態載入，避免把桌面地圖資源塞進行動 PWA shell；桌面 rail resizing 已抽到 `js/desktop-layout.js` 作為第一個模組化 migration seam。
- **測試與稽核**：Vitest、Playwright、fixture Worker、全台 live route audit 與 GitHub Actions CI。

## 功能

- 一次處理起點、終點與多個停靠點，正確計算全程距離與時間。
- 白牌使用 Valhalla `motor_scooter`，黃牌與紅牌使用 `motorcycle`。
- 透過道路名稱、road class、way ID 與 shape index 驗證機車通行資格。
- 遇到禁行或無法確認的路段會自動避開重算一次，仍不安全則回 HTTP 422 且不提供 geometry。
- 長距離、多停靠路線會分段取得道路屬性，再還原為同一組全程 shape index。
- 沿途最多 12 段，以綠、黃、紅、灰顯示順暢、車多、壅塞與資料不足。
- 每段顯示交通、天氣、事件、來源、觀測時間與最多兩支相關攝影機。
- 支援途中停靠手動更新；頁面可見時最多每五分鐘自動更新一次。
- Google Maps 保留停靠點順序；Apple Maps 官方 Map Links 只支援兩點，因此多停靠點會依原始順序提供分段連結。
- 收藏與最後成功路線快照存在 `localStorage`；PWA 提供可安裝、可更新的離線殼層，離線內容會明確標示為非即時。

## 技術棧

- Frontend：HTML、CSS、Vanilla JavaScript、Tailwind CSS、Leaflet、MapLibre GL
- Backend / Edge：Cloudflare Workers、KV
- Routing：Valhalla
- Data：TDX、交通部公路局 THB、中央氣象署 CWA、公開 CCTV
- Testing：Vitest、Playwright、fixture Worker、live route audit
- Delivery：GitHub Pages、GitHub Actions、Cloudflare

## 架構

```text
Static HTML/CSS/JS
        |
        | desktop only
        +--> desktop-bootstrap.js
        |      |-- map-provider-config.js
        |      |-- maplibre-renderer.js
        |      |-- desktop-dashboard.js
        |      `-- desktop-layout.js
        |
        v
Cloudflare Worker /v2
  |-- Valhalla route + trace_attributes
  |-- Prebuilt provider snapshots (TDX / THB / CWA / CCTV)
  |     `-- route cells + roadRef index, immutable time slots
  |-- Nominatim geocoding proxy
  `-- KV route cache (6 hours)
```

前端不保存 CWA 或 TDX 金鑰，也不直接呼叫第三方資料服務。短網址展開只允許 Google Maps 與 Apple Maps 網域。

Staging 的 conditions 熱路徑只讀由本機／CI 預處理的 KV 快照，不在 Worker 內解析全台 THB XML。快照的 `generatedAt` 只代表產生時間，交通與氣象仍各自使用官方 `observedAt` 驗證時效；缺少、過期或格式錯誤時維持 `partial` 與灰色 `unknown`，不會回頭直打上游或標成順暢。

更完整的模組責任與重構方向見 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 專案結構

```text
.
├── index.html
├── css/
├── js/
│   ├── core.js
│   ├── services.js
│   ├── data.js
│   ├── main-ui.js
│   ├── route-conditions.js
│   ├── ride-tools.js
│   ├── desktop-bootstrap.js
│   ├── desktop-dashboard.js
│   ├── desktop-layout.js
│   ├── maplibre-renderer.js
│   └── pwa.js
├── worker/
├── tests/
├── scripts/
└── .github/workflows/
```

## 安裝到 iPhone 主畫面

1. 使用 Safari 開啟 <https://zheng851228.github.io/taiwan-dashboard/>。
2. 點 Safari 工具列的分享按鈕。
3. 選擇「加入主畫面」，再按「加入」。

從主畫面開啟後會以獨立 Web App 顯示。網站發布新版時不需重新安裝，畫面會提示使用者執行更新。即時路況、天氣、地圖圖磚與影像仍需網路；離線時只顯示已保存路線與收藏。

## 開始使用

需求：Node.js 20+、npm、Python 3。

```bash
npm install
npm start
```

開啟：

```text
http://127.0.0.1:4173/
```

此入口預設連接已驗收的 production Worker，使用即時道路、交通與氣象資料。若只要開發或離線驗證，先另開一個終端啟動 fixture Worker：

```bash
npm run worker:dev:fixture
```

再以測試覆寫參數開啟：

```text
http://127.0.0.1:4173/?worker=http://127.0.0.1:8787
```

Fixture 模式會在畫面明確顯示 `DEMO 示範`，只用於本機與 CI，不代表真實道路、交通、氣象或法規結果。

## Worker 設定

Staging 與 production 必須使用不同的六小時路線快取 KV。重新建立環境時，以環境名稱建立 namespace：

```bash
npx wrangler kv namespace create taiwan-dashboard-route-cache-staging
npx wrangler kv namespace create taiwan-dashboard-route-cache-production
```

把各自回傳的 namespace id 加到 `worker/wrangler.jsonc` 對應環境：

```jsonc
"kv_namespaces": [
  { "binding": "ROUTE_CACHE", "id": "YOUR_NAMESPACE_ID" }
]
```

正式環境憑證只寫入 Git 已忽略的 `worker/.dev.vars.production`；平台允許時不要重用 staging 值，也不要把值貼到終端參數或提交 Git：

```dotenv
CWA_API_KEY="ROTATED_VALUE"
TDX_CLIENT_ID="ROTATED_VALUE"
TDX_CLIENT_SECRET="ROTATED_VALUE"
```

目前 production 的 CWA key 已輪替；TDX 平台不允許更換既有 Client ID／Secret，因此經明確核准與 staging 共用。撤銷 TDX 憑證會同時影響兩個環境，後續若平台支援重發或能建立獨立應用，應優先拆分。

沒有 TDX credentials 時，正式模式會把交通標示為未知，不會當成順暢；在配置正式 credentials 並完成上游驗收前，不應對外宣稱即時壅塞功能已正式上線。可用以下變數覆寫上游端點：

- `VALHALLA_BASE_URL`
- `CAMERA_SOURCE_URL`
- `CWA_OBSERVATION_ENDPOINT`
- `CWA_FORECAST_ENDPOINT`
- `CWA_COUNTY_FORECAST_ENDPOINT`
- `TDX_VD_CONFIG_ENDPOINT`
- `TDX_VD_LIVE_ENDPOINT`
- `TDX_SECTION_ENDPOINT`
- `TDX_INCIDENT_ENDPOINT`
- `TDX_SCHEDULED_INCIDENT_ENDPOINT`
- `TDX_FREEWAY_INCIDENT_ENDPOINT`
- `THB_SECTION_ENDPOINT`
- `THB_SECTION_SHAPE_ENDPOINT`
- `THB_LIVE_TRAFFIC_ENDPOINT`
- `THB_CONGESTION_ENDPOINT`

### Staging provider snapshot

`env.staging` 使用 `PROVIDER_SNAPSHOT_MODE=kv`；production 尚未啟用。先從被 Git 忽略的 `worker/.dev.vars` 讀取憑證，在本機抓取並正規化公開資料，再把不含憑證的 immutable slot 寫入 staging KV：

```bash
npm run worker:snapshot:build
npm run worker:snapshot:upload:staging
```

產物固定寫到 `/tmp/taiwan-dashboard-provider-snapshot.json`，包含：

- 五分鐘交通快照：TDX VD、TDX 事件、THB 發布路段與 CWA 樣本。
- 六小時攝影機格網，以及可直接回傳的 `/v2/cams` JSON。
- 十五分鐘縣市氣象 `/v2/weather` JSON。

每個 slot 都有到期時間；Worker 先讀目前 slot，KV 尚未同步時再讀前一 slot。交通快照超過十五分鐘即不可用，攝影機硬上限十二小時，且個別交通觀測仍必須在十分鐘內。此命令只更新 staging namespace，不會部署或修改 production。正式自動排程與 production snapshot 必須另行批准。

先 dry-run，再明確指定 production environment 部署；禁止省略 `--env production`，避免誤碰 root Worker：

```bash
npx wrangler deploy --config worker/wrangler.jsonc --env production --strict --dry-run
npm run worker:deploy -- --env production --strict --secrets-file worker/.dev.vars.production
```

## API

- `POST /v2/routes`
- `GET /v2/routes/{routeId}/conditions`
- `GET /v2/cams`
- `GET /v2/weather`
- `GET /v2/geocode?q=...`
- `GET /v2/expand?url=...`

舊 `/route`、`/cam-list`、`/weather` 與根路徑展開端點保留一個版本週期。

`conditions` 的每個道路事件保留原有 `title`、`description`、`severity`，並增加向後相容的語意欄位：

- `kind`：事故、施工、壅塞通報、特殊管制、天候、災害、活動、道路障礙或其他。
- `impact`：全線封閉、車道封閉、交通管制、路肩作業、不影響通行或未知。
- `status`：`active`、`scheduled` 或 `unknown`；已過期事件不回傳。
- `effectiveAt`、`expiresAt`、`regulationCodes`、`blockedLanes` 與事件座標。
- `canonicalId`、`sourceScope` 與 `feedType`：保留省道／高速公路及即時／預告來源，避免跨來源相同 ID 被錯誤合併。

同一來源範圍內的事件只計一次；向後相容欄位 `overall.affectedIncidentSections` 計算包含已定位事件點的分析段數，`overall.roadLevelIncidentCount` 表示來源未提供座標的道路級警告。地圖保留原交通實線顏色，官方有座標時最多顯示三個事件位置，並在最接近路線的位置畫約 600 公尺的分類短色條（施工橘、事故紅、管制紫、天候藍）；短色條只協助找到事件位置，不代表官方公布的完整影響範圍。沒有座標的事件只顯示「位置未提供」，不會假造精確 marker 或路線色，避免把「有施工」誤讀成整段壅塞或封閉。

## 驗證

```bash
npm run check
npm run test:e2e
```

`npm run check` 會執行前端與 Worker syntax checks、靜態資產檢查與 Vitest。GitHub Actions 會在 pull request 與 `main` push 自動執行這個 gate。

Vitest 覆蓋牌照規則、國道與快速道路、國 3 甲例外、方向性限制、資料時效、VD 方向匹配、壅塞分級與 Worker fixture API。Playwright 設定包含桌面、iPhone、Android 與小平板。

全台 live 稽核另涵蓋 22 縣市、北宜、蘇花、南迴、阿里山、三離島、牌照比較與環島多停靠壓力案例。先啟動正式資料 Worker，再另開終端執行：

```bash
npm run worker:dev
npm run test:routes:live
```

報告預設輸出到 `/tmp/taiwan-dashboard-route-audit/`。可用 `--filter=critical` 篩選類別，或以 `ROUTE_AUDIT_DELAY_MS`、`ROUTE_AUDIT_OUTPUT_DIR` 調整請求間隔與輸出位置。

## 資料與限制

- 路由與道路屬性使用 [Valhalla API](https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/)。
- 省道發布路段速度、方向與線型使用公路局 [168 交通資料庫開放資料](https://thbapp.thb.gov.tw/opendata/)，來源標示為 `THB`。動態資料至少快取 60 秒，靜態路段與線型快取六小時；無法匹配、超過十分鐘或官方標示資料異常時維持灰色。
- VD 即時交通使用 [TDX 路況資訊 v2](https://tdx.transportdata.tw/api-service/swagger/basic/7f07d940-91a4-495d-9465-1c9df89d709c)，道路事件使用 [TDX 道路事件 v1](https://tdx.transportdata.tw/api-service/swagger/basic/60abfa19-ffe3-4eef-a4b1-0539435dfca9)。VD 方向來自 `DetectionLinks.Bearing`，沒有有效 VD 時才使用公路局發布路段；兩者都必須符合一公里、方向差小於 60 度與十分鐘時效限制。事件查詢涵蓋省道即時／預告及高速公路即時，三個來源每頁要求 1000 筆並強制取得總筆數，超過一頁時以 `$skip` 完整讀取；頁面截斷會標成來源失效，不會被解讀為沿途零事件。官方沒有高速公路預告事件 endpoint。事件依官方 `EventType`、`Impact.Severity` 與 `Regulations` 區分種類和封閉程度，代表點會對完整路段線型找最近段；未開始的事件標為預告，已過期事件不顯示。快照將有座標事件依格網、無座標事件依道路索引，讀取時沿完整路線幾何選格網，避免每條路線掃描全台事件或漏掉長路段端點事件。市區事件尚未納入，介面會明確提示來源範圍；逐城市資料不得在單一路線請求中同步大量 fan-out。
- 氣象使用中央氣象署的 `O-A0001-001` 自動氣象站、`F-D0047-089` 鄉鎮三小時預報，以及工具頁的 `F-C0032-001` 縣市預報；資料入口見 [CWA 開放資料](https://opendata.cwa.gov.tw/)。
- Google 導航交接依 [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)；行動瀏覽器支援的停靠點數可能有限。
- Apple 導航交接依 [Apple Map Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html)，官方格式只有 `saddr` 與 `daddr`。
- 機車道路規則有版本號，並依 [公路局大型重型機車開放路段](https://www.thb.gov.tw/News_ExpresswaySection.aspx?PageSize=10&n=462&page=1&sms=13790)、[高速公路局管制道路說明](https://www.freeway.gov.tw/Publish.aspx?cnid=183&p=379) 與 [台北市快速／高架道路大型重機開放說明](https://english.dot.gov.taipei/News_Content.aspx?n=3C4F5FC3FD2929A0&s=226C194502FDC5F5&sms=DFFA119D1FD5602C) 維護；台北市具名快速／高架道路允許黃、紅牌但白牌仍會避開。道路圖資可能缺少方向或交流道細節，仍應以現場標誌與最新公告為準。
- Google Maps 與 Apple Maps 會在交接後自行重算路線，使用者開始導航前仍需再次確認沒有進入禁行道路。
