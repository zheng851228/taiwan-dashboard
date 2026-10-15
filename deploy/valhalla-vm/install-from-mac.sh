#!/usr/bin/env bash
# Run on the owner's Mac (gcloud + wrangler already signed in):
#   cd ~/Projects/taiwan-dashboard && git fetch -q origin feat/resilience-monitoring \
#     && bash <(git show origin/feat/resilience-monitoring:deploy/valhalla-vm/install-from-mac.sh)
# It asks before every step.  The shared key is generated here and never printed.
set -euo pipefail

BRANCH="${BRANCH:-feat/resilience-monitoring}"
HOST="${VALHALLA_HOSTNAME:-valhalla.caotaapps.com}"
REPO_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

ask() { read -r -p "$1 [y/N] " a; case "$a" in y|Y|yes|YES) return 0 ;; *) echo "已略過"; return 1 ;; esac; }
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

command -v gcloud >/dev/null || { echo "找不到 gcloud" >&2; exit 1; }
[ -d "$REPO_DIR/worker" ] || { echo "請在 taiwan-dashboard 專案資料夾裡執行" >&2; exit 1; }

step "1. 找 VM"
gcloud compute instances list --format='table(name,zone.basename(),status,machineType.basename())'
RUNNING="$(gcloud compute instances list --filter='status=RUNNING' --format='value(name,zone.basename())')"
if [ -n "$RUNNING" ] && [ "$(printf '%s\n' "$RUNNING" | wc -l | tr -d ' ')" = 1 ]; then
  read -r VM ZONE <<<"$RUNNING"   # macOS ships bash 3.2: no mapfile
else
  read -r -p "VM 名稱: " VM
  read -r -p "區域 (zone): " ZONE
fi
echo "使用 VM: $VM ($ZONE)"
ask "確認要在這台 VM 上安裝 Valhalla（會與遊戲伺服器共用，限制 1.5 核 / 3GB）？" || exit 1

step "2. 產生密鑰並存進 Worker（production）"
KEY="$(openssl rand -hex 32)"
if ask "把密鑰存成 Worker secret VALHALLA_PRIMARY_KEY？"; then
  (cd "$REPO_DIR/worker" && printf '%s' "$KEY" | npx wrangler secret put VALHALLA_PRIMARY_KEY --env production)
fi

step "3. 在 VM 上安裝（Docker、下載程式、建置台灣路網約 10-20 分鐘）"
if ask "開始安裝？"; then
  gcloud compute ssh "$VM" --zone "$ZONE" --command "sudo bash -s" <<REMOTE
set -euo pipefail
command -v git >/dev/null || (apt-get update -qq && apt-get install -y -qq git)
if [ -d /opt/valhalla/repo/.git ]; then
  git -C /opt/valhalla/repo fetch -q --depth 1 origin $BRANCH && git -C /opt/valhalla/repo checkout -q -B $BRANCH FETCH_HEAD
else
  mkdir -p /opt/valhalla && git clone -q --depth 1 -b $BRANCH https://github.com/zheng851228/taiwan-dashboard /opt/valhalla/repo
fi
VALHALLA_KEY='$KEY' bash /opt/valhalla/repo/deploy/valhalla-vm/setup.sh
REMOTE
fi

step "4. 建立 Cloudflare Tunnel（$HOST）"
echo "等一下會出現一個 https://dash.cloudflare.com/... 的網址：按住 Command 點開，登入 Cloudflare，選 caotaapps.com 按 Authorize。"
if ask "開始？"; then
  gcloud compute ssh "$VM" --zone "$ZONE" -- -t "sudo /opt/valhalla/tunnel.sh $HOST"
fi

step "5. 測試"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$HOST/route" -H 'Content-Type: application/json' -d '{}' || true)"
echo "沒帶密鑰：HTTP $code（應該是 403）"
ok="$(curl -s -X POST "https://$HOST/route" -H 'Content-Type: application/json' -H "X-Valhalla-Key: $KEY" \
  -d '{"locations":[{"lat":25.0478,"lon":121.5170},{"lat":25.0340,"lon":121.5645}],"costing":"motor_scooter"}' \
  | grep -o '"length":[0-9.]*' | head -1 || true)"
echo "帶密鑰：${ok:-失敗}（應該看到 \"length\":4 左右，單位公里）"
unset KEY
echo
echo "完成。Worker 要在 PR 合併、部署後才會開始用這台（VALHALLA_PRIMARY_URL 會一起設定）。"
