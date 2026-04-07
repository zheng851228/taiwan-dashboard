'use strict';
const CWA_KEY = 'CWA-57962C34-72D2-446D-98D4-63B80BD8F9FB';
const C = {
  MAP: { center: [23.8, 121.0], zoom: 7, cityZoom: 13, flyDur: 1.2 },
  TILES: {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  },
  ROUTE_RADIUS_KM: 1.0,
  ROUTE_THIN_STEP: 3,
  COLS: {
    dark: { free: '#22c55e', slow: '#f59e0b', bad: '#ef4444' },
    light: { free: '#16a34a', slow: '#d97706', bad: '#dc2626' }
  },
  SRC: {
    tdx: { lbl: 'TDX平台', col: '#3b82f6' },
    city: { lbl: '縣市政府', col: '#8b5cf6' },
    yt: { lbl: 'YouTube', col: '#ff0000' }
  },
  ST: {
    free: { lbl: '順暢', p: 'bg-free', c: 'c-free' },
    slow: { lbl: '緩慢', p: 'bg-slow', c: 'c-slow' },
    bad: { lbl: '壅塞', p: 'bg-bad', c: 'c-bad' }
  },
  STAT_LBL: { free: '順暢路段', slow: '緩慢路段', bad: '壅塞路段' }
};
