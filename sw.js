const CACHE_VERSION = "v26";
const SHELL_CACHE = `twdash-shell-${CACHE_VERSION}`;
const LEGACY_AUTO_UPDATE_CACHE = "twdash-shell-v12";

const SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.svg",
  "./assets/icons/app-icon.svg",
  "./assets/icons/maskable-icon.svg",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/vendor/leaflet/leaflet.css",
  "./assets/vendor/leaflet/leaflet.js",
  "./assets/vendor/leaflet/images/marker-icon.png",
  "./assets/vendor/leaflet/images/marker-icon-2x.png",
  "./assets/vendor/leaflet/images/marker-shadow.png",
  "./assets/vendor/fontawesome/css/all.min.css",
  "./assets/vendor/fontawesome/webfonts/fa-solid-900.woff2",
  "./assets/vendor/fontawesome/webfonts/fa-regular-400.woff2",
  "./assets/vendor/fontawesome/webfonts/fa-brands-400.woff2",
  "./css/tailwind.generated.css",
  "./css/style.css?v=26",
  "./js/core.js",
  "./js/services.js",
  "./js/data.js",
  "./js/main-ui.js",
  "./js/enhancements.js",
  "./js/route-conditions.js",
  "./js/ride-tools.js",
  "./js/maplibre-renderer.js",
  "./js/desktop-dashboard.js",
  "./js/pwa.js"
];

const API_PATTERNS = [
  "taiwan-dashboard-api-production.lucky851228.workers.dev",
  "url-expander.lucky851228.workers.dev",
  "127.0.0.1"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.keys().then((existingKeys) =>
      caches.open(SHELL_CACHE)
        .then((cache) => Promise.all(SHELL_URLS.map(async (url) => {
          // 每個 shell 版本都略過瀏覽器 HTTP cache，避免新 cache 混入舊 JS。
          const request = new Request(new URL(url, self.registration.scope), { cache: "reload" });
          const response = await fetch(request);
          if (!response.ok) throw new Error(`Unable to cache ${url}: HTTP ${response.status}`);
          await cache.put(request, response);
        })))
        // v12 only displayed a toast and could not activate a waiting worker.
        // Auto-activate this one migration; later versions use the in-app update button.
        .then(() => existingKeys.includes(LEGACY_AUTO_UPDATE_CACHE) ? self.skipWaiting() : undefined)
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("twdash-") && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (API_PATTERNS.some((pattern) => url.hostname.includes(pattern))) {
    event.respondWith(apiNetworkOnly(request));
    return;
  }

  if (/^\/(v2\/|route$|cam-list$|weather$)/.test(url.pathname)) {
    event.respondWith(apiNetworkOnly(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    return cached || cache.match("./index.html");
  }
}

async function apiNetworkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    return new Response(JSON.stringify({
      status: "error",
      updatedAt: new Date().toISOString(),
      data: null,
      message: "目前處於離線狀態，即時路況與天氣無法更新。"
    }), {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    });
  }
}
