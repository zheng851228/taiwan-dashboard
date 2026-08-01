# Taiwan Dashboard Developer Changelog

This repository-only log records user-facing changes, verification evidence, and release caveats. It is intentionally not linked from the App UI or cached by the Service Worker.

## 2026-08-02 — PWA v37 desktop bottom alignment

- 桌面指揮台移除底列多餘留白，讓圖例、沿途時間軸與 CCTV 面板共享同一底線。
- 桌面時間軸不再繼承手機版進場位移動畫，避免 ready 狀態初現時短暫超出主畫面；手機動畫保持不變。
- Service Worker 清除 v36 shell；不改 Worker endpoint、路線 schema、路況語意或 production routing。

## 2026-08-01 — PWA v36 diagnostic boundary

- CCTV 回傳 0 時只保留 console／開發者診斷紀錄與一般提醒，不再自動把診斷面板疊在 App 主畫面；仍可用時鐘三擊手動開啟。
- Service Worker 清除 v35 shell；不改 Worker endpoint、路線 schema 或 production routing。

## 2026-08-01 — PWA v35 mobile shell boundary

- Mobile Safari／Android 不再載入 MapLibre renderer 或桌面指揮台模組；只有 ≥1200px 桌面視窗才動態請求，失敗時回退 Leaflet 傳統地圖。
- Service Worker 清除 v34 shell，保留桌面首次使用後的動態快取；不改 Worker endpoint、路線 schema 或 production routing。

## 2026-08-01 — PWA v34 3D camera and home navigation

- 桌面 3D 地圖新增鳥瞰、立體、沿路、重置視角，保留原生羅盤、縮放與自由旋轉；DEM／WebGL fallback 時自動停用視角選單。
- Logo 改為語意化「返回規劃主畫面」按鈕，保留目前 routeId、conditions、收藏與最近路線，只關閉浮層並重新聚焦全線。
- UI／Service Worker cache version 升至 PWA v34；開發紀錄不會載入或顯示在 App 介面。

## 2026-08-01 — PWA v33 security boundaries

- Worker 加入 allowlisted CORS、rate limiting、32 KiB JSON body cap、UUID 與 HTTPS 地圖網址驗證。
- staging／production environment 明確綁定兩個 rate-limit namespace，避免 Wrangler environment 不繼承頂層 binding。
- GitHub Pages 加入 page-level CSP，MapLibre 使用同源 vendored worker；外部影像與 YouTube embed 使用 no-referrer／sandbox。
- UI／Service Worker cache version 升至 PWA v33；開發紀錄不會載入或顯示在 App 介面。

## 2026-07-30 — PWA v27 terrain tile bounds

- 限制 Mapterhorn DEM／hillshade source 到台灣、金門、馬祖與澎湖涵蓋範圍，避免向周邊海域與日本圖磚發出已知不存在的請求。
- 保留 terrain unavailable 時的 2D fallback；不修改 Worker、路線 API 或海拔估算契約。
- UI／Service Worker cache version 升至 PWA v27；更新不會出現在 App 內容中。

## 2026-07-30 — PWA v26 contrast refresh

### Changed

- Refreshed the service-worker shell and stylesheet URL so installed PWAs receive the latest contrast fixes without reinstalling.
- Increased dark-surface secondary, muted, subtle, and faint text colors and applied the ladder to route, condition, mobile summary, desktop rail, CCTV, and map attribution labels.

### Scope

- Frontend cache and text contrast only; no Worker, API, KV, secret, route rule, or endpoint change.

## 2026-07-30 — Desktop vehicle selector and palette cleanup

### Changed

- Desktop now has one vehicle selector in the header; the duplicate route-form motorcycle selector is hidden only at desktop widths and remains available on mobile.
- Shortened desktop labels to 白牌／黃牌／紅牌／汽車 and aligned dark surfaces, controls, borders, active states, and primary route actions to one navy/green palette.

### Scope

- Frontend layout, copy, and CSS only; route selection still calls the existing `RouteMod.setVehicle()` path and Worker/API contracts are unchanged.

## 2026-07-30 — Conditions timeout fallback

### Changed

- Added a 20-second client timeout for route conditions requests.
- A stalled upstream now exits loading state with a clear retryable error and does not present stale conditions as current data.

### Verification

- Added an iPhone E2E covering the hanging-request timeout path.
- Worker endpoint, route schema, cache, secrets and production routing unchanged.

## 2026-07-30 — Desktop contrast pass

### Changed

- Raised the dark-theme secondary text ladder for route summaries, safety notes, coverage metrics, map attribution, condition timeline metadata, CCTV details and playback controls.
- Kept light-theme colors, mobile layout, route semantics and color-plus-icon event cues unchanged.

### Verification

- `git diff --check` — passed.
- `npm run check` — 146/146 passed.
- Desktop command-center E2E — 4 passed; mobile/tablet MapLibre isolation — 4 passed.
- Playwright visual check at 1536×1024 — ready state, route panels and timeline remained readable with no layout overflow.

### Scope

- CSS text contrast and developer changelog only; no Worker, API, KV, secret, route rule or endpoint change.

## 2026-07-30 — CARTO raster URL follow-up

### Changed

- Removed the unsupported `{r}` placeholder from the desktop CARTO raster tile URLs so MapLibre requests concrete `.png` tiles.

### Verification

- `npm run check` — 146/146 passed.
- Desktop command-center E2E — 4 passed; mobile/tablet MapLibre isolation — 4 passed.
- Local production-Worker smoke — desktop 1536×1024 and iPhone 390×844 reached `ready`, resolved the route, and had 0px horizontal overflow.
- Public production route audit `north-keelung-taipei` — 0 fail, 1 known data-coverage warning (25% live traffic coverage).

