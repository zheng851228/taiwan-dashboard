(function() {
‘use strict’;

window.Config = {
CWA_KEY: ‘CWA-57962C34-72D2-446D-98D4-63B80BD8F9FB’,
MAP_CENTER: [23.9, 121.0],
MAP_ZOOM: 7,
ROUTE_FILTER_KM: 1.0,
SIMPLIFY_STEP: 5,
TILE_DARK: ‘https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png’,
TILE_LIGHT: ‘https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png’,
TILE_ATTR: ‘© OpenStreetMap © CARTO’,
STATUS_COLOR: {
smooth:  ‘#3fb950’,
slow:    ‘#d29922’,
jam:     ‘#da3633’,
unknown: ‘#8b949e’
},
REGIONS: {
north:   [‘台北市’,‘新北市’,‘基隆市’,‘桃園市’,‘新竹市’,‘新竹縣’,‘宜蘭縣’],
central: [‘苗栗縣’,‘台中市’,‘彰化縣’,‘南投縣’,‘雲林縣’],
south:   [‘嘉義市’,‘嘉義縣’,‘台南市’,‘高雄市’,‘屏東縣’],
east:    [‘花蓮縣’,‘台東縣’],
island:  [‘澎湖縣’,‘金門縣’,‘連江縣’]
}
};
})();