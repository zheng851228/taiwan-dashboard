# Taiwan Dashboard

給台灣機車騎士在出發前或途中停靠時使用的沿途天氣與路況助手。系統會先依白牌、黃牌、紅牌驗證路線，再依騎乘順序整理官方交通、氣象、道路事件與 CCTV 現場畫面。

本專案不是騎乘中的持續導航，也不保證取代現場標誌或法規。灰色路段代表資料不足，不代表順暢；攝影機只提供現場畫面，不使用 AI 自動判定塞車或降雨。

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
- 收藏存在 `localStorage`，PWA 提供離線殼層。

## 架構

```text
Static HTML/CSS/JS
        |
        v
Cloudflare Worker /v2
  |-- Valhalla route + trace_attributes
  |-- THB 168 published sections + shapes + travel speed
  |-- TDX VD live traffic + incidents
  |-- CWA observations + township 3-hour forecast
  |-- CCTV source
  |-- Nominatim geocoding proxy
  `-- KV route cache (6 hours)
```

前端不保存 CWA 或 TDX 金鑰，也不直接呼叫第三方資料服務。短網址展開只允許 Google Maps 與 Apple Maps 網域。

## 本機執行

需求：Node.js 20+、npm、Python 3。

```bash
npm install
npm run worker:dev:fixture
```

另開一個終端：

```bash
npm run dev
```

開啟：

```text
http://127.0.0.1:4173/?worker=http://127.0.0.1:8787
```

Fixture 模式會在畫面明確顯示 `DEMO 示範`，只用於本機與 CI，不代表真實道路、交通、氣象或法規結果。

## Worker 設定

先建立六小時路線快取用 KV：

```bash
npx wrangler kv namespace create ROUTE_CACHE --config worker/wrangler.jsonc
```

把回傳的 namespace id 加到 `worker/wrangler.jsonc`：

```jsonc
"kv_namespaces": [
  { "binding": "ROUTE_CACHE", "id": "YOUR_NAMESPACE_ID" }
]
```

設定 secrets：

```bash
npx wrangler secret put CWA_API_KEY --config worker/wrangler.jsonc
npx wrangler secret put TDX_CLIENT_ID --config worker/wrangler.jsonc
npx wrangler secret put TDX_CLIENT_SECRET --config worker/wrangler.jsonc
```

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
- `THB_SECTION_ENDPOINT`
- `THB_SECTION_SHAPE_ENDPOINT`
- `THB_LIVE_TRAFFIC_ENDPOINT`
- `THB_CONGESTION_ENDPOINT`

部署：

```bash
npm run worker:deploy
```

## API

- `POST /v2/routes`
- `GET /v2/routes/{routeId}/conditions`
- `GET /v2/cams`
- `GET /v2/weather`
- `GET /v2/geocode?q=...`
- `GET /v2/expand?url=...`

舊 `/route`、`/cam-list`、`/weather` 與根路徑展開端點保留一個版本週期。

## 驗證

```bash
npm run check
npm run test:e2e
```

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
- VD 即時交通使用 [TDX 路況資訊 v2](https://tdx.transportdata.tw/api-service/swagger/basic/7f07d940-91a4-495d-9465-1c9df89d709c)，道路事件使用 [TDX 道路事件 v1](https://tdx.transportdata.tw/api-service/swagger/basic/60abfa19-ffe3-4eef-a4b1-0539435dfca9)。VD 方向來自 `DetectionLinks.Bearing`，沒有有效 VD 時才使用公路局發布路段；兩者都必須符合一公里、方向差小於 60 度與十分鐘時效限制。
- 氣象使用中央氣象署的 `O-A0001-001` 自動氣象站、`F-D0047-089` 鄉鎮三小時預報，以及工具頁的 `F-C0032-001` 縣市預報；資料入口見 [CWA 開放資料](https://opendata.cwa.gov.tw/)。
- Google 導航交接依 [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)；行動瀏覽器支援的停靠點數可能有限。
- Apple 導航交接依 [Apple Map Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html)，官方格式只有 `saddr` 與 `daddr`。
- 機車道路規則有版本號，並依 [公路局大型重型機車開放路段](https://www.thb.gov.tw/News_ExpresswaySection.aspx?PageSize=10&n=462&page=1&sms=13790)、[高速公路局管制道路說明](https://www.freeway.gov.tw/Publish.aspx?cnid=183&p=379) 與 [台北市快速／高架道路大型重機開放說明](https://english.dot.gov.taipei/News_Content.aspx?n=3C4F5FC3FD2929A0&s=226C194502FDC5F5&sms=DFFA119D1FD5602C) 維護；台北市具名快速／高架道路允許黃、紅牌但白牌仍會避開。道路圖資可能缺少方向或交流道細節，仍應以現場標誌與最新公告為準。
- Google Maps 與 Apple Maps 會在交接後自行重算路線，使用者開始導航前仍需再次確認沒有進入禁行道路。
