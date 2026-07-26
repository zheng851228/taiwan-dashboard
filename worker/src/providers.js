import { encodePolyline6, haversineKm, mergeLegShapes } from './polyline.js';

const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const DEFAULT_TDX_CONFIG_URL = 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/VD/Highway?$format=JSON';
const DEFAULT_TDX_LIVE_URL = 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Live/VD/Highway?$format=JSON';
const DEFAULT_TDX_SECTION_URL = 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Section/Highway?$format=JSON';
const DEFAULT_TDX_INCIDENT_URL = 'https://tdx.transportdata.tw/api/basic/v1/Traffic/RoadEvent/LiveEvent/Highway?$format=JSON';
const DEFAULT_THB_SECTION_URL = 'https://thbapp.thb.gov.tw/opendata/section/sectioninfo/SectionList.xml';
const DEFAULT_THB_SECTION_SHAPE_URL = 'https://thbapp.thb.gov.tw/opendata/section/sectionshapeinfo/SectionShapeList.xml';
const DEFAULT_THB_LIVE_TRAFFIC_URL = 'https://thbapp.thb.gov.tw/opendata/section/livetrafficdata/LiveTrafficList.xml';
const DEFAULT_THB_CONGESTION_URL = 'https://thbapp.thb.gov.tw/opendata/section/congetioninfo/CongestionLevelList.xml';
const DEFAULT_CWA_OBSERVATION_URL = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001';
const DEFAULT_CWA_FORECAST_URL = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-089';
const DEFAULT_CWA_COUNTY_FORECAST_URL = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';

let tokenCache = null;
let tdxStaticCache = null;
let thbStaticCache = null;
let thbStaticPromise = null;
let thbLiveCache = null;
let thbLivePromise = null;
const jsonResponseCache = new Map();
const jsonResponsePromises = new Map();
const TDX_STATIC_TTL_MS = 6 * 60 * 60 * 1000;
const THB_STATIC_TTL_MS = 6 * 60 * 60 * 1000;
const THB_LIVE_TTL_MS = 60 * 1000;
const TDX_LIVE_TTL_MS = 60 * 1000;
const CWA_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const CAMERA_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;
const TRACE_CHUNK_DISTANCE_KM = 150;
const JSON_RESPONSE_CACHE_MAX = 256;

export async function getValhallaRoute(locations, costing, env, avoidLocations = []) {
  const baseUrl = String(env.VALHALLA_BASE_URL || 'https://valhalla1.openstreetmap.de').replace(/\/$/, '');
  const payload = {
    locations: locations.map((location) => ({
      lat: location.lat,
      lon: location.lng,
      type: location.type || 'break'
    })),
    costing,
    units: 'kilometers',
    directions_options: { units: 'kilometers' },
    costing_options: costingOptions(costing)
  };
  if (avoidLocations.length) payload.exclude_locations = avoidLocations;

  const result = await requestJson(`${baseUrl}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, 20000);
  const trip = result.trip;
  if (!trip || !Array.isArray(trip.legs) || !trip.legs.length) {
    throw new Error('Valhalla did not return route legs');
  }
  const encodedShapes = trip.legs.map((leg) => leg.shape).filter(Boolean);
  const geometry = mergeLegShapes(encodedShapes);
  if (geometry.length < 2) throw new Error('Valhalla returned an empty route shape');
  const summary = trip.summary || {};
  return {
    geometry,
    encodedShape: encodePolyline6(geometry),
    distanceKm: round(summary.length ?? sumLegValue(trip.legs, 'length'), 1),
    durationMinutes: Math.max(1, Math.round(Number(summary.time ?? sumLegValue(trip.legs, 'time')) / 60)),
    source: 'valhalla'
  };
}

function costingOptions(costing) {
  if (costing === 'motor_scooter') {
    return { motor_scooter: { use_highways: 0, use_tolls: 0, top_speed: 80 } };
  }
  if (costing === 'motorcycle') {
    return { motorcycle: { use_highways: 0.1, use_tolls: 0, top_speed: 110 } };
  }
  return { auto: { use_tolls: 0.5 } };
}

function sumLegValue(legs, key) {
  return legs.reduce((sum, leg) => sum + Number((leg.summary || {})[key] || 0), 0);
}

export async function traceRouteAttributes(route, costing, env) {
  const baseUrl = String(env.VALHALLA_BASE_URL || 'https://valhalla1.openstreetmap.de').replace(/\/$/, '');
  const chunks = splitTraceGeometry(route.geometry);
  const shapeMatch = chunks.length > 1 ? 'walk_or_snap' : 'edge_walk';
  const edges = [];
  const tracedChunks = await mapWithConcurrency(chunks, 2, async (chunk) => {
    const result = await requestJson(`${baseUrl}/trace_attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encoded_polyline: encodePolyline6(chunk.geometry),
        costing,
        shape_match: shapeMatch,
        filters: {
          action: 'include',
          attributes: [
            'edge.names',
            'edge.way_id',
            'edge.road_class',
            'edge.use',
            'edge.forward',
            'edge.traversability',
            'edge.length',
            'edge.begin_shape_index',
            'edge.end_shape_index'
          ]
        }
      })
    }, 20000);
    const chunkEdges = Array.isArray(result.edges) ? result.edges : [];
    if (!chunkEdges.length) {
      throw new Error(`Valhalla trace_attributes returned no road edges for chunk ${chunk.startShapeIndex}`);
    }
    assertTraceCoverage(chunkEdges, chunk.geometry.length, chunk.startShapeIndex);
    return {
      startShapeIndex: chunk.startShapeIndex,
      edges: chunkEdges
    };
  });
  tracedChunks.forEach((chunk) => {
    const chunkEdges = chunk.edges;
    chunkEdges.forEach((edge) => appendTraceEdge(edges, normalizeTraceEdge(edge, chunk.startShapeIndex)));
  });
  if (!edges.length) throw new Error('Valhalla trace_attributes returned no road edges');
  return edges;
}

