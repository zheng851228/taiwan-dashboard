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
  it('classifies event kind and impact from provider metadata and text', async () => {
    const vmModel = await loadViewModel();
    expect(vmModel.inferRoadEventKind({ title: '道路施工中' })).toBe('construction');
    expect(vmModel.inferRoadEventKind({ title: '前方發生車禍' })).toBe('accident');
    expect(vmModel.inferRoadEventImpact({ severityCode: 2 })).toBe('full_closure');
    expect(vmModel.inferRoadEventImpact({ blockedLanes: '內側車道' })).toBe('lane_closure');
    expect(vmModel.inferRoadEventImpact({ title: '路肩施工' })).toBe('shoulder');
  });

  it('builds stable event presentation priority and scheduled labels', async () => {
    const vmModel = await loadViewModel();
    const active = vmModel.roadEventPresentation({ kind: 'accident', impact: 'full_closure', status: 'active' });
    const scheduled = vmModel.roadEventPresentation({ kind: 'accident', impact: 'full_closure', status: 'scheduled' });
    expect(active.label).toContain('事故');
    expect(active.label).toContain('全線封閉');
    expect(active.icon).toBe('fa-ban');
    expect(active.priority).toBeGreaterThan(scheduled.priority);
    expect(scheduled.label.startsWith('預告·')).toBe(true);
  });

  it('deduplicates incidents while preserving located-section and closure summaries', async () => {
    const vmModel = await loadViewModel();
    const shared = { canonicalId: 'same', kind: 'control', impact: 'full_closure', status: 'active', lat: 24.1, lng: 120.6 };
    const result = vmModel.summarizeRoadEvents([
      { incidents: [shared] },
      { incidents: [shared, { id: 'approx', kind: 'construction', locationApproximate: true }] }
    ]);
    expect(result.incidentCount).toBe(2);
    expect(result.affectedSections).toBe(2);
    expect(result.roadLevelIncidentCount).toBe(1);
    expect(result.activeFullClosureCount).toBe(1);
  });

  it('prioritizes road closures ahead of congestion and weather alerts and caps the list at six', async () => {
    const vmModel = await loadViewModel();
    const sections = Array.from({ length: 8 }, (_, index) => ({
      order: index + 1,
      roadRef: '台' + (index + 1) + '線',
      fromKm: index,
      toKm: index + 1,
      traffic: { level: index === 0 ? 'congested' : 'clear' },
      weather: { condition: index === 1 ? '陣雨' : '晴', rainChance: index === 1 ? 80 : 10 },
      incidents: index === 2 ? [{ kind: 'control', impact: 'full_closure', status: 'active', lat: 24.1, lng: 120.6 }] : []
    }));
    const alerts = vmModel.buildAlerts(sections);
    expect(alerts).toHaveLength(3);
    expect(alerts[0].event.impact).toBe('full_closure');
    expect(alerts[1].type).toBe('danger');
    expect(alerts[2].type).toBe('weather');
  });
});
