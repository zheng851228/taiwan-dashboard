# Taiwan Dashboard（台灣機車路況指揮）

> 給台灣機車騎士使用的「出發前／途中停靠」路線情報工具。  
> 依白牌、黃牌、紅牌檢查路線可行性，並把沿途交通、天氣、道路事件與 CCTV 現場畫面整理在同一個介面。

**線上使用：** <https://zheng851228.github.io/taiwan-dashboard/>

## 這個專案在做什麼？

Taiwan Dashboard 想解決一個很實際的問題：

> 騎機車出發前，我不只想知道「怎麼走」，還想先知道這條路能不能騎、沿途會不會塞、是否有施工／事故、天氣如何，以及附近有沒有 CCTV 可以直接確認現場。

一般導航 App 主要負責把使用者帶到目的地；Taiwan Dashboard 則更偏向**出發前的路線情報整理與風險確認**。

使用者輸入起點、終點與停靠點後，系統會：

1. 依車牌級別建立候選路線。
2. 檢查道路類型與機車通行限制。
3. 將整條路線拆成可閱讀的分析區段。
4. 對照官方交通、道路事件與氣象資料。
5. 找出沿線 CCTV，讓使用者自行查看現場畫面。
6. 最後再把路線交給 Google Maps 或 Apple Maps 進行實際導航。

## 適合誰？

- 白牌機車騎士：希望避開快速道路、高架道路或其他不確定路段。
- 黃牌／紅牌重機騎士：希望依大型重型機車可通行規則規劃路線。
- 長途騎乘者：出發前想一次確認交通、天氣、施工、事故與 CCTV。
- 多停靠點行程：希望保留停靠順序並掌握整段路線狀態。

## 主要功能

| 功能 | 說明 |
| --- | --- |
| 機車路線驗證 | 白牌使用 Valhalla `motor_scooter`；黃牌、紅牌使用 `motorcycle`，並額外檢查道路名稱、road class、way ID、shape index 等資訊。 |
| 禁行路段處理 | 遇到禁止或無法確認的路段會嘗試避開並重算；仍無法確認安全時不回傳可騎乘 geometry。 |
| 多停靠點 | 支援起點、終點與多個停靠點，並計算完整行程距離與時間。 |
| 沿途路況 | 最多整理 12 個分析區段，以綠、黃、紅、灰表示順暢、車多、壅塞、資料不足。 |
| 道路事件 | 顯示事故、施工、交通管制、天候、災害、活動與其他官方事件。 |
| 天氣資訊 | 依沿途位置整合中央氣象署觀測與預報資料。 |
| CCTV | 顯示沿線相關道路攝影機，讓使用者直接查看官方／公開現場影像。 |
| PWA | 可加入 iPhone 主畫面，保留收藏與最後一次成功路線快照。 |
| 外部導航 | 路線確認後可交給 Google Maps 或 Apple Maps 導航。 |

## 很重要：它不是什麼

Taiwan Dashboard **不是騎乘中的持續導航系統**，也不取代道路標誌、交通法規、警察指揮或導航 App。

幾個重要原則：

- **灰色不代表順暢。** 灰色代表資料不足、過期、無法匹配或來源不可用。
- **不會把缺資料當成沒塞車。** 無法確認時會保留 `unknown`／`partial` 狀態。
- **CCTV 不使用 AI 自動判定。** 系統只呈現現場影像，是否塞車、下雨或道路可通行仍由使用者自行判讀。
- **Google Maps / Apple Maps 會重新計算路線。** 開始導航前仍需再次確認沒有被導入禁行道路。
- **道路規則可能變更。** 最終仍以現場標誌與主管機關最新公告為準。

## 使用流程

```text
輸入起點 / 終點 / 停靠點
          |
          v
選擇白牌 / 黃牌 / 紅牌
          |
          v
建立並驗證機車可行路線
          |
          v
取得沿途交通 / 天氣 / 事件 / CCTV
          |
          v
使用者確認路線與現場資訊
          |
          v
交給 Google Maps / Apple Maps 導航
```

## 資料來源

本專案盡量使用官方或公開資料，並保留來源與觀測時間。