function assertTraceCoverage(edges, geometryLength, startShapeIndex) {
  const ranges = edges.map((edge) => ({
    begin: Number(edge.begin_shape_index ?? edge.beginShapeIndex ?? 0),
    end: Number(edge.end_shape_index ?? edge.endShapeIndex ?? edge.begin_shape_index ?? 0)
  })).sort((a, b) => a.begin - b.begin);
  let coveredThrough = 0;
  for (const range of ranges) {
    const validRange = Number.isInteger(range.begin)
      && Number.isInteger(range.end)
      && range.begin >= 0
      && range.begin <= range.end
      && range.end < geometryLength;
    if (!validRange) {
      throw new Error(`Valhalla trace_attributes returned invalid shape indices for chunk ${startShapeIndex}`);
    }
    // An attributed road edge must begin at or before the last covered point.
    // begin === coveredThrough + 1 would leave the segment between both points unattributed.
    if (range.begin > coveredThrough) {
      throw new Error(`Valhalla trace_attributes left an attribution gap for chunk ${startShapeIndex}`);
    }
    coveredThrough = Math.max(coveredThrough, range.end);
  }
  if (coveredThrough < geometryLength - 1) {
    throw new Error(`Valhalla trace_attributes returned partial road coverage for chunk ${startShapeIndex}`);
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let stopped = false;
  async function run() {
    while (!stopped && nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  }
  const runners = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    () => run()
  );
  await Promise.all(runners);
  return results;
}

export function splitTraceGeometry(geometry, maxDistanceKm = TRACE_CHUNK_DISTANCE_KM) {
  if (!Array.isArray(geometry) || geometry.length < 2) return [];
  const chunks = [];
  let startShapeIndex = 0;
  let distanceKm = 0;
  for (let index = 1; index < geometry.length; index += 1) {
    const segmentKm = haversineKm(geometry[index - 1], geometry[index]);
    if (distanceKm + segmentKm > maxDistanceKm && index - 1 > startShapeIndex) {
      chunks.push({
        geometry: geometry.slice(startShapeIndex, index),
        startShapeIndex
      });
      startShapeIndex = index - 1;
      distanceKm = segmentKm;
    } else {
      distanceKm += segmentKm;
    }
  }
  chunks.push({ geometry: geometry.slice(startShapeIndex), startShapeIndex });
  return chunks;
}

function normalizeTraceEdge(edge, startShapeIndex) {
  return {
    names: normalizeNames(edge.names),
    wayId: edge.way_id ?? edge.wayId ?? null,
    roadClass: edge.road_class || edge.roadClass || '',
    use: edge.use || '',
    forward: edge.forward,
    traversability: edge.traversability || '',
    motorcycleAccess: edge.motorcycle_access ?? edge.motorcycleAccess,
    lengthKm: Number(edge.length || 0),
    beginShapeIndex: startShapeIndex + Number(edge.begin_shape_index ?? edge.beginShapeIndex ?? 0),
    endShapeIndex: startShapeIndex + Number(edge.end_shape_index ?? edge.endShapeIndex ?? edge.begin_shape_index ?? 0)
  };
}

function appendTraceEdge(edges, edge) {
  const previous = edges.at(-1);
  const sameWay = previous
    && edge.wayId !== null
    && previous.wayId === edge.wayId
    && previous.forward === edge.forward;
  if (sameWay && edge.beginShapeIndex <= previous.endShapeIndex) {
    previous.endShapeIndex = Math.max(previous.endShapeIndex, edge.endShapeIndex);
    previous.lengthKm = round(previous.lengthKm + edge.lengthKm, 4);
    return;
  }
  edges.push(edge);
}

function normalizeNames(names) {
  return (Array.isArray(names) ? names : [])
    .map((name) => typeof name === 'string' ? name : name.value || name.text || '')
    .filter(Boolean);
}

export function buildFixtureRoute(locations) {
  const geometry = [];
  const edges = [];
  let shapeIndex = 0;
  let distanceKm = 0;
  for (let legIndex = 0; legIndex < locations.length - 1; legIndex += 1) {
    const from = [locations[legIndex].lat, locations[legIndex].lng];
    const to = [locations[legIndex + 1].lat, locations[legIndex + 1].lng];
    const steps = Math.max(8, Math.min(36, Math.ceil(haversineKm(from, to) / 3)));
    const beginShapeIndex = shapeIndex;
    for (let step = 0; step <= steps; step += 1) {
      if (legIndex > 0 && step === 0) continue;
      const ratio = step / steps;
      geometry.push([
        from[0] + (to[0] - from[0]) * ratio,
        from[1] + (to[1] - from[1]) * ratio
      ]);
      shapeIndex = geometry.length - 1;
    }
    const legDistance = haversineKm(from, to) * 1.18;
    distanceKm += legDistance;
    edges.push({
      names: [`示範道路 ${legIndex + 1}`],
      roadClass: 'primary',
      use: 'road',
      lengthKm: legDistance,
      beginShapeIndex,
      endShapeIndex: shapeIndex,
      wayId: `fixture-${legIndex + 1}`
    });
  }
  return {
    geometry,
    encodedShape: encodePolyline6(geometry),
    distanceKm: round(distanceKm, 1),
    durationMinutes: Math.max(1, Math.round(distanceKm / 42 * 60)),
    source: 'fixture',
    edges
  };
}

export function buildFixtureCameras() {
  return [
    ['demo-taipei', '\u53f0\u5317\u8eca\u7ad9\u793a\u7bc4\u756b\u9762', 25.0478, 121.517, '\u5e02\u6c11\u5927\u9053'],
    ['demo-pinglin', '\u5317\u5b9c\u516c\u8def\u576a\u6797\u793a\u7bc4\u756b\u9762', 24.935, 121.711, '\u53f09\u7dda'],
    ['demo-yilan', '\u5b9c\u862d\u5e02\u793a\u7bc4\u756b\u9762', 24.757, 121.753, '\u53f09\u7dda'],
    ['demo-hsinchu', '\u65b0\u7af9\u897f\u6ff1\u793a\u7bc4\u756b\u9762', 24.83, 120.93, '\u53f061\u7dda'],
    ['demo-taichung', '\u53f0\u4e2d\u5e02\u5340\u793a\u7bc4\u756b\u9762', 24.147, 120.674, '\u53f012\u7dda'],
    ['demo-chiayi', '\u5609\u7fa9\u793a\u7bc4\u756b\u9762', 23.48, 120.449, '\u53f01\u7dda'],
    ['demo-kaohsiung', '\u9ad8\u96c4\u793a\u7bc4\u756b\u9762', 22.627, 120.301, '\u53f01\u7dda'],
    ['demo-hualien', '\u82b1\u84ee\u793a\u7bc4\u756b\u9762', 23.987, 121.602, '\u53f09\u7dda']
  ].map((item, index) => ({
    id: item[0],
    name: item[1],
    lat: item[2],
    lng: item[3],
    roadRef: item[4],
    imageUrl: '',
    status: index === 3 ? 'offline' : 'unknown',
    source: 'DEMO'
  }));
}

export function buildFixtureCountyWeather(now = new Date()) {
  return {
    '\u53f0\u5317\u5e02': { temp: 27, weather: '\u591a\u96f2', name: '\u53f0\u5317\u5e02', town: '', rainChance: 20, observedAt: now.toISOString(), source: 'DEMO' },
    '\u5b9c\u862d\u7e23': { temp: 25, weather: '\u77ed\u66ab\u96e8', name: '\u5b9c\u862d\u7e23', town: '', rainChance: 70, observedAt: now.toISOString(), source: 'DEMO' },
    '\u53f0\u4e2d\u5e02': { temp: 29, weather: '\u6674\u6642\u591a\u96f2', name: '\u53f0\u4e2d\u5e02', town: '', rainChance: 10, observedAt: now.toISOString(), source: 'DEMO' },
    '\u9ad8\u96c4\u5e02': { temp: 30, weather: '\u591a\u96f2', name: '\u9ad8\u96c4\u5e02', town: '', rainChance: 30, observedAt: now.toISOString(), source: 'DEMO' }
  };
}

export async function loadLiveProviderData(sections, env) {
  const issues = [];
  const [tdxResult, thbResult, weatherResult, cameraResult] = await Promise.allSettled([
    loadTdxData(env),
    loadThbPublishedData(sections, env),
    loadCwaSamples(sections, env),
    loadCameras(env)
  ]);

  const tdx = settledValue(
    tdxResult,
    { config: null, sections: null, live: null, incidents: [], issues: [] },
    'TDX',
    issues
  );
  const thb = settledValue(
    thbResult,
    { publishedTraffic: [], liveTraffic: null, congestion: null },
    'THB',
    issues
  );
  (tdx.issues || []).forEach((issue) => issues.push(`TDX: ${issue}`));
  const weather = settledValue(weatherResult, [], 'CWA', issues);
  const cameras = settledValue(cameraResult, [], 'CCTV', issues);
  const referenceSpeedByLink = tdx.sections && thb.liveTraffic && thb.congestion
    ? buildReferenceSpeedByLink(tdx.sections, thb.liveTraffic, thb.congestion)
    : new Map();
  return {
    detectors: tdx.config && tdx.live
      ? mergeTdxDetectors(tdx.config, tdx.live, referenceSpeedByLink)
      : [],
    publishedTraffic: thb.publishedTraffic || [],
    incidents: tdx.incidents || [],
    weather,
    cameras,
    trafficSource: 'TDX/THB',
    issues
  };
}

function settledValue(result, fallback, label, issues) {
  if (result.status === 'fulfilled') return result.value;
  issues.push(`${label}: ${result.reason && result.reason.message ? result.reason.message : 'unavailable'}`);
  return fallback;
}

async function loadTdxData(env) {
  if (!env.TDX_CLIENT_ID || !env.TDX_CLIENT_SECRET) {
    throw new Error('credentials not configured');
  }
  const token = await getTdxToken(env);
  const headers = { Authorization: `Bearer ${token}` };
  const liveUrl = env.TDX_VD_LIVE_ENDPOINT || DEFAULT_TDX_LIVE_URL;
  const incidentUrl = env.TDX_INCIDENT_ENDPOINT || DEFAULT_TDX_INCIDENT_URL;
  const [staticResponse, liveResponse, incidentResponse] = await Promise.allSettled([
    loadTdxStaticData(env, headers),
    requestJsonCached(liveUrl, { headers }, 15000, TDX_LIVE_TTL_MS),
    requestJsonCached(incidentUrl, { headers }, 15000, TDX_LIVE_TTL_MS)
  ]);
  const issues = staticResponse.status === 'fulfilled'
    ? [...staticResponse.value.issues]
    : [`static feeds unavailable: ${resultError(staticResponse)}`];
  if (liveResponse.status !== 'fulfilled') {
    issues.push(`VD live feed unavailable: ${resultError(liveResponse)}`);
  }
  if (incidentResponse.status !== 'fulfilled') {
    issues.push(`road events unavailable: ${resultError(incidentResponse)}`);
  }
  return {
    config: staticResponse.status === 'fulfilled' ? staticResponse.value.config : null,
    sections: staticResponse.status === 'fulfilled' ? staticResponse.value.sections : null,
    live: liveResponse.status === 'fulfilled' ? liveResponse.value : null,
    incidents: incidentResponse.status === 'fulfilled' ? normalizeTdxIncidents(incidentResponse.value) : [],
    issues
  };
}

async function loadTdxStaticData(env, headers) {
  const urls = {
    config: env.TDX_VD_CONFIG_ENDPOINT || DEFAULT_TDX_CONFIG_URL,
    sections: env.TDX_SECTION_ENDPOINT || DEFAULT_TDX_SECTION_URL
  };
  const cacheKey = Object.values(urls).join('|');
  if (tdxStaticCache && tdxStaticCache.key === cacheKey && tdxStaticCache.expiresAt > Date.now()) {
    return tdxStaticCache.value;
  }

  const [configResult, sectionResult] = await Promise.allSettled([
    requestJson(urls.config, { headers }, 20000),
    requestJson(urls.sections, { headers }, 20000)
  ]);

  const issues = [];
  const staticResults = [
    ['VD configuration', configResult],
    ['sections', sectionResult]
  ];
  staticResults.forEach(([label, result]) => {
    if (result.status !== 'fulfilled') {
      issues.push(`${label} unavailable: ${resultError(result)}`);
    }
  });
  if (staticResults.every(([, result]) => result.status !== 'fulfilled')) {
    throw new Error(issues.join('; ') || 'no usable TDX static feed');
  }

  const value = {
    config: configResult.status === 'fulfilled' ? configResult.value : null,
    sections: sectionResult.status === 'fulfilled' ? sectionResult.value : null,
    issues
  };
  if (staticResults.every(([, result]) => result.status === 'fulfilled')) {
    tdxStaticCache = {
      key: cacheKey,
      value,
      expiresAt: Date.now() + TDX_STATIC_TTL_MS
    };
  }
  return value;
}

async function loadThbPublishedData(routeSections, env) {
  const [staticData, liveTraffic] = await Promise.all([
    loadThbStaticData(env),
    loadThbLiveTraffic(env)
  ]);
  return {
    publishedTraffic: mergePublishedSections(
      staticData.sections,
      staticData.sectionShapes,
      liveTraffic,
      staticData.congestion,
      routeSections,
      'THB'
    ),
    liveTraffic,
    congestion: staticData.congestion
  };
}

async function loadThbStaticData(env) {
  const urls = {
    sections: env.THB_SECTION_ENDPOINT || DEFAULT_THB_SECTION_URL,
    sectionShapes: env.THB_SECTION_SHAPE_ENDPOINT || DEFAULT_THB_SECTION_SHAPE_URL,
    congestion: env.THB_CONGESTION_ENDPOINT || DEFAULT_THB_CONGESTION_URL
  };
  const cacheKey = Object.values(urls).join('|');
  if (thbStaticCache && thbStaticCache.key === cacheKey && thbStaticCache.expiresAt > Date.now()) {
    return thbStaticCache.value;
  }
  if (thbStaticPromise && thbStaticPromise.key === cacheKey) return thbStaticPromise.promise;

  const promise = (async () => {
    const [sectionXml, shapeXml, congestionXml] = await Promise.all([
      requestText(urls.sections, {}, 30000),
      requestText(urls.sectionShapes, {}, 30000),
      requestText(urls.congestion, {}, 15000)
    ]);
    const value = {
      sections: parseThbSectionsXml(sectionXml),
      sectionShapes: parseThbSectionShapesXml(shapeXml),
      congestion: parseThbCongestionXml(congestionXml)
    };
    thbStaticCache = {
      key: cacheKey,
      value,
      expiresAt: Date.now() + THB_STATIC_TTL_MS
    };
    return value;
  })();
  thbStaticPromise = { key: cacheKey, promise };
  try {
    return await promise;
  } finally {
    if (thbStaticPromise?.promise === promise) thbStaticPromise = null;
  }
}

async function loadThbLiveTraffic(env) {
  const url = env.THB_LIVE_TRAFFIC_ENDPOINT || DEFAULT_THB_LIVE_TRAFFIC_URL;
  if (thbLiveCache && thbLiveCache.key === url && thbLiveCache.expiresAt > Date.now()) {
    return thbLiveCache.value;
  }
  if (thbLivePromise && thbLivePromise.key === url) return thbLivePromise.promise;

  const promise = requestText(url, {}, 30000).then((xml) => {
    const value = parseThbLiveTrafficXml(xml);
    thbLiveCache = {
      key: url,
      value,
      expiresAt: Date.now() + THB_LIVE_TTL_MS
    };
    return value;
  });
  thbLivePromise = { key: url, promise };
  try {
    return await promise;
  } finally {
    if (thbLivePromise?.promise === promise) thbLivePromise = null;
  }
}

function resultError(result) {
  return result.reason && result.reason.message ? result.reason.message : 'unavailable';
}

async function getTdxToken(env) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) return tokenCache.value;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.TDX_CLIENT_ID,
    client_secret: env.TDX_CLIENT_SECRET
  });
  const response = await requestJson(TDX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }, 10000);
  if (!response.access_token) throw new Error('TDX token missing');
  tokenCache = {
    value: response.access_token,
    expiresAt: Date.now() + Number(response.expires_in || 900) * 1000
  };
  return tokenCache.value;
}

