import { describe, expect, it } from 'vitest';
import { classifyRoadEvent, roadEventState } from '../worker/src/road-events.js';

const NOW = new Date('2026-07-27T04:00:00.000Z');

describe('road event semantics', () => {
  it.each([
    [1, 'accident'],
    [2, 'construction'],
    [3, 'congestion'],
    [4, 'control'],
    [5, 'weather'],
    [6, 'disaster'],
    [7, 'activity'],
    [8, 'hazard']
  ])('maps official TDX EventType %s to %s', (typeCode, kind) => {
    expect(classifyRoadEvent({ typeCode }).kind).toBe(kind);
  });

  it('keeps construction and full closure as separate dimensions', () => {
    expect(classifyRoadEvent({
      typeCode: 2,
      severityCode: 2,
      regulationCodes: [1],
      description: '道路施工期間全線封閉'
    })).toEqual({
      kind: 'construction',
      impact: 'full_closure'
    });
  });

  it.each([
    [{ typeCode: 1, severityCode: 1 }, 'lane_closure'],
    [{ typeCode: 2, regulationCodes: [2] }, 'lane_closure'],
    [{ typeCode: 2, regulationCodes: [8] }, 'controlled'],
    [{ typeCode: 2, regulationCodes: [5] }, 'shoulder'],
    [{ typeCode: 2, severityCode: 0 }, 'no_impact'],
    [{ title: '施工', description: '現場採單線雙向機動管制通行' }, 'controlled']
  ])('normalizes the road impact as %s', (event, impact) => {
    expect(classifyRoadEvent(event).impact).toBe(impact);
  });

  it('falls back to text for a dropped-object hazard', () => {
    expect(classifyRoadEvent({
      title: '其他異常告警',
      description: '中間車道有大型掉落物'
    })).toMatchObject({
      kind: 'hazard',
      impact: 'unknown'
    });
  });

  it.each(['未知', '無', '無占用車道', '來源未提供'])(
    'does not treat semantic-empty BlockedLanes "%s" as a lane closure',
    (blockedLanes) => {
      expect(classifyRoadEvent({ typeCode: 2, blockedLanes })).toMatchObject({
        kind: 'construction',
        impact: 'unknown'
      });
    }
  );

  it('still recognizes a meaningful blocked-lane description', () => {
    expect(classifyRoadEvent({
      typeCode: 2,
      blockedLanes: '外側車道'
    }).impact).toBe('lane_closure');
  });

  it('distinguishes scheduled, active, expired, and unknown timing', () => {
    expect(roadEventState({ effectiveAt: '2026-07-27T05:00:00.000Z' }, NOW)).toBe('scheduled');
    expect(roadEventState({ effectiveAt: NOW.toISOString() }, NOW)).toBe('active');
    expect(roadEventState({ expiresAt: NOW.toISOString() }, NOW)).toBe('expired');
    expect(roadEventState({}, NOW)).toBe('unknown');
  });
});
