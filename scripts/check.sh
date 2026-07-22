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
node --check js/ride-tools.js
node --check sw.js
node --check worker/src/polyline.js
node --check worker/src/rules.js
node --check worker/src/conditions.js
node --check worker/src/providers.js
node --check worker/src/index.js
node --check scripts/taiwan-route-cases.mjs
node --check scripts/audit-taiwan-routes.mjs

node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('package ok')"

grep -q 'css/style.css' index.html
grep -q 'js/core.js' index.html
grep -q 'js/services.js' index.html
grep -q 'js/data.js' index.html
grep -q 'js/main-ui.js' index.html
grep -q 'js/enhancements.js' index.html
grep -q 'js/route-conditions.js' index.html
grep -q 'js/ride-tools.js' index.html
grep -q 'manifest.json' index.html
grep -q '/v2/routes' js/services.js
grep -q 'motor_scooter' worker/src/index.js

npm test

echo "All checks passed."
