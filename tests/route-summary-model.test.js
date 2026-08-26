import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function loadModel() {
  const source = await readFile(path.join(root, 'js/route-summary-model.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  return window.RouteSummaryModel;
}

describe('RouteSummaryModel', () => {
  it('normalizes route distance and duration with the existing display precision', async () => {
    const model = await loadModel();
    expect(model.normalizeRouteInfo({ distanceKm: 123.456, durationMinutes: 98.6 })).toEqual({
      distance: '123.5',
      duration: 99
    });
  });

  it('builds vehicle labels for motorcycle plates and cars', async () => {
    const model = await loadModel();
    expect(model.vehicleLabel('motorcycle', 'white')).toBe('🏍️ 白牌');
    expect(model.vehicleLabel('motorcycle', 'yellow')).toBe('🏍️ 黃牌');
    expect(model.vehicleLabel('motorcycle', 'red')).toBe('🏍️ 紅牌');
    expect(model.vehicleLabel('car')).toBe('🚗 汽車');
  });

  it('builds route UI copy for routes with and without CCTV results', async () => {
    const model = await loadModel();
    const info = { distance: '12.3', duration: 26 };
    const withCameras = model.routeUiCopy(4, info, 'motorcycle');
    expect(withCameras.statusText).toBe('安全驗證完成 · 4 支沿途現場畫面');
    expect(withCameras.listCountText).toBe('路線過濾：共 4 支沿途現場畫面');
    expect(withCameras.summaryText).toBe('🏍 12.3km/26分 · 已驗證');

    const withoutCameras = model.routeUiCopy(0, info, 'car');
    expect(withoutCameras.statusText).toBe('安全驗證完成 · 沿途暫無現場畫面');
    expect(withoutCameras.listCountText).toBe('路線過濾：未找到合適攝影機');
    expect(withoutCameras.summaryText).toBe('🚗 12.3km/26分 · 已驗證');
  });

  it('preserves fixture warning precedence for completion messages', async () => {
    const model = await loadModel();
    const info = { distance: '20.0', duration: 40 };
    expect(model.completionMessage({}, info, 'motorcycle', 'red')).toBe('🏍️ 紅牌 20.0km / 約40分鐘');
    expect(model.completionMessage({ dataMode: 'fixture' }, info, 'motorcycle', 'red'))
      .toBe('示範路線已載入，不可用於實際騎乘');
  });
});