export function mergeTdxDetectors(configPayload, livePayload, referenceSpeedByLink = new Map()) {
  const configs = arrayFromPayload(configPayload, ['VDs', 'VDList']);
  const lives = arrayFromPayload(livePayload, ['VDLives', 'VDLiveList']);
  const liveById = new Map(lives.map((item) => [item.VDID || item.VdId || item.id, item]));
  return configs.flatMap((config) => {
    const id = config.VDID || config.VdId || config.id;
    const live = liveById.get(id);
    if (!live) return [];
    if (live.Status !== undefined && Number(live.Status) !== 0) return [];
    const detectionLinks = Array.isArray(config.DetectionLinks) && config.DetectionLinks.length
      ? config.DetectionLinks
      : [{ LinkID: null, Bearing: config.Bearing || config.DirectionAngle }];
    return detectionLinks.map((link, linkIndex) => ({
      id: link.LinkID ? `${id}:${link.LinkID}` : `${id}:${linkIndex}`,
      lat: numeric(config.PositionLat, config.Position?.PositionLat, config.lat),
      lng: numeric(config.PositionLon, config.Position?.PositionLon, config.lng),
      heading: directionDegrees(
        link.Bearing ?? link.RoadDirection ?? config.Bearing ?? config.DirectionAngle
      ),
      roadRef: config.RoadName || config.RoadID || config.RoadSection || '',
      speedKph: trafficSpeed(live, link.LinkID),
      referenceSpeedKph: numeric(
        referenceSpeedByLink.get(link.LinkID),
        config.SpeedLimit,
        config.ReferenceSpeed,
        config.FreeFlowSpeed,
        config.Speed
      ),
      observedAt: live.DataCollectTime || live.UpdateTime || live.observedAt,
      source: 'TDX'
    }));
  }).filter((item) => item && Number.isFinite(item.lat) && Number.isFinite(item.lng));
}

