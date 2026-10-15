# Valhalla 台灣路網(Cloud Run)

每週一(UTC 18:23)GitHub Actions 會下載最新的台灣 OSM 資料、建置 Valhalla 圖資、做冒煙測試,
再推到 Artifact Registry 並部署到 Cloud Run 服務 `valhalla-tw`(asia-east1,無公開存取)。

以下本機指令皆以 repo 根目錄為工作目錄；Google Cloud Shell 需先取得 repo。

## 一次性設定
1. 在 Google Cloud Shell 執行:`bash scripts/gcp/setup-valhalla.sh`(會先確認專案)。
2. 依腳本結尾的提示,到 GitHub repo 設定:
   - Secrets:`GCP_WIF_PROVIDER`、`GCP_DEPLOY_SA`
   - Variable:`GCP_PROJECT_ID`
3. 到 Actions 手動執行 **Valhalla Taiwan image**,完成第一次部署。
4. 第一次部署後再執行一次 setup 腳本(授權 invoker 並印出服務網址),把網址設為 Worker 變數 `VALHALLA_PRIMARY_URL`。
5. 在 Mac 的 repo 根目錄執行:
   `npx wrangler secret put GCP_SERVICE_ACCOUNT_KEY --config worker/wrangler.jsonc --env production < key.json`,完成後刪除金鑰檔。
   若目前使用 VM，請依下節順序切換，不要提前部署 Cloud Run URL。

## 從 VM 切換到 Cloud Run

切換由維運人員決定；以下步驟完成驗證前，保留 VM 與 Tunnel 以便回復。
`wrangler secret put/delete` 會立即建立並部署新版本，不能當成等到下次 deploy 才生效的設定。
參考 [Cloudflare secrets 文件](https://developers.cloudflare.com/workers/configuration/secrets/)。

1. 完成 Cloud Run `valhalla-tw`（asia-east1、無公開存取、`--min-instances 0`）第一次部署，
   再執行 setup 腳本授權 invoker。
2. **先設定 production 的 `GCP_SERVICE_ACCOUNT_KEY` secret**，內容為具有該服務
   `roles/run.invoker` 權限的 service account JSON：
   ```sh
   npx wrangler secret put GCP_SERVICE_ACCOUNT_KEY --config worker/wrangler.jsonc --env production < key.json
   ```
   完成後刪除本機 GCP 金鑰檔。此時保留原本已部署的 VM URL 與 `VALHALLA_PRIMARY_KEY`，
   Worker 仍優先走 VM 的 `X-Valhalla-Key` 密鑰模式，預先放入 GCP 金鑰不影響 VM 路線請求。
3. 把本機 `worker/wrangler.jsonc` 的 **production vars** 中 `VALHALLA_PRIMARY_URL` 改為
   Cloud Run 服務網址（與 ID token 的 audience 相同），此時先不要部署。
   在切換前完成所有本機驗證：執行 `bash scripts/check.sh`，並以該 invoker 的 ID token
   直接測試 Cloud Run `/status`、`/route` 與 `/trace_attributes`，確認可用。
4. **刪除 VM 密鑰前，確認能回滾**：Mac 上的 `~/.config/taiwan-dashboard/valhalla-key`
   必須保有原本 VM 密鑰且權限為 `0600`；VM 的 `/opt/valhalla/.env` 也有該密鑰。
   保留原本 VM URL 的紀錄，不要把密鑰印出或寫入 repo。
5. 驗證全數完成、部署指令就緒後，**刪除 production 的 VM 密鑰並立刻部署新 URL**：
   ```sh
   npx wrangler secret delete VALHALLA_PRIMARY_KEY --config worker/wrangler.jsonc --env production &&
     npx wrangler deploy --config worker/wrangler.jsonc --env production
   ```
   兩個操作不是原子切換；連續執行以把空窗縮到數秒，實際時間仍取決於部署速度。
   空窗內路線會退回公共伺服器，可能較慢，並非路線服務中斷。
   若只刪密鑰卻沒部署新 URL，線上的 Worker 仍指向 VM，會拿 Google ID token 打 VM，
   VM 回 403 後 primary breaker（主要引擎斷路器）會開啟並退回公共伺服器。
   部署失敗時應立即依下方步驟回滾，避免長時間停留在此狀態。
6. 驗證 Worker 實際透過 Cloud Run 完成路線與 trace，確認 Cloud Run 請求紀錄、
   Worker fallback／warmup 警告，以及下一個 5 分鐘排程的 `/status` 請求。
   確認 snapshot 與原有健康檢查仍正常，再觀察數個排程週期。
7. 最後才到 VM 原本的 compose 目錄執行 `docker compose down`，
   移除 `/etc/cron.d/valhalla-tw`，再移除該 VM 的 Cloudflare Tunnel DNS 記錄。

### 切換失敗時回滾到 VM

以下回滾以 VM、原本 compose 服務與 Tunnel DNS 仍保留為前提。
先把本機 `worker/wrangler.jsonc` 的 production `VALHALLA_PRIMARY_URL` 還原為原本 VM 的
Cloudflare Tunnel URL，再於 repo 根目錄連續執行：

```sh
npx wrangler secret put VALHALLA_PRIMARY_KEY --config worker/wrangler.jsonc --env production < ~/.config/taiwan-dashboard/valhalla-key &&
  npx wrangler deploy --config worker/wrangler.jsonc --env production
```

`secret put` 也會立即生效；若線上 URL 已是 Cloud Run，重新 deploy 前會短暫改用 VM 密鑰
呼叫 Cloud Run 而退回公共伺服器。部署完成後驗證 VM 的路線與 trace 恢復。
`GCP_SERVICE_ACCOUNT_KEY` 可保留，有 VM 密鑰時不會使用它。

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
3. Worker(在 Mac 的 repo 根目錄):
   `npx wrangler secret put TELEGRAM_BOT_TOKEN --config worker/wrangler.jsonc --env production`、
   `npx wrangler secret put TELEGRAM_CHAT_ID --config worker/wrangler.jsonc --env production`
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
