#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

echo "Checking frontend files..."

node --check js/core.js
node --check js/services.js
node --check js/data.js
node --check js/main-ui.js
node --check js/enhancements.js
node --check js/route-conditions.js
node --check js/route-condition-view-model.js
node --check js/ride-tools.js
node --check js/maplibre-renderer.js
node --check js/maplibre-camera-layer.js
node --check js/maplibre-route-layer.js
node --check js/maplibre-condition-layer.js
node --check js/desktop-dashboard.js
node --check js/desktop-layout.js
node --check js/map-provider-config.js
node --check js/pwa.js
node --check sw.js
node --check worker/src/polyline.js
node --check worker/src/rules.js
node --check worker/src/road-events.js
node --check worker/src/conditions.js
node --check worker/src/provider-snapshot.js
node --check worker/src/providers.js
node --check worker/src/index.js
node --check scripts/taiwan-route-cases.mjs
node --check scripts/audit-taiwan-routes.mjs
node --check scripts/build-provider-snapshot.mjs

node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('package ok')"

grep -q 'css/style.css' index.html
grep -q 'css/tailwind.generated.css' index.html
! grep -q 'cdn.tailwindcss.com' index.html
grep -q 'js/core.js' index.html
grep -q 'js/services.js' index.html
grep -q 'js/data.js' index.html
grep -q 'js/main-ui.js' index.html
grep -q 'js/enhancements.js' index.html
grep -q 'js/route-conditions.js' index.html
grep -q 'js/ride-tools.js' index.html
grep -q 'js/pwa.js' index.html
grep -q 'manifest.json' index.html
grep -q 'apple-touch-icon.png' index.html
! grep -Eq '(unpkg|cdnjs|fonts\.googleapis)\.com' index.html
grep -q '/v2/routes' js/services.js
grep -q 'motor_scooter' worker/src/index.js
grep -q 'https://taiwan-dashboard-api-production.lucky851228.workers.dev' js/core.js
grep -q 'taiwan-dashboard-api-production.lucky851228.workers.dev' sw.js
test -s css/tailwind.generated.css
test -s assets/icons/icon-192.png
test -s assets/icons/icon-512.png
test -s assets/icons/maskable-512.png
test -s assets/vendor/leaflet/leaflet.js
test -s assets/vendor/maplibre-gl/maplibre-gl.mjs
test -s assets/vendor/maplibre-gl/maplibre-gl-shared.mjs
test -s assets/vendor/maplibre-gl/maplibre-gl-worker.mjs
test -s assets/vendor/maplibre-gl/maplibre-gl.css
test -s assets/vendor/fontawesome/css/all.min.css

npm test

echo "All checks passed."
