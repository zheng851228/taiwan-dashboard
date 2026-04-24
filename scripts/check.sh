#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

echo "Checking frontend files..."

node --check js/core.js
node --check js/data.js
node --check js/main-ui.js
node --check js/enhancements.js
node --check sw.js

node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"

grep -q 'css/style.css' index.html
grep -q 'js/core.js' index.html
grep -q 'js/data.js' index.html
grep -q 'js/main-ui.js' index.html
grep -q 'js/enhancements.js' index.html
grep -q 'manifest.json' index.html

echo "All checks passed."
