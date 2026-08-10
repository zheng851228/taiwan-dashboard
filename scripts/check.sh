#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

echo "Checking frontend files..."

node --check js/core.js
node --check js/services.js
node --check js/data.js
node --check js/route-search-model.js
node --check js/route-summary-model.js
node --check js/route-navigation-model.js
node --check js/main-ui.js
node --check js/enhancements.js
node --check js/route-condition-view-model.js
node --check js/route-conditions.js
node --check js/ride-tools.js
node --check js/maplibre-renderer.js
node --check js/maplibre-route-layer.js
node --check js/maplibre-camera-layer.js
node --check js/maplibre-condition-layer.js
node --check js/desktop-dashboard.js
node --check js/desktop-layout.js
node --check js/desktop-bootstrap.js
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
grep -q 'js/route-search-model.js' index.html
grep -q 'js/route-summary-model.js' index.html
grep -q 'js/main-ui.js' index.html
node -e "const s=require('fs').readFileSync('index.html','utf8'); const search=s.indexOf('js/route-search-model.js'); const summary=s.indexOf('js/route-summary-model.js'); const ui=s.indexOf('js/main-ui.js'); if(search < 0 || summary < 0 || ui < 0 || search > ui || summary > ui) throw new Error('route search/summary models must load before main-ui');"
grep -q 'RouteSearchModel.prepareEndpoints' js/main-ui.js
grep -q 'RouteSearchModel.buildAddressPlan' js/main-ui.js
grep -q 'RouteSearchModel.buildVehicle' js/main-ui.js
grep -q 'RouteSearchModel.unresolvedPointMessage' js/main-ui.js
grep -q 'RouteSummaryModel.normalizeRouteInfo' js/main-ui.js
grep -q 'RouteSummaryModel.routeUiCopy' js/main-ui.js
grep -q 'RouteSummaryModel.completionMessage' js/main-ui.js
! grep -q 'window.ThemeMod' js/main-ui.js
! grep -q 'window.ListMod' js/main-ui.js
! grep -q 'window.ModalMod' js/main-ui.js
! grep -q 'window.NavMod' js/main-ui.js
! grep -q 'window.MapMod' js/main-ui.js
grep -q "params.get('e2e') !== '1'" js/main-ui.js
grep -q 'window.__MapTestProbe = Object.freeze' js/main-ui.js
grep -q 'var mapTestWaypointMarker = null' js/main-ui.js
! grep -q 'window.__mapTestWaypointMarker' js/main-ui.js
grep -q "Bus.on('navigation:request'" js/main-ui.js
! grep -q 'NavMod' index.html
for file in js/desktop-dashboard.js js/enhancements.js js/ride-tools.js; do
  ! grep -q 'NavMod' "$file"
  grep -q "Bus.emit('navigation:request'" "$file"
done
grep -q "Bus.on('map:request'" js/main-ui.js
grep -q "action === 'nearby-overlay-upsert'" js/main-ui.js
grep -q "action === 'nearby-overlay-radius'" js/main-ui.js
grep -q "action === 'nearby-overlay-clear'" js/main-ui.js
grep -q "action === 'clear-waypoint-overlays'" js/main-ui.js
grep -q "action === 'draw-route'" js/main-ui.js
grep -q "action === 'draw-start-end'" js/main-ui.js
grep -q "action === 'focus-camera'" js/main-ui.js
grep -q "action === 'draw-condition-sections'" js/main-ui.js
grep -q "action === 'focus-section'" js/main-ui.js
for file in js/desktop-dashboard.js js/ride-tools.js js/enhancements.js js/route-conditions.js js/pwa.js; do
  ! grep -q 'MapMod' "$file"
