import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TAIWAN_REGIONS, TAIWAN_ROUTE_CASES } from './taiwan-route-cases.mjs';

const workerUrl = String(process.env.WORKER_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const timeoutMs = positiveNumber(process.env.ROUTE_AUDIT_TIMEOUT_MS, 120000);
const delayMs = positiveNumber(process.env.ROUTE_AUDIT_DELAY_MS, 1000);
const outputDir = process.env.ROUTE_AUDIT_OUTPUT_DIR || '/tmp/taiwan-dashboard-route-audit';
const allowFixture = String(process.env.ROUTE_AUDIT_ALLOW_FIXTURE || '').toLowerCase() === 'true';
const filter = argumentValue('--filter') || process.env.ROUTE_AUDIT_FILTER || '';
const limit = positiveNumber(argumentValue('--limit') || process.env.ROUTE_AUDIT_LIMIT, Infinity);
const selectedCases = TAIWAN_ROUTE_CASES
  .filter((testCase) => matchesFilter(testCase, filter))
  .slice(0, limit);

if (!selectedCases.length) {
  throw new Error(`No route cases matched filter: ${filter || '(empty)'}`);
}

const startedAt = new Date();
const results = [];
console.log(`Taiwan route audit: ${selectedCases.length} cases via ${workerUrl}`);

for (const [index, testCase] of selectedCases.entries()) {
  console.log(`[${index + 1}/${selectedCases.length}] ${testCase.name} (${testCase.plate})`);
  const result = await auditRoute(testCase);
  results.push(result);
  console.log(`  ${result.status.toUpperCase()} ${result.distanceKm ?? '--'} km, traffic ${result.trafficCoveragePercent ?? '--'}%`);
  if (delayMs && index < selectedCases.length - 1) await sleep(delayMs);
}

const finishedAt = new Date();
const coveredRegions = unique(selectedCases.flatMap((testCase) => testCase.regions));
const report = {
  generatedAt: finishedAt.toISOString(),
  startedAt: startedAt.toISOString(),
  durationSeconds: round((finishedAt - startedAt) / 1000, 1),
  workerUrl,
  mode: allowFixture ? 'fixture-allowed' : 'live-required',
  filter: filter || null,
  expectedRegions: TAIWAN_REGIONS,
  coveredRegions,
  missingRegions: TAIWAN_REGIONS.filter((region) => !coveredRegions.includes(region)),
  summary: summarize(results),
  results
};

await mkdir(outputDir, { recursive: true });
const stamp = finishedAt.toISOString().replace(/[:.]/g, '-');
const jsonPath = path.join(outputDir, `taiwan-route-audit-${stamp}.json`);
const markdownPath = path.join(outputDir, `taiwan-route-audit-${stamp}.md`);
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(markdownPath, renderMarkdown(report), 'utf8');

console.log('');
console.log(`Summary: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`);
console.log(`Regions: ${coveredRegions.length}/${TAIWAN_REGIONS.length}`);
console.log(`JSON: ${jsonPath}`);
console.log(`Markdown: ${markdownPath}`);

if (report.summary.fail) process.exitCode = 1;

async function auditRoute(testCase) {
  const errors = [];
  const warnings = [];
  const routeStartedAt = performance.now();
  let routeResponse;
  try {
    routeResponse = await fetchJson(`${workerUrl}/v2/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: testCase.locations.map(({ lat, lng, type }) => ({ lat, lng, type })),
        vehicle: { type: 'motorcycle', plate: testCase.plate },
        preferences: { strategy: 'balanced' }
      })
    });
  } catch (error) {
    return failedResult(testCase, `Route request failed: ${error.message}`, performance.now() - routeStartedAt);
  }
  const routeMs = Math.round(performance.now() - routeStartedAt);
  const route = routeResponse.body?.data;
  if (routeResponse.status !== 200 || !route) {
    return failedResult(
      testCase,
      `Route HTTP ${routeResponse.status}: ${routeResponse.body?.message || 'empty response'}`,
      routeMs,
      routeResponse.body
    );
  }

  if (route.validation?.status !== 'safe') errors.push('Route validation is not safe');
  if (!route.validation?.rulesVersion) errors.push('Route rulesVersion is missing');
  if (!allowFixture && route.dataMode !== 'live') errors.push(`Expected live dataMode, received ${route.dataMode}`);
  if (!route.routeId) errors.push('routeId is missing');
  if (!Array.isArray(route.geometry?.coordinates) || route.geometry.coordinates.length < 2) {
    errors.push('Route geometry is empty');
  }
  if (!Number.isFinite(route.distanceKm)) {
    errors.push('Route distance is missing');
  } else if (route.distanceKm < testCase.distanceKm[0] || route.distanceKm > testCase.distanceKm[1]) {
    errors.push(`Distance ${route.distanceKm} km is outside ${testCase.distanceKm[0]}-${testCase.distanceKm[1]} km`);
  }
  if (route.validation?.rerouted) {
    const rerouteCount = Math.max(1, Number(route.validation.rerouteCount || 1));
    warnings.push(`Route required ${rerouteCount} safety reroute${rerouteCount === 1 ? '' : 's'}`);
  }
  if (routeMs > 10000) warnings.push(`Route response was slow (${routeMs} ms)`);

  let conditionsResponse;
  const conditionsStartedAt = performance.now();
  try {
    conditionsResponse = await fetchJson(`${workerUrl}/v2/routes/${encodeURIComponent(route.routeId)}/conditions`);
  } catch (error) {
    return {
      ...baseResult(testCase),
      status: 'fail',
      errors: [...errors, `Conditions request failed: ${error.message}`],
      warnings,
      routeMs,
      conditionsMs: Math.round(performance.now() - conditionsStartedAt),
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      routeId: route.routeId
    };
  }
  const conditionsMs = Math.round(performance.now() - conditionsStartedAt);
  const conditions = conditionsResponse.body?.data;
  if (conditionsResponse.status !== 200 || !conditions) {
    errors.push(`Conditions HTTP ${conditionsResponse.status}: ${conditionsResponse.body?.message || 'empty response'}`);
  }

  const sections = Array.isArray(conditions?.sections) ? conditions.sections : [];
  if (!sections.length || sections.length > 12) errors.push(`Invalid section count: ${sections.length}`);
  if (!['ok', 'partial'].includes(conditionsResponse.body?.status)) {
    errors.push(`Invalid conditions status: ${conditionsResponse.body?.status}`);
  }
  if (!allowFixture && conditions?.dataMode !== 'live') {
    errors.push(`Expected live conditions, received ${conditions?.dataMode}`);
  }
  const allowedTrafficLevels = new Set(['clear', 'slow', 'congested', 'unknown']);
  sections.forEach((section) => {
    const traffic = section.traffic || {};
    const weather = section.weather || {};
    if (!allowedTrafficLevels.has(traffic.level)) errors.push(`Section ${section.order} has invalid traffic level`);
    if (traffic.level === 'unknown') {
      if (traffic.speedKph !== null || traffic.referenceSpeedKph !== null) {
        errors.push(`Section ${section.order} exposes a speed while traffic is unknown`);
      }
    } else if (!traffic.source || !validDate(traffic.observedAt)) {
      errors.push(`Section ${section.order} known traffic lacks source or timestamp`);
    }
    if (weather.condition && weather.condition !== '\u672a\u77e5' && (!weather.source || !validDate(weather.observedAt))) {
      errors.push(`Section ${section.order} known weather lacks source or timestamp`);
    }
  });

  const overall = conditions?.overall || {};
  if (!validPercent(overall.coveragePercent)) errors.push('Traffic coverage is outside 0-100');
  if (!validPercent(overall.weatherCoveragePercent)) errors.push('Weather coverage is outside 0-100');
  const upstreamIssues = Array.isArray(conditions?.issues) ? conditions.issues : [];
  if (upstreamIssues.length) warnings.push(...upstreamIssues.map((issue) => `Upstream: ${issue}`));
  if (overall.coveragePercent === 0) warnings.push('No route section has live traffic coverage');
  if (Number(overall.weatherCoveragePercent) < 100) {
    warnings.push(`Weather coverage is ${overall.weatherCoveragePercent}%`);
  }
  if (conditionsMs > 10000) warnings.push(`Conditions response was slow (${conditionsMs} ms)`);

  const trafficSources = countValues(sections
    .filter((section) => section.traffic?.level !== 'unknown')
    .map((section) => section.traffic?.source || 'unknown'));
  const status = errors.length ? 'fail' : (warnings.length ? 'warn' : 'pass');
  return {
    ...baseResult(testCase),
    status,
    errors: unique(errors),
    warnings: unique(warnings),
    routeId: route.routeId,
    validation: route.validation,
    routeSource: route.source,
    roadSummary: route.roadSummary || [],
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes,
    routeMs,
    conditionsMs,
    conditionsStatus: conditionsResponse.body?.status,
    sectionCount: sections.length,
    trafficCoveragePercent: overall.coveragePercent,
    weatherCoveragePercent: overall.weatherCoveragePercent,
    coveredSections: overall.coveredSections,
    rainSections: overall.rainSections,
    congestedSections: overall.congestedSections,
    incidentCount: overall.incidentCount,
    trafficSources,
    sources: conditions?.sources || [],
    updatedAt: conditionsResponse.body?.updatedAt || null,
    upstreamIssues
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`HTTP ${response.status} returned non-JSON data`);
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function baseResult(testCase) {
  return {
    id: testCase.id,
    name: testCase.name,
    category: testCase.category,
    regions: testCase.regions,
    plate: testCase.plate,
    stops: testCase.locations.map((location) => location.name),
    expectedDistanceKm: testCase.distanceKm
  };
}

function failedResult(testCase, message, routeMs, response = null) {
  return {
    ...baseResult(testCase),
    status: 'fail',
    errors: [message],
    warnings: [],
    routeMs: Math.round(routeMs),
    response
  };
}

function summarize(values) {
  const successful = values.filter((result) => result.status !== 'fail');
  return {
    total: values.length,
    pass: values.filter((result) => result.status === 'pass').length,
    warn: values.filter((result) => result.status === 'warn').length,
    fail: values.filter((result) => result.status === 'fail').length,
    averageTrafficCoveragePercent: average(successful.map((result) => result.trafficCoveragePercent)),
    averageWeatherCoveragePercent: average(successful.map((result) => result.weatherCoveragePercent)),
    totalDistanceKm: round(successful.reduce((sum, result) => sum + Number(result.distanceKm || 0), 0), 1),
    totalRouteSeconds: round(successful.reduce((sum, result) => sum + Number(result.routeMs || 0), 0) / 1000, 1),
    totalConditionsSeconds: round(successful.reduce((sum, result) => sum + Number(result.conditionsMs || 0), 0) / 1000, 1)
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Taiwan Dashboard 全台 Live 路線稽核',
    '',
    `- 產生時間：${report.generatedAt}`,
    `- Worker：${report.workerUrl}`,
    `- 案例：${report.summary.total}（PASS ${report.summary.pass} / WARN ${report.summary.warn} / FAIL ${report.summary.fail}）`,
    `- 行政區覆蓋：${report.coveredRegions.length}/${report.expectedRegions.length}`,
    `- 平均交通覆蓋：${report.summary.averageTrafficCoveragePercent}%`,
    `- 平均天氣覆蓋：${report.summary.averageWeatherCoveragePercent}%`,
    `- 總測試里程：${report.summary.totalDistanceKm} km`,
    '',
    '| 結果 | 路線 | 牌照 | 距離 | 交通 | 天氣 | 路段 | 問題 |',
    '|---|---|---:|---:|---:|---:|---:|---|'
  ];
  report.results.forEach((result) => {
    const notes = [...(result.errors || []), ...(result.warnings || [])].join('; ') || '--';
    lines.push(`| ${result.status.toUpperCase()} | ${escapeCell(result.name)} | ${result.plate} | ${result.distanceKm ?? '--'} km | ${result.trafficCoveragePercent ?? '--'}% | ${result.weatherCoveragePercent ?? '--'}% | ${result.sectionCount ?? '--'} | ${escapeCell(notes)} |`);
  });
  const findings = report.results.filter((result) => result.errors?.length || result.warnings?.length);
  if (findings.length) {
    lines.push('', '## 需注意案例', '');
    findings.forEach((result) => {
      lines.push(`### ${result.status.toUpperCase()} ${result.name}`);
      (result.errors || []).forEach((message) => lines.push(`- FAIL: ${message}`));
      (result.warnings || []).forEach((message) => lines.push(`- WARN: ${message}`));
      lines.push('');
    });
  }
  return `${lines.join('\n')}\n`;
}

function argumentValue(name) {
  const argument = process.argv.slice(2).find((value) => value === name || value.startsWith(`${name}=`));
  if (!argument) return null;
  if (argument.includes('=')) return argument.slice(argument.indexOf('=') + 1);
  const index = process.argv.indexOf(argument);
  return process.argv[index + 1] || null;
}

function matchesFilter(testCase, value) {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return [testCase.id, testCase.name, testCase.category, testCase.plate, ...testCase.regions]
    .some((candidate) => String(candidate).toLowerCase().includes(normalized));
}

function validDate(value) {
  return value && !Number.isNaN(new Date(value).getTime());
}

function validPercent(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
}

function countValues(values) {
  return values.reduce((result, value) => {
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

function average(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? round(finite.reduce((sum, value) => sum + value, 0) / finite.length, 1) : null;
}

function unique(values) {
  return [...new Set(values)];
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
