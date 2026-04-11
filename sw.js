// 環島路況指揮中心 Service Worker
// 版本號：更新時改這裡強制更新快取
var CACHE_VERSION = ‘v1’;
var CACHE_NAME    = ‘roadcam-’ + CACHE_VERSION;

// 靜態資源（長期快取）
var STATIC_URLS = [
‘./’,
‘./index.html’,
‘./cams.json’,
‘./manifest.json’
];

// API 快取設定
var API_CACHE_NAME  = ‘roadcam-api-’ + CACHE_VERSION;
var TWIPCAM_API     = ‘https://www.twipcam.com/api/v1/cam-list.json’;
var API_MAX_AGE_MS  = 10 * 60 * 1000; // 10 分鐘

// ── 安裝：預快取靜態資源 ────────────────────────────────────
self.addEventListener(‘install’, function(event) {
event.waitUntil(
caches.open(CACHE_NAME)
.then(function(cache) {
return cache.addAll(STATIC_URLS);
})
.then(function() {
return self.skipWaiting();
})
);
});

// ── 啟用：清除舊版快取 ──────────────────────────────────────
self.addEventListener(‘activate’, function(event) {
event.waitUntil(
caches.keys().then(function(keys) {
return Promise.all(
keys
.filter(function(key) {
return key !== CACHE_NAME && key !== API_CACHE_NAME;
})
.map(function(key) {
return caches.delete(key);
})
);
}).then(function() {
return self.clients.claim();
})
);
});

// ── 攔截請求 ────────────────────────────────────────────────
self.addEventListener(‘fetch’, function(event) {
var url = event.request.url;

// twipcam API：Stale-While-Revalidate（先回快取，背景更新）
if (url.indexOf(‘twipcam.com/api/v1/cam-list.json’) !== -1) {
event.respondWith(staleWhileRevalidate(event.request, API_CACHE_NAME, API_MAX_AGE_MS));
return;
}

// cams.json：同樣策略
if (url.indexOf(‘cams.json’) !== -1) {
event.respondWith(staleWhileRevalidate(event.request, CACHE_NAME, 5 * 60 * 1000));
return;
}

// 靜態資源（Leaflet、FontAwesome CDN 等）：Cache First
if (
url.indexOf(‘unpkg.com’) !== -1 ||
url.indexOf(‘cdnjs.cloudflare.com’) !== -1 ||
url.indexOf(‘cdn.tailwindcss.com’) !== -1 ||
url.indexOf(‘fonts.googleapis.com’) !== -1
) {
event.respondWith(cacheFirst(event.request, CACHE_NAME));
return;
}

// 其他：直接走網路，不快取
});

// ── Stale-While-Revalidate ──────────────────────────────────
// 立即回傳快取（舊資料），同時背景抓新資料更新快取
function staleWhileRevalidate(request, cacheName, maxAgeMs) {
return caches.open(cacheName).then(function(cache) {
return cache.match(request).then(function(cached) {
var fetchPromise = fetch(request.clone())
.then(function(networkResp) {
if (networkResp && networkResp.status === 200) {
// 加上時間戳記到快取
var respToCache = networkResp.clone();
cache.put(request, respToCache);
}
return networkResp;
})
.catch(function() {
return null;
});

```
  // 有快取就先回傳，同時背景更新
  if (cached) {
    // 檢查快取是否過期（超過 maxAgeMs 就也等網路）
    var dateHeader = cached.headers.get('date');
    if (dateHeader) {
      var age = Date.now() - new Date(dateHeader).getTime();
      if (age < maxAgeMs) {
        return cached; // 快取還新鮮，直接回
      }
    } else {
      return cached; // 沒有 date header，直接回快取
    }
  }

  // 快取過期或沒有快取，等網路
  return fetchPromise.then(function(resp) {
    return resp || cached; // 網路失敗就降級用舊快取
  });
});
```

});
}

// ── Cache First ─────────────────────────────────────────────
// 有快取就用快取，否則走網路並存入快取
function cacheFirst(request, cacheName) {
return caches.open(cacheName).then(function(cache) {
return cache.match(request).then(function(cached) {
if (cached) return cached;
return fetch(request).then(function(networkResp) {
if (networkResp && networkResp.status === 200) {
cache.put(request, networkResp.clone());
}
return networkResp;
});
});
});
}