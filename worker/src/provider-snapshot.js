import { decodePolyline6, encodePolyline6, haversineKm } from './polyline.js';

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_PREFIX = 'provider-snapshot:v1:live:';
const CAMERA_SNAPSHOT_PREFIX = 'provider-snapshot:v1:cameras:';
const DEFAULT_GRID_DEGREES = 0.05;
const WEATHER_GRID_DEGREES = 0.5;
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;
const SNAPSHOT_SLOT_MS = 5 * 60 * 1000;
const HTTP_SLOT_MS = {
  cams: 6 * 60 * 60 * 1000,
  weather: 15 * 60 * 1000
};
const SOURCE_FAILURE_ISSUES = [
  'TDX: provider snapshot unavailable',
  'THB: provider snapshot unavailable',
  'CWA: provider snapshot unavailable',
  'CCTV: provider snapshot unavailable'
];

export function isProviderSnapshotFresh(
  snapshot,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_AGE_MS
) {
  if (!snapshot || !snapshot.generatedAt) return false;
  const generatedAt = new Date(snapshot.generatedAt).getTime();
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const age = current - generatedAt;
  return Number.isFinite(generatedAt)
    && Number.isFinite(current)
    && Number.isFinite(Number(maxAgeMs))
    && age >= 0
    && age <= Number(maxAgeMs);
}

export function selectRouteSnapshotBucketKeys(sections, bucketConfig = {}) {
  const gridDegrees = positiveNumber(bucketConfig.gridDegrees, DEFAULT_GRID_DEGREES);
  const halo = Math.max(0, Math.floor(positiveNumber(bucketConfig.halo, 1)));
  const keys = new Set();

  for (const section of sections || []) {
    const point = Array.isArray(section?.sample) ? section.sample : null;
    const lat = Number(point?.[0]);
    const lng = Number(point?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const latCell = Math.floor(lat / gridDegrees);
    const lngCell = Math.floor(lng / gridDegrees);
    for (let latOffset = -halo; latOffset <= halo; latOffset += 1) {
      for (let lngOffset = -halo; lngOffset <= halo; lngOffset += 1) {
        keys.add(`${latCell + latOffset}:${lngCell + lngOffset}`);
      }
    }
  }
  return [...keys].sort();
}

export async function loadSnapshotProviderData(sections, env, options = {}) {
  const now = options instanceof Date ? options : (options.now || new Date());
  const vehicle = options instanceof Date ? null : options.vehicle;
  const maxAgeMs = options instanceof Date
    ? DEFAULT_MAX_AGE_MS
    : positiveNumber(options.maxAgeMs, DEFAULT_MAX_AGE_MS);
  const binding = env.PROVIDER_SNAPSHOTS || env.ROUTE_CACHE;
  const readSnapshot = options.readSnapshot || (binding
    ? (key) => binding.get(key, { type: 'text', cacheTtl: 60 })
    : null);
  if (!readSnapshot) return emptySnapshotProviderData(SOURCE_FAILURE_ISSUES);

  const attempts = Math.max(2, Math.ceil(maxAgeMs / SNAPSHOT_SLOT_MS) + 1);
  let decoded = null;
  let lastIssue = 'provider snapshot missing';
  let readFailure = '';
  for (let offset = 0; offset < attempts; offset += 1) {
    const key = providerSnapshotSlotKey(now, offset);
    let raw;
    try {
      raw = await readSnapshot(key);
    } catch (error) {
      readFailure = `provider snapshot read failed: ${error.message || 'unavailable'}`;
      lastIssue = readFailure;
      continue;
    }
    if (raw === null || raw === undefined) {
      if (!readFailure) lastIssue = 'provider snapshot missing';
      continue;
    }
    try {
      const candidate = decodeProviderSnapshot(raw);
      if (
        candidate.header.schemaVersion !== SNAPSHOT_SCHEMA_VERSION
        || !isProviderSnapshotFresh(candidate.header, now, maxAgeMs)
      ) {
        lastIssue = 'provider snapshot stale or unsupported';
        continue;
      }
      decoded = candidate;
      break;
    } catch (error) {
      lastIssue = `provider snapshot malformed: ${error.message || 'invalid payload'}`;
    }
  }

  if (!decoded) {
    return emptySnapshotProviderData(
      SOURCE_FAILURE_ISSUES.map((issue) => `${issue}; ${lastIssue}`)
    );
  }

  const gridDegrees = positiveNumber(decoded.header.gridDegrees, DEFAULT_GRID_DEGREES);
  const selectedCells = selectRouteSnapshotBucketKeys(sections, {
    gridDegrees,
    halo: Math.max(1, Number(decoded.header.routeHalo) || 1)
  });
  const weatherGridDegrees = positiveNumber(
    decoded.header.weatherGridDegrees,
    WEATHER_GRID_DEGREES
  );
  const weatherCells = decoded.header.weatherGridDegrees
    ? selectRouteSnapshotBucketKeys(sections, {
      gridDegrees: weatherGridDegrees,
      halo: 2
    }).map((cellId) => `w:${cellId}`)
    : [];
  const publishedCells = decoded.header.publishedByRoad
    ? (sections || []).flatMap((section) => {
      const roadKey = snapshotRoadKey(section.roadRef || section.roadName);
      if (!roadKey) return [];
      return selectRouteSnapshotBucketKeys([section], {
        gridDegrees,
        halo: Math.max(1, Number(decoded.header.routeHalo) || 1)
      }).map((cellId) => `p:${cellId}:${roadKey}`);
    })
    : [];
  const cellsToRead = [
    '__global__',
    ...new Set([...selectedCells, ...publishedCells, ...weatherCells])
  ];
  const data = emptyProviderArrays();
  const issues = Array.isArray(decoded.header.issues)
    ? decoded.header.issues.map(String)
    : [];

  for (const cellId of cellsToRead) {
    let cell;
    try {
      cell = decoded.readCell(cellId);
    } catch (error) {
      issues.push(`Snapshot: malformed cell ${cellId}`);
      continue;
    }
    if (cell === null || cell === undefined) continue;
    if (!validProviderCell(cell)) {
      issues.push(`Snapshot: malformed cell ${cellId}`);
      continue;
    }
    data.detectors.push(...cell.detectors);
    data.publishedTraffic.push(...cell.publishedTraffic);
    data.incidents.push(...cell.incidents);
    data.weather.push(...cell.weather);
    data.cameras.push(...cell.cameras);
  }

  if (decoded.header.cameraSnapshotRequired) {
    const cameraDecoded = await findCameraSnapshot(readSnapshot, now);
    if (!cameraDecoded) {
      issues.push('CCTV: provider camera snapshot unavailable');
    } else {
      const cameraCellCache = new Map();
      for (const section of sections || []) {
        const cameraCells = selectRouteSnapshotBucketKeys([section], {
          gridDegrees: positiveNumber(cameraDecoded.header.gridDegrees, 0.025),
          halo: Math.max(1, Number(cameraDecoded.header.routeHalo) || 2)
        });
        const candidates = [];
        for (const cellId of cameraCells) {
          let cell = cameraCellCache.get(cellId);
          if (cell === undefined) {
            try {
              cell = cameraDecoded.readCell(cellId);
            } catch {
              issues.push(`CCTV: malformed camera snapshot cell ${cellId}`);
              cell = null;
            }
            cameraCellCache.set(cellId, cell || null);
          }
          if (cell === null) continue;
          if (!validProviderCell(cell)) {
            issues.push(`CCTV: malformed camera snapshot cell ${cellId}`);
            continue;
          }
          candidates.push(...cell.cameras);
        }
        data.cameras.push(...selectCamerasForSection(
          dedupe(candidates, cameraIdentity),
          section,
          vehicle
        ));
      }
    }
  }

  const weather = selectRouteWeather(
    dedupe(data.weather, weatherIdentity),
    sections,
    now
  );
  const cameras = selectRouteCameras(
    dedupe(data.cameras, cameraIdentity),
    sections,
    vehicle
  );
  return {
    detectors: dedupe(data.detectors, detectorIdentity),
    publishedTraffic: mergePublishedTraffic(data.publishedTraffic),
    incidents: dedupe(data.incidents, incidentIdentity),
    weather,
    cameras,
    trafficSource: 'TDX/THB',
    issues,
    snapshotGeneratedAt: decoded.header.generatedAt,
    snapshotProviders: decoded.header.providers || {}
  };
}

export function buildProviderSnapshotDocument(providerData, options = {}) {
  const gridDegrees = positiveNumber(options.gridDegrees, DEFAULT_GRID_DEGREES);
  const cells = new Map();
  const publishedByCell = new Map();
  const ensureCell = (cellId) => {
    if (!cells.has(cellId)) cells.set(cellId, emptyProviderArrays());
    return cells.get(cellId);
  };

  for (const detector of providerData.detectors || []) {
    const cellId = pointCellId(detector.lat, detector.lng, gridDegrees);
    if (cellId) ensureCell(cellId).detectors.push(detector);
  }
  for (const camera of providerData.cameras || []) {
    const cellId = pointCellId(camera.lat, camera.lng, gridDegrees);
    if (cellId) ensureCell(cellId).cameras.push(camera);
  }
  for (const published of providerData.publishedTraffic || []) {
    const geometry = thinGeometry(published.geometry || [], 0.25);
    for (let geometryOrder = 0; geometryOrder < geometry.length; geometryOrder += 1) {
      const coordinate = geometry[geometryOrder];
      const spatialCellId = pointCellId(coordinate?.[0], coordinate?.[1], gridDegrees);
      if (!spatialCellId) continue;
      const roadKey = snapshotRoadKey(published.roadRef);
      const cellId = roadKey ? `p:${spatialCellId}:${roadKey}` : spatialCellId;
      if (!publishedByCell.has(cellId)) publishedByCell.set(cellId, new Map());
      const id = publishedIdentity(published);
      const byId = publishedByCell.get(cellId);
      if (!byId.has(id)) {
        byId.set(id, { ...published, geometry: [], geometryOrder });
      }
      byId.get(id).geometry.push(coordinate);
    }
  }
  for (const [cellId, byId] of publishedByCell) {
    ensureCell(cellId).publishedTraffic.push(...byId.values());
  }

  const globalCell = ensureCell('__global__');
  globalCell.incidents.push(...(providerData.incidents || []));
  for (const weather of providerData.weather || []) {
    const cellId = pointCellId(weather.lat, weather.lng, WEATHER_GRID_DEGREES);
    if (cellId) ensureCell(`w:${cellId}`).weather.push(weather);
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    gridDegrees,
    weatherGridDegrees: WEATHER_GRID_DEGREES,
    publishedByRoad: true,
    providers: options.providers || {},
    issues: options.issues || providerData.issues || [],
    cameraSnapshotRequired: Boolean(options.cameraSnapshotRequired),
    routeHalo: Number(options.routeHalo) || 1,
    cells: Object.fromEntries([...cells.entries()].sort(([a], [b]) => a.localeCompare(b)))
  };
}

export function packProviderSnapshot(snapshot) {
  const cellIndex = {};
  const bodyParts = [];
  let offset = 0;
  for (const [cellId, cell] of Object.entries(snapshot.cells || {}).sort(([a], [b]) => (
    a.localeCompare(b)
  ))) {
    const value = JSON.stringify(compactProviderCell(cell));
    cellIndex[cellId] = [offset, value.length];
    bodyParts.push(value);
    offset += value.length;
  }
  const header = {
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    gridDegrees: snapshot.gridDegrees,
    weatherGridDegrees: snapshot.weatherGridDegrees,
    publishedByRoad: Boolean(snapshot.publishedByRoad),
    providers: snapshot.providers || {},
    issues: snapshot.issues || [],
    cameraSnapshotRequired: Boolean(snapshot.cameraSnapshotRequired),
    routeHalo: Number(snapshot.routeHalo) || 1,
    encoding: 'compact-v1',
    cellIndex
  };
  return `${JSON.stringify(header)}\n${bodyParts.join('')}`;
}

export function providerSnapshotSlotKey(now = new Date(), previousSlots = 0) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const slot = Math.floor(timestamp / SNAPSHOT_SLOT_MS) * SNAPSHOT_SLOT_MS
    - Math.max(0, previousSlots) * SNAPSHOT_SLOT_MS;
  return `${SNAPSHOT_PREFIX}${new Date(slot).toISOString().replace(/[-:]/g, '').slice(0, 13)}Z`;
}

