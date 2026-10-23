#!/bin/bash
# Override MAP_TILE_REFERER or MAP_TILE_URL to probe another origin/tile.
set -euo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
key=$(sed -nE "s/^[[:space:]]*key:[[:space:]]*['\"]([A-Za-z0-9_-]+)['\"],?[[:space:]]*$/\1/p" \
  "${ROOT_DIR}/js/map-provider-config.js")
if [ -z "$key" ]; then
  echo '地圖圖磚檢查失敗 (HTTP 000)：無法從 js/map-provider-config.js 讀取 key' >&2
  exit 1
fi

referer=${MAP_TILE_REFERER:-https://zheng851228.github.io/taiwan-dashboard/}
url=${MAP_TILE_URL:-https://api.maptiler.com/maps/dataviz-dark/8/214/110.png?key=${key}}
curl_status=0
# Do not use --fail: a 403 can also return image/png; inspect both metadata fields.
metadata=$(curl -s -o /dev/null -w '%{http_code}\n%{content_type}' \
  --connect-timeout 10 --max-time 30 --retry 2 --retry-delay 2 \
  --referer "$referer" "$url") || curl_status=$?
code=${metadata%%$'\n'*}
code=${code:-000}
content_type=${metadata#*$'\n'}
content_type=$(printf '%s' "$content_type" | tr '[:upper:]' '[:lower:]')

if [ "$curl_status" -ne 0 ]; then
  echo "地圖圖磚檢查失敗 (HTTP ${code})：curl 傳輸失敗 (exit ${curl_status})" >&2
  exit 1
fi
if [ "$code" != '200' ]; then
  echo "地圖圖磚檢查失敗 (HTTP ${code})：預期 HTTP 200，Content-Type=${content_type:-缺少}" >&2
  exit 1
fi
case "$content_type" in
  image/*) echo "地圖圖磚檢查成功 (HTTP ${code})：Content-Type=${content_type}" ;;
  *) echo "地圖圖磚檢查失敗 (HTTP ${code})：Content-Type=${content_type:-缺少}，預期 image/*" >&2; exit 1 ;;
esac
