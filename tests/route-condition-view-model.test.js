import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function loadViewModel() {
  const source = await readFile(path.join(root, 'js/route-condition-view-model.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window, Map });
  return window.RouteConditionViewModel;
}

describe('RouteConditionViewModel', () => {
  it('loads without DOM globals and classifies event kind and impact', async () => {
    const model = await loadViewModel();
    expect(model.inferRoadEventKind({ title: '道路施工中' })).toBe('construction');
    expect(model.inferRoadEventKind({ title: '前方發生車禍' })).toBe('accident');
    expect(model.inferRoadEventImpact({ severityCode: 2 })).toBe('full_closure');
    expect(model.inferRoadEventImpact({ blockedLanes: '內側車道' })).toBe('lane_closure');
    expect(model.inferRoadEventImpact({ title: '路肩施工' })).toBe('shoulder');
  });

  it('does not treat provider sentinel blocked-lane values as lane closures', async () => {
    const model = await loadViewModel();
    expect(model.hasBlockedLaneImpact('-99')).toBe(false);
    expect(model.hasBlockedLaneImpact('未知')).toBe(false);
    expect(model.hasBlockedLaneImpact('無占用任何車道')).toBe(false);
    expect(model.hasBlockedLaneImpact('外側車道')).toBe(true);
  });

  it('builds stable event presentation priority and scheduled labels', async () => {
    const model = await loadViewModel();
    const active = model.roadEventPresentation({ kind: 'accident', impact: 'full_closure', status: 'active' });
    const scheduled = model.roadEventPresentation({ kind: 'accident', impact: 'full_closure', status: 'scheduled' });
    expect(active.label).toContain('事故');
    expect(active.label).toContain('全線封閉');
    expect(active.icon).toBe('fa-ban');
    expect(active.priority).toBeGreaterThan(scheduled.priority);
    expect(scheduled.label.startsWith('預告·')).toBe(true);
  });

  it('deduplicates incidents while preserving located-section and closure summaries', async () => {
    const model = await loadViewModel();
    const shared = { canonicalId: 'same', kind: 'control', impact: 'full_closure', status: 'active', lat: 24.1, lng: 120.6 };
    const result = model.summarizeRoadEvents([
      { incidents: [shared] },
      { incidents: [shared, { id: 'approx', kind: 'construction', locationApproximate: true }] }
    ]);
    expect(result.incidentCount).toBe(2);
    expect(result.affectedSections).toBe(2);
    expect(result.roadLevelIncidentCount).toBe(1);
    expect(result.activeFullClosureCount).toBe(1);
  });

  it('prioritizes closures and caps the alert list at six', async () => {
    const model = await loadViewModel();
    const sections = Array.from({ length: 8 }, (_, index) => ({
      order: index + 1,
      roadRef: '台' + (index + 1) + '線',
      fromKm: index,
      toKm: index + 1,
      traffic: { level: index === 0 ? 'congested' : 'clear' },
      weather: { condition: index === 1 ? '陣雨' : '晴', rainChance: index === 1 ? 80 : 10 },
      incidents: [{
        id: 'event-' + index,
        kind: index === 2 ? 'control' : 'construction',
        impact: index === 2 ? 'full_closure' : 'unknown',
        status: 'active',
        lat: 24.1 + index / 100,
        lng: 120.6 + index / 100
      }]
    }));
    const alerts = model.buildAlerts(sections);
    expect(alerts).toHaveLength(6);
    expect(alerts[0].event.impact).toBe('full_closure');
    expect(alerts.some((alert) => alert.type === 'danger')).toBe(true);
    expect(alerts.some((alert) => alert.type === 'weather')).toBe(false);
  });

  it('handles empty inputs without DOM or map dependencies', async () => {
    const model = await loadViewModel();
    expect(model.primaryRoadEvent([])).toBeNull();
    expect(model.summarizeRoadEvents(null).incidentCount).toBe(0);
    expect(model.buildAlerts(null)).toEqual([]);
  });
});