function trafficSpeed(live, linkId) {
  let linkFlows = live.LinkFlows || live.linkFlows || [];
  if (linkId) linkFlows = linkFlows.filter((link) => (link.LinkID || link.linkId) === linkId);
  let weightedSpeed = 0;
  let totalVolume = 0;
  let fallbackSpeed = 0;
  let fallbackCount = 0;
  for (const link of linkFlows) {
    for (const lane of link.Lanes || link.lanes || []) {
      const speed = Number(lane.Speed ?? lane.speed);
      const volumes = lane.Vehicles || lane.VehicleVolumes || lane.vehicles || [];
      const volume = volumes.reduce((sum, item) => {
        const value = Number(item.Volume ?? item.volume);
        return sum + (Number.isFinite(value) && value > 0 ? value : 0);
      }, 0);
      const errorType = String(lane.ErrorType || '').toLowerCase();
      if (errorType && errorType !== 'diag0') continue;
      if (Number.isFinite(speed) && speed >= 0) {
        if (volume > 0) {
          weightedSpeed += speed * volume;
          totalVolume += volume;
        } else if (speed > 0) {
          fallbackSpeed += speed;
          fallbackCount += 1;
        }
      }
    }
  }
  if (totalVolume) return weightedSpeed / totalVolume;
  return fallbackCount ? fallbackSpeed / fallbackCount : null;
}

