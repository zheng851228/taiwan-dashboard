# Agent lessons（錯誤紀錄）

Codex、agy、Claude 在這個 repo 被糾正或審查抓到的錯誤。每條寫成：**錯在哪 → 為什麼錯 → 下次怎麼做**。「下次怎麼做」是規則，接到相關任務時照做。

新增規則：被糾正後，由犯錯的 agent（或協調的 Claude 代筆）在對應段落加一條，跟修正放在同一個 PR。已經寫進 `AGENTS.md` 的規則不重複寫在這裡。

## 放寬安全檢查

- **2026-10-16 · Claude · PR #92**：容許路線結尾小段沒被涵蓋時，測試只用單一道路。結果漏了兩個問題：多條道路結尾位置相同時延長到錯的那條、路線短於容許長度時一段都沒比對到也放行（agy 審查抓到）。原因是只測了觸發 bug 的那個情況。→ 放寬任何檢查時，測試至少包含：多個元素結尾平手、最短輸入（2 個點）、完全沒有比對到。

## 線上切換與部署文件

- **2026-10-16 · Codex · PR #95**：VM 切換到 Cloud Run 的步驟把 `wrangler secret delete` 排在 `deploy` 前面，照做會讓正式版的主要引擎失效好幾分鐘（agy 審查抓到）。原因是以為 secret 要等下次 deploy 才生效；實際上 `wrangler secret put/delete` 會立刻建立並部署新版本。→ 寫線上切換步驟時，每一步都註明「執行後線上是什麼狀態」；先加上新的憑證，移除舊的永遠是最後一步，而且緊接著部署。附上完整的回滾指令與舊密鑰的備份位置。

## GCP 腳本

- **2026-10-16 · `scripts/gcp/setup-valhalla.sh`**：預算寫死 `1USD`，帳單帳戶是新台幣計價，建立失敗；服務帳戶金鑰被組織政策 `iam.disableServiceAccountKeyCreation` 擋下，Worker 呼叫 Cloud Run 的整套設計因此卡住。原因是假設專案不屬於任何組織、帳單用美元。→ 預算金額用 `gcloud billing accounts describe --format='value(currencyCode)'` 的幣別；要從 GCP 外部呼叫 GCP 時，優先用 Workload Identity Federation，先查專案有沒有隸屬組織（`gcloud projects describe` 的 parent），再決定能不能用服務帳戶金鑰。

## 每週自查

每週一由排程 agent 對照本檔與 `AGENTS.md`，檢查過去 7 天合併的 PR 有沒有違反任何一條，結果寫進 Notion「Taiwan Dashboard 進度追蹤」，每條附上證據連結，方便使用者抽查。發現新的錯誤時，提議新增一條。
