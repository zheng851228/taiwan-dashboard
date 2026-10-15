#!/usr/bin/env bash
# One-time setup on the VM (Debian/Ubuntu).  Run as root:
#   VALHALLA_KEY=<secret> bash setup.sh
# - installs Docker if missing
# - copies the compose files to /opt/valhalla and stores the key in /opt/valhalla/.env (0600)
# - builds the first Taiwan image and starts valhalla + gate (the tunnel is set up by tunnel.sh)
# - weekly rebuild by cron: Tuesday 04:30 Taipei time (Monday 20:30 UTC)
set -euo pipefail

BASE=/opt/valhalla
SRC="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" = 0 ] || { echo "請用 sudo 執行" >&2; exit 1; }
[ -n "${VALHALLA_KEY:-}" ] || { echo "缺少 VALHALLA_KEY" >&2; exit 1; }

if ! command -v docker >/dev/null 2>&1; then
  echo "== 安裝 Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null

echo "== 安裝檔案到 $BASE"
mkdir -p "$BASE/cloudflared"
install -m 0644 "$SRC/docker-compose.yml" "$BASE/docker-compose.yml"
install -m 0644 "$SRC/Caddyfile" "$BASE/Caddyfile"
install -m 0644 "$SRC/cloudflared-config.yml.template" "$BASE/cloudflared-config.yml.template"
install -m 0755 "$SRC/build-tiles.sh" "$BASE/build-tiles.sh"
install -m 0755 "$SRC/tunnel.sh" "$BASE/tunnel.sh"
umask 077
printf 'VALHALLA_KEY=%s\nVALHALLA_MEM=%s\nBUILD_MEM=%s\n' "$VALHALLA_KEY" "${VALHALLA_MEM:-2g}" "${BUILD_MEM:-3g}" > "$BASE/.env"
chmod 600 "$BASE/.env"
umask 022

echo "== 第一次建置台灣路網（約 10-20 分鐘）"
"$BASE/build-tiles.sh"

echo "== 啟動 valhalla 與密鑰閘門"
(cd "$BASE" && docker compose up -d valhalla gate)

echo "== 每週自動更新（週二 04:30 台灣時間）"
cat > /etc/cron.d/valhalla-tw <<CRON
# rebuild the Taiwan Valhalla image weekly; log to /var/log/valhalla-build.log
30 20 * * 1 root cd $BASE/repo && git pull -q --ff-only || true; $BASE/build-tiles.sh >> /var/log/valhalla-build.log 2>&1
CRON
chmod 644 /etc/cron.d/valhalla-tw

echo "完成。接下來執行 sudo $BASE/tunnel.sh <hostname> 建立 Cloudflare Tunnel。"