export function buildReferenceSpeedByLink(sectionPayload, liveTrafficPayload, congestionPayload) {
  const sections = arrayFromPayload(sectionPayload, ['Sections', 'SectionList']);
  const liveTraffics = arrayFromPayload(liveTrafficPayload, ['LiveTraffics', 'LiveTrafficList']);
  const groups = arrayFromPayload(congestionPayload, ['CongestionLevels', 'CongestionLevelList']);
  const trafficBySection = new Map(liveTraffics.map((item) => [item.SectionID, item]));
  const referenceByGroup = new Map(groups.map((group) => [
    group.CongestionLevelID,
    referenceSpeedFromCongestionGroup(group)
  ]));
  const result = new Map();
  sections.forEach((section) => {
    const traffic = trafficBySection.get(section.SectionID);
    const referenceSpeed = numeric(
      section.SpeedLimit,
      traffic && referenceByGroup.get(traffic.CongestionLevelID)
    );
    if (!Number.isFinite(referenceSpeed) || referenceSpeed <= 0) return;
    (section.LinkIDs || []).forEach((link) => {
      if (link.LinkID) result.set(link.LinkID, referenceSpeed);
    });
  });
  return result;
}

export function mergePublishedSections(
  sectionPayload,
  shapePayload,
  liveTrafficPayload,
  congestionPayload,
  routeSections = [],
  source = 'TDX'
) {
  const sections = arrayFromPayload(sectionPayload, ['Sections', 'SectionList']);
  const shapes = arrayFromPayload(shapePayload, ['SectionShapes', 'SectionShapeList']);
  const liveTraffics = arrayFromPayload(liveTrafficPayload, ['LiveTraffics', 'LiveTrafficList']);
  const groups = arrayFromPayload(congestionPayload, ['CongestionLevels', 'CongestionLevelList']);
  const routeRoads = new Set((routeSections || []).map((section) => normalizeRoadKey(section.roadRef)).filter(Boolean));
  const shapeBySection = new Map(shapes.map((shape) => [shape.SectionID, shape]));
  const trafficBySection = new Map(liveTraffics.map((traffic) => [traffic.SectionID, traffic]));
  const referenceByGroup = new Map(groups.map((group) => [
    group.CongestionLevelID,
    referenceSpeedFromCongestionGroup(group)
  ]));

  return sections.flatMap((section) => {
    const id = section.SectionID || section.sectionId;
    const roadRef = section.RoadName || section.RoadID || section.SectionName || '';
    if (routeRoads.size && !routeRoads.has(normalizeRoadKey(roadRef))) return [];
    const shape = shapeBySection.get(id);
    const traffic = trafficBySection.get(id);
    if (!shape || !traffic) return [];
    const geometry = parseLineString(shape.Geometry || shape.geometry);
    if (geometry.length < 2) return [];
    const congestionLevel = numeric(traffic.CongestionLevel, traffic.congestionLevel);
    return [{
      id,
      roadRef,
      heading: directionDegrees(section.RoadDirection || section.Direction),
      geometry,
      speedKph: numeric(traffic.TravelSpeed, traffic.travelSpeed),
      referenceSpeedKph: numeric(
        section.SpeedLimit,
        referenceByGroup.get(traffic.CongestionLevelID)
      ),
      congestionLevel,
      observedAt: traffic.DataCollectTime || traffic.UpdateTime || liveTrafficPayload?.UpdateTime || null,
      available: congestionLevel === null || congestionLevel >= 0,
      source,
      method: 'published-section'
    }];
  });
}

export function parseThbSectionsXml(xml) {
  return {
    UpdateTime: xmlValue(xml, 'UpdateTime'),
    Sections: xmlBlocks(xml, 'Section').map((block) => ({
      SectionID: xmlValue(block, 'SectionID'),
      SectionName: xmlValue(block, 'SectionName'),
      RoadID: xmlValue(block, 'RoadID'),
      RoadName: xmlValue(block, 'RoadName'),
      RoadClass: numeric(xmlValue(block, 'RoadClass')),
      RoadDirection: xmlValue(block, 'RoadDirection')
    })).filter((section) => section.SectionID && section.RoadName)
  };
}

export function parseThbSectionShapesXml(xml) {
  return {
    UpdateTime: xmlValue(xml, 'UpdateTime'),
    SectionShapes: xmlBlocks(xml, 'SectionShape').map((block) => ({
      SectionID: xmlValue(block, 'SectionID'),
      Geometry: xmlValue(block, 'Geometry')
    })).filter((shape) => shape.SectionID && shape.Geometry)
  };
}

export function parseThbLiveTrafficXml(xml) {
  return {
    UpdateTime: normalizeDateTime(xmlValue(xml, 'UpdateTime')),
    LiveTraffics: xmlBlocks(xml, 'LiveTraffic').map((block) => ({
      SectionID: xmlValue(block, 'SectionID'),
      TravelTime: numeric(xmlValue(block, 'TravelTime')),
      TravelSpeed: numeric(xmlValue(block, 'TravelSpeed')),
      CongestionLevelID: xmlValue(block, 'CongestionLevelID'),
      CongestionLevel: numeric(xmlValue(block, 'CongestionLevel')),
      DataCollectTime: normalizeDateTime(xmlValue(block, 'DataCollectTime'))
    })).filter((traffic) => traffic.SectionID)
  };
}

