/**

- utils.js — 工具函式庫
- 
- 包含：
- - DOM 選取捷徑
- - 時間格式化
- - Haversine 地理距離計算
- - 點到線段最短距離
- - 座標抽稀演算法
- - 氣象署縣市名稱標準化
- - Event Bus（模組間通訊）
- - Clock（時鐘）
- - Toast（提示通知）
- - LazyImg（圖片懶加載）
    */

‘use strict’;

// ══════════════════════════════════════
// DOM 捷徑
// ══════════════════════════════════════

/** 以 id 取得 DOM 元素 */
const $ = id => document.getElementById(id);

/** 取得目前時間字串（24小時制） */
const now = () => new Date().toLocaleTimeString(‘zh-TW’, { hour12: false });

/** 角度轉弧度 */
const rad = deg => deg * Math.PI / 180;

// ══════════════════════════════════════
// 地理計算
// ══════════════════════════════════════

/**

- Haversine 公式：計算兩點間的球面距離（公里）
- @param {number} lat1 - 起點緯度
- @param {number} lng1 - 起點經度
- @param {number} lat2 - 終點緯度
- @param {number} lng2 - 終點經度
- @returns {number} 距離（公里）
  */
  function distKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a    = Math.sin(dLat / 2) ** 2
  + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

/**

- 計算點 P 到線段 AB 的最短距離（公里）
- 用於路線感知過濾：判斷 CCTV 是否在路線附近
- 
- @param {number} px,py - 目標點（CCTV）座標
- @param {number} ax,ay - 線段起點座標
- @param {number} bx,by - 線段終點座標
- @returns {number} 最短距離（公里）
  */
  function distToSegKm(px, py, ax, ay, bx, by) {
  const dx    = bx - ax;
  const dy    = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distKm(px, py, ax, ay); // A、B 重合，退化為點距離
  // 計算投影比例 t，限制在 [0,1] 內確保投影點在線段上
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return distKm(px, py, ax + t * dx, ay + t * dy);
  }

/**

- 座標抽稀：每隔 step 個點取一個
- 降低長途路徑（數百個座標）的距離計算量
- 
- @param {Array<{lat,lng}>} coords - 完整路徑座標陣列
- @param {number} step - 抽稀間距（設定於 C.ROUTE_THIN_STEP）
- @returns {Array<{lat,lng}>} 抽稀後的座標陣列
  */
  function thinCoords(coords, step) {
  if (step <= 1) return coords;
  return coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
  }

// ══════════════════════════════════════
// 氣象署名稱標準化
// ══════════════════════════════════════

/** 氣象署部分縣市使用「臺」，需對應到 data.js 中的「台」 */
const NAME_PATCH = {
‘臺北市’: ‘台北市’,
‘臺中市’: ‘台中市’,
‘臺南市’: ‘台南市’,
‘臺東縣’: ‘台東縣’,
};

/**

- 將氣象署回傳的 locationName 標準化
- 先查補丁表，再做通用「臺→台」轉換
- @param {string} n - 氣象署縣市名稱
- @returns {string} 標準化後的名稱
  */
  function normName(n) {
  return (NAME_PATCH[n] ?? n).replace(/臺/g, ‘台’);
  }

// ══════════════════════════════════════
// EVENT BUS（模組間通訊）
// ══════════════════════════════════════

/**

- 簡易發布/訂閱系統
- 讓各模組不需直接互相引用，透過事件名稱通訊
- 
- 已定義事件：
- ‘theme’           → 主題切換（payload: boolean isDark）
- ‘weather:updated’ → CWA 天氣資料更新完成
- ‘weather:error’   → CWA API 失敗
- ‘route:updated’   → 路線分析完成（payload: {camIds, cityIds, camCount, cityCount}）
- ‘route:cleared’   → 路線清除
  */
  const Bus = (() => {
  const handlers = {};
  return {
  /**
  - 訂閱事件
  - @param {string}   event   - 事件名稱
  - @param {Function} handler - 處理函式
    */
    on(event, handler) {
    (handlers[event] = handlers[event] || []).push(handler);
    },
    /**
  - 發送事件
  - @param {string} event   - 事件名稱
  - @param {*}      payload - 傳遞的資料
    */
    emit(event, payload) {
    (handlers[event] || []).forEach(fn => fn(payload));
    },
    };
    })();

// ══════════════════════════════════════
// CLOCK（時鐘）
// ══════════════════════════════════════

/**

- 即時時鐘模組
- 使用 requestAnimationFrame 取代 setInterval，
- 只在字串實際改變時更新 DOM，效能更好
  */
  const Clock = (() => {
  const $clk  = $(‘js-clk’);
  const $date = $(‘js-date’);
  const timeFmt = { hour: ‘2-digit’, minute: ‘2-digit’, second: ‘2-digit’, hour12: false };
  const dateFmt = { year: ‘numeric’, month: ‘long’, day: ‘numeric’, weekday: ‘short’ };
  let lastTick = ‘’;

function tick() {
const n = new Date();
const t = n.toLocaleTimeString(‘zh-TW’, timeFmt);
if (t !== lastTick) {
$clk.textContent  = t;
$date.textContent = n.toLocaleDateString(‘zh-TW’, dateFmt);
lastTick = t;
}
requestAnimationFrame(tick);
}

return {
init() { requestAnimationFrame(tick); },
};
})();

// ══════════════════════════════════════
// TOAST（提示通知）
// ══════════════════════════════════════

/**

- 非阻塞提示通知
- 自動在指定時間後消失，不干擾使用者操作
  */
  const Toast = (() => {
  const $toast = $(‘toast’);
  let timer;

return {
/**
* 顯示提示訊息
* @param {string} msg - 訊息文字
* @param {number} dur - 顯示時間（毫秒，預設 2400）
*/
show(msg, dur = 2400) {
$toast.textContent = msg;
$toast.classList.add(‘show’);
clearTimeout(timer);
timer = setTimeout(() => $toast.classList.remove(‘show’), dur);
},
};
})();

// ══════════════════════════════════════
// LAZY IMG（圖片懶加載）
// ══════════════════════════════════════

/**

- 使用 IntersectionObserver 實現圖片懶加載
- 圖片進入可視範圍前 120px 才開始載入，節省流量
- 載入完成後加上 .in 類別觸發淡入動畫
  */
  const Lazy = (() => {
  const observer = new IntersectionObserver(
  entries => {
  entries.forEach(entry => {
  if (!entry.isIntersecting) return;
  const img = entry.target;
  img.src    = img.dataset.src;
  img.onload = () => img.classList.add(‘in’);
  observer.unobserve(img); // 載入後取消觀察，節省資源
  });
  },
  { rootMargin: ‘120px’ }
  );

return {
/**
* 開始觀察容器內所有帶有 data-src 的圖片
* @param {Element} root - 父容器元素
*/
watch(root) {
root.querySelectorAll(‘img[data-src]’).forEach(img => observer.observe(img));
},
};
})();