import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function loadModule() {
  const source = await readFile(path.join(root, 'js/snapshot-honesty.js'), 'utf8');
  const window = {};
  // DOM 不存在於測試環境：init 必須優雅 no-op
  const document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const sandbox = {
    window,
    document,
    navigator: {},
    setInterval() { return 0; },
    clearInterval() {}
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.SnapshotHonesty;
}

describe('SnapshotHonesty.formatSnapshotLabel', () => {
  it('renders 快照路況（X 分鐘前）from a real fetched_at', async () => {
    const m = await loadModule();
    const now = 1_700_000_000_000;
    expect(m.formatSnapshotLabel(new Date(now - 30 * 1000).toISOString(), now))
      .toBe('快照路況（剛剛）');
    expect(m.formatSnapshotLabel(new Date(now - 12 * 60 * 1000).toISOString(), now))
      .toBe('快照路況（12 分鐘前）');
    expect(m.formatSnapshotLabel(new Date(now - 2 * 3600 * 1000).toISOString(), now))
      .toBe('快照路況（2 小時前）');
  });

  it('never fabricates: unknown time stays unknown', async () => {
    const m = await loadModule();
    const now = 1_700_000_000_000;
    expect(m.formatSnapshotLabel(null, now)).toBe('快照路況（時間未知）');
    expect(m.formatSnapshotLabel(undefined, now)).toBe('快照路況（時間未知）');
    expect(m.formatSnapshotLabel('not-a-date', now)).toBe('快照路況（時間未知）');
    expect(m.formatSnapshotLabel('', now)).toBe('快照路況（時間未知）');
  });

  it('contains no 即時 wording', async () => {
    const m = await loadModule();
    const now = 1_700_000_000_000;
    const label = m.formatSnapshotLabel(new Date(now - 60000).toISOString(), now);
    expect(label).not.toContain('即時');
    expect(m.formatSnapshotLabel(null, now)).not.toContain('即時');
  });
});

describe('SnapshotHonesty.formatDataTime', () => {
  it('shows data time, never now, and marks unknown as --', async () => {
    const m = await loadModule();
    expect(m.formatDataTime(null)).toBe('--');
    expect(m.formatDataTime('garbage')).toBe('--');
    const d = new Date(2026, 9, 4, 14, 5, 0);
    const out = m.formatDataTime(d.toISOString());
    expect(out).toContain('14:05');
  });
});

describe('SnapshotHonesty.freshness', () => {
  it('marks old snapshots stale and unknown time unknown', async () => {
    const m = await loadModule();
    const now = 1_700_000_000_000;
    expect(m.freshness(new Date(now - 1000).toISOString(), 'conditions', now)).toBe('fresh');
    expect(m.freshness(new Date(now - 31 * 60 * 1000).toISOString(), 'conditions', now)).toBe('stale');
    expect(m.freshness(null, 'conditions', now)).toBe('unknown');
  });
});

describe('SnapshotHonesty.chipHtml', () => {
  it('distinguishes proxy data visually without engineering jargon', async () => {
    const m = await loadModule();
    const proxy = m.chipHtml('proxy');
    expect(proxy).toContain('is-proxy');
    expect(proxy).toContain('推估');
    expect(proxy).not.toContain('即時');
    const official = m.chipHtml('official', new Date(1_700_000_000_000 - 60000).toISOString(), 1_700_000_000_000);
    expect(official).toContain('snapshot-chip');
    expect(official).toContain('快照');
  });
});

describe('SnapshotHonesty.notice', () => {
  it('explains what happened and what to do, in plain language', async () => {
    const m = await loadModule();
    for (const kind of ['cams-error', 'weather-error', 'conditions-error', 'snapshot-stale', 'cams-empty']) {
      const n = m.notice(kind, { age: '40 分鐘前' });
      expect(n.title, kind).toBeTruthy();
      expect(n.body, kind).toBeTruthy();
      expect(n.title).not.toContain('即時');
      expect(n.body).not.toContain('即時');
      // 不把工程術語丟到介面上
      expect(n.title + n.body).not.toMatch(/API|HTTP|timeout|500|ENOTFOUND/i);
    }
    const stale = m.notice('snapshot-stale', { age: '40 分鐘前' });
    expect(stale.body).toContain('40 分鐘前');
    const html = m.noticeHtml('cams-error');
    expect(html).toContain('data-notice');
    expect(html).toContain('CCTV 影像暫時無法取得');
    expect(html).toContain('data-sh-retry="cams"');
  });
});

describe('SnapshotHonesty.rideVerdictFromData', () => {
  it('says 別騎 on full closure', async () => {
    const m = await loadModule();
    const v = m.rideVerdictFromData({ hasRoute: true, fullClosures: 2, snapshotAgeText: '快照（5 分鐘前）' });
    expect(v.level).toBe('stop');
    expect(v.headline).toBe('今天別騎');
    expect(v.sub).toContain('2 處全線封閉');
    expect(v.sub).toContain('快照（5 分鐘前）');
  });

  it('says 別騎 on heavy rain signal', async () => {
    const m = await loadModule();
    const v = m.rideVerdictFromData({ hasRoute: true, heavyRain: true });
    expect(v.level).toBe('stop');
    expect(v.headline).toBe('今天別騎');
  });

  it('says 小心 on rain / incidents / congestion', async () => {
    const m = await loadModule();
    const v = m.rideVerdictFromData({ hasRoute: true, rainSections: 3, incidentCount: 1, congestedSections: 0 });
    expect(v.level).toBe('caution');
    expect(v.headline).toBe('小心騎乘');
    expect(v.sub).toContain('3 段降雨');
  });

  it('says 小心 when coverage is low', async () => {
    const m = await loadModule();
    const v = m.rideVerdictFromData({ hasRoute: true, lowCoverage: true });
    expect(v.level).toBe('caution');
    expect(v.sub).toContain('沒有資料');
  });

  it('says 可以出發 when the snapshot is clean', async () => {
    const m = await loadModule();
    const v = m.rideVerdictFromData({ hasRoute: true });
    expect(v.level).toBe('go');
    expect(v.headline).toBe('可以出發');
  });

  it('downgrades to 小心 when the snapshot is stale', async () => {
    const m = await loadModule();
    const v = m.rideVerdictFromData({ hasRoute: true, snapshotStale: true, snapshotAgeText: '快照（50 分鐘前）' });
    expect(v.level).toBe('caution');
    expect(v.sub).toContain('快照（50 分鐘前）');
  });

  it('stays honest when there is no route', async () => {
    const m = await loadModule();
    const v = m.rideVerdictFromData({ hasRoute: false });
    expect(v.level).toBe('idle');
    expect(v.headline).toBe('還沒規劃路線');
  });
});