export function parseThbCongestionXml(xml) {
  const groups = [];
  const groupPattern = /<CongestionLevel>\s*<CongestionLevelID>([^<]+)<\/CongestionLevelID>[\s\S]*?<MeasureIndex>([^<]+)<\/MeasureIndex>\s*<Levels>([\s\S]*?)<\/Levels>\s*<\/CongestionLevel>/g;
  for (const match of String(xml || '').matchAll(groupPattern)) {
    const levels = [];
    const levelPattern = /<Level>\s*<Level>(-?\d+)<\/Level>([\s\S]*?)<\/Level>/g;
    for (const levelMatch of match[3].matchAll(levelPattern)) {
      levels.push({
        Level: Number(levelMatch[1]),
        LowValue: numeric(xmlValue(levelMatch[2], 'LowValue')),
        TopValue: numeric(xmlValue(levelMatch[2], 'TopValue'))
      });
    }
    groups.push({
      CongestionLevelID: decodeXml(match[1]),
      MeasureIndex: decodeXml(match[2]),
      Levels: levels
    });
  }
  return {
    UpdateTime: xmlValue(xml, 'UpdateTime'),
    CongestionLevels: groups
  };
}

function xmlBlocks(xml, tagName) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  return [...String(xml || '').matchAll(pattern)].map((match) => match[1]);
}

function xmlValue(xml, tagName) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const match = String(xml || '').match(pattern);
  return match ? decodeXml(match[1].trim()) : '';
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function normalizeDateTime(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')
    .replace(/(\.\d{3})\d+([+-]\d{2}:\d{2}|Z)$/, '$1$2');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseLineString(value) {
  const match = String(value || '').trim().match(/^LINESTRING\s*\((.+)\)$/i);
  if (!match) return [];
  return match[1].split(',').map((pair) => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number);
    return [lat, lng];
  }).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

function normalizeRoadKey(value) {
  return String(value || '').replace(/臺/g, '台').replace(/線|公路|\s/g, '');
}

function referenceSpeedFromCongestionGroup(group) {
  if (String(group.MeasureIndex || '').toLowerCase() !== 'speed') return null;
  const clear = (group.Levels || []).find((level) => Number(level.Level) === 1);
  const clearLowerBound = Number(clear && clear.LowValue);
  return Number.isFinite(clearLowerBound) && clearLowerBound > 0
    ? clearLowerBound / 0.75
    : null;
}

function directionDegrees(value) {
  if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  const directions = {
    N: 0,
    NE: 45,
    E: 90,
    SE: 135,
    S: 180,
    SW: 225,
    W: 270,
    NW: 315
  };
  return directions[String(value || '').trim().toUpperCase()] ?? null;
}

export function normalizeTdxIncidents(payload) {
  const payloadUpdatedAt = payload?.UpdateTime || payload?.SrcUpdateTime || null;
  return arrayFromPayload(payload, ['LiveEvents', 'Incidents', 'RoadIncidents']).map((item) => {
    const point = parseWktPoint(item.Positions || item.Geometry);
    const roadLocation = item.Location?.FreeExpressHighway || {};
    const impact = item.Impact || {};
    return {
      id: item.IncidentID || item.EventID || item.id,
      title: item.EventTitle || item.IncidentType || item.Title || '道路事件',
      description: item.Description || item.Comment || '',
      severity: impact.Severity ?? item.Severity ?? 'warning',
      roadRef: roadLocation.Road || item.RoadName || item.RoadID || '',
      lat: numeric(item.PositionLat, item.Position?.PositionLat, item.lat, point?.lat),
      lng: numeric(item.PositionLon, item.Position?.PositionLon, item.lng, point?.lng),
      updatedAt: item.LastUpdateTime || item.UpdateTime || item.PublishTime || payloadUpdatedAt,
      expiresAt: item.ExpireTime || impact.Duration?.DurationEndTime || item.EndTime || null,
      source: 'TDX'
    };
  });
}

