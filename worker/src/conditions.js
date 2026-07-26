import {
  bearingDegrees,
  cumulativeDistances,
  haversineKm,
  nearestCoordinateIndex
} from './polyline.js';
import { extractRoadRef, validateRouteEdges } from './rules.js';

const TRAFFIC_PRIORITY = { unknown: 0, clear: 1, slow: 2, congested: 3 };
const CAMERA_GRID_DEGREES = 0.05;

export function classifyTraffic(speedKph, referenceSpeedKph) {
  if (!Number.isFinite(speedKph) || !Number.isFinite(referenceSpeedKph) || referenceSpeedKph <= 0) {
    return 'unknown';
  }
  const ratio = speedKph / referenceSpeedKph;
  if (ratio >= 0.75) return 'clear';
  if (ratio >= 0.45) return 'slow';
  return 'congested';
}

export function isFresh(observedAt, maxAgeMinutes, now = new Date()) {
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.getTime())) return false;
  return now.getTime() - observed.getTime() <= maxAgeMinutes * 60 * 1000;
}

export function headingDifference(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

export function matchTrafficDetector(section, detectors, now = new Date()) {
  return (detectors || [])
    .map((detector) => ({
      detector,
      distanceKm: haversineKm(section.sample, [detector.lat, detector.lng])
    }))
    .filter(({ detector, distanceKm }) => (
      distanceKm <= 1
      && headingDifference(section.heading, detector.heading) < 60
      && isFresh(detector.observedAt, 10, now)
      && Number.isFinite(detector.speedKph)
      && Number.isFinite(detector.referenceSpeedKph)
      && detector.referenceSpeedKph > 0
    ))
    .sort((a, b) => {
      const aRoad = normalizeRoadRef(a.detector.roadRef) === normalizeRoadRef(section.roadRef) ? 0 : 1;
      const bRoad = normalizeRoadRef(b.detector.roadRef) === normalizeRoadRef(section.roadRef) ? 0 : 1;
      return aRoad - bRoad || a.distanceKm - b.distanceKm;
    })[0] || null;
}

export function matchPublishedTraffic(section, publishedSections, now = new Date()) {
  return (publishedSections || [])
    .filter((published) => (
      published.available !== false
      && normalizeRoadRef(published.roadRef) === normalizeRoadRef(section.roadRef)
      && headingDifference(section.heading, published.heading) < 60
      && isFresh(published.observedAt, 10, now)
      && Number.isFinite(published.speedKph)
      && Number.isFinite(published.referenceSpeedKph)
      && published.referenceSpeedKph > 0
      && Array.isArray(published.geometry)
      && published.geometry.length > 1
    ))
    .map((published) => ({
      published,
      distanceKm: distanceToGeometry(section.sample, published.geometry)
    }))
    .filter(({ distanceKm }) => distanceKm <= 1)
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

function distanceToGeometry(point, geometry) {
  return geometry.reduce((nearest, coordinate) => (
    Math.min(nearest, haversineKm(point, coordinate))
  ), Infinity);
}

function normalizeRoadRef(value) {
  return String(value || '').replace(/臺/g, '台').replace(/線|公路|\s/g, '');
}

export function createRouteSections(route) {
  const coordinates = route.geometry || [];
  if (coordinates.length < 2) return [];
  const cumulative = cumulativeDistances(coordinates);
  const measuredTotal = cumulative[cumulative.length - 1];
  const totalKm = Number(route.distanceKm) > 0 ? Number(route.distanceKm) : measuredTotal;
  const sectionCount = Math.max(1, Math.min(12, Math.ceil(totalKm / 10)));
  const targetLength = totalKm / sectionCount;
  const measuredScale = measuredTotal > 0 ? measuredTotal / totalKm : 1;

  const sections = [];
  for (let order = 1; order <= sectionCount; order += 1) {
    const fromKm = targetLength * (order - 1);
    const toKm = order === sectionCount ? totalKm : targetLength * order;
    const fromIndex = nearestCoordinateIndex(cumulative, fromKm * measuredScale);
    const toIndex = Math.max(fromIndex + 1, nearestCoordinateIndex(cumulative, toKm * measuredScale));
    const safeToIndex = Math.min(coordinates.length - 1, toIndex);
    const middleIndex = Math.min(
      coordinates.length - 1,
      nearestCoordinateIndex(cumulative, ((fromKm + toKm) / 2) * measuredScale)
    );
    const edge = findEdgeForIndex(route.edges || [], middleIndex);
    sections.push({
      order,
      fromKm: round(fromKm, 1),
      toKm: round(toKm, 1),
      roadRef: extractRoadRef(edge || {}) || (edge && edge.names && edge.names[0]) || '一般道路',
      roadName: (edge && edge.names && edge.names[0]) || '',
      geometry: coordinates.slice(fromIndex, safeToIndex + 1),
      sample: coordinates[middleIndex],
      heading: bearingDegrees(coordinates[fromIndex], coordinates[safeToIndex]),
      fromIndex,
      toIndex: safeToIndex
    });
  }
  return sections;
}

function findEdgeForIndex(edges, shapeIndex) {
  return edges.find((edge) => (
    Number(edge.beginShapeIndex || 0) <= shapeIndex
    && Number(edge.endShapeIndex || edge.beginShapeIndex || 0) >= shapeIndex
  )) || edges[0] || null;
}

export function fuseConditions(route, providerData, now = new Date()) {
  const sections = createRouteSections(route);
  const cameraGrid = buildCameraGrid(providerData.cameras);
  const fused = sections.map((section) => {
    const trafficMatch = matchTrafficDetector(section, providerData.detectors, now);
    const publishedMatch = trafficMatch
      ? null
      : matchPublishedTraffic(section, providerData.publishedTraffic, now);
    const traffic = trafficMatch
      ? trafficFromDetector(trafficMatch.detector)
      : (publishedMatch
        ? trafficFromPublishedSection(publishedMatch.published, publishedMatch.distanceKm)
        : unknownTraffic(providerData.trafficSource || 'TDX'));
    const weather = matchWeather(section, providerData.weather, now);
    const incidents = matchIncidents(section, providerData.incidents, now);
    const cameras = matchCameras(section, cameraGrid, route.vehicle);
    return {
      order: section.order,
      fromKm: section.fromKm,
      toKm: section.toKm,
      roadRef: section.roadRef,
      roadName: section.roadName,
      geometry: section.geometry,
      traffic,
      weather,
      incidents,
      cameras
    };
  });

  return {
    overall: buildOverall(fused),
    sections: fused
  };
}

function trafficFromDetector(detector) {
  return {
    level: classifyTraffic(detector.speedKph, detector.referenceSpeedKph),
    speedKph: round(detector.speedKph, 0),
    referenceSpeedKph: round(detector.referenceSpeedKph, 0),
    observedAt: detector.observedAt,
    source: detector.source || 'TDX',
    method: 'vd',
    detectorId: detector.id || null
  };
}

function trafficFromPublishedSection(published, distanceKm) {
  return {
    level: classifyTraffic(published.speedKph, published.referenceSpeedKph),
    speedKph: round(published.speedKph, 0),
    referenceSpeedKph: round(published.referenceSpeedKph, 0),
    observedAt: published.observedAt,
    source: published.source || 'TDX',
    method: 'published-section',
    sectionId: published.id || null,
    matchedDistanceKm: round(distanceKm, 2)
  };
}

function unknownTraffic(source) {
  return {
    level: 'unknown',
    speedKph: null,
    referenceSpeedKph: null,
    observedAt: null,
    source,
    message: '無可用或十分鐘內的交通資料'
  };
}

function matchWeather(section, samples, now) {
  const match = (samples || [])
    .map((sample) => ({ sample, distanceKm: haversineKm(section.sample, [sample.lat, sample.lng]) }))
    .filter(({ sample, distanceKm }) => distanceKm <= 50 && isFresh(sample.observedAt, 90, now))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
  if (!match) {
    return {
      condition: '未知',
      temperatureC: null,
      rainChance: null,
      observedAt: null,
      source: 'CWA',
      message: '附近沒有足夠新鮮的氣象資料'
    };
  }
  return {
    condition: match.sample.condition || '未知',
    temperatureC: Number.isFinite(match.sample.temperatureC) ? round(match.sample.temperatureC, 0) : null,
    rainChance: Number.isFinite(match.sample.rainChance) ? round(match.sample.rainChance, 0) : null,
    observedAt: match.sample.observedAt,
    forecastAt: match.sample.forecastAt || null,
    source: match.sample.source || 'CWA',
    stationDistanceKm: round(match.distanceKm, 1)
  };
}

function matchIncidents(section, incidents, now) {
  return (incidents || []).filter((incident) => {
    if (incident.expiresAt && new Date(incident.expiresAt) < now) return false;
    const sameRoad = normalizeRoadRef(incident.roadRef) === normalizeRoadRef(section.roadRef);
    const hasCoordinates = Number.isFinite(incident.lat) && Number.isFinite(incident.lng);
    const close = hasCoordinates
      ? haversineKm(section.sample, [incident.lat, incident.lng]) <= 3
      : false;
    return close || (!hasCoordinates && sameRoad);
  }).map((incident) => ({
    id: incident.id,
    title: incident.title || '道路事件',
    description: incident.description || '',
    severity: incident.severity || 'info',
    roadRef: incident.roadRef || section.roadRef,
    updatedAt: incident.updatedAt || null,
    source: incident.source || 'TDX'
  }));
}

function buildCameraGrid(cameras) {
  const buckets = new Map();
  const seen = new Set();
  for (const camera of cameras || []) {
    if (!Number.isFinite(camera.lat) || !Number.isFinite(camera.lng) || camera.prohibited) continue;
    const identity = cameraIdentity(camera);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const key = cameraGridKey(camera.lat, camera.lng);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(camera);
    else buckets.set(key, [camera]);
  }
  return buckets;
}

function cameraIdentity(camera) {
  const id = String(camera.id || '').trim();
  if (id) return `id:${id}`;
  const imageUrl = camera.imageUrl || camera.cam_url || camera.url || '';
  return `location:${camera.lat},${camera.lng}:${imageUrl}`;
}

function cameraGridKey(lat, lng) {
  return `${Math.floor(lat / CAMERA_GRID_DEGREES)},${Math.floor(lng / CAMERA_GRID_DEGREES)}`;
}

function nearbyCameraBuckets(section, cameraGrid, radiusKm) {
  if (!Array.isArray(section.sample) || section.sample.length < 2) return [];
  const [lat, lng] = section.sample;
  const latCell = Math.floor(lat / CAMERA_GRID_DEGREES);
  const lngCell = Math.floor(lng / CAMERA_GRID_DEGREES);
  const latCells = Math.ceil((radiusKm / 110.6) / CAMERA_GRID_DEGREES);
  const lngDegrees = radiusKm / (111.3 * Math.max(0.35, Math.cos(lat * Math.PI / 180)));
  const lngCells = Math.ceil(lngDegrees / CAMERA_GRID_DEGREES);
  const nearby = [];
  for (let latOffset = -latCells; latOffset <= latCells; latOffset += 1) {
    for (let lngOffset = -lngCells; lngOffset <= lngCells; lngOffset += 1) {
      const bucket = cameraGrid.get(`${latCell + latOffset},${lngCell + lngOffset}`);
      if (bucket) nearby.push(...bucket);
    }
  }
  return nearby;
}

function compareCameraCandidates(a, b) {
  return Number(b.sameRoad) - Number(a.sameRoad) || a.distanceKm - b.distanceKm;
}

function sameCameraRoad(section, camera) {
  const sectionValue = section.roadRef || section.roadName || '';
  const cameraValue = camera.roadRef || camera.name || '';
  const sectionRef = extractRoadRef({ roadRef: sectionValue, names: [sectionValue] });
  const cameraRef = extractRoadRef({ roadRef: cameraValue, names: [cameraValue] });
  if (sectionRef || cameraRef) return Boolean(sectionRef && cameraRef && sectionRef === cameraRef);
  const sectionName = normalizeRoadRef(sectionValue);
  const cameraName = normalizeRoadRef(cameraValue);
  return Boolean(sectionName && cameraName && sectionName === cameraName);
}

function matchCameras(section, cameraGrid, vehicle) {
  const selected = [];
  for (const camera of nearbyCameraBuckets(section, cameraGrid, 5)) {
    const distanceKm = haversineKm(section.sample, [camera.lat, camera.lng]);
    if (distanceKm > 5 || cameraRoadIsProhibited(camera, vehicle)) continue;
    const candidate = {
      camera,
      sameRoad: sameCameraRoad(section, camera),
      distanceKm
    };
    selected.push(candidate);
    selected.sort(compareCameraCandidates);
    if (selected.length > 2) selected.length = 2;
  }
  return selected
    .map(({ camera, distanceKm }) => ({
      id: camera.id,
      name: camera.name,
      lat: camera.lat,
      lng: camera.lng,
      imageUrl: camera.imageUrl || camera.cam_url || camera.url || '',
      status: camera.status || 'unknown',
      distanceKm: round(distanceKm, 1),
      source: camera.source || 'CCTV',
      label: '現場畫面'
    }));
}

function cameraRoadIsProhibited(camera, vehicle) {
  if (!vehicle || vehicle.type === 'car') return false;
  const roadName = camera.roadRef || camera.name || '';
  return validateRouteEdges([{
    names: [roadName],
    roadClass: '',
    use: 'road',
    beginShapeIndex: 0,
    endShapeIndex: 0
  }], vehicle).status !== 'safe';
}

export function buildOverall(sections) {
  const trafficCovered = sections.filter((section) => section.traffic.level !== 'unknown').length;
  const weatherCovered = sections.filter((section) => section.weather.condition !== '未知').length;
  const worstTraffic = sections.reduce((worst, section) => (
    TRAFFIC_PRIORITY[section.traffic.level] > TRAFFIC_PRIORITY[worst] ? section.traffic.level : worst
  ), 'unknown');
  return {
    trafficLevel: worstTraffic,
    rainSections: sections.filter((section) => (
      (section.weather.condition || '').includes('雨') || Number(section.weather.rainChance) >= 60
    )).length,
    congestedSections: sections.filter((section) => section.traffic.level === 'congested').length,
    incidentCount: sections.reduce((sum, section) => sum + section.incidents.length, 0),
    coveragePercent: sections.length ? Math.round((trafficCovered / sections.length) * 100) : 0,
    weatherCoveragePercent: sections.length ? Math.round((weatherCovered / sections.length) * 100) : 0,
    coveredSections: trafficCovered,
    totalSections: sections.length
  };
}

export function buildFixtureProviderData(sections, now = new Date()) {
  const trafficPatterns = [
    { ratio: 0.84, speed: 55 },
    { ratio: 0.62, speed: 37 },
    null,
    { ratio: 0.38, speed: 23 }
  ];
  const detectors = [];
  const weather = [];
  const cameras = [];
  const incidents = [];

  sections.forEach((section, index) => {
    const pattern = trafficPatterns[index % trafficPatterns.length];
    if (pattern) {
      detectors.push({
        id: `demo-vd-${index + 1}`,
        lat: section.sample[0],
        lng: section.sample[1],
        heading: section.heading,
        roadRef: section.roadRef,
        speedKph: pattern.speed,
        referenceSpeedKph: pattern.speed / pattern.ratio,
        observedAt: now.toISOString(),
        source: 'DEMO'
      });
    }
    weather.push({
      lat: section.sample[0],
      lng: section.sample[1],
      condition: index % 5 === 2 ? '短暫雨' : (index % 3 === 1 ? '多雲' : '晴時多雲'),
      temperatureC: 24 + (index % 5),
      rainChance: index % 5 === 2 ? 70 : 20,
      observedAt: now.toISOString(),
      source: 'DEMO'
    });
    cameras.push({
      id: `demo-cam-${index + 1}`,
      name: `${section.roadRef} 示範攝影機`,
      roadRef: section.roadRef,
      lat: section.sample[0],
      lng: section.sample[1],
      status: index % 6 === 4 ? 'offline' : 'unknown',
      source: 'DEMO'
    });
    if (index === 3) {
      incidents.push({
        id: 'demo-incident-1',
        title: '示範道路施工',
        description: '此為本機測試資料，不代表現場事件。',
        severity: 'warning',
        roadRef: section.roadRef,
        lat: section.sample[0],
        lng: section.sample[1],
        updatedAt: now.toISOString(),
        source: 'DEMO'
      });
    }
  });

  return { detectors, weather, cameras, incidents, trafficSource: 'DEMO' };
}

function round(value, digits) {
  if (value === null || value === undefined || value === '') return null;
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}
