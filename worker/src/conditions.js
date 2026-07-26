import {
  bearingDegrees,
  cumulativeDistances,
  haversineKm,
  nearestCoordinateIndex
} from './polyline.js';
import { classifyRoadEvent, roadEventState } from './road-events.js';
import { extractRoadRef, validateRouteEdges } from './rules.js';

const TRAFFIC_PRIORITY = { unknown: 0, clear: 1, slow: 2, congested: 3 };
const CAMERA_GRID_DEGREES = 0.05;
const CONDITION_GEOMETRY_POINT_LIMIT = 96;
const ROAD_EVENT_MATCH_KM = 3;
const ROAD_EVENT_FALLBACK_MATCH_KM = 0.75;
const ROAD_EVENT_SCHEDULE_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

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
  const ageMs = now.getTime() - observed.getTime();
  return ageMs >= 0 && ageMs <= maxAgeMinutes * 60 * 1000;
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
      && published.geometry.length > 0
    ))
    .map((published) => ({
      published,
      distanceKm: distanceToGeometry(section.sample, published.geometry)
    }))
    .filter(({ distanceKm }) => distanceKm <= 1)
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

function distanceToGeometry(point, geometry) {
  if (!Array.isArray(geometry) || !geometry.length) return Infinity;
  if (geometry.length === 1) return haversineKm(point, geometry[0]);
  let nearest = Infinity;
  for (let index = 1; index < geometry.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegmentKm(point, geometry[index - 1], geometry[index]));
  }
  return nearest;
}

function distanceToSegmentKm(point, start, end) {
  const referenceLat = ((Number(point[0]) + Number(start[0]) + Number(end[0])) / 3) * Math.PI / 180;
  const latScale = 111.32;
  const lngScale = 111.32 * Math.cos(referenceLat);
  const pointX = Number(point[1]) * lngScale;
  const pointY = Number(point[0]) * latScale;
  const startX = Number(start[1]) * lngScale;
  const startY = Number(start[0]) * latScale;
  const endX = Number(end[1]) * lngScale;
  const endY = Number(end[0]) * latScale;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (!Number.isFinite(lengthSquared) || lengthSquared === 0) return haversineKm(point, start);
  const projection = Math.max(0, Math.min(1, (
    ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / lengthSquared
  )));
  return Math.hypot(
    pointX - (startX + projection * deltaX),
    pointY - (startY + projection * deltaY)
  );
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
  const incidentAssignments = assignRoadEvents(sections, providerData.incidents, now);
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
    const incidents = incidentAssignments.get(Number(section.order)) || [];
    const cameras = matchCameras(section, cameraGrid, route.vehicle);
    return {
      order: section.order,
      fromKm: section.fromKm,
      toKm: section.toKm,
      roadRef: section.roadRef,
      roadName: section.roadName,
      geometry: compactGeometry(section.geometry, CONDITION_GEOMETRY_POINT_LIMIT),
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

export function compactGeometry(geometry, maximumPoints = CONDITION_GEOMETRY_POINT_LIMIT) {
  if (!Array.isArray(geometry)) return [];
  const limit = Math.max(2, Math.floor(Number(maximumPoints) || CONDITION_GEOMETRY_POINT_LIMIT));
  if (geometry.length <= limit) return geometry;
  const lastIndex = geometry.length - 1;
  return Array.from({ length: limit }, (_, index) => (
    geometry[Math.round((index / (limit - 1)) * lastIndex)]
  ));
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

export function assignRoadEvents(sections, incidents, now = new Date()) {
  const assignments = new Map((sections || []).map((section) => [Number(section.order), []]));
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();

  for (const incident of incidents || []) {
    const status = roadEventState(incident, now);
    if (status === 'expired') continue;
    const effectiveTime = incident.effectiveAt ? new Date(incident.effectiveAt).getTime() : NaN;
    if (
      status === 'scheduled'
      && Number.isFinite(effectiveTime)
      && effectiveTime - currentTime > ROAD_EVENT_SCHEDULE_HORIZON_MS
    ) {
      continue;
    }

    const roadRef = normalizeRoadRef(incident.roadRef);
    const candidates = (sections || []).map((section) => ({
      section,
      sameRoad: Boolean(roadRef) && roadRef === normalizeRoadRef(section.roadRef),
      distanceKm: eventDistanceToSection(incident, section)
    }));
    const sameRoadCandidates = candidates.filter((candidate) => candidate.sameRoad);
    const hasCoordinates = Number.isFinite(incident.lat) && Number.isFinite(incident.lng);
    let match = null;
    let locationApproximate = false;

    if (hasCoordinates) {
      const pool = sameRoadCandidates.length ? sameRoadCandidates : candidates;
      const maximumDistance = sameRoadCandidates.length
        ? ROAD_EVENT_MATCH_KM
        : ROAD_EVENT_FALLBACK_MATCH_KM;
      match = pool
        .filter((candidate) => Number.isFinite(candidate.distanceKm))
        .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
      if (match && match.distanceKm > maximumDistance) match = null;
    } else if (sameRoadCandidates.length) {
      match = sameRoadCandidates.sort((a, b) => Number(a.section.order) - Number(b.section.order))[0];
      locationApproximate = true;
    }

    if (!match) continue;
    const classification = classifyRoadEvent(incident);
    const normalized = {
      id: incident.id,
      title: incident.title || '道路事件',
      description: incident.description || '',
      severity: incident.severity ?? 'unknown',
      severityCode: incident.severityCode ?? null,
      kind: classification.kind,
      impact: classification.impact,
      status,
      roadRef: incident.roadRef || match.section.roadRef,
      lat: Number.isFinite(incident.lat) ? incident.lat : null,
      lng: Number.isFinite(incident.lng) ? incident.lng : null,
      effectiveAt: incident.effectiveAt || null,
      expiresAt: incident.expiresAt || null,
      updatedAt: incident.updatedAt || null,
      regulationCodes: Array.isArray(incident.regulationCodes) ? incident.regulationCodes : [],
      blockWay: incident.blockWay ?? null,
      blockedLanes: incident.blockedLanes || '',
      impactDescription: incident.impactDescription || '',
      locationApproximate,
      source: incident.source || 'TDX'
    };
    assignments.get(Number(match.section.order)).push(normalized);
  }

  for (const events of assignments.values()) {
    events.sort((a, b) => roadEventPriority(b) - roadEventPriority(a));
  }
  return assignments;
}

function eventDistanceToSection(incident, section) {
  if (!Number.isFinite(incident.lat) || !Number.isFinite(incident.lng)) return Infinity;
  const eventPoint = [incident.lat, incident.lng];
  if (Array.isArray(section.geometry) && section.geometry.length) {
    return distanceToGeometry(eventPoint, section.geometry);
  }
  return Array.isArray(section.sample) ? haversineKm(eventPoint, section.sample) : Infinity;
}

function roadEventPriority(incident) {
  const impactPriority = {
    full_closure: 60,
    lane_closure: 50,
    controlled: 40,
    shoulder: 30,
    unknown: 20,
    no_impact: 10
  };
  const kindPriority = {
    accident: 9,
    disaster: 8,
    hazard: 7,
    control: 6,
    construction: 5,
    weather: 4,
    congestion: 3,
    activity: 2,
    other: 1
  };
  return (impactPriority[incident.impact] || 0)
    + (kindPriority[incident.kind] || 0)
    - (incident.status === 'scheduled' ? 5 : 0);
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
  if (Array.isArray(camera.prohibitedFor)) {
    return camera.prohibitedFor.includes(vehicle.plate || 'white');
  }
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
  const incidentsByIdentity = new Map();
  const affectedIncidentSections = sections.filter((section) => (
    section.incidents.some(incidentHasPreciseLocation)
  )).length;
  for (const section of sections) {
    for (const incident of section.incidents) {
      const identity = incident.id
        || `${incident.title}:${incident.roadRef}:${incident.effectiveAt || incident.updatedAt || ''}`;
      if (!incidentsByIdentity.has(identity)) incidentsByIdentity.set(identity, incident);
    }
  }
  const uniqueIncidents = [...incidentsByIdentity.values()];
  const incidentCounts = uniqueIncidents.reduce((counts, incident) => {
    const kind = incident.kind || 'other';
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, {});
  return {
    trafficLevel: worstTraffic,
    rainSections: sections.filter((section) => (
      (section.weather.condition || '').includes('雨') || Number(section.weather.rainChance) >= 60
    )).length,
    congestedSections: sections.filter((section) => section.traffic.level === 'congested').length,
    incidentCount: uniqueIncidents.length,
    incidentCounts,
    affectedIncidentSections,
    roadLevelIncidentCount: uniqueIncidents.filter((incident) => !incidentHasPreciseLocation(incident)).length,
    fullClosureCount: uniqueIncidents.filter((incident) => incident.impact === 'full_closure').length,
    activeFullClosureCount: uniqueIncidents.filter((incident) => (
      incident.impact === 'full_closure' && incident.status === 'active'
    )).length,
    scheduledFullClosureCount: uniqueIncidents.filter((incident) => (
      incident.impact === 'full_closure' && incident.status === 'scheduled'
    )).length,
    activeIncidentCount: uniqueIncidents.filter((incident) => incident.status === 'active').length,
    scheduledIncidentCount: uniqueIncidents.filter((incident) => incident.status === 'scheduled').length,
    coveragePercent: sections.length ? Math.round((trafficCovered / sections.length) * 100) : 0,
    weatherCoveragePercent: sections.length ? Math.round((weatherCovered / sections.length) * 100) : 0,
    coveredSections: trafficCovered,
    totalSections: sections.length
  };
}

function incidentHasPreciseLocation(incident) {
  return Boolean(incident)
    && !incident.locationApproximate
    && Number.isFinite(Number(incident.lat))
    && Number.isFinite(Number(incident.lng))
    && incident.lat !== null && incident.lat !== ''
    && incident.lng !== null && incident.lng !== '';
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
        description: '外側車道施工並採單線管制；此為本機測試資料，不代表現場事件。',
        severity: 'warning',
        typeCode: 2,
        regulationCodes: [8],
        roadRef: section.roadRef,
        lat: section.sample[0],
        lng: section.sample[1],
        effectiveAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
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
