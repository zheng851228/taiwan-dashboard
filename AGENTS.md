# AGENTS.md — 環島路況指揮中心（taiwan-dashboard）

給 Codex、agy、Claude 等程式 agent 的工作規則。產品說明、API 與架構看 `README.md`、`docs/ARCHITECTURE.md`；指令以 `package.json` scripts 為準。

## 分工與界線

- 每個任務在**自己的 git worktree 與分支**上做，只 commit 到該分支。
- 合併、push、開 PR、部署 Worker／VM、設定 secret，都由負責協調的 Claude session 處理；agent 的任務以「commit 到分支並回報」作為完成。
- 回報用繁體中文：改了哪些檔案、做法、每項測試結果（包含沒跑的與原因）、仍有疑慮的地方。
- commit 訊息用英文 conventional commits（`fix(worker): …`、`perf(desktop): …`），結尾加上自己的 `Co-Authored-By` 行。

## 專案原則（影響程式判斷）

資料處理刻意偏保守：沒有可靠資料就顯示未知；事件沒有座標就不畫 marker；無法確認機車可行時，寧可拒絕回傳路線，不回傳可能錯誤的路線。修 bug 時只放寬到證據支持的範圍，並保留其餘檢查。

## 前端

- 原始碼在 `js/*.js`（var + IIFE 模組，透過 `window.*` 與 Bus 事件溝通，沿用這個風格）。頁面只載入 `js/dist/app.js`、`app2.js`、`desktop.js`。
- 改了 `js/` 底下任何原始檔，都要跑 `node scripts/build-js.mjs` 重建 bundle。它會把 `git rev-parse --short HEAD` 寫進 `index.html`、`sw.js` 和 bundle 的版號，所以 rebase 或改 base 之後要重建一次。`js/dist/*` 一律由它產生。
- 桌面與手機的分界是 `Config.DESKTOP_QUERY`（`js/core.js`）；桌面寬度不會建立手機版地圖（`MapMod` 延遲建立）。
- 樣式放 `css/style.css`（`:root` 與 `body.light` 的 `--c-*`、`--s-*` tokens）。綠色 `--s-clear` 只用於「順暢」路況。只有能跑 `npm run build:css` 時才加新的 Tailwind class。
- 改 UI 前先 grep `tests/e2e/` 與 `scripts/check.sh`，保留它們依賴的 id、class、`data-*` 與文字。

## Worker（`worker/`）

- Cloudflare Worker，設定在 `worker/wrangler.jsonc`，分 `staging`、`production` 兩個環境。
- 路線：`worker/src/valhalla.js` 依序嘗試自架 Valhalla（`VALHALLA_PRIMARY_URL`，VM 經 Cloudflare Tunnel）再退回公共伺服器；`worker/src/providers.js` 的 `traceRouteAttributes` 把路線對應到道路，供 `conditions.js`、`rules.js` 使用。
- 單元測試用 `vi.stubGlobal('fetch', …)` 模擬上游；不要在測試裡打真實 API。

## 驗證

1. `bash scripts/check.sh`：語法、bundle 版號一致性與 `vitest`。
2. 相關的 Playwright：`npx playwright test <spec> --project=desktop-chromium`（或 `iphone`）。
   - 本機 Worker 的連接埠只能用 `8787`（預設）或 `8790`（`E2E_WORKER_PORT=8790`），其他連接埠會被 `index.html` 的 CSP 擋下。
   - `desktop-chromium`、`android` 用系統的 Google Chrome（`channel: 'chrome'`）。
   - e2e 失敗時，先在 main 上跑同一個測試確認是否為既有失敗；新的失敗要修程式，測試只在需求本身改變時才改。
3. 寫測試先於改程式：先讓新測試失敗，再改到通過。

UI 改動的完整驗證流程（手機觸控範圍、toast 位置、配色、截圖）在 `taiwan-dashboard-ui-verify` skill；沒有這個 skill 的 agent，至少跑上面兩項並附上手機與桌面截圖。
