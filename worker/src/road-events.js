const EVENT_KIND_BY_TYPE = {
  1: 'accident',
  2: 'construction',
  3: 'congestion',
  4: 'control',
  5: 'weather',
  6: 'disaster',
  7: 'activity',
  8: 'hazard'
};

const VALID_KINDS = new Set([
  'accident',
  'construction',
  'congestion',
  'control',
  'weather',
  'disaster',
  'activity',
  'hazard',
  'other'
]);

const VALID_IMPACTS = new Set([
  'full_closure',
  'lane_closure',
  'controlled',
  'shoulder',
  'no_impact',
  'unknown'
]);

const FULL_CLOSURE_PATTERN = /(?:全線|雙向|道路|路段).{0,8}(?:封閉|中斷|阻斷)|(?:禁止|無法|暫停)通行/;
const LANE_CLOSURE_PATTERN = /(?:封閉|占用).{0,8}車道|車道.{0,4}(?:封閉|縮減)/;
const CONTROL_PATTERN = /單線雙向|單線機動|機動管制|交通管制|交管|改道|管制通行|現場指揮/;
const NO_LANE_IMPACT_PATTERN = /(?:無|未)(?:占用|封閉|阻斷|影響).{0,8}(?:車道|道路)|不影響(?:道路)?通行|無影響/;

export function classifyRoadEvent(event = {}) {
  const typeCode = finiteInteger(event.typeCode ?? event.EventType);
  const title = String(event.title ?? event.EventTitle ?? '');
  const description = String(event.description ?? event.Description ?? '');
  const impactDescription = String(event.impactDescription ?? event.Impact?.Description ?? '');
  const text = `${title} ${description} ${impactDescription}`;
  const kind = VALID_KINDS.has(event.kind)
    ? event.kind
    : (EVENT_KIND_BY_TYPE[typeCode] || inferKind(text));
  const regulationCodes = numericList(
    event.regulationCodes ?? event.regulations ?? event.Impact?.Regulations
  );
  const severityCode = finiteInteger(event.severityCode ?? event.Impact?.Severity ?? event.severity);
  const blockedLanes = String(event.blockedLanes ?? event.Impact?.BlockedLanes ?? '');
  const impact = VALID_IMPACTS.has(event.impact)
    ? event.impact
    : inferImpact({
      text,
      regulationCodes,
      severityCode,
      blockedLanes
    });

  return { kind, impact };
}

export function roadEventState(event = {}, now = new Date()) {
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const effective = timestamp(event.effectiveAt ?? event.startsAt);
  const expires = timestamp(event.expiresAt);
  if (Number.isFinite(expires) && expires <= current) return 'expired';
  if (Number.isFinite(effective) && effective > current) return 'scheduled';
  if (Number.isFinite(effective)) return 'active';
  return 'unknown';
}

export function roadEventIdentity(event = {}) {
  const existing = String(event.canonicalId || '').trim();
  if (existing) return existing;
  const source = String(event.source || 'TDX').trim().toLowerCase() || 'tdx';
  const scope = String(event.sourceScope || 'unknown').trim().toLowerCase() || 'unknown';
  const id = String(event.id || event.EventID || event.IncidentID || '').trim();
  if (id) return `${source}:${scope}:${id}`;
  const roadRef = String(event.roadRef || event.RoadName || '').trim();
  const title = String(event.title || event.EventTitle || '').trim();
  const effectiveAt = String(event.effectiveAt || event.EffectiveTime || event.updatedAt || '').trim();
  const lat = finiteCoordinate(event.lat);
  const lng = finiteCoordinate(event.lng);
  return [
    source,
    scope,
    roadRef,
    title,
    effectiveAt,
    lat === null ? '' : lat.toFixed(5),
    lng === null ? '' : lng.toFixed(5)
  ].join(':');
}

function inferKind(text) {
  if (/事故|車禍|追撞|碰撞|翻覆|火燒車/.test(text)) return 'accident';
  if (/施工|工程|養護|修繕|開挖|清掃|割草|修剪/.test(text)) return 'construction';
  if (/壅塞|車多|回堵/.test(text)) return 'congestion';
  if (/管制|封閉|改道|疏運|演習|維安/.test(text)) return 'control';
  if (/濃霧|豪雨|強風|高溫|低溫|颱風|冰雹|下雪|塵霾|天氣/.test(text)) return 'weather';
  if (/地震|海嘯|落石|坍方|淹水|山崩|土石流|火災|洩漏|災害/.test(text)) return 'disaster';
  if (/活動|遊行|路跑|節慶|進香|集會/.test(text)) return 'activity';
  if (/散落物|掉落物|異物|路面損毀|坑洞|積水|故障車|逆行|誤闖|動物|異常告警/.test(text)) {
    return 'hazard';
  }
  return 'other';
}

function inferImpact({ text, regulationCodes, severityCode, blockedLanes }) {
  if (severityCode === 2 || regulationCodes.includes(1) || FULL_CLOSURE_PATTERN.test(text)) {
    return 'full_closure';
  }
  if (
    severityCode === 1
    || regulationCodes.includes(2)
    || hasBlockedLaneImpact(blockedLanes)
    || (!NO_LANE_IMPACT_PATTERN.test(text) && LANE_CLOSURE_PATTERN.test(text))
  ) {
    return 'lane_closure';
  }
  if (
    regulationCodes.some((code) => [3, 4, 6, 7, 8, 9].includes(code))
    || CONTROL_PATTERN.test(text)
  ) {
    return 'controlled';
  }
  if (regulationCodes.includes(5) || /路肩/.test(text)) return 'shoulder';
  if (severityCode === 0 || /不影響(?:道路)?通行|無影響/.test(text)) return 'no_impact';
  return 'unknown';
}

function hasBlockedLaneImpact(value) {
  const text = String(value || '').trim().replace(/\s+/g, '');
  if (!text) return false;
  if (/^(?:-99|0|254|255|none|unknown|null|n\/a|未知|未提供|來源未提供|不適用)$/i.test(text)) {
    return false;
  }
  if (/^無(?:(?:占用|封閉|阻斷|影響)(?:任何)?(?:車道|道路))?$/.test(text)) return false;
  return true;
}

function numericList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(finiteInteger).filter(Number.isFinite);
}

function finiteInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function timestamp(value) {
  if (!value) return NaN;
  return new Date(value).getTime();
}

function finiteCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
