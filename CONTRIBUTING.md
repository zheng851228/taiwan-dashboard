# 貢獻指南 / Contributing

歡迎回報問題與提出小而單一的 PR。開始修改前請閱讀 [AGENTS.md](AGENTS.md)、[過往錯誤紀錄](docs/agent-lessons.md) 與 [系統架構](docs/ARCHITECTURE.md)。功能與資料限制見 [README](README.md)。

## 本機啟動

需要 Node.js 20+、npm 與 Python 3；CI 使用 Node.js 22。從 repository 根目錄執行：

```bash
npm ci
npm start
```

開啟 <http://127.0.0.1:4173/>。預設連到 production Worker。

開發 UI 或使用示範資料時，在另一個終端啟動 fixture Worker：

```bash
npm run worker:dev:fixture
```

前端改開 <http://127.0.0.1:4173/?worker=http://127.0.0.1:8787>。畫面會標示 DEMO，資料不可視為真實路況。只啟動靜態伺服器、不重建 CSS 可用 `npm run dev`。

## 修改與驗證

- 前端沿用 `var` + IIFE、`window.*` 與 Bus 事件的既有風格。
- 修改 `js/` 原始檔後，執行 `node scripts/build-js.mjs`，一起提交產生的 bundle 與版號變更；不要手改 `js/dist/*`。rebase 或更換 base 後須再次重建。
- 行為變更先寫會失敗的測試，再修改程式。Worker 單元測試以 `vi.stubGlobal('fetch', …)` 模擬上游，不打真實 API。
- 資料不可靠就顯示未知；不能確認機車通行資格時，不放寬限制來讓結果看似完整。

提交前執行：

```bash
bash scripts/check.sh
```

有關聯的瀏覽器回歸測試，例如：

```bash
npx playwright test tests/e2e/desktop-layout.spec.js --project=desktop-chromium
npx playwright test tests/e2e/dashboard.spec.js --project=iphone
```

完整瀏覽器測試：

```bash
npm run test:e2e
```

Playwright 設定會啟動 fixture Worker 與靜態伺服器。桌面／Android 使用系統 Google Chrome，iPhone／小平板使用 WebKit；必要時依 CI 的方式安裝：

```bash
npx playwright install --with-deps chrome webkit
```

本機 Worker 使用 `8787`，或設定 `E2E_WORKER_PORT=8790` 執行 Playwright；其他連接埠會被 CSP 擋下。E2E 失敗時，先在 main 跑相同測試辨別既有問題；只有需求改變時才調整測試預期。UI 變更請附桌面與手機截圖。純文件修改不需重建 JS bundle。

## PR 與問題回報

每個任務使用獨立分支／worktree；PR 聚焦單一問題，避免把道路規則、資料處理與 UI 重構混在一起。說明改動原因、驗證結果、未執行的檢查與原因。Commit 使用英文 conventional commits；agent 請遵守 AGENTS.md 的協作與署名規則。

使用 [Bug 回報](https://github.com/zheng851228/taiwan-dashboard/issues/new?template=bug_report.yml) 或 [功能提案](https://github.com/zheng851228/taiwan-dashboard/issues/new?template=feature_request.yml)。請勿提交 API 金鑰、Token、Cookie、私人位置或未遮蔽的敏感截圖。安全問題依 [SECURITY.md](SECURITY.md) 私下回報。

English summary: Keep PRs small and focused. Run `npm ci`, then `npm start` for local development; use the fixture Worker for demo data. Rebuild bundles with `node scripts/build-js.mjs` after changing JS sources. Run `bash scripts/check.sh` and relevant Playwright tests, report any checks you could not run, and never publish secrets. Report vulnerabilities privately as described in SECURITY.md.