function parseWktPoint(value) {
  const match = String(value || '').match(/POINT\s*(?:Z\s*)?\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export async function loadCwaSamples(sections, env) {
  if (!env.CWA_API_KEY) throw new Error('API key not configured');
  const [stationPayload, forecastPayload] = await Promise.all([
    fetchCwa(env.CWA_OBSERVATION_ENDPOINT || DEFAULT_CWA_OBSERVATION_URL, env.CWA_API_KEY),
    fetchCwa(env.CWA_FORECAST_ENDPOINT || DEFAULT_CWA_FORECAST_URL, env.CWA_API_KEY)
  ]);
  const stations = normalizeCwaStations(stationPayload);
  const forecasts = normalizeCwaForecasts(forecastPayload);
  return sections.map((section) => {
    const stationMatch = nearestPoint(section.sample, stations);
    const forecastMatch = nearestPoint(section.sample, forecasts);
    if (!stationMatch || stationMatch.distanceKm > 50) return null;

    const station = stationMatch.value;
    const forecast = forecastMatch && forecastMatch.distanceKm <= 50
      ? forecastMatch.value
      : null;
    return {
      lat: station.lat,
      lng: station.lng,
      condition: (forecast && forecast.condition) || (station && station.condition) || '未知',
      temperatureC: station ? station.temperatureC : (forecast && forecast.temperatureC),
      rainChance: forecast ? forecast.rainChance : null,
      observedAt: (station && station.observedAt) || new Date().toISOString(),
      forecastAt: forecast && forecast.forecastAt,
      stationDistanceKm: round(stationMatch.distanceKm, 1),
      source: 'CWA'
    };
  }).filter(Boolean);
}

export async function loadCountyWeather(env) {
  if (!env.CWA_API_KEY) return {};
  const payload = await fetchCwa(
    env.CWA_COUNTY_FORECAST_ENDPOINT || DEFAULT_CWA_COUNTY_FORECAST_URL,
    env.CWA_API_KEY
  );
  const forecasts = normalizeCwaForecasts(payload);
  return forecasts.reduce((result, item) => {
    if (!item.county) return result;
    result[item.county] = {
      temp: item.temperatureC ?? '--',
      weather: item.condition || '未知',
      name: item.county,
      town: item.town || '',
      rainChance: item.rainChance,
      observedAt: item.observedAt
    };
    return result;
  }, {});
}

async function fetchCwa(url, apiKey) {
  const parsed = new URL(url);
  parsed.searchParams.set('Authorization', apiKey);
  parsed.searchParams.set('format', 'JSON');
  return requestJsonCached(parsed.toString(), {}, 15000, CWA_SNAPSHOT_TTL_MS);
}

function normalizeCwaStations(payload) {
  const stations = payload.records?.Station || payload.records?.station || [];
  return stations.map((station) => {
    const coordinate = station.GeoInfo?.Coordinates?.find((item) => item.CoordinateName === 'WGS84')
      || station.GeoInfo?.Coordinates?.[0] || {};
    const elements = station.WeatherElement || {};
    return {
      lat: numeric(coordinate.StationLatitude, station.PositionLat, station.lat),
      lng: numeric(coordinate.StationLongitude, station.PositionLon, station.lng),
      condition: elements.Weather || station.Weather || '未知',
      temperatureC: numeric(elements.AirTemperature, station.AirTemperature),
      observedAt: station.ObsTime?.DateTime || station.ObsTime || station.DataTime || null
    };
  }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
}

const COUNTY_CENTERS = {
  '基隆市': [25.128, 121.742], '台北市': [25.033, 121.565], '新北市': [25.012, 121.465],
  '桃園市': [24.994, 121.301], '新竹市': [24.814, 120.968], '新竹縣': [24.688, 121.157],
  '苗栗縣': [24.26, 120.799], '台中市': [24.148, 120.674], '彰化縣': [23.992, 120.616],
  '南投縣': [23.961, 120.972], '雲林縣': [23.709, 120.431], '嘉義市': [23.48, 120.449],
  '嘉義縣': [23.452, 120.255], '台南市': [23, 120.227], '高雄市': [22.627, 120.301],
  '屏東縣': [22.552, 120.548], '宜蘭縣': [24.694, 121.738], '花蓮縣': [23.987, 121.602],
  '台東縣': [22.797, 121.071], '澎湖縣': [23.571, 119.579], '金門縣': [24.449, 118.377],
  '連江縣': [26.197, 119.94]
};

export function normalizeCwaForecasts(payload, now = new Date()) {
  const townshipForecasts = normalizeTownshipForecasts(payload, now);
  if (townshipForecasts.length) return townshipForecasts;

  const locations = payload.records?.location || payload.records?.Location || [];
  return locations.map((location) => {
    const county = String(location.locationName || location.LocationName || '').replace(/臺/g, '台');
    const elements = location.weatherElement || location.WeatherElement || [];
    const wx = findForecastValue(elements, 'Wx');
    const pop = findForecastValue(elements, 'PoP');
    const min = Number(findForecastValue(elements, 'MinT').value);
    const max = Number(findForecastValue(elements, 'MaxT').value);
    const center = COUNTY_CENTERS[county];
    if (!center) return null;
    return {
      county,
      lat: center[0],
      lng: center[1],
      condition: wx.value || '未知',
      temperatureC: Number.isFinite(min) && Number.isFinite(max) ? (min + max) / 2 : null,
      rainChance: Number.isFinite(Number(pop.value)) ? Number(pop.value) : null,
      observedAt: new Date().toISOString(),
      forecastAt: wx.startTime || null
    };
  }).filter(Boolean);
}

function normalizeTownshipForecasts(payload, now) {
  const groups = payload.records?.Locations || payload.records?.locations || [];
  return groups.flatMap((group) => {
    const county = String(group.LocationsName || group.locationsName || '').replace(/臺/g, '台');
    const updatedAt = group.Update || group.update || group.IssueTime || group.issueTime || now.toISOString();
    const locations = group.Location || group.location || [];
    return locations.map((location) => {
      const elements = location.WeatherElement || location.weatherElement || [];
      const temperature = findTownshipForecastValue(elements, ['\u6eab\u5ea6', 'T'], ['Temperature'], now);
      const rain = findTownshipForecastValue(
        elements,
        ['3\u5c0f\u6642\u964d\u96e8\u6a5f\u7387', 'PoP3h', 'PoP'],
        ['ProbabilityOfPrecipitation'],
        now
      );
      const weather = findTownshipForecastValue(elements, ['\u5929\u6c23\u73fe\u8c61', 'Wx'], ['Weather'], now);
      const lat = numeric(location.Latitude, location.latitude);
      const lng = numeric(location.Longitude, location.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        county,
        town: location.LocationName || location.locationName || '',
        lat,
        lng,
        condition: weather.value || '\u672a\u77e5',
        temperatureC: Number.isFinite(Number(temperature.value)) ? Number(temperature.value) : null,
        rainChance: Number.isFinite(Number(rain.value)) ? Number(rain.value) : null,
        observedAt: updatedAt,
        forecastAt: rain.time || weather.time || temperature.time || null
      };
    }).filter(Boolean);
  });
}

function findTownshipForecastValue(elements, names, valueKeys, now) {
  const element = elements.find((item) => names.includes(item.ElementName || item.elementName)) || {};
  const period = selectNearTermPeriod(element.Time || element.time || [], now);
  const rawValues = period.ElementValue || period.elementValue || [];
  const values = Array.isArray(rawValues) ? rawValues : [rawValues];
  let value = null;
  for (const item of values) {
    for (const key of valueKeys) {
      if (item && item[key] !== undefined && item[key] !== null && item[key] !== '') {
        value = item[key];
        break;
      }
    }
    if (value !== null) break;
  }
  return {
    value,
    time: period.DataTime || period.dataTime || period.StartTime || period.startTime || null
  };
}

function selectNearTermPeriod(periods, now) {
  const current = now.getTime();
  const horizon = current + 3 * 60 * 60 * 1000;
  const ranked = (periods || []).map((period, index) => {
    const startValue = period.DataTime || period.dataTime || period.StartTime || period.startTime;
    const endValue = period.EndTime || period.endTime || startValue;
    const start = new Date(startValue).getTime();
    const end = new Date(endValue).getTime();
    const valid = Number.isFinite(start) && Number.isFinite(end);
    const overlaps = valid && end >= current && start <= horizon;
    const distance = valid ? Math.abs(start - current) : Number.MAX_SAFE_INTEGER;
    return { period, index, overlaps, distance };
  });
  return ranked.sort((a, b) => Number(b.overlaps) - Number(a.overlaps) || a.distance - b.distance || a.index - b.index)[0]?.period || {};
}

function findForecastValue(elements, name) {
  const element = elements.find((item) => item.elementName === name || item.ElementName === name) || {};
  const period = (element.time || element.Time || [])[0] || {};
  const parameter = period.parameter || period.Parameter || {};
  return {
    value: parameter.parameterName ?? parameter.ParameterName ?? '',
    startTime: period.startTime || period.StartTime || null
  };
}

function nearestPoint(point, values) {
  return (values || []).map((value) => ({
    value,
    distanceKm: haversineKm(point, [value.lat, value.lng])
  })).sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

export async function loadCameras(env) {
  const url = env.CAMERA_SOURCE_URL || 'https://www.twipcam.com/api/v1/cam-list.json';
  const payload = await requestJsonCached(url, {}, 15000, CAMERA_SNAPSHOT_TTL_MS);
  const list = Array.isArray(payload) ? payload : payload.data || payload.cams || [];
  return list.map((camera, index) => ({
    id: String(camera.id || camera.CCTVID || `cam-${index}`),
    name: String(camera.name || camera.RoadName || camera.CCTVName || '未命名攝影機'),
    lat: numeric(camera.lat, camera.latitude, camera.PositionLat),
    lng: numeric(camera.lon, camera.lng, camera.longitude, camera.PositionLon),
    roadRef: camera.roadRef || camera.RoadName || camera.name || '',
    imageUrl: camera.cam_url || camera.imageUrl || camera.url || '',
    status: camera.status || 'unknown',
    source: camera.source || 'CCTV'
  })).filter((camera) => (
    Number.isFinite(camera.lat) && Number.isFinite(camera.lng)
    && camera.lat > 21 && camera.lat < 27 && camera.lng > 118 && camera.lng < 123
  ));
}

function normalizePlaceText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/臺/g, '台')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function buildNominatimPlaceQuery(query) {
  const canonicalQuery = String(query || '')
    .trim()
    .replace(/台/g, '臺')
    .replace(/\s*(?:臺灣|taiwan)\s*$/i, '')
    .trim();
  const civicMatch = canonicalQuery.match(/^(.+?([縣市]))(政府|議會)$/);
  if (!civicMatch) return canonicalQuery;
  return `${civicMatch[2]}${civicMatch[3]} ${civicMatch[1]}`;
}

function geocodeRelevance(item, query) {
  const normalizedQuery = normalizePlaceText(query);
  const normalizedName = normalizePlaceText(item.name);
  const normalizedDisplayName = normalizePlaceText(item.display_name);
  const adminMatch = normalizedQuery.match(/^(.+?[縣市])/);
  const intent = adminMatch ? normalizedQuery.slice(adminMatch[1].length) : normalizedQuery;
  let score = Number(item.importance || 0);

  if (normalizedName === normalizedQuery) score += 200;
  else if (normalizedDisplayName.includes(normalizedQuery)) score += 80;
  if (adminMatch) {
    score += normalizedDisplayName.includes(adminMatch[1]) ? 100 : -100;
  }
  if (intent && normalizedName.includes(intent)) score += 20;
  return score;
}

export async function geocodePlace(query) {
  const originalQuery = String(query || '').trim();
  const normalizedQuery = buildNominatimPlaceQuery(originalQuery);
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', /台灣|taiwan/i.test(normalizedQuery) ? normalizedQuery : `${normalizedQuery} 台灣`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '8');
  url.searchParams.set('countrycodes', 'tw');
  url.searchParams.set('viewbox', '117,27,124,20');
  url.searchParams.set('bounded', '1');
  url.searchParams.set('accept-language', 'zh-TW');
  url.searchParams.set('addressdetails', '1');
  const payload = await requestJsonCached(url.toString(), {
    headers: { 'User-Agent': 'taiwan-dashboard-worker/2.0 (route-assistant)' }
  }, 10000, GEOCODE_TTL_MS);
  const seen = new Set();
  const adminMatch = normalizePlaceText(originalQuery).match(/^(.+?[縣市])/);
  const places = (payload || []).map((item) => ({
    name: String(item.name || item.display_name || '').split(',')[0].trim(),
    displayName: item.display_name || '',
    sub: String(item.display_name || '').split(',').slice(1, 3).join('、').trim(),
    lat: Number(item.lat),
    lng: Number(item.lon),
    type: item.type || item.category || 'place',
    importance: Number(item.importance || 0),
    relevance: geocodeRelevance(item, originalQuery)
  })).filter((item) => {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return false;
    if (adminMatch && !normalizePlaceText(item.displayName).includes(adminMatch[1])) return false;
    const key = `${item.name}|${item.lat.toFixed(5)}|${item.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.relevance - a.relevance);
  return places.map(({ relevance, ...item }) => item);
}

const MAP_HOSTS = new Set([
  'maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com', 'maps.apple.com'
]);

export async function expandMapUrl(rawUrl) {
  let current = new URL(rawUrl);
  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    if (!MAP_HOSTS.has(current.hostname)) throw new Error('Unsupported map URL host');
    const response = await fetch(current.toString(), { redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) return current.toString();
    const location = response.headers.get('location');
    if (!location) return current.toString();
    current = new URL(location, current);
  }
  throw new Error('Too many redirects');
}

function arrayFromPayload(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return [];
}

function numeric(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function round(value, digits) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

async function requestJson(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const rawBody = await response.text();
      let detail = rawBody.slice(0, 300);
      try {
        const body = JSON.parse(rawBody);
        detail = body.error || body.message || body.error_code || detail;
      } catch {
        // Keep the bounded text response when the upstream does not return JSON.
      }
      throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}${detail ? `: ${detail}` : ''}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestJsonCached(url, options = {}, timeoutMs = 12000, ttlMs = 60000) {
  const key = `${String(options.method || 'GET').toUpperCase()} ${url}`;
  const cached = jsonResponseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (jsonResponsePromises.has(key)) return jsonResponsePromises.get(key);

  const promise = requestJson(url, options, timeoutMs).then((value) => {
    const now = Date.now();
    for (const [cacheKey, entry] of jsonResponseCache) {
      if (entry.expiresAt <= now) jsonResponseCache.delete(cacheKey);
    }
    if (jsonResponseCache.has(key)) jsonResponseCache.delete(key);
    jsonResponseCache.set(key, { value, expiresAt: now + ttlMs });
    while (jsonResponseCache.size > JSON_RESPONSE_CACHE_MAX) {
      jsonResponseCache.delete(jsonResponseCache.keys().next().value);
    }
    return value;
  });
  jsonResponsePromises.set(key, promise);
  try {
    return await promise;
  } finally {
    if (jsonResponsePromises.get(key) === promise) jsonResponsePromises.delete(key);
  }
}

async function requestText(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
