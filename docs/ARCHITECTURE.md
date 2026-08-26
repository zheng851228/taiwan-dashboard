# Taiwan Dashboard Architecture

本文件說明 Taiwan Dashboard 目前的系統邊界、各層責任與後續重構原則。它描述的是 **目前 `main` 的架構**，不是未完成重構分支的狀態。

## 1. 系統定位

Taiwan Dashboard 是給台灣機車騎士使用的出發前／途中停靠路線情報工具。核心責任是：

1. 依白牌、黃牌、紅牌驗證路線是否適合機車通行。
2. 將路線切成可理解的沿途區段。
3. 整合交通、道路事件、氣象與 CCTV。
4. 對資料缺失、過期或無法確認的狀態採保守呈現。
5. 將最終導航交給 Google Maps 或 Apple Maps，而不是自行提供持續 turn-by-turn navigation。

## 2. Runtime boundary

```text
Browser / GitHub Pages
        |
        | /v2 API
        v
Cloudflare Worker
  |-- route orchestration
  |-- motorcycle eligibility validation
  |-- provider normalization
  |-- freshness policy
  |-- route/provider cache
        |
        +--> Valhalla
        +--> TDX
        +--> THB / 公路局 168
        +--> CWA
        +--> CCTV feeds
        +--> Nominatim
```

### Browser 責任

Browser 主要負責：

- 起點、終點、停靠點與牌照類型互動。
- 路線結果與路況資訊呈現。
- Leaflet / MapLibre 地圖 rendering。
- CCTV 預覽與沿線資訊互動。
- 收藏、最後成功路線與其他 `localStorage` 狀態。
- PWA 安裝、更新與離線殼層。
- Google Maps / Apple Maps 導航交接。

Browser **不應**：

- 保存 TDX / CWA 等正式 credentials。
- 自行重新定義官方資料的 freshness policy。
- 把缺資料或過期資料推論成「順暢」。
- 對 CCTV 畫面做未經驗證的 AI 塞車／降雨判讀。

### Cloudflare Worker 責任

Worker 主要負責：

- 呼叫 Valhalla 建立路線與取得道路屬性。
- 依牌照類型驗證道路通行資格。
- 遇到禁行或無法確認路段時進行保守處理與必要的重算。
- 存取、正規化並整合 TDX、THB、CWA、CCTV 等資料。
- 判定資料是否新鮮、過期、缺失或 partial。
- 提供 `/v2` API contract。
- 管理 route cache 與 provider snapshot 讀取。

## 3. 目前前端模組

| 檔案 | 主要責任 |
| --- | --- |
| `js/core.js` | 共用狀態、storage、DOM helper 與基礎工具 |
| `js/services.js` | Browser → Worker API boundary |
| `js/data.js` | 前端資料處理 helper |
| `js/main-ui.js` | 主要 UI 與路線搜尋／結果 orchestration |
| `js/enhancements.js` | 額外互動與跨畫面功能 |
| `js/route-conditions.js` | 交通、天氣、事件等沿線條件呈現 |
| `js/ride-tools.js` | 騎乘相關工具頁功能 |
| `js/maplibre-renderer.js` | Desktop MapLibre rendering 與圖層協調 |
| `js/desktop-dashboard.js` | Desktop command-center UI 與互動 |
| `js/map-provider-config.js` | 地圖 provider 設定 |
| `js/pwa.js` | PWA 安裝、更新、離線與 restore 行為 |
| `sw.js` | Service Worker / app shell cache |

目前部分模組仍偏大。後續重構應採「一次抽一個責任」的方式，而不是一次改寫整個前端。

## 4. Worker 模組

Worker 程式位於 `worker/src/`。核心責任分散在：

- `index.js`：HTTP/API orchestration。
- `rules.js`：道路與牌照相關規則。
- `polyline.js`：geometry/polyline 處理。
- `road-events.js`：道路事件語意與定位處理。
- `conditions.js`：沿途 conditions 組合。
- `providers.js`：上游 provider 存取與正規化。
- `provider-snapshot.js`：snapshot 讀取與 freshness handling。

涉及 Worker、牌照規則、道路 eligibility、shape index、事件匹配或 freshness 的變更，應視為高風險 domain change，不應與純 UI refactor 混在同一 PR。

## 5. 資料可信度原則

本專案採保守策略：

- `unknown` 代表無法確認，不等於道路順暢。
- 過期 observation 不應被當成即時資料。
- 缺少座標的道路事件不應被假造精確 marker。
- CCTV 只呈現官方／公開來源影像，不自行推論交通結論。
- Google Maps / Apple Maps 交接後可能重新計算路線，使用者仍需再次確認道路限制。

這些原則優先於「畫面看起來完整」。

## 6. API boundary

主要 API：

```text
POST /v2/routes
GET  /v2/routes/{routeId}/conditions
GET  /v2/cams
GET  /v2/weather
GET  /v2/geocode?q=...
GET  /v2/expand?url=...
```

前端應優先透過既有 service boundary 使用 API，不應讓 feature module 各自拼接 Worker URL 或解析原始 provider payload。

## 7. 測試與驗證

基準檢查：

```bash
npm run check
```

目前 `npm run check` 會執行：

- JavaScript syntax checks。
- JSON parse checks。
- 關鍵資產與入口引用檢查。
- 基本安全／部署 invariants。
- Vitest unit tests。

Browser regression：

```bash
npm run test:e2e
```

Live routing audit：

```bash
npm run worker:dev
npm run test:routes:live
```

Live audit 會接觸真實上游資料，適合 routing/provider 相關變更，不應成為每個純文件 PR 的必要 gate。

## 8. 重構規則

後續架構整理遵守以下原則：

1. **Extract before rewrite**：先抽離單一責任，再考慮改寫。
2. **一次一個 seam**：一個 PR 處理一個可獨立 review 的邊界。
3. **保持 behavior**：純結構 refactor 不應順便改 routing/provider semantics。
4. **Domain decision 與 rendering 分離**：例如 freshness 判斷屬 Worker/domain，不屬 renderer。
5. **避免新增 mega-global**：移除舊 global 時，不要用另一個大型 global 取代。
6. **保護最新主線修正**：重構需從最新 `main` 開始，不能回退已合併的產品修正。
7. **高風險變更另開 PR**：牌照規則、道路 eligibility、geometry、事件匹配與 provider freshness 必須獨立驗證。

## 9. 重構 Roadmap

目前正式 roadmap 追蹤於 GitHub Issue #41：

1. CI 與架構文件。
2. Desktop layout 與 MapLibre rendering seams。
3. Route presentation view-models。
4. Browser globals / `RouteMod` coupling cleanup。

舊 PR #35 僅保留作為歷史探索與測試參考，不再作為可直接合併的交付單位。

## 10. Framework policy

目前沒有必須遷移到 React、Vue 或其他 framework 的前提。

只有在出現可量化問題，例如：

- component lifecycle 已難以維護；
- state synchronization 成本明顯過高；
- 模組化原生 JavaScript 無法合理解決開發速度或測試問題；

才應評估 framework migration。架構整理本身不是換 framework 的理由。
