/**
 * data.js — 縣市資料庫、CCTV 標記與 CWA 氣象串接模組
 */

'use strict';

const Data = (() => {
  // 1. 內部資料庫 (範例包含北中東代表，其餘縣市可依格式新增)
  // rn: north, central, south, east, island
  const _cities = [
    {
      id: 'taipei', name: '台北市', lat: 25.0330, lng: 121.5654, rn: 'north',
      w: { t: '--', d: '載入中', h: '--', rain: '--', wind: '--', i: '⏳' },
      roads: [
        { n: '國道 1 號 (台北段)', s: 'free', nt: '全線順暢' },
        { n: '市民大道高架', s: 'slow', nt: '東向車多' }
      ],
      cams: [
        { id: 'tp-01', n: '忠孝基隆路口', lat: 25.0413, lng: 121.5652, src: 'yt', ytId: '2M_H-7Wp_7Y' },
        { id: 'tp-02', n: '承德市民路口', lat: 25.0487, lng: 121.5173, src: 'city', img: 'https://images.unsplash.com/photo-1545147418-403428905c14?auto=format&fit=crop&w=400' }
      ],
      _ms: 'free', _cnt: { free: 15, slow: 2, bad: 0 }
    },
    {
      id: 'taichung', name: '台中市', lat: 24.1477, lng: 120.6736, rn: 'central',
      w: { t: '--', d: '載入中', h: '--', rain: '--', wind: '--', i: '⏳' },
      roads: [
        { n: '台 74 線 (快官霧峰)', s: 'free', nt: '路況良好' },
        { n: '台灣大道二段', s: 'slow', nt: '接近百貨區車多' }
      ],
      cams: [
        { id: 'tc-01', n: '五權西路路口', lat: 24.1400, lng: 120.6500, src: 'yt', ytId: 'S-7p_p7L298' }
      ],
      _ms: 'free', _cnt: { free: 22, slow: 5, bad: 0 }
    },
    {
      id: 'hualien', name: '花蓮縣', lat: 23.9772, lng: 121.6044, rn: 'east',
      w: { t: '--', d: '載入中', h: '--', rain: '--', wind: '--', i: '⏳' },
      roads: [
        { n: '台 9 線 (蘇花改)', s: 'bad', nt: '特定路段施工管制' },
        { n: '台 11 線 (花東海岸)', s: 'free', nt: '一路順暢' }
      ],
      cams: [
        { id: 'hl-01', n: '蘇花改仁水隧道', lat: 24.2000, lng: 121.7000, src: 'tdx', img: 'https://images.unsplash.com/photo-1449156001934-03700499e1bc?auto=format&fit=crop&w=400' }
      ],
      _ms: 'slow', _cnt: { free: 8, slow: 12, bad: 3 }
    }
  ];

  // 2. 氣象狀態圖示對照表 (CWA Wx 數值)
  const WX_MAP = {
    '1': '☀️', '2': '⛅', '3': '⛅', '4': '☁️', '7': '☁️',
    '8': '🌧️', '10': '🌧️', '15': '⛈️', '22': '⛈️'
  };

  return {
    /**
     * 初始化：串接中央氣象署 API
     */
    async init() {
      try {
        // CWA_KEY 來自 config.js
        const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${CWA_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.success === 'true') {
          this.parseWeather(data.records.location);
          Bus.emit('weather:updated'); // 通知 main.js 重繪 UI
        } else {
          throw new Error('CWA API 回傳失敗');
        }
      } catch (e) {
        console.error('[Data] 氣象載入失敗，使用預設值', e);
        Bus.emit('weather:error');
      }
    },

    /**
     * 解析 API 回傳資料並更新到 _cities 陣列
     */
    parseWeather(locations) {
      locations.forEach(loc => {
        const standardName = normName(loc.locationName); // 處理 臺/台 補丁
        const target = _cities.find(c => c.name === standardName);
        if (target) {
          const elements = loc.weatherElement;
          const wx = elements.find(e => e.elementName === 'Wx').time[0].parameter;
          const minT = elements.find(e => e.elementName === 'MinT').time[0].parameter.parameterName;
          const pop = elements.find(e => e.elementName === 'PoP').time[0].parameter.parameterName;

          target.w = {
            t: minT,
            d: wx.parameterName,
            h: '70', // F-C0032-001 未提供濕度，設為常態值
            rain: pop,
            wind: '2.0',
            i: WX_MAP[wx.parameterValue] || '🌡️'
          };
        }
      });
    },

    // 取得所有縣市
    all() { return _cities; },

    // 取得特定縣市 (透過索引)
    byIdx(i) { return _cities[i]; },

    /**
     * 靈魂函式：將所有 CCTV 攤平為單一陣列
     * 供 RouteMod 進行高效率的經緯度線段距離運算
     */
    allCams() {
      return _cities.flatMap(city => 
        city.cams.map(cam => ({ 
          ...cam, 
          cityId: city.id, 
          cityName: city.name 
        }))
      );
    },

    /**
     * 綜合過濾器：處理 分區切換 + 搜尋關鍵字 + 路線感知
     */
    filter(region, search, routeFilter) {
      return _cities.filter(c => {
        const matchRegion = region === 'all' || c.rn === region;
        const matchSearch = c.name.includes(search);
        // routeFilter 是一個包含 cityId 的 Set
        const matchRoute  = !routeFilter || routeFilter.has(c.id);
        
        return matchRegion && matchSearch && matchRoute;
      });
    },

    // 手動觸發刷新
    refresh() { this.init(); }
  };
})();
