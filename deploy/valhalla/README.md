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
