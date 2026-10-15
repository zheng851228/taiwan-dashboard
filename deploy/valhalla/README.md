# Valhalla 台灣路網(Cloud Run)

每週一(UTC 18:23)GitHub Actions 會下載最新的台灣 OSM 資料、建置 Valhalla 圖資、做冒煙測試,
再推到 Artifact Registry 並部署到 Cloud Run 服務 `valhalla-tw`(asia-east1,無公開存取)。

## 一次性設定
1. 在 Google Cloud Shell 執行:`bash scripts/gcp/setup-valhalla.sh`(會先確認專案)。
2. 依腳本結尾的提示,到 GitHub repo 設定:
   - Secrets:`GCP_WIF_PROVIDER`、`GCP_DEPLOY_SA`
   - Variable:`GCP_PROJECT_ID`
3. 到 Actions 手動執行 **Valhalla Taiwan image**,完成第一次部署。
4. 第一次部署後再執行一次 setup 腳本(授權 invoker 並印出服務網址),把網址設為 Worker 變數 `VALHALLA_PRIMARY_URL`。
5. 在 Mac 的 `worker` 目錄執行:
   `npx wrangler secret put GCP_SERVICE_ACCOUNT_KEY --env production < key.json`,完成後刪除金鑰檔。

## 從 VM 切換到 Cloud Run

切換由維運人員決定；以下步驟完成驗證前，保留 VM 與 Tunnel 以便回復。

1. 完成 Cloud Run `valhalla-tw`（asia-east1、無公開存取、`--min-instances 0`）第一次部署，
   再執行 setup 腳本授權 invoker。先以該 invoker 的 ID token 測試 Cloud Run `/status`、
   `/route` 與 `/trace_attributes`，確認可用後才切換 Worker。
2. 把 `worker/wrangler.jsonc` 的 **production vars** 中 `VALHALLA_PRIMARY_URL` 改為
   Cloud Run 服務網址（與 ID token 的 audience 相同）。
3. **刪除 production 的 `VALHALLA_PRIMARY_KEY` secret**。在 repo 根目錄執行：
   `npx wrangler secret delete VALHALLA_PRIMARY_KEY --config worker/wrangler.jsonc --env production`。
   只要這個 secret 存在，Worker 就會優先走 VM 的 `X-Valhalla-Key` 密鑰模式，
   不會使用 Google ID token，也不會啟動 Cloud Run 保溫。
4. 設定 production 的 `GCP_SERVICE_ACCOUNT_KEY` secret，內容為具有該服務
   `roles/run.invoker` 權限的 service account JSON。在 repo 根目錄執行：
   `npx wrangler secret put GCP_SERVICE_ACCOUNT_KEY --config worker/wrangler.jsonc --env production < key.json`，
   完成後刪除本機金鑰檔。secret 刪除／更新會影響正在服務的 Worker，請安排切換時段，
   並留意這段期間主要引擎可能退回公共伺服器。
5. 驗證程式後部署 Worker：
   `npx wrangler deploy --config worker/wrangler.jsonc --env production`。
6. 驗證 Worker 實際透過 Cloud Run 完成路線與 trace，確認 Cloud Run 請求紀錄、
   Worker fallback／warmup 警告，以及下一個 5 分鐘排程的 `/status` 請求。
   確認 snapshot 與原有健康檢查仍正常，再觀察數個排程週期。
7. 最後才到 VM 原本的 compose 目錄執行 `docker compose down`，
   移除 `/etc/cron.d/valhalla-tw`，再移除該 VM 的 Cloudflare Tunnel DNS 記錄。
   若切換驗證失敗，先保留 VM，回復舊 URL 與 VM 密鑰模式並重新部署 Worker。

Worker 每 5 分鐘以 `ctx.waitUntil` 背景呼叫主要引擎的 `GET /status`，
重用 Google ID token 認證與快取。只有設定主要 URL、未設定 VM 密鑰且提供 GCP 金鑰時才執行；
VM 模式不送保溫請求。`/status` 請求逾時為 10 秒，token 交換沿用認證模組的 8 秒逾時。
失敗只記錄警告，不寫 KV，也不改變路線 circuit breaker（斷路器）；
成功亦不清除 breaker，因為 `/status` 成功不代表路線查詢已恢復。

保溫是盡力而為，無法保證不會冷啟動。冷啟動或其他錯誤使主要引擎超過目前
15 秒路線逾時時，Worker 仍會退回公共伺服器；請同時確認路線與 trace 使用的引擎。

## 備註
- 沒有設定 `GCP_PROJECT_ID` 時,workflow 只建置與測試,不會推送或部署;PR 也一樣。
- 只保留最新 2 個映像,以維持在 Artifact Registry 免費額度內。
- 另有 `health-check.yml` 每小時檢查 API 與網站,異常時會寄信,並在設有 `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 時發 Telegram 通知。

## Telegram 通知(Worker 與外部健康檢查共用同一個機器人)
1. 在 Telegram 找 @BotFather,傳 `/newbot` 建立機器人,取得 token;再對你的機器人傳任意一句話。
2. 在瀏覽器開 `https://api.telegram.org/bot<token>/getUpdates`,找到 `"chat":{"id":...}` 的數字,就是 chat id。
3. Worker(在 Mac 的 `worker` 目錄):
   `npx wrangler secret put TELEGRAM_BOT_TOKEN --env production`、
   `npx wrangler secret put TELEGRAM_CHAT_ID --env production`
4. GitHub repo > Settings > Secrets and variables > Actions:新增同名的兩個 secrets(給外部健康檢查用)。

Worker 每 5 分鐘檢查路況/天氣/攝影機資料源,每小時實測一次路線引擎與地址搜尋;
同一項連續失敗 2 次才通知一次,恢復時再通知一次。沒設定 Telegram 時不會發送,其餘照常運作。

## Worker 相關設定一覽
| 名稱 | 類型 | 用途 |
|---|---|---|
| `VALHALLA_PRIMARY_URL` | 變數 | Cloud Run 服務網址;未設定時只用公開的 FOSSGIS 伺服器 |
| `VALHALLA_BASE_URL` | 變數 | 公開備援(預設 FOSSGIS),永遠保留 |
| `VALHALLA_PRIMARY_KEY` | secret | 自架 VM（Cloudflare Tunnel）用的共用密鑰；有設定時優先於 GCP 金鑰，見 ../valhalla-vm/ |
| `GCP_SERVICE_ACCOUNT_KEY` | secret | 呼叫 Cloud Run 用的 invoker 金鑰(JSON) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | secret | 異常通知 |
| `NOMINATIM_RATE_LIMITER` | 綁定 | 全站每分鐘最多 50 次 Nominatim 查詢,超過時改用 Photon |