export function providerCameraSnapshotSlotKey(now = new Date(), previousSlots = 0) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const intervalMs = HTTP_SLOT_MS.cams;
  const slot = Math.floor(timestamp / intervalMs) * intervalMs
    - Math.max(0, previousSlots) * intervalMs;
  return `${CAMERA_SNAPSHOT_PREFIX}${new Date(slot).toISOString().replace(/[-:]/g, '').slice(0, 13)}Z`;
}

export function providerSnapshotHttpSlotKey(kind, now = new Date(), previousSlots = 0) {
  const intervalMs = HTTP_SLOT_MS[kind];
  if (!intervalMs) throw new Error(`Unsupported provider snapshot HTTP kind: ${kind}`);
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const slot = Math.floor(timestamp / intervalMs) * intervalMs
    - Math.max(0, previousSlots) * intervalMs;
  return `provider-snapshot:v1:http:${kind}:${new Date(slot).toISOString().replace(/[-:]/g, '').slice(0, 13)}Z`;
}

export function packProviderSnapshotHttpEnvelope(envelope, generatedAt = new Date().toISOString()) {
  return `${JSON.stringify({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, generatedAt })}\n${JSON.stringify(envelope)}`;
}

export async function loadProviderSnapshotHttpEnvelope(kind, env, options = {}) {
  const now = options.now || new Date();
  const intervalMs = HTTP_SLOT_MS[kind];
  const maxAgeMs = positiveNumber(
    options.maxAgeMs,
    kind === 'cams' ? 12 * 60 * 60 * 1000 : 60 * 60 * 1000
  );
  const binding = env.PROVIDER_SNAPSHOTS || env.ROUTE_CACHE;
  if (!intervalMs || !binding) return null;
  const attempts = Math.max(2, Math.ceil(maxAgeMs / intervalMs) + 1);
  for (let offset = 0; offset < attempts; offset += 1) {
    const key = providerSnapshotHttpSlotKey(kind, now, offset);
    let value;
    try {
      value = await binding.get(key, { type: 'text', cacheTtl: 60 });
    } catch {
      continue;
    }
    if (typeof value !== 'string') continue;
    const lineBreak = value.indexOf('\n');
    if (lineBreak < 0) continue;
    try {
      const header = JSON.parse(value.slice(0, lineBreak));
      if (
        header.schemaVersion === SNAPSHOT_SCHEMA_VERSION
        && isProviderSnapshotFresh(header, now, maxAgeMs)
      ) {
        return value.slice(lineBreak + 1);
      }
    } catch {
      // Try the previous immutable slot.
    }
  }
  return null;
}

