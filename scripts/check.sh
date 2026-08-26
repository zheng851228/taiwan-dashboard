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
node --check js/route-search-model.js
node --check js/route-summary-model.js
node --check js/route-navigation-model.js
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
grep -q 'js/route-search-model.js' index.html
node -e "const s=require('fs').readFileSync('index.html','utf8'); const model=s.indexOf('js/route-search-model.js'); const runtime=s.indexOf('js/main-ui.js'); if(model<0 || runtime<0 || model>runtime) throw new Error('route search model must load before main-ui.js')"
grep -q 'js/route-summary-model.js' index.html
node -e "const s=require('fs').readFileSync('index.html','utf8'); const model=s.indexOf('js/route-summary-model.js'); const runtime=s.indexOf('js/main-ui.js'); if(model<0 || runtime<0 || model>runtime) throw new Error('route summary model must load before main-ui.js')"
grep -q 'js/main-ui.js' index.html
grep -q 'js/enhancements.js' index.html
grep -q 'js/route-condition-view-model.js' index.html
grep -q 'js/route-navigation-model.js' index.html
node -e "const s=require('fs').readFileSync('index.html','utf8'); const model=s.indexOf('js/route-navigation-model.js'); const runtime=s.indexOf('js/route-conditions.js'); if(model<0 || runtime<0 || model>runtime) throw new Error('route navigation model must load before route-conditions.js')"
grep -q 'js/route-conditions.js' index.html
node -e "const s=require('fs').readFileSync('index.html','utf8'); const model=s.indexOf('js/route-condition-view-model.js'); const runtime=s.indexOf('js/route-conditions.js'); if(model<0 || runtime<0 || model>runtime) throw new Error('route condition view model must load before route-conditions.js')"
grep -q 'js/ride-tools.js' index.html
grep -q 'js/pwa.js' index.html
grep -q 'manifest.json' index.html
grep -q 'apple-touch-icon.png' index.html
! grep -Eq '(unpkg|cdnjs|fonts\.googleapis)\.com' index.html
grep -q 'RouteSearchModel.prepareEndpoints' js/main-ui.js
grep -q 'RouteSearchModel.buildAddressPlan' js/main-ui.js
grep -q 'RouteSearchModel.unresolvedPointMessage' js/main-ui.js
grep -q 'RouteSearchModel.buildVehicle' js/main-ui.js
grep -q 'RouteSummaryModel.routeUiCopy' js/main-ui.js
grep -q 'RouteSummaryModel.normalizeRouteInfo' js/main-ui.js
grep -q 'RouteSummaryModel.completionMessage' js/main-ui.js
grep -q 'RouteNavigationModel.buildNavigation' js/route-conditions.js
grep -q 'RouteNavigationModel.appleClickIntent' js/route-conditions.js
grep -q "Bus.on('vehicle:changed'" js/route-conditions.js
! grep -q 'window.ThemeMod = ThemeMod' js/main-ui.js
! grep -q 'window.ListMod = ListMod' js/main-ui.js
! grep -q 'window.ModalMod = ModalMod' js/main-ui.js
! grep -q 'window.DesktopElevationMod = DesktopElevationMod' js/desktop-dashboard.js
! grep -q 'window.NavMod = NavMod' js/main-ui.js
! grep -q 'window.InfoMod = InfoMod' js/main-ui.js
grep -q "Bus.on('navigation:request'" js/main-ui.js
grep -q "Bus.on('camera:open'" js/main-ui.js
grep -q "Bus.on('route:request'" js/main-ui.js
grep -q "action === 'set-vehicle'" js/main-ui.js
grep -q "action === 'analyze'" js/main-ui.js
grep -q "action === 'clear'" js/main-ui.js
grep -q "Bus.emit('camera:closed'" js/main-ui.js
! grep -q 'NavMod' js/desktop-dashboard.js
! grep -q 'NavMod' js/enhancements.js
! grep -q 'NavMod' js/ride-tools.js
! grep -q 'InfoMod' js/enhancements.js
! grep -q 'InfoMod' js/ride-tools.js
grep -q "Bus.emit('camera:open'" js/enhancements.js
grep -q "Bus.emit('camera:open'" js/ride-tools.js
grep -q "Bus.on('camera:selected'" js/ride-tools.js
grep -q "Bus.on('camera:closed'" js/ride-tools.js
grep -q "Bus.on('map:request'" js/main-ui.js
grep -q "action === 'invalidate-size'" js/main-ui.js
grep -q "action === 'focus-route'" js/main-ui.js
grep -q "action === 'set-view'" js/main-ui.js
grep -q "action === 'nearby-overlay-upsert'" js/main-ui.js
grep -q "action === 'nearby-overlay-radius'" js/main-ui.js
grep -q "action === 'nearby-overlay-clear'" js/main-ui.js
grep -q "action === 'clear-waypoint-overlays'" js/main-ui.js
grep -q "action === 'draw-route'" js/main-ui.js
grep -q "action === 'draw-start-end'" js/main-ui.js
grep -q "action === 'focus-camera'" js/main-ui.js
grep -q "action === 'draw-condition-sections'" js/main-ui.js
grep -q "action === 'focus-section'" js/main-ui.js
! grep -q 'MapMod' js/desktop-dashboard.js
! grep -q 'MapMod' js/ride-tools.js
! grep -q 'MapMod' js/enhancements.js
! grep -q 'MapMod' js/route-conditions.js
! grep -q 'RouteMod' js/route-conditions.js
! grep -q 'RouteMod.setVehicle' js/desktop-dashboard.js
! grep -q 'RouteMod.analyze' js/enhancements.js
! grep -q 'RouteMod.clear' js/enhancements.js
! grep -q 'RouteMod.active' js/desktop-dashboard.js
! grep -q 'RouteMod.active' js/enhancements.js
! grep -q 'RouteMod.active' js/ride-tools.js
! grep -q 'RouteMod.filteredCams' js/desktop-dashboard.js
! grep -q 'RouteMod.filteredCams' js/enhancements.js
grep -q 'state.routeCameras = (payload && payload.cams || []).slice();' js/desktop-dashboard.js
grep -q 'RouteStripMod.routeCameras = (payload && payload.cams || []).slice();' js/enhancements.js
grep -q 'state.routeCameras = [];' js/desktop-dashboard.js
grep -q 'RouteStripMod.routeCameras = [];' js/enhancements.js
grep -q 'cams: RouteMod.filteredCams.slice()' js/main-ui.js
grep -q 'RouteMod.filteredCams = [];' js/pwa.js
grep -q 'AppState.activeRoute' js/desktop-dashboard.js
grep -q 'AppState.activeRoute' js/enhancements.js
grep -q 'AppState.activeRoute' js/ride-tools.js
grep -q 'RouteMod.active = true;' js/pwa.js
grep -q 'RouteMod.active = true;' js/main-ui.js
grep -q 'RouteMod.active = false;' js/main-ui.js
! grep -q 'MapMod' js/pwa.js
grep -q "Bus.emit('map:request'" js/desktop-dashboard.js
grep -q "Bus.emit('map:request'" js/enhancements.js
grep -q "Bus.emit('map:request'" js/ride-tools.js
grep -q "action: 'nearby-overlay-upsert'" js/enhancements.js
grep -q "action: 'nearby-overlay-radius'" js/enhancements.js
grep -q "action: 'nearby-overlay-clear'" js/enhancements.js
grep -q "action: 'clear-waypoint-overlays'" js/enhancements.js
grep -q "action: 'draw-start-end'" js/route-conditions.js
grep -q "action: 'focus-camera'" js/route-conditions.js
grep -q "action: 'draw-condition-sections'" js/route-conditions.js
grep -q "action: 'focus-section'" js/route-conditions.js
grep -q "action: 'draw-route'" js/pwa.js
grep -q "action: 'draw-start-end'" js/pwa.js
grep -q "action: 'set-vehicle'" js/desktop-dashboard.js
grep -q "action: 'analyze'" js/enhancements.js
grep -q "action: 'clear'" js/enhancements.js
grep -q "action: 'clear'" js/route-conditions.js
grep -q 'window.MapMod = MapMod' js/main-ui.js
grep -q 'window.RouteMod = RouteMod' js/main-ui.js
grep -q '/v2/routes' js/services.js
grep -q 'motor_scooter' worker/src/index.js
grep -q 'https://taiwan-dashboard-api-production.lucky851228.workers.dev' js/core.js
grep -q 'taiwan-dashboard-api-production.lucky851228.workers.dev' sw.js
grep -q 'js/route-search-model.js?v=44' sw.js
grep -q 'js/route-summary-model.js?v=44' sw.js
grep -q 'js/route-navigation-model.js?v=44' sw.js
grep -q 'js/route-condition-view-model.js?v=44' sw.js
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
