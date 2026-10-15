# Valhalla 台灣路網（共用 VM + Cloudflare Tunnel）

測試期間用現有的 GCP VM（與遊戲伺服器共用）。之後要換成 Cloud Run 時，只要把 Worker 的
`VALHALLA_PRIMARY_URL` 改成 Cloud Run 網址、刪掉 `VALHALLA_PRIMARY_KEY`，程式不用改（見 ../valhalla/README.md）。

- `valhalla`：路線引擎，最多 1.5 核、2GB 記憶體，只在內部網路。
- `gate`（Caddy）：沒有正確 `X-Valhalla-Key` 標頭的請求一律 403。
- `cloudflared`：往外連到 Cloudflare 的 Tunnel，VM 不用開任何埠；網址 `valhalla.caotaapps.com`。
- 每週二 04:30（台灣時間）自動下載最新圖資重建；新映像先在旁邊測試通過才切換，失敗就保留舊的。
  建置時限制 2 核、3GB；記憶體不夠時建置失敗、舊的照常服務，不會擠到遊戲。紀錄在 `/var/log/valhalla-build.log`。

## 安裝（在 VM 上，root）
```bash
git clone --depth 1 https://github.com/zheng851228/taiwan-dashboard /opt/valhalla/repo
VALHALLA_KEY=<密鑰> bash /opt/valhalla/repo/deploy/valhalla-vm/setup.sh
/opt/valhalla/tunnel.sh valhalla.caotaapps.com     # 第一次會給一個網址，登入 Cloudflare 授權
```
Worker：`VALHALLA_PRIMARY_URL=https://valhalla.caotaapps.com`（變數）、`VALHALLA_PRIMARY_KEY`（secret，同一把密鑰）。

## 常用
- 狀態：`cd /opt/valhalla && docker compose ps`
- 手動重建：`sudo /opt/valhalla/build-tiles.sh`
- 停用（Worker 會自動退回公開伺服器）：`cd /opt/valhalla && docker compose down`