function decodeProviderSnapshot(raw) {
  if (typeof raw === 'object' && raw !== null) {
    return {
      header: raw,
      readCell: (cellId) => raw.cells?.[cellId] ?? null
    };
  }
  if (typeof raw !== 'string') throw new Error('unsupported value type');
  const lineBreak = raw.indexOf('\n');
  if (lineBreak < 0) {
    const parsed = JSON.parse(raw);
    return {
      header: parsed,
      readCell: (cellId) => parsed.cells?.[cellId] ?? null
    };
  }
  const header = JSON.parse(raw.slice(0, lineBreak));
  if (!header.cellIndex || typeof header.cellIndex !== 'object') {
    throw new Error('cell index missing');
  }
  const bodyOffset = lineBreak + 1;
  return {
    header,
    readCell(cellId) {
      const range = header.cellIndex[cellId];
      if (!range) return null;
      const [start, length] = range.map(Number);
      if (
        !Number.isInteger(start)
        || !Number.isInteger(length)
        || start < 0
        || length < 0
        || bodyOffset + start + length > raw.length
      ) {
        throw new Error('invalid cell range');
      }
      const cell = JSON.parse(raw.slice(bodyOffset + start, bodyOffset + start + length));
      return header.encoding === 'compact-v1' ? expandProviderCell(cell) : cell;
    }
  };
}

async function findCameraSnapshot(readSnapshot, now) {
  const maxAgeMs = 12 * 60 * 60 * 1000;
  for (let offset = 0; offset < 3; offset += 1) {
    let raw;
    try {
      raw = await readSnapshot(providerCameraSnapshotSlotKey(now, offset));
    } catch {
      continue;
    }
    if (raw === null || raw === undefined) continue;
    try {
      const decoded = decodeProviderSnapshot(raw);
      if (
        decoded.header.schemaVersion === SNAPSHOT_SCHEMA_VERSION
        && isProviderSnapshotFresh(decoded.header, now, maxAgeMs)
      ) {
        return decoded;
      }
    } catch {
      // Try the previous immutable camera slot.
    }
  }
  return null;
}

function compactProviderCell(cell) {
  return {
    d: (cell.detectors || []).map((item) => [
      item.id, item.lat, item.lng, item.heading, item.roadRef, item.speedKph,
      item.referenceSpeedKph, item.observedAt
    ]),
    p: (cell.publishedTraffic || []).map((item) => [
      item.id, item.roadRef, item.heading, encodePolyline6(item.geometry || []),
      item.speedKph, item.referenceSpeedKph, item.observedAt, item.available,
      item.geometryOrder
    ]),
    i: (cell.incidents || []).map((item) => [
      item.id, item.title, item.description, item.severity, item.roadRef,
      item.lat, item.lng, item.updatedAt, item.expiresAt
    ]),
    w: (cell.weather || []).map((item) => [
      item.lat, item.lng, item.condition, item.temperatureC, item.rainChance,
      item.observedAt, item.forecastAt
    ]),
    c: (cell.cameras || []).map((item) => [
      item.id, item.name, item.lat, item.lng, item.imageUrl,
      item.status, item.prohibited, item.prohibitedFor,
      item.roadRef && item.roadRef !== item.name ? item.roadRef : null
    ])
  };
}

