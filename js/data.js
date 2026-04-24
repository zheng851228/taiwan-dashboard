// Remote data loading and normalization.

(function() {
  'use strict';

  // 依攝影機名稱推斷縣市
  function guessCountyByName(name) {
    var map = [
      ['基隆','基隆市'],['台北','台北市'],['臺北','台北市'],['新北','新北市'],
      ['桃園','桃園市'],['新竹','新竹市'],['苗栗','苗栗縣'],
      ['台中','台中市'],['臺中','台中市'],['彰化','彰化縣'],['南投','南投縣'],
      ['雲林','雲林縣'],['嘉義','嘉義市'],['台南','台南市'],['臺南','台南市'],
      ['高雄','高雄市'],['屏東','屏東縣'],['宜蘭','宜蘭縣'],
      ['花蓮','花蓮縣'],['台東','台東縣'],['臺東','台東縣'],
      ['澎湖','澎湖縣'],['金門','金門縣'],['馬祖','連江縣'],
      ['汐止','新北市'],['板橋','新北市'],['三重','新北市'],['中和','新北市'],
      ['永和','新北市'],['新莊','新北市'],['五股','新北市'],['林口','新北市'],
      ['楊梅','桃園市'],['中壢','桃園市'],['龍潭','桃園市'],
      ['頭份','苗栗縣'],['三義','苗栗縣'],['竹南','苗栗縣'],
      ['豐原','台中市'],['大雅','台中市'],['南屯','台中市'],['大甲','台中市'],
      ['王田','彰化縣'],['員林','彰化縣'],['北斗','彰化縣'],['埔鹽','彰化縣'],
      ['西螺','雲林縣'],['虎尾','雲林縣'],['斗南','雲林縣'],['斗六','雲林縣'],
      ['民雄','嘉義縣'],['水上','嘉義縣'],['竹崎','嘉義縣'],['梅山','嘉義縣'],
      ['新營','台南市'],['麻豆','台南市'],['永康','台南市'],['仁德','台南市'],
      ['岡山','高雄市'],['楠梓','高雄市'],['鼎金','高雄市'],['燕巢','高雄市'],
      ['旗山','高雄市'],['林邊','屏東縣'],['萬丹','屏東縣'],['竹田','屏東縣'],
      ['頭城','宜蘭縣'],['蘇澳','宜蘭縣'],['坪林','新北市'],['石碇','新北市'],
      ['太魯閣','花蓮縣'],['秀林','花蓮縣'],['關原','花蓮縣']
    ];
    for (var i = 0; i < map.length; i++) {
      if (name.indexOf(map[i][0]) !== -1) return map[i][1];
    }
    return null;
  }

  // 依座標反推縣市（用最近縣市中心）
  function guessCountyByCoord(lat, lng) {
    var best = null, minD = 1e9;
    for (var c in window.COUNTY_CENTERS) {
      var cc = window.COUNTY_CENTERS[c];
      var dLat = (cc[0] - lat);
      var dLng = (cc[1] - lng);
      var d = dLat*dLat + dLng*dLng;
      if (d < minD) { minD = d; best = c; }
    }
    return best || '台灣';
  }

  // 優先名稱，失敗再用座標
  function guessCounty(name, lat, lng) {
    var byName = guessCountyByName(name);
    if (byName) return byName;
    if (lat && lng) return guessCountyByCoord(lat, lng);
    return '台灣';
  }

  window.COUNTY_CENTERS = {
    '台北市':[25.0330,121.5654],'新北市':[25.0120,121.4653],'基隆市':[25.1283,121.7419],
    '桃園市':[24.9937,121.3010],'新竹市':[24.8138,120.9675],'新竹縣':[24.6877,121.1565],
    '苗栗縣':[24.2603,120.7986],'台中市':[24.1477,120.6736],'彰化縣':[23.9916,120.6158],
    '南投縣':[23.9609,120.9718],'雲林縣':[23.7092,120.4313],'嘉義市':[23.4801,120.4491],
    '嘉義縣':[23.4518,120.2554],'台南市':[22.9999,120.2270],'高雄市':[22.6273,120.3014],
    '屏東縣':[22.5519,120.5487],'宜蘭縣':[24.6941,121.7378],'花蓮縣':[23.9871,121.6015],
    '台東縣':[22.7972,121.0713],'澎湖縣':[23.5711,119.5793],'金門縣':[24.4493,118.3765],
    '連江縣':[26.1971,119.9395]
  };

  // 攝影機分類規則
  function classifyCam(id) {
    if (/^n[0-9]/.test(id))        return 'highway';   // 國道
    if (/^t[0-9]/.test(id) && /[ew]-/.test(id)) return 'expressway'; // 快速道路（有東西向）
    if (/^t[0-9]/.test(id))        return 'provincial'; // 省道
    if (/^wra-|^forest-|^taroko/.test(id)) return 'scenic'; // 熱門景點
    if (/^city-|^tpe-|^tpn-|^kh-/.test(id)) return 'city';  // 市區
    return 'other';
  }

  var _cams = [];

  window.Data = {
    weather: {},
    weatherState: 'idle',
    camsState: 'idle',
    allCams: function() { return _cams; },
    loadDynamic: function() {
      Diag.info('開始載入資料...');
      Data.camsState = 'loading';
      var PROXY = 'https://url-expander.lucky851228.workers.dev/cam-list';

      fetchJson(PROXY).then(function(apiData) {
        Diag.add('cam-list HTTP 200', 'ok');
        return apiData;
      }).catch(function(e){
        Diag.err('cam-list 失敗: ' + e.message);
        Data.camsState = 'error';
        return [];
      }).then(function(apiData) {
        Diag.info('cam-list 筆數: ' + (Array.isArray(apiData) ? apiData.length : 'NOT ARRAY'));
        if (Array.isArray(apiData)) {
          _cams = apiData
            .filter(function(c) {
              return c.lat > 21 && c.lat < 26 && c.lon > 118 && c.lon < 123;
            })
            .map(function(c) {
              var cat = classifyCam(c.id);
              var county = guessCounty(c.name, c.lat, c.lon);
              return {
                id:     c.id,
                name:   c.name,
                county: county,
                lat:    c.lat,
                lng:    c.lon,
                url:    c.cam_url,
                type:   'cctv',
                cat:    cat,
                status: 'unknown'
              };
            });
          Diag.ok('CCTV: ' + _cams.length + ' 支');
          Data.camsState = _cams.length > 0 ? 'ready' : (Data.camsState === 'error' ? 'error' : 'empty');
        }
        var statEl = Dom.byId('js-stat-cams');
        if (statEl) statEl.textContent = _cams.length;
        if (_cams.length === 0) {
          Diag.err('CCTV 為 0，Worker 可能需要更新');
          Diag.show();
          setTimeout(function() { Toast.show('\u26a0\ufe0f CCTV \u8cc7\u6599\u672a\u8f09\u5165', 4000); }, 1500);
        }
        Bus.emit('cams:updated');
      });
    },
    fetchWeather: function() {
      Data.weatherState = 'loading';
      var PROXY = 'https://url-expander.lucky851228.workers.dev/weather';
      fetchJson(PROXY)
        .then(function(result) {
          // Worker 已整理好：{ 台北市: { temp, weather, name, town }, ... }
          Data.weather = {};
          Object.keys(result).forEach(function(county) {
            Data.weather[county] = result[county];
          });
          Data.weatherState = Object.keys(Data.weather).length > 0 ? 'ready' : 'empty';
          Bus.emit('weather:updated');
        })
        .catch(function() {
          // fallback 直連 CWA
          var url = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001' +
                    '?Authorization=' + Config.CWA_KEY + '&format=JSON';
          fetchJson(url).then(function(json){
            var st = json && json.records && json.records.Station;
            if (!Array.isArray(st)) {
              Data.weatherState = 'error';
              Bus.emit('weather:updated');
              return;
            }
            Data.weather = {};
            st.forEach(function(s) {
              var c = s.GeoInfo && s.GeoInfo.CountyName;
              if (!c) return;
              var obs = s.WeatherElement;
              Data.weather[c] = { temp: obs && obs.AirTemperature, weather: obs && obs.Weather };
            });
            Data.weatherState = Object.keys(Data.weather).length > 0 ? 'ready' : 'empty';
            Bus.emit('weather:updated');
          }).catch(function(){
            Data.weatherState = 'error';
            Bus.emit('weather:updated');
          });
        });
    }
  };

  window.Data.loadDynamic();
  window.Data.fetchWeather();
})();
