export const RULES_VERSION = 'tw-moto-2026-01';

export const RULE_SOURCES = [
  'https://www.thb.gov.tw/News_ExpresswaySection.aspx?PageSize=200&n=462&sms=13790',
  'https://www.freeway.gov.tw/Publish.aspx?cnid=183&p=379'
];

const EXPRESSWAY_REFS = new Set([
  '台2己', '台61', '台62', '台64', '台65', '台66', '台68', '台72',
  '台74', '台76', '台78', '台82', '台84', '台86', '台88'
]);

const HEAVY_RESTRICTED_SECTIONS = [
  { roadRef: '台65', names: /土城一交流道|土城交流道/, range: '土城一交流道至土城交流道' },
  { roadRef: '台74', names: /草湖交流道|霧峰交流道/, range: '草湖交流道至霧峰交流道' },
  { roadRef: '台76', names: /林厝交流道|中興系統交流道|八卦山隧道/, range: '林厝交流道至中興系統交流道' },
  { roadRef: '台78', names: /古坑交流道|古坑系統交流道/, range: '古坑交流道至古坑系統交流道' },
  { roadRef: '台82', names: /嘉義交流道|水上系統交流道/, range: '嘉義交流道至水上系統交流道' },
  { roadRef: '台88', names: /五甲系統交流道|鳳山交流道/, range: '五甲系統交流道至鳳山交流道' }
];

function normalizeRoadText(value) {
  return String(value || '')
    .replace(/臺/g, '台')
    .replace(/\s+/g, '')
    .replace(/公路|線/g, '');
}

export function extractRoadRef(edge) {
  const names = Array.isArray(edge.names) ? edge.names : [];
  const text = normalizeRoadText([edge.roadRef, ...names].filter(Boolean).join(' '));
  const national = text.match(/國道(\d+)(甲)?/);
  if (national) return `國道${national[1]}${national[2] || ''}`;
  const provincial = text.match(/台(\d+)(甲|乙|丙|丁|戊|己)?/);
  if (provincial) return `台${provincial[1]}${provincial[2] || ''}`;
  return '';
}

function violation(edge, edgeIndex, code, message, confidence = 'certain') {
  return {
    code,
    message,
    confidence,
    edgeIndex,
    roadRef: extractRoadRef(edge),
    roadName: (edge.names || [])[0] || '',
    beginShapeIndex: Number(edge.beginShapeIndex || 0),
    endShapeIndex: Number(edge.endShapeIndex || edge.beginShapeIndex || 0)
  };
}

export function validateRouteEdges(edges, vehicle = {}) {
  const plate = vehicle.plate || 'white';
  const vehicleType = vehicle.type || 'motorcycle';
  if (vehicleType === 'car') {
    return createValidation([]);
  }

  const violations = [];
  edges.forEach((edge, edgeIndex) => {
    const roadRef = extractRoadRef(edge);
    const joinedName = normalizeRoadText((edge.names || []).join(' '));
    const roadClass = normalizeRoadText(edge.roadClass).toLowerCase();
    const use = normalizeRoadText(edge.use).toLowerCase();
    const isNationalFreeway = roadRef.startsWith('國道');
    const isExpressway = EXPRESSWAY_REFS.has(roadRef) || joinedName.includes('快速') || joinedName.includes('東西向');
    const isHeavyPlate = plate === 'yellow' || plate === 'red';
    const traversability = String(edge.traversability || '').toLowerCase();
    const directionBlocked = edge.motorcycleAccess === false
      || String(edge.motorcycleAccess || '').toLowerCase() === 'no'
      || traversability === 'none'
      || (edge.forward === true && traversability === 'backward')
      || (edge.forward === false && traversability === 'forward');

    if (directionBlocked) {
      violations.push(violation(edge, edgeIndex, 'directional-motorcycle-restriction', '此行進方向禁止機車通行'));
      return;
    }

    if (isNationalFreeway) {
      if (roadRef === '國道3甲' && isHeavyPlate) return;
      violations.push(violation(edge, edgeIndex, 'national-freeway', `${roadRef || '國道'}禁止此牌照機車通行`));
      return;
    }

    if (plate === 'white' && isExpressway) {
      violations.push(violation(edge, edgeIndex, 'white-plate-expressway', `${roadRef || '快速道路'}禁止白牌機車通行`));
      return;
    }

    const restrictedSection = isHeavyPlate && HEAVY_RESTRICTED_SECTIONS.find((item) => (
      item.roadRef === roadRef && item.names.test(joinedName)
    ));
    if (restrictedSection) {
      violations.push(violation(
        edge,
        edgeIndex,
        'heavy-motorcycle-restricted-section',
        `${restrictedSection.roadRef}線${restrictedSection.range}禁止大型重型機車通行`
      ));
      return;
    }

    if (isHeavyPlate && roadRef === '台2己' && /南下|southbound/.test(joinedName)) {
      violations.push(violation(edge, edgeIndex, 'directional-motorcycle-restriction', '台2己線南下路段禁止大型重型機車通行'));
      return;
    }

    const looksLikeUnidentifiedFreeway = roadClass === 'motorway'
      || use === 'motorway'
      || (use === 'ramp' && roadClass === 'trunk');
    if (looksLikeUnidentifiedFreeway && !roadRef) {
      violations.push(violation(
        edge,
        edgeIndex,
        'unverified-controlled-road',
        '無法確認封閉式道路的機車通行資格',
        'uncertain'
      ));
    }
  });

  const unique = violations.filter((item, index, list) => (
    list.findIndex((candidate) => candidate.code === item.code && candidate.edgeIndex === item.edgeIndex) === index
  ));
  return createValidation(unique);
}

function createValidation(violations) {
  return {
    status: violations.length ? 'blocked' : 'safe',
    rulesVersion: RULES_VERSION,
    checkedAt: new Date().toISOString(),
    sources: RULE_SOURCES,
    violations
  };
}

export function buildAvoidLocations(violations, coordinates) {
  const seen = new Set();
  const locations = [];
  for (const item of violations) {
    const middle = Math.max(0, Math.min(
      coordinates.length - 1,
      Math.round((item.beginShapeIndex + item.endShapeIndex) / 2)
    ));
    const point = coordinates[middle];
    if (!point) continue;
    const key = `${point[0].toFixed(5)},${point[1].toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({ lat: point[0], lon: point[1] });
    if (locations.length >= 5) break;
  }
  return locations;
}
