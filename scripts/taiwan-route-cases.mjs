export const TAIWAN_REGIONS = [
  '基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣',
  '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義市',
  '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣',
  '台東縣', '澎湖縣', '金門縣', '連江縣'
];

function stop(name, lat, lng) {
  return { name, lat, lng, type: 'break' };
}

export const TAIWAN_ROUTE_CASES = [
  {
    id: 'north-keelung-taipei',
    name: '基隆車站 -> 台北車站',
    category: 'regional',
    regions: ['基隆市', '台北市'],
    plate: 'white',
    locations: [stop('基隆車站', 25.1327, 121.7393), stop('台北車站', 25.0478, 121.517)],
    distanceKm: [20, 45]
  },
  {
    id: 'north-taipei-tamsui',
    name: '台北車站 -> 淡水',
    category: 'regional',
    regions: ['台北市', '新北市'],
    plate: 'white',
    locations: [stop('台北車站', 25.0478, 121.517), stop('淡水老街', 25.1676, 121.445)],
    distanceKm: [18, 45]
  },
  {
    id: 'north-banqiao-taoyuan',
    name: '板橋 -> 桃園',
    category: 'regional',
    regions: ['新北市', '桃園市'],
    plate: 'white',
    locations: [stop('板橋車站', 25.0143, 121.4637), stop('桃園車站', 24.9892, 121.3133)],
    distanceKm: [15, 60]
  },
  {
    id: 'north-taoyuan-hsinchu',
    name: '桃園 -> 新竹',
    category: 'regional',
    regions: ['桃園市', '新竹縣', '新竹市'],
    plate: 'white',
    locations: [stop('桃園車站', 24.9892, 121.3133), stop('新竹車站', 24.8016, 120.9716)],
    distanceKm: [45, 95]
  },
  {
    id: 'west-hsinchu-miaoli',
    name: '新竹 -> 苗栗',
    category: 'regional',
    regions: ['新竹市', '新竹縣', '苗栗縣'],
    plate: 'white',
    locations: [stop('新竹車站', 24.8016, 120.9716), stop('苗栗車站', 24.5700, 120.8223)],
    distanceKm: [30, 95]
  },
  {
    id: 'west-miaoli-taichung',
    name: '苗栗 -> 台中',
    category: 'regional',
    regions: ['苗栗縣', '台中市'],
    plate: 'white',
    locations: [stop('苗栗車站', 24.5700, 120.8223), stop('台中車站', 24.1370, 120.6868)],
    distanceKm: [50, 105]
  },
  {
    id: 'west-taichung-changhua',
    name: '台中 -> 彰化',
    category: 'regional',
    regions: ['台中市', '彰化縣'],
    plate: 'white',
    locations: [stop('台中車站', 24.1370, 120.6868), stop('彰化車站', 24.0818, 120.5385)],
    distanceKm: [18, 50]
  },
  {
    id: 'central-taichung-puli',
    name: '台中 -> 埔里',
    category: 'regional',
    regions: ['台中市', '南投縣'],
    plate: 'white',
    locations: [stop('台中車站', 24.1370, 120.6868), stop('埔里', 23.9660, 120.9680)],
    distanceKm: [45, 100]
  },
  {
    id: 'west-changhua-yunlin',
    name: '彰化 -> 斗六',
    category: 'regional',
    regions: ['彰化縣', '雲林縣'],
    plate: 'white',
    locations: [stop('彰化車站', 24.0818, 120.5385), stop('斗六車站', 23.7110, 120.5411)],
    distanceKm: [45, 110]
  },
  {
    id: 'west-yunlin-chiayi',
    name: '斗六 -> 嘉義',
    category: 'regional',
    regions: ['雲林縣', '嘉義縣', '嘉義市'],
    plate: 'white',
    locations: [stop('斗六車站', 23.7110, 120.5411), stop('嘉義車站', 23.4791, 120.4412)],
    distanceKm: [30, 70]
  },
  {
    id: 'mountain-chiayi-alishan',
    name: '嘉義 -> 阿里山',
    category: 'critical',
    regions: ['嘉義市', '嘉義縣'],
    plate: 'white',
    locations: [stop('嘉義車站', 23.4791, 120.4412), stop('阿里山', 23.5110, 120.8050)],
    distanceKm: [55, 115]
  },
  {
    id: 'west-chiayi-tainan',
    name: '嘉義 -> 台南',
    category: 'regional',
    regions: ['嘉義市', '嘉義縣', '台南市'],
    plate: 'white',
    locations: [stop('嘉義車站', 23.4791, 120.4412), stop('台南車站', 22.9971, 120.2127)],
    distanceKm: [55, 115]
  },
  {
    id: 'west-tainan-kaohsiung-white',
    name: '台南 -> 高雄（白牌）',
    category: 'plate',
    regions: ['台南市', '高雄市'],
    plate: 'white',
    locations: [stop('台南車站', 22.9971, 120.2127), stop('高雄車站', 22.6394, 120.3020)],
    distanceKm: [40, 95]
  },
  {
    id: 'south-kaohsiung-pingtung',
    name: '高雄 -> 屏東',
    category: 'regional',
    regions: ['高雄市', '屏東縣'],
    plate: 'white',
    locations: [stop('高雄車站', 22.6394, 120.3020), stop('屏東車站', 22.6692, 120.4863)],
    distanceKm: [18, 55]
  },
  {
    id: 'south-pingtung-hengchun',
    name: '屏東 -> 恆春',
    category: 'critical',
    regions: ['屏東縣'],
    plate: 'white',
    locations: [stop('屏東車站', 22.6692, 120.4863), stop('恆春', 22.0038, 120.7430)],
    distanceKm: [80, 150]
  },
  {
    id: 'north-cross-taipei-yilan',
    name: '台北 -> 宜蘭（北宜）',
    category: 'critical',
    regions: ['台北市', '新北市', '宜蘭縣'],
    plate: 'yellow',
    locations: [stop('台北車站', 25.0478, 121.517), stop('宜蘭車站', 24.7540, 121.7580)],
    distanceKm: [65, 115]
  },
  {
    id: 'east-yilan-suao',
    name: '宜蘭 -> 蘇澳',
    category: 'regional',
    regions: ['宜蘭縣'],
    plate: 'white',
    locations: [stop('宜蘭車站', 24.7540, 121.7580), stop('蘇澳車站', 24.5960, 121.8510)],
    distanceKm: [18, 50]
  },
  {
    id: 'east-suhua',
    name: '蘇澳 -> 花蓮（蘇花）',
    category: 'critical',
    regions: ['宜蘭縣', '花蓮縣'],
    plate: 'white',
    locations: [stop('蘇澳車站', 24.5960, 121.8510), stop('花蓮車站', 23.9937, 121.6013)],
    distanceKm: [85, 150]
  },
  {
    id: 'east-hualien-taitung',
    name: '花蓮 -> 台東',
    category: 'critical',
    regions: ['花蓮縣', '台東縣'],
    plate: 'white',
    locations: [stop('花蓮車站', 23.9937, 121.6013), stop('台東車站', 22.7937, 121.1230)],
    distanceKm: [150, 235]
  },
  {
    id: 'south-cross-taitung-fangliao',
    name: '台東 -> 枋寮（南迴）',
    category: 'critical',
    regions: ['台東縣', '屏東縣'],
    plate: 'yellow',
    locations: [stop('台東車站', 22.7937, 121.1230), stop('枋寮車站', 22.3672, 120.5924)],
    distanceKm: [105, 200]
  },
  {
    id: 'island-penghu',
    name: '澎湖馬公 -> 西嶼',
    category: 'island',
    regions: ['澎湖縣'],
    plate: 'white',
    locations: [stop('馬公', 23.5663, 119.5770), stop('西嶼外垙', 23.5646, 119.4782)],
    distanceKm: [20, 60]
  },
  {
    id: 'island-kinmen',
    name: '金門金城 -> 金湖',
    category: 'island',
    regions: ['金門縣'],
    plate: 'white',
    locations: [stop('金城', 24.4321, 118.3171), stop('金湖', 24.4412, 118.4196)],
    distanceKm: [8, 35]
  },
  {
    id: 'island-matsu-nangan',
    name: '馬祖南竿福澳 -> 馬祖村',
    category: 'island',
    regions: ['連江縣'],
    plate: 'white',
    locations: [stop('福澳港', 26.1592, 119.9432), stop('馬祖村', 26.1513, 119.9285)],
    distanceKm: [1, 15]
  },
  {
    id: 'plate-hsinchu-taichung-white',
    name: '新竹 -> 台中（白牌）',
    category: 'plate',
    regions: ['新竹市', '新竹縣', '苗栗縣', '台中市'],
    plate: 'white',
    locations: [stop('新竹車站', 24.8016, 120.9716), stop('台中車站', 24.1370, 120.6868)],
    distanceKm: [90, 180]
  },
  {
    id: 'plate-hsinchu-taichung-yellow',
    name: '新竹 -> 台中（黃牌）',
    category: 'plate',
    regions: ['新竹市', '新竹縣', '苗栗縣', '台中市'],
    plate: 'yellow',
    locations: [stop('新竹車站', 24.8016, 120.9716), stop('台中車站', 24.1370, 120.6868)],
    distanceKm: [90, 180]
  },
  {
    id: 'plate-tainan-kaohsiung-red',
    name: '台南 -> 高雄（紅牌）',
    category: 'plate',
    regions: ['台南市', '高雄市'],
    plate: 'red',
    locations: [stop('台南車站', 22.9971, 120.2127), stop('高雄車站', 22.6394, 120.3020)],
    distanceKm: [40, 95]
  },
  {
    id: 'stress-round-island-multistop',
    name: '本島環島多停靠骨架',
    category: 'stress',
    regions: TAIWAN_REGIONS.filter((region) => !['澎湖縣', '金門縣', '連江縣'].includes(region)),
    plate: 'yellow',
    locations: [
      stop('台北', 25.0478, 121.5170),
      stop('花蓮', 23.9937, 121.6013),
      stop('台東', 22.7937, 121.1230),
      stop('高雄', 22.6394, 120.3020),
      stop('台中', 24.1370, 120.6868),
      stop('台北', 25.0478, 121.5170)
    ],
    distanceKm: [750, 1400]
  }
];
