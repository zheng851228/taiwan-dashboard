#!/usr/bin/env bash
# Run on the owner's Mac (gcloud + wrangler already signed in):
#   cd ~/Projects/taiwan-dashboard && git switch main && git pull --ff-only \
#     && bash deploy/valhalla-vm/install-from-mac.sh
# It installs on the single RUNNING VM of the current gcloud project (or asks which one), so
# point gcloud at the right account/project first when moving to a new VM.
# It asks before every step.  The shared key is generated here and never printed.
set -euo pipefail

BRANCH="${BRANCH:-main}"
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

step "1b. 讀取 VM 記憶體與 Minecraft（java）設定"
# prints: TOTAL_MB AVAILABLE_MB JAVA_XMX_MB(0 if none) JAVA_RSS_MB(0 if none)
# (a function, not a heredoc inside $(...): macOS bash 3.2 mis-parses `case ... )` there)
probe_memory() {
gcloud compute ssh "$VM" --zone "$ZONE" --command 'bash -s' <<'PROBE'
total=$(awk '/^MemTotal:/{print int($2/1024)}' /proc/meminfo)
avail=$(awk '/^MemAvailable:/{print int($2/1024)}' /proc/meminfo)
xmx=0; rss=0
for pid in $(pgrep -f java || true); do
  args=$(sudo tr '\0' '\n' < /proc/$pid/cmdline 2>/dev/null)
  # NeoForge / Forge servers keep JVM flags in @argument files (user_jvm_args.txt) in their cwd
  for f in $(printf '%s\n' "$args" | sed -n 's/^@//p'); do
    case "$f" in /*) path="$f" ;; *) path="/proc/$pid/cwd/$f" ;; esac
    args="$args
$(sudo cat "$path" 2>/dev/null | tr ' ' '\n')"
  done
  arg=$(printf '%s\n' "$args" | grep -E '^-Xmx[0-9]+[gGmMkK]?$' | tail -1)
  if [ -n "$arg" ]; then
    v=${arg#-Xmx}; n=${v%[gGmMkK]}; u=${v#$n}
    case "$u" in g|G) n=$((n*1024));; k|K) n=$((n/1024));; m|M|'') ;; esac
    [ "$n" -gt "$xmx" ] && xmx=$n
  fi
  r=$(awk '/^VmRSS:/{print int($2/1024)}' /proc/$pid/status 2>/dev/null || echo 0); rss=$((rss + ${r:-0}))
done
echo "前 5 個最吃記憶體的程式（MB / 名稱）：" >&2
ps -eo rss=,comm=,args= --sort=-rss 2>/dev/null | head -5 | awk '{printf "  %6d MB  %s  %s\n", $1/1024, $2, substr($0, index($0,$3), 70)}' >&2
if command -v docker >/dev/null 2>&1; then
  echo "Docker 容器：" >&2
  sudo docker ps --format '  {{.Names}}  {{.Image}}  {{.Status}}' 2>/dev/null >&2 || true
fi
installed=0
sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^valhalla-valhalla-1$' && [ -s /opt/valhalla/.env ] && installed=1
echo "$total $avail $xmx $rss $installed"
PROBE
}
MEM="$(probe_memory)"
read -r TOTAL_MB AVAIL_MB XMX_MB JAVA_RSS_MB INSTALLED <<<"$(printf '%s\n' "$MEM" | tail -1)"
echo "VM 記憶體：總共 ${TOTAL_MB} MB，目前可用 ${AVAIL_MB} MB"
if [ "${XMX_MB:-0}" -gt 0 ]; then
  echo "Minecraft（java）：-Xmx ${XMX_MB} MB，目前實際使用 ${JAVA_RSS_MB} MB"
  # the JVM uses more than its heap (metaspace, threads, native): reserve heap + 25%
  JAVA_RESERVE=$(( XMX_MB * 125 / 100 ))
  [ "$JAVA_RSS_MB" -gt "$JAVA_RESERVE" ] && JAVA_RESERVE=$JAVA_RSS_MB
else
  echo "沒找到 java 的 -Xmx（伺服器可能沒在跑）；以目前已使用的記憶體估算"
  JAVA_RESERVE=$(( TOTAL_MB - AVAIL_MB ))
fi
HEADROOM=$(( TOTAL_MB - JAVA_RESERVE - 1024 ))   # 1 GB for the OS
echo "扣掉遊戲與系統後可給 Valhalla：約 ${HEADROOM} MB（平常的服務 + 每週建置同時在跑時都要放得下）"
if [ "$HEADROOM" -ge 6144 ]; then
  VALHALLA_MEM=2g; BUILD_MEM=3g
elif [ "$HEADROOM" -ge 4096 ]; then
  VALHALLA_MEM=1g; BUILD_MEM=2g
elif [ "$HEADROOM" -ge 2048 ]; then
  # Valhalla itself needs ~100 MB (tiles are mmapped); only the weekly rebuild is heavy.
  # With this little room the rebuild may fail - then the current image keeps serving.
  VALHALLA_MEM=768m; BUILD_MEM=1536m
  echo "空間偏緊：每週重建若記憶體不夠會失敗，但舊的路網會照常服務，不會擠到 Minecraft。"
else
  echo "空間不夠，為了不影響 Minecraft，這台 VM 不安裝。建議改用 Cloud Run（deploy/valhalla/README.md）。" >&2
  if [ "${INSTALLED:-0}" = 1 ]; then
    echo "VM 上已經有裝好的 Valhalla；要停用：gcloud compute ssh $VM --zone $ZONE --command 'cd /opt/valhalla && sudo docker compose down'" >&2
  fi
  exit 1
fi
echo "設定：Valhalla 最多 ${VALHALLA_MEM}，每週建置最多 ${BUILD_MEM}，CPU 最多 1.5 核"
if [ "${INSTALLED:-0}" = 1 ]; then
  echo "VM 上的 Valhalla 已經裝好並在運作。"
  ask "繼續（套用上面的記憶體上限，然後設定 Cloudflare Tunnel）？請輸入 y" || exit 1
else
  ask "確認要在這台 VM 上安裝 Valhalla？" || exit 1
fi

step "2. 密鑰（存在這台 Mac，只有你能讀；重跑會沿用同一把）"
KEY_FILE="$HOME/.config/taiwan-dashboard/valhalla-key"
mkdir -p "$(dirname "$KEY_FILE")"
if [ -s "$KEY_FILE" ]; then
  echo "沿用既有密鑰：$KEY_FILE"
else
  (umask 077; openssl rand -hex 32 > "$KEY_FILE")
  echo "已產生新密鑰：$KEY_FILE"
fi
chmod 600 "$KEY_FILE"
KEY="$(cat "$KEY_FILE")"
if ask "現在也把密鑰存成 Worker secret VALHALLA_PRIMARY_KEY？（需要 wrangler 已登入）"; then
  if ! (cd "$REPO_DIR/worker" && npx wrangler secret put VALHALLA_PRIMARY_KEY --env production < "$KEY_FILE"); then
    echo "Worker secret 這次沒設成功（wrangler 沒登入）。不影響 VM 安裝，之後再設：" >&2
    echo "  cd ~/Projects/taiwan-dashboard/worker && npx wrangler login && npx wrangler secret put VALHALLA_PRIMARY_KEY --env production < $KEY_FILE" >&2
  fi
fi

step "3. 在 VM 上安裝（Docker、下載程式、建置台灣路網約 10-20 分鐘）"
if [ "${INSTALLED:-0}" = 1 ]; then
  echo "VM 上已經裝好並在運作，略過安裝（要重建路網：在 VM 執行 sudo /opt/valhalla/build-tiles.sh）"
  echo "套用記憶體上限：Valhalla ${VALHALLA_MEM}，每週建置 ${BUILD_MEM}"
  gcloud compute ssh "$VM" --zone "$ZONE" --command "sudo sed -i -e 's/^VALHALLA_MEM=.*/VALHALLA_MEM=${VALHALLA_MEM}/' -e 's/^BUILD_MEM=.*/BUILD_MEM=${BUILD_MEM}/' /opt/valhalla/.env && cd /opt/valhalla && sudo docker compose up -d valhalla >/dev/null 2>&1 && echo 已套用"
elif ask "開始安裝？"; then
  gcloud compute ssh "$VM" --zone "$ZONE" --command "sudo bash -s" <<REMOTE
set -euo pipefail
command -v git >/dev/null || (apt-get update -qq && apt-get install -y -qq git)
if [ -d /opt/valhalla/repo/.git ]; then
  git -C /opt/valhalla/repo fetch -q --depth 1 origin $BRANCH && git -C /opt/valhalla/repo checkout -q -B $BRANCH FETCH_HEAD
else
  mkdir -p /opt/valhalla && git clone -q --depth 1 -b $BRANCH https://github.com/zheng851228/taiwan-dashboard /opt/valhalla/repo
fi
VALHALLA_KEY='$KEY' VALHALLA_MEM='$VALHALLA_MEM' BUILD_MEM='$BUILD_MEM' bash /opt/valhalla/repo/deploy/valhalla-vm/setup.sh
REMOTE
fi

step "4. 建立 Cloudflare Tunnel（${HOST}）"
echo "等一下會出現一個 https://dash.cloudflare.com/... 的網址：按住 Command 點開，登入 Cloudflare，選 caotaapps.com 按 Authorize。"
if ask "開始？"; then
  # refresh the VM's copy of the scripts first (setup.sh installed them from an older commit)
  gcloud compute ssh "$VM" --zone "$ZONE" -- -t "sudo bash -c 'git -C /opt/valhalla/repo fetch -q --depth 1 origin $BRANCH && git -C /opt/valhalla/repo checkout -q -B $BRANCH FETCH_HEAD && install -m 0755 /opt/valhalla/repo/deploy/valhalla-vm/tunnel.sh /opt/valhalla/tunnel.sh && /opt/valhalla/tunnel.sh $HOST'"
fi

step "5. 測試"
# --doh-url: the Mac may still cache "no such host" from before the DNS record existed
DOH=""; curl --help all 2>/dev/null | grep -q -- '--doh-url' && DOH="--doh-url https://1.1.1.1/dns-query"
code="$(curl -s $DOH -o /dev/null -w '%{http_code}' -X POST "https://$HOST/route" -H 'Content-Type: application/json' -d '{}' || true)"
echo "沒帶密鑰：HTTP ${code}（應該是 403）"
ok="$(curl -s $DOH -X POST "https://$HOST/route" -H 'Content-Type: application/json' -H "X-Valhalla-Key: $KEY" \
  -d '{"locations":[{"lat":25.0478,"lon":121.5170},{"lat":25.0340,"lon":121.5645}],"costing":"motor_scooter"}' \
  | grep -o '"length":[0-9.]*' | head -1 || true)"
echo "帶密鑰：${ok:-失敗}（應該看到 \"length\":4 左右，單位公里）"
unset KEY
echo
echo "完成。Worker 要在 PR 合併、部署後才會開始用這台（VALHALLA_PRIMARY_URL 會一起設定）。"