function expandProviderCell(cell) {
  if (!cell || typeof cell !== 'object') return cell;
  if (!['d', 'p', 'i', 'w', 'c'].every((key) => Array.isArray(cell[key]))) return cell;
  return {
    detectors: cell.d.map((item) => ({
      id: item[0],
      lat: item[1],
      lng: item[2],
      heading: item[3],
      roadRef: item[4],
      speedKph: item[5],
      referenceSpeedKph: item[6],
      observedAt: item[7],
      source: 'TDX'
    })),
    publishedTraffic: cell.p.map((item) => ({
      id: item[0],
      roadRef: item[1],
      heading: item[2],
      geometry: decodePolyline6(item[3] || ''),
      speedKph: item[4],
      referenceSpeedKph: item[5],
      observedAt: item[6],
      available: item[7],
      geometryOrder: item[8],
      source: 'THB',
      method: 'published-section'
    })),
    incidents: cell.i.map((item) => ({
      id: item[0],
      title: item[1],
      description: item[2],
      severity: item[3],
      roadRef: item[4],
      lat: item[5],
      lng: item[6],
      updatedAt: item[7],
      expiresAt: item[8],
      source: 'TDX'
    })),
    weather: cell.w.map((item) => ({
      lat: item[0],
      lng: item[1],
      condition: item[2],
      temperatureC: item[3],
      rainChance: item[4],
      observedAt: item[5],
      forecastAt: item[6],
      source: 'CWA'
    })),
    cameras: cell.c.map((item) => ({
      id: item[0],
      name: item[1],
      lat: item[2],
      lng: item[3],
      roadRef: item[8] || item[1],
      imageUrl: item[4],
      status: item[5],
      source: 'CCTV',
      prohibited: item[6],
      prohibitedFor: item[7]
    }))
  };
}

function validProviderCell(cell) {
  return cell
    && typeof cell === 'object'
    && ['detectors', 'publishedTraffic', 'incidents', 'weather', 'cameras']
      .every((key) => Array.isArray(cell[key]));
}

function emptySnapshotProviderData(issues) {
  return {
    ...emptyProviderArrays(),
    trafficSource: 'TDX/THB',
    issues: [...issues],
    snapshotGeneratedAt: null,
    snapshotProviders: {}
  };
}

function emptyProviderArrays() {
  return {
    detectors: [],
    publishedTraffic: [],
    incidents: [],
    weather: [],
    cameras: []
  };
}

