(function() {
‘use strict’;

// 全台縣市中心座標
window.COUNTY_CENTERS = {
‘台北市’:   [25.0330, 121.5654],
‘新北市’:   [25.0120, 121.4653],
‘基隆市’:   [25.1283, 121.7419],
‘桃園市’:   [24.9937, 121.3010],
‘新竹市’:   [24.8138, 120.9675],
‘新竹縣’:   [24.6877, 121.1565],
‘苗栗縣’:   [24.2603, 120.7986],
‘台中市’:   [24.1477, 120.6736],
‘彰化縣’:   [23.9916, 120.6158],
‘南投縣’:   [23.9609, 120.9718],
‘雲林縣’:   [23.7092, 120.4313],
‘嘉義市’:   [23.4801, 120.4491],
‘嘉義縣’:   [23.4518, 120.2554],
‘台南市’:   [22.9999, 120.2270],
‘高雄市’:   [22.6273, 120.3014],
‘屏東縣’:   [22.5519, 120.5487],
‘宜蘭縣’:   [24.6941, 121.7378],
‘花蓮縣’:   [23.9871, 121.6015],
‘台東縣’:   [22.7972, 121.0713],
‘澎湖縣’:   [23.5711, 119.5793],
‘金門縣’:   [24.4493, 118.3765],
‘連江縣’:   [26.1971, 119.9395]
};

// 靜態 CCTV 資料（主要路段範例，可自行擴充）
var STATIC_CAMS = [
// 北部
{ id: ‘s001’, name: ‘國道1號-基隆端’, county: ‘基隆市’, lat: 25.1190, lng: 121.7218, url: ‘https://cctv.thb.gov.tw/001.jpg’, status: ‘smooth’ },
{ id: ‘s002’, name: ‘台北交流道’, county: ‘台北市’, lat: 25.0500, lng: 121.5200, url: ‘https://cctv.thb.gov.tw/002.jpg’, status: ‘smooth’ },
{ id: ‘s003’, name: ‘新北板橋’, county: ‘新北市’, lat: 25.0138, lng: 121.4635, url: ‘https://cctv.thb.gov.tw/003.jpg’, status: ‘slow’ },
{ id: ‘s004’, name: ‘桃園南崁’, county: ‘桃園市’, lat: 25.0610, lng: 121.2993, url: ‘https://cctv.thb.gov.tw/004.jpg’, status: ‘smooth’ },
{ id: ‘s005’, name: ‘新竹關西’, county: ‘新竹縣’, lat: 24.7946, lng: 121.1740, url: ‘https://cctv.thb.gov.tw/005.jpg’, status: ‘smooth’ },
// 中部
{ id: ‘s006’, name: ‘苗栗三義’, county: ‘苗栗縣’, lat: 24.3997, lng: 120.7576, url: ‘https://cctv.thb.gov.tw/006.jpg’, status: ‘smooth’ },
{ id: ‘s007’, name: ‘台中清水’, county: ‘台中市’, lat: 24.3601, lng: 120.5678, url: ‘https://cctv.thb.gov.tw/007.jpg’, status: ‘jam’ },
{ id: ‘s008’, name: ‘彰化交流道’, county: ‘彰化縣’, lat: 24.0739, lng: 120.5372, url: ‘https://cctv.thb.gov.tw/008.jpg’, status: ‘slow’ },
{ id: ‘s009’, name: ‘雲林斗南’, county: ‘雲林縣’, lat: 23.6787, lng: 120.4785, url: ‘https://cctv.thb.gov.tw/009.jpg’, status: ‘smooth’ },
// 南部
{ id: ‘s010’, name: ‘嘉義水上’, county: ‘嘉義縣’, lat: 23.4589, lng: 120.3912, url: ‘https://cctv.thb.gov.tw/010.jpg’, status: ‘smooth’ },
{ id: ‘s011’, name: ‘台南新市’, county: ‘台南市’, lat: 23.0740, lng: 120.3123, url: ‘https://cctv.thb.gov.tw/011.jpg’, status: ‘smooth’ },
{ id: ‘s012’, name: ‘高雄岡山’, county: ‘高雄市’, lat: 22.7965, lng: 120.2956, url: ‘https://cctv.thb.gov.tw/012.jpg’, status: ‘slow’ },
{ id: ‘s013’, name: ‘屏東九如’, county: ‘屏東縣’, lat: 22.7263, lng: 120.4817, url: ‘https://cctv.thb.gov.tw/013.jpg’, status: ‘smooth’ },
// 東部
{ id: ‘s014’, name: ‘宜蘭頭城’, county: ‘宜蘭縣’, lat: 24.8622, lng: 121.8192, url: ‘https://cctv.thb.gov.tw/014.jpg’, status: ‘smooth’ },
{ id: ‘s015’, name: ‘花蓮北埔’, county: ‘花蓮縣’, lat: 24.1326, lng: 121.6298, url: ‘https://cctv.thb.gov.tw/015.jpg’, status: ‘smooth’ },
{ id: ‘s016’, name: ‘台東卑南’, county: ‘台東縣’, lat: 22.7423, lng: 121.1416, url: ‘https://cctv.thb.gov.tw/016.jpg’, status: ‘smooth’ },
// 交通部 CCTV (外部 API 示範補充)
{ id: ‘s017’, name: ‘雪山隧道北口’, county: ‘新北市’, lat: 25.0234, lng: 121.7609, url: ‘https://tisvcloud.freeway.gov.tw/cctv/01.jpg’, status: ‘unknown’ },
{ id: ‘s018’, name: ‘國道3號木柵’, county: ‘台北市’, lat: 24.9941, lng: 121.5729, url: ‘https://tisvcloud.freeway.gov.tw/cctv/02.jpg’, status: ‘unknown’ },
{ id: ‘s019’, name: ‘台9線南迴’, county: ‘台東縣’, lat: 22.3219, lng: 120.8784, url: ‘https://cctv.thb.gov.tw/019.jpg’, status: ‘smooth’ },
{ id: ‘s020’, name: ‘蘇花公路’, county: ‘花蓮縣’, lat: 24.0890, lng: 121.7012, url: ‘https://cctv.thb.gov.tw/020.jpg’, status: ‘smooth’ }
];

// 交通部高速公路 CCTV API (動態)
var THB_CCTV_API = ‘https://tisvcloud.freeway.gov.tw/history/TDCS_M04A/latest.xml’;

// 取得所有攝影機 (靜態 + 快取動態)
var _dynamicCams = [];
var _loaded = false;

window.Data = {
getCams: function() {
return STATIC_CAMS.concat(_dynamicCams);
},
allCams: function() {
return STATIC_CAMS.concat(_dynamicCams);
},
loadDynamic: function() {
// 嘗試載入交通部動態資料（HTTPS OK）
fetch(‘https://ptx.transportdata.tw/MOTC/v2/Road/Traffic/Live?%24top=50&%24format=JSON’)
.then(function(r) { return r.json(); })
.then(function(arr) {
if (!Array.isArray(arr)) return;
arr.forEach(function(item) {
if (item.PositionLat && item.PositionLon) {
*dynamicCams.push({
id: ’dyn*’ + item.CCTVId,
name: item.CCTVName || item.CCTVId,
county: item.County || ‘未知’,
lat: parseFloat(item.PositionLat),
lng: parseFloat(item.PositionLon),
url: item.VideoStreamURL || ‘’,
status: ‘unknown’
});
}
});
_loaded = true;
Bus.emit(‘cams:updated’);
})
.catch(function() {
_loaded = true;
Bus.emit(‘cams:updated’);
});
},
// 氣象資料
weather: {},
fetchWeather: function() {
var url = ‘https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001?Authorization=’ +
Config.CWA_KEY + ‘&format=JSON&limit=50’;
fetch(url)
.then(function(r) { return r.json(); })
.then(function(json) {
var stations = json && json.records && json.records.Station;
if (!Array.isArray(stations)) return;
stations.forEach(function(s) {
var county = s.GeoInfo && s.GeoInfo.CountyName;
if (!county) return;
var obs = s.WeatherElement;
if (!Data.weather[county]) {
Data.weather[county] = {
temp: obs && obs.AirTemperature,
weather: obs && obs.Weather,
rain: obs && obs.Now && obs.Now.Precipitation
};
}
});
Bus.emit(‘weather:updated’);
})
.catch(function() {});
}
};

window.Data.loadDynamic();
window.Data.fetchWeather();
})();