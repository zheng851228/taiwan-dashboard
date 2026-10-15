#!/usr/bin/env bash
# Creates a locally-managed Cloudflare Tunnel for <hostname> (e.g. valhalla.caotaapps.com) and
# starts it.  The first run prints a login URL: open it, sign in to Cloudflare and authorize
# the zone (caotaapps.com).  Re-running is safe.
set -euo pipefail

BASE=/opt/valhalla
HOSTNAME_="${1:?用法: sudo $0 valhalla.caotaapps.com}"
NAME=valhalla-tw
CF="docker run --rm -v $BASE/cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest"
[ "$(id -u)" = 0 ] || { echo "請用 sudo 執行" >&2; exit 1; }
mkdir -p "$BASE/cloudflared"
chown 65532:65532 "$BASE/cloudflared"   # the cloudflared image runs as uid 65532 (nonroot)

if [ ! -s "$BASE/cloudflared/cert.pem" ]; then
  echo "== 登入 Cloudflare：請打開下面出現的網址，選 caotaapps.com 並按授權"
  $CF tunnel login
fi

ID="$($CF tunnel list --output json 2>/dev/null | python3 -c "import sys,json;print(next((t['id'] for t in (json.load(sys.stdin) or []) if t['name']=='$NAME'),''))")"
if [ -z "$ID" ]; then
  echo "== 建立 tunnel $NAME"
  $CF tunnel create "$NAME" >/dev/null
  ID="$($CF tunnel list --output json | python3 -c "import sys,json;print(next(t['id'] for t in (json.load(sys.stdin) or []) if t['name']=='$NAME'))")"
fi
echo "tunnel id: $ID"

echo "== DNS：$HOSTNAME_ -> tunnel"
$CF tunnel route dns --overwrite-dns "$NAME" "$HOSTNAME_"

sed -e "s/__TUNNEL_ID__/$ID/g" -e "s/__HOSTNAME__/$HOSTNAME_/g" \
  "$BASE/cloudflared-config.yml.template" > "$BASE/cloudflared/config.yml"
chown 65532:65532 "$BASE/cloudflared/config.yml"
chmod 600 "$BASE/cloudflared/$ID.json" 2>/dev/null || true
chown 65532:65532 "$BASE/cloudflared/$ID.json" 2>/dev/null || true

echo "== 啟動 tunnel"
(cd "$BASE" && docker compose up -d cloudflared)
echo "完成：https://$HOSTNAME_ （沒有密鑰會回 403）"
