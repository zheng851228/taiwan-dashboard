#!/usr/bin/env bash
# Builds a fresh Taiwan Valhalla image from the latest Geofabrik extract, smoke-tests it on a
# side container, and only then switches the running service to it (no downtime on failure).
# Run weekly by cron (see setup.sh).  Build steps are capped so the game server keeps its CPU.
set -euo pipefail

BASE=/opt/valhalla
REPO="$BASE/repo"
VALHALLA_TAG="${VALHALLA_TAG:-3.6.0}"
IMAGE_BASE="ghcr.io/valhalla/valhalla:${VALHALLA_TAG}"
STAMP="$(date -u +%Y%m%d%H%M)"
WORK="$BASE/build-$STAMP"
LOG_PREFIX="[valhalla-build $STAMP]"

log() { echo "$LOG_PREFIX $*"; }
cleanup() { docker rm -f "valhalla-smoke-$STAMP" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

mkdir -p "$WORK/out"
log "download Taiwan extract"
curl -fsSL --retry 5 --retry-delay 10 -o "$WORK/taiwan-latest.osm.pbf" \
  https://download.geofabrik.de/asia/taiwan-latest.osm.pbf

log "build tiles with $IMAGE_BASE (capped: 2 CPUs, 3 GB)"
docker pull -q "$IMAGE_BASE" >/dev/null
docker run --rm --cpus 2 --memory 3g --entrypoint bash -v "$WORK:/data" "$IMAGE_BASE" -euc '
  cd /data
  mkdir -p tiles
  valhalla_build_config \
    --mjolnir-tile-dir /data/tiles \
    --mjolnir-tile-extract /data/tiles.tar \
    --mjolnir-admin /data/admins.sqlite \
    --mjolnir-timezone /data/timezones.sqlite \
    --httpd-service-listen "tcp://*:8080" \
    > /data/valhalla.json
  valhalla_build_timezones > /data/timezones.sqlite
  valhalla_build_admins -c /data/valhalla.json /data/taiwan-latest.osm.pbf
  valhalla_build_tiles -c /data/valhalla.json /data/taiwan-latest.osm.pbf
  valhalla_build_extract -c /data/valhalla.json -v
'
cp "$WORK/valhalla.json" "$WORK/tiles.tar" "$WORK/admins.sqlite" "$WORK/timezones.sqlite" "$WORK/out/"

log "build runtime image valhalla-tw:$STAMP"
docker build -q --build-arg VALHALLA_TAG="$VALHALLA_TAG" -f "$REPO/deploy/valhalla/Dockerfile" \
  -t "valhalla-tw:$STAMP" "$WORK/out" >/dev/null

log "smoke test"
docker run -d --name "valhalla-smoke-$STAMP" --cpus 1 --memory 1g -p 127.0.0.1:18080:8080 "valhalla-tw:$STAMP" >/dev/null
ready=0
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:18080/status >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ "$ready" = 1 ] || { log "new image did not start; keeping the current one"; exit 1; }
curl -fsS -H 'Content-Type: application/json' \
  -d '{"locations":[{"lat":25.0478,"lon":121.5170},{"lat":25.0340,"lon":121.5645}],"costing":"motor_scooter"}' \
  http://127.0.0.1:18080/route | grep -q '"legs"' || { log "smoke route failed; keeping the current one"; exit 1; }

log "switch service to the new image"
docker tag "valhalla-tw:$STAMP" valhalla-tw:current
(cd "$BASE" && docker compose up -d valhalla)

# keep the current and the previous image only
docker images valhalla-tw --format '{{.Tag}}' | grep -E '^[0-9]{12}$' | sort -r | tail -n +3 \
  | while read -r tag; do docker rmi "valhalla-tw:$tag" >/dev/null 2>&1 || true; done
log "done"