done
node -e "const fs=require('fs'); for (const name of fs.readdirSync('js')) { if (!name.endsWith('.js') || name === 'main-ui.js') continue; const file='js/'+name; const text=fs.readFileSync(file,'utf8'); if (text.includes('MapMod')) throw new Error('direct MapMod consumer remains: '+file); }"
! grep -R -q 'MapMod' tests/e2e
grep -q "Bus.emit('map:request'" js/desktop-dashboard.js
grep -q "Bus.emit('map:request'" js/ride-tools.js
grep -q "Bus.emit('map:request'" js/enhancements.js
grep -q "action: 'nearby-overlay-upsert'" js/enhancements.js
grep -q "action: 'nearby-overlay-radius'" js/enhancements.js
grep -q "action: 'nearby-overlay-clear'" js/enhancements.js
grep -q "action: 'clear-waypoint-overlays'" js/enhancements.js
! grep -q 'NearbyMod.marker' js/enhancements.js
! grep -q 'NearbyMod.circle' js/enhancements.js
grep -q "action: 'draw-route'" js/pwa.js
grep -q "action: 'draw-start-end'" js/pwa.js
grep -q "action: 'focus-camera'" js/route-conditions.js
grep -q "action: 'draw-condition-sections'" js/route-conditions.js
grep -q "action: 'draw-start-end'" js/route-conditions.js
grep -q "action: 'focus-section'" js/route-conditions.js
! grep -q 'window.DesktopElevationMod' js/desktop-dashboard.js
grep -q 'state.routeCameras = event && Array.isArray(event.cams)' js/desktop-dashboard.js
! grep -q 'RouteMod.filteredCams' js/desktop-dashboard.js
grep -q "Bus.on('vehicle:changed'" js/desktop-dashboard.js
grep -q "vehicle: { mode: 'motorcycle', plate: 'white' }" js/desktop-dashboard.js
! grep -q 'RouteMod.mode' js/desktop-dashboard.js
! grep -q 'RouteMod.plate' js/desktop-dashboard.js
grep -q 'RouteMod.setVehicle(restoredMode, restoredPlate)' js/pwa.js
! grep -q 'RouteMod.mode' js/pwa.js
grep -q 'js/enhancements.js' index.html
grep -q 'js/route-condition-view-model.js' index.html
grep -q 'js/route-navigation-model.js' index.html
grep -q 'js/route-conditions.js' index.html
node -e "const s=require('fs').readFileSync('index.html','utf8'); const vm=s.indexOf('js/route-condition-view-model.js'); const nav=s.indexOf('js/route-navigation-model.js'); const ui=s.indexOf('js/route-conditions.js'); if(vm < 0 || nav < 0 || ui < 0 || vm > ui || nav > ui) throw new Error('route condition/navigation models must load before route-conditions');"
grep -q 'RouteConditionViewModel.roadEventPresentation' js/route-conditions.js
grep -q 'RouteConditionViewModel.primaryRoadEvent' js/route-conditions.js
grep -q 'RouteConditionViewModel.summarizeRoadEvents' js/route-conditions.js
grep -q 'RouteConditionViewModel.buildAlerts' js/route-conditions.js
grep -q 'RouteNavigationModel.buildNavigation' js/route-conditions.js
grep -q 'RouteNavigationModel.appleClickIntent' js/route-conditions.js
! grep -q 'function routePoints' js/route-conditions.js
! grep -q 'function googleUrl' js/route-conditions.js
! grep -q 'function appleUrl' js/route-conditions.js
! grep -q 'ROAD_EVENT_KINDS' js/route-conditions.js
! grep -q 'inferRoadEventKind' js/route-conditions.js
grep -q 'js/ride-tools.js' index.html
grep -q 'js/desktop-bootstrap.js' index.html
grep -q 'js/maplibre-route-layer.js' js/desktop-bootstrap.js
grep -q 'js/maplibre-camera-layer.js' js/desktop-bootstrap.js
grep -q 'js/maplibre-condition-layer.js' js/desktop-bootstrap.js
grep -q 'js/desktop-layout.js' js/desktop-bootstrap.js
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