### Scope

- Frontend MapLibre tile URL only; no Worker, API, KV, secret, or routing change.

## 2026-07-30 — PWA v25

### Changed

- Added the desktop command-center layout at 1200px and above while preserving the mobile and tablet navigation flow.
- Added local MapLibre GL JS rendering with a 2D/3D terrain switch, Mapterhorn DEM and an automatic Leaflet fallback when WebGL or terrain is unavailable.
- Split traffic, construction, accident, control, weather and unknown-data semantics into distinct map layers and context panels.
- Added client-only terrain elevation sampling, approximate slope summary, route playback controls, and a clearly labelled simulated cursor.
- Kept all route, conditions, navigation handoff, Worker endpoints, API schemas and secrets unchanged.

### Verification

- Pending final browser visual comparison at 1536×1024, 1440×900 and 1280×800.
- Pending final mobile regression and public GitHub Pages smoke after the two focused PRs are reviewed.

### Scope

- Frontend, vendored map assets, PWA shell and developer-only documentation.
- No Worker deployment, production routing, API schema or credential change.

## 2026-07-29 — PWA v23

### Changed

- Made the completed-route view map-first on phone-sized screens.
- Automatically collapsed the route conditions timeline after a successful mobile route load; users can still expand it for full details.
- Removed the duplicate travel status card, completion message, and completion banner from the mobile ready state.
- Removed the redundant post-route loading toast that obscured the lower map after results were already available.
- Reduced the completed-route chip and collapsed conditions panel footprint.
- Renamed the ready-state route action from `輸入起終點` to `調整`.

### Verification

- Passed: `npm run check` — 146/146 tests.
- Passed: `npm run test:e2e` — 77 passed, 59 skipped.
- Passed: 360×778 Chrome mobile visual check — no horizontal overflow; completed-route chip 44px; collapsed conditions chip 50px.
- Passed: GitHub Pages run `30468414085`; public PWA cache is `twdash-shell-v23` and the App shell reloads offline.
- Passed: public 390×844 representative route smoke — `validation=safe`, `dataMode=live`, matching route IDs, 9 condition sections, 0px horizontal overflow, and conservative `未回報` event semantics.

### Scope

- Frontend and PWA shell only.
- No Worker endpoint, API schema, route rule, secret, or production Worker change.

## 2026-07-29 — PWA v22

- Added local display preferences for the top clock and completed-route banner.
- Added direct dismiss controls and restore controls under `工具 → 畫面顯示`.
- PR: [#10](https://github.com/zheng851228/taiwan-dashboard/pull/10)

## 2026-07-29 — PWA v21

- Deferred the iPhone install prompt until the first non-fixture live safe route succeeds.
- Kept the manual installation entry available under Tools.
- PR: [#9](https://github.com/zheng851228/taiwan-dashboard/pull/9)

## 2026-07-29 — PWA v20

- Added `empty / analyzing / ready` route UI states.
- Focused the first mobile screen on route planning and map visibility.
- Added actionable empty states in Tools.
- PR: [#8](https://github.com/zheng851228/taiwan-dashboard/pull/8)
## 2026-07-30 — PWA v28 desktop command-center fidelity
- 以最新桌面指揮台參考圖整理 ready 狀態：左側固定呈現路線輸入、安全驗證、圖例與資料來源，中央保留 3D 地圖，右側與下方呈現路段、CCTV、時間軸及海拔資訊。
- 1280px 桌面視窗縮窄左右資訊 rail 與頂端 header，維持地圖主視覺與無橫向溢出；手機版、Worker、路線 API 與條件 schema 不變。
- UI／Service Worker cache version 升至 PWA v28；開發紀錄不會載入或顯示在 App 介面。
## 2026-07-30 — PWA v29 Traditional Chinese map labels
- 改用 CARTO `dark_nolabels`／`light_nolabels` 底圖，避免把英文地名烘焙在圖磚中。
- 由前端以共用繁中地名資料渲染 Leaflet 與 MapLibre 標籤，桌面 3D、桌面 2D、手機與傳統地圖維持一致；不修改 Worker、路線 API 或事件語意。
- UI／Service Worker cache version 升至 PWA v29；開發紀錄不會載入或顯示在 App 介面。

## 2026-07-30 — PWA v30 light-theme contrast
- 提高亮色主題的正文、次要標籤、輸入提示、桌面指揮台面板、地圖工具與繁中地名標籤對比，讓文字與背景保持清楚分級。
- 不修改 Worker、路線 API、地圖資料、事件語意或公開 schema；深色主題維持原有視覺。
- UI／Service Worker cache version 升至 PWA v30；開發紀錄不會載入或顯示在 App 介面。

## 2026-07-30 — PWA v31 desktop map controls and density
- 修正從傳統地圖切回 2D／3D 時未重新建立桌面 MapLibre renderer 的問題；2D／3D 控制會恢復對應地圖模式，MapLibre 失敗仍保留傳統地圖 fallback。
- 桌面 ready 狀態收斂下方時間軸高度，將可用垂直空間還給中央地圖；手機版、Worker、路線 API 與條件 schema 不變。
- UI／Service Worker cache version 升至 PWA v31；開發紀錄不會載入或顯示在 App 介面。

## 2026-07-30 — PWA v32 desktop disclaimer space
- 桌面警示話語改為不佔版面的固定小提示，主畫面高度直接交給地圖與沿途時間軸；手機版維持原有行為。
- 保留「僅供參考、非導航用途」安全提醒，但不再建立下方固定 footer 空間；Worker、路線 API 與 conditions schema 不變。
- UI／Service Worker cache version 升至 PWA v32；開發紀錄不會載入或顯示在 App 介面。
