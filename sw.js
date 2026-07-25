const CACHE_VERSION = "v6";
const SHELL_CACHE = `twdash-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `twdash-runtime-${CACHE_VERSION}`;

const SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.svg",
  "./css/tailwind.generated.css",
  "./css/style.css",
  "./js/core.js",
  "./js/services.js",
  "./js/data.js",
  "./js/main-ui.js",
  "./js/enhancements.js",
  "./js/route-conditions.js",
  "./js/ride-tools.js"
];

const CACHE_FIRST_HOSTS = [
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "cdn.tailwindcss.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

const API_PATTERNS = [
  "taiwan-dashboard-api-production.lucky851228.workers.dev",
  "url-expander.lucky851228.workers.dev",
  "127.0.0.1"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (CACHE_FIRST_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  if (API_PATTERNS.some((pattern) => url.hostname.includes(pattern))) {
    event.respondWith(apiNetworkOnly(request));
    return;
  }

  if (/^\/(v2\/|route$|cam-list$|weather$)/.test(url.pathname)) {
    event.respondWith(apiNetworkOnly(request));
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
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