| 類型 | 來源 | 用途 |
| --- | --- | --- |
| 路由 / 道路屬性 | [Valhalla](https://valhalla.github.io/valhalla/) | 路線建立、trace attributes、道路屬性 |
| 即時交通 / 道路事件 | [TDX 運輸資料流通服務](https://tdx.transportdata.tw/) | VD 交通資料、道路事件 |
| 省道路況 | [公路局 168 交通資料庫開放資料](https://thbapp.thb.gov.tw/opendata/) | 省道速度、方向、路段與線型 |
| 天氣 | [中央氣象署開放資料](https://opendata.cwa.gov.tw/) | 自動站觀測、鄉鎮與縣市預報 |
| CCTV | 公開道路攝影機資料 | 沿線現場影像 |
| 地點搜尋 | Nominatim | 地理編碼 proxy |

資料都有時效限制。若資料過期、格式異常或匹配失敗，系統會明確顯示為未知，而不是推測結果。

## 系統架構

```text
GitHub Pages
Static HTML / CSS / JavaScript
                |
                v
        Cloudflare Worker /v2
          |-- Valhalla route + trace_attributes
          |-- Provider snapshots
          |     |-- TDX
          |     |-- THB
          |     |-- CWA
          |     `-- CCTV
          |-- Nominatim geocoding proxy
          `-- Cloudflare KV route cache
```

### 為什麼使用 Worker？

前端不直接保存 CWA / TDX 憑證，也不直接把所有第三方資料來源暴露給瀏覽器。

Cloudflare Worker 負責：

- 路由 API 整合。
- 第三方資料正規化。
- 快照與快取讀取。
- 資料時效判斷。
- 路線條件彙整。
- 地理編碼 proxy。
- Google / Apple 短網址安全展開。

## 專案結構

```text
.
├── index.html            # Web App 入口
├── css/                  # 樣式
├── js/                   # 前端功能模組
├── worker/               # Cloudflare Worker / API
├── tests/                # Vitest / Playwright / 路線測試
├── scripts/              # 資料處理與維護腳本
├── cam-list.json         # 已發布的 CCTV 快照
├── manifest.json         # PWA manifest
├── sw.js                 # Service Worker
└── README.md
```

## 快速開始

### 需求

- Node.js 20+
- npm
- Python 3

### 啟動前端

```bash
npm install
npm start
```

開啟：

```text
http://127.0.0.1:4173/
```

預設會連接 production Worker。

### 本機 Fixture 模式

如果只是開發 UI、離線驗證或執行測試，可啟動 fixture Worker：

```bash
npm run worker:dev:fixture
```

再使用：

```text
http://127.0.0.1:4173/?worker=http://127.0.0.1:8787
```

Fixture 模式會在畫面明確標示 **DEMO 示範**；其中的道路、交通、天氣與法規結果不能視為真實資料。

## 安裝到 iPhone 主畫面

1. 使用 Safari 開啟 <https://zheng851228.github.io/taiwan-dashboard/>。
2. 點選 Safari 分享按鈕。
3. 選擇「加入主畫面」。
4. 從主畫面開啟即可使用獨立 Web App 模式。

PWA 可以保存收藏與最近成功路線，但即時路況、氣象、地圖與 CCTV 仍需要網路。離線資料會明確標示為非即時。

## API

目前主要 API：

```text
POST /v2/routes
GET  /v2/routes/{routeId}/conditions
GET  /v2/cams
GET  /v2/weather
GET  /v2/geocode?q=...
GET  /v2/expand?url=...
```

### `/v2/routes`

建立並驗證機車路線。若路線仍包含無法安全確認的道路，可回 HTTP `422`，且不提供可被誤用的 geometry。

### `/v2/routes/{routeId}/conditions`

回傳沿途交通、天氣、事件、資料來源與 CCTV 等資訊。

道路事件除原有 `title`、`description`、`severity` 外，也包含：

- `kind`：事故、施工、壅塞通報、特殊管制、天候、災害、活動、道路障礙或其他。
- `impact`：全線封閉、車道封閉、交通管制、路肩作業、不影響通行或未知。
- `status`：`active`、`scheduled`、`unknown`。
- `effectiveAt` / `expiresAt`。
- `regulationCodes` / `blockedLanes`。
- `canonicalId` / `sourceScope` / `feedType`。

沒有事件座標時，介面只會標示「位置未提供」，不會自行假造精確位置。

## 測試與驗證

### 基本檢查

```bash
npm run check
npm run test:e2e
```

測試範圍包含：

- 白牌 / 黃牌 / 紅牌道路規則。
- 國道、快速道路與大型重機例外。
- 方向性限制。
- 資料時效。
- VD 方向匹配。
- 壅塞分級。
- Worker fixture API。
- Desktop / iPhone / Android / 小平板 Playwright E2E。

### 全台 Live 路線稽核

```bash
npm run worker:dev
npm run test:routes:live
```

Live audit 涵蓋 22 縣市及多種代表性路線，例如北宜、蘇花、南迴、阿里山、離島、牌照比較及環島多停靠壓力案例。

報告預設輸出到：

```text
/tmp/taiwan-dashboard-route-audit/
```

## Provider Snapshot 與快取

Staging 可使用預先處理的 provider snapshot，避免每次路線查詢都即時解析大量上游資料。

```bash
npm run worker:snapshot:build
npm run worker:snapshot:upload:staging
```

快照主要包含：

- 交通資料與道路事件。
- CCTV 格網資料。
- 氣象資料。

不同資料有不同有效時間。Worker 會檢查來源觀測時間，而不是只看快照產生時間。

## Worker 環境設定

Staging 與 production 應使用不同的路線快取 KV namespace：

```bash
npx wrangler kv namespace create taiwan-dashboard-route-cache-staging
npx wrangler kv namespace create taiwan-dashboard-route-cache-production
```

正式環境的 API credentials 不應提交 Git，請放在被忽略的環境檔案或平台 Secret 中，例如：

```dotenv
CWA_API_KEY="..."
TDX_CLIENT_ID="..."
TDX_CLIENT_SECRET="..."
```

可覆寫的主要上游端點包含：

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

### Production 部署

正式部署前先執行 dry-run，並明確指定 production environment：

```bash
npx wrangler deploy --config worker/wrangler.jsonc --env production --strict --dry-run
npm run worker:deploy -- --env production --strict --secrets-file worker/.dev.vars.production
```

避免省略 `--env production`，以免部署到錯誤環境。

## 道路規則與資料限制

### 機車通行規則

道路規則依主管機關公開資訊維護，包括：

- [公路局大型重型機車開放路段](https://www.thb.gov.tw/News_ExpresswaySection.aspx?PageSize=10&n=462&page=1&sms=13790)
- [高速公路局管制道路說明](https://www.freeway.gov.tw/Publish.aspx?cnid=183&p=379)
- [台北市快速／高架道路大型重機開放說明](https://english.dot.gov.taipei/News_Content.aspx?n=3C4F5FC3FD2929A0&s=226C194502FDC5F5&sms=DFFA119D1FD5602C)

道路圖資與實際規定可能存在時間差，因此仍須以現場標誌與最新公告為準。

### 交通資料

- TDX VD 與公路局資料皆有距離、方向與時效匹配條件。
- 無法可靠匹配的資料不會直接套到路線上。
- 市區事件目前並非完整涵蓋範圍。
- 上游資料被截斷或解析失敗時，不會被解讀為「沿途沒有事件」。

### 氣象資料

目前使用中央氣象署：

- `O-A0001-001` 自動氣象站。
- `F-D0047-089` 鄉鎮三小時預報。
- `F-C0032-001` 縣市預報。

### 外部導航

- Google Maps：依 [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) 交接。
- Apple Maps：依 [Apple Map Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html) 交接。

Apple Map Links 官方格式只有 `saddr` / `daddr`，因此多停靠點會依原始順序拆成多段連結。

## 專案原則

這個專案在資料處理上刻意偏保守：

1. **不知道就是不知道**：沒有可靠資料時顯示未知，不假裝順暢。
2. **官方資料優先**：路況、氣象、規則盡可能保留原始來源與時間。
3. **不假造精度**：事件沒有座標時，不生成假的 marker。
4. **安全優先於完整 geometry**：無法確認機車可行性時，寧可拒絕回傳路線。
5. **導航與情報分離**：本系統負責路線情報與驗證，最終導航交給專用導航 App。

## 專案狀態

目前專案持續開發中，主要部署方式為：

- Frontend：GitHub Pages
- API：Cloudflare Worker
- Route engine：Valhalla
- Cache / snapshots：Cloudflare KV
- Test：Vitest + Playwright + Live route audit

功能與資料來源仍會持續調整，因此任何即時資訊都應搭配官方公告與現場狀況判斷。

## 貢獻與回報

如果你發現：

- 某條機車路線判定錯誤。
- 路況或事件位置匹配不合理。
- CCTV 無法顯示。
- 手機／桌面版 UI 有問題。
- 某個官方資料來源已變更。

可以透過 GitHub Issue 提供：

1. 起點與終點。
2. 車牌級別（白牌／黃牌／紅牌）。
3. 發生時間。
4. 預期結果與實際結果。
5. 可重現的畫面或錯誤訊息。

請不要在 Issue 或 PR 中貼出 API Key、Token、Cookie 或其他敏感資訊。

## License

目前 repository 尚未提供正式的開源授權條款。若要重用、修改或重新發布本專案程式碼，請先確認授權狀態或聯絡專案維護者。
