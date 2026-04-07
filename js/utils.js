'use strict';
const $ = id => document.getElementById(id);
const now = () => new Date().toLocaleTimeString('zh-TW', { hour12: false });
const rad = deg => deg * Math.PI / 180;

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distToSegKm(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distKm(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return distKm(px, py, ax + t * dx, ay + t * dy);
}

function thinCoords(coords, step) {
  if (step <= 1) return coords;
  return coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
}

const NAME_PATCH = { '臺北市': '台北市', '臺中市': '台中市', '臺南市': '台南市', '臺東縣': '台東縣' };
function normName(n) { return (NAME_PATCH[n] ?? n).replace(/臺/g, '台'); }

const Bus = (() => {
  const handlers = {};
  return {
    on(event, handler) { (handlers[event] = handlers[event] || []).push(handler); },
    emit(event, payload) { (handlers[event] || []).forEach(fn => fn(payload)); }
  };
})();

const Clock = (() => {
  let lastTick = '';
  function tick() {
    const n = new Date();
    const t = n.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    if (t !== lastTick) {
      if ($('js-clk')) $('js-clk').textContent = t;
      if ($('js-date')) $('js-date').textContent = n.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
      lastTick = t;
    }
    requestAnimationFrame(tick);
  }
  return { init() { requestAnimationFrame(tick); } };
})();

const Toast = (() => {
  let timer;
  return {
    show(msg, dur = 2400) {
      const $toast = $('toast');
      if (!$toast) return;
      $toast.textContent = msg;
      $toast.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => $toast.classList.remove('show'), dur);
    }
  };
})();

const Lazy = (() => {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      img.src = img.dataset.src;
      img.onload = () => img.classList.add('in');
      observer.unobserve(img);
    });
  }, { rootMargin: '120px' });
  return { watch(root) { root.querySelectorAll('img[data-src]').forEach(img => observer.observe(img)); } };
})();