function pointCellId(latValue, lngValue, gridDegrees) {
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${Math.floor(lat / gridDegrees)}:${Math.floor(lng / gridDegrees)}`;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function dedupe(values, identity) {
  const seen = new Set();
  return (values || []).filter((value) => {
    const key = identity(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectorIdentity(item) {
  return item?.id || `${item?.lat}:${item?.lng}:${item?.heading}:${item?.observedAt}`;
}

function publishedIdentity(item) {
  return item?.id || `${item?.roadRef}:${item?.heading}:${item?.observedAt}`;
}

function mergePublishedTraffic(items) {
  const fragmentsById = new Map();
  for (const item of items || []) {
    const id = publishedIdentity(item);
    if (!fragmentsById.has(id)) fragmentsById.set(id, []);
    fragmentsById.get(id).push(item);
  }
  return [...fragmentsById.values()].map((fragments) => {
    const sorted = fragments.sort((a, b) => (
      Number(a.geometryOrder || 0) - Number(b.geometryOrder || 0)
    ));
    return {
      ...sorted[0],
      geometry: sorted.flatMap((fragment) => fragment.geometry || [])
    };
  });
}

function incidentIdentity(item) {
  return item?.id || `${item?.title}:${item?.roadRef}:${item?.updatedAt}`;
}

function weatherIdentity(item) {
  return `${item?.lat}:${item?.lng}:${item?.observedAt}:${item?.forecastAt || ''}`;
}

function cameraIdentity(item) {
  return item?.id || `${item?.lat}:${item?.lng}:${item?.imageUrl || item?.url || ''}`;
}

function selectRouteWeather(weather, sections, now) {
  const grid = buildPointGrid(weather, 0.5);
  const selected = [];
  for (const section of sections || []) {
    const candidates = nearbyGridPoints(grid, section.sample, 50, 0.5)
      .map((sample) => ({
        sample,
        distanceKm: haversineKm(section.sample, [sample.lat, sample.lng])
      }))
      .filter(({ sample, distanceKm }) => (
        distanceKm <= 50 && freshTimestamp(sample.observedAt, 90, now)
      ))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    if (candidates[0]) selected.push(candidates[0].sample);
  }
  return dedupe(selected, weatherIdentity);
}

function selectRouteCameras(cameras, sections, vehicle) {
  const selected = [];
  for (const section of sections || []) {
    selected.push(...selectCamerasForSection(cameras, section, vehicle));
  }
  return dedupe(selected, cameraIdentity);
}

function selectCamerasForSection(cameras, section, vehicle) {
  return (cameras || [])
    .map((camera) => ({
      camera,
      sameRoad: sameSnapshotRoad(section.roadRef || section.roadName, camera.roadRef || camera.name),
      distanceKm: haversineKm(section.sample, [camera.lat, camera.lng])
    }))
    .filter(({ camera, distanceKm }) => (
      distanceKm <= 5
      && !camera.prohibited
      && !(
        vehicle?.type === 'motorcycle'
        && Array.isArray(camera.prohibitedFor)
        && camera.prohibitedFor.includes(vehicle.plate || 'white')
      )
    ))
    .sort((a, b) => (
      Number(b.sameRoad) - Number(a.sameRoad) || a.distanceKm - b.distanceKm
    ))
    .slice(0, 2)
    .map((candidate) => candidate.camera);
}

function buildPointGrid(values, gridDegrees) {
  const grid = new Map();
  for (const value of values || []) {
    const cellId = pointCellId(value.lat, value.lng, gridDegrees);
    if (!cellId) continue;
    if (!grid.has(cellId)) grid.set(cellId, []);
    grid.get(cellId).push(value);
  }
  return grid;
}

function nearbyGridPoints(grid, point, radiusKm, gridDegrees) {
  const lat = Number(point?.[0]);
  const lng = Number(point?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const latCell = Math.floor(lat / gridDegrees);
  const lngCell = Math.floor(lng / gridDegrees);
  const latCells = Math.ceil((radiusKm / 110.6) / gridDegrees);
  const lngDegrees = radiusKm / (111.3 * Math.max(0.35, Math.cos(lat * Math.PI / 180)));
  const lngCells = Math.ceil(lngDegrees / gridDegrees);
  const values = [];
  for (let latOffset = -latCells; latOffset <= latCells; latOffset += 1) {
    for (let lngOffset = -lngCells; lngOffset <= lngCells; lngOffset += 1) {
      values.push(...(grid.get(`${latCell + latOffset}:${lngCell + lngOffset}`) || []));
    }
  }
  return values;
}

function freshTimestamp(value, maxAgeMinutes, now) {
  const timestamp = new Date(value).getTime();
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const age = current - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= maxAgeMinutes * 60 * 1000;
}

function sameSnapshotRoad(first, second) {
  const firstKey = snapshotRoadKey(first);
  const secondKey = snapshotRoadKey(second);
  return Boolean(firstKey && secondKey && firstKey === secondKey);
}

function snapshotRoadKey(value) {
  const normalized = String(value || '').replace(/臺/g, '台').replace(/\s+/g, '');
  const national = normalized.match(/國道(\d+)(甲)?/);
  if (national) return `國道${national[1]}${national[2] || ''}`;
  const provincial = normalized.match(/台(\d+)(甲|乙|丙|丁|戊|己)?/);
  if (provincial) return `台${provincial[1]}${provincial[2] || ''}`;
  return normalized.replace(/線|公路/g, '');
}

function thinGeometry(geometry, minimumDistanceKm) {
  if (!Array.isArray(geometry) || geometry.length <= 2) return geometry;
  const selected = [geometry[0]];
  let previous = geometry[0];
  for (let index = 1; index < geometry.length - 1; index += 1) {
    const coordinate = geometry[index];
    if (haversineKm(previous, coordinate) < minimumDistanceKm) continue;
    selected.push(coordinate);
    previous = coordinate;
  }
  const last = geometry.at(-1);
  if (selected.at(-1) !== last) selected.push(last);
  return selected;
}
