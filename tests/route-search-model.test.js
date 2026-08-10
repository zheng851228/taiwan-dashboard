import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function loadModel() {
  const source = await readFile(path.join(root, 'js/route-search-model.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  return window.RouteSearchModel;
}

describe('RouteSearchModel', () => {
  it('normalizes and validates required route endpoints', async () => {
    const model = await loadModel();
    expect(model.prepareEndpoints('  台北車站  ', ' 高雄車站 ')).toEqual({
      ok: true,
      startValue: '台北車站',
      endValue: '高雄車站',
      message: ''
    });
    expect(model.prepareEndpoints('台北車站', '   ')).toEqual({
      ok: false,
      startValue: '台北車站',
      endValue: '',
      message: '請分別填入起點和終點'
    });
  });

  it('builds display and resolution addresses while reusing matching cached route points', async () => {
    const model = await loadModel();
    const plan = model.buildAddressPlan({
      startValue: ' 台北車站 ',
      endValue: '高雄車站',
      waypoints: [' 台中車站 ', '嘉義車站'],
      startRoutePoint: '25.0478,121.5170',
      startRoutePointLabel: '台北車站',
      endRoutePoint: '22.6396,120.3028',
      endRoutePointLabel: '不同標籤'
    });
    expect(Array.from(plan.displayAddrs)).toEqual(['台北車站', '台中車站', '嘉義車站', '高雄車站']);
    expect(Array.from(plan.resolutionAddrs)).toEqual(['25.0478,121.5170', '台中車站', '嘉義車站', '高雄車站']);
  });

  it('preserves the existing vehicle request contract and unresolved-point labels', async () => {
    const model = await loadModel();
    expect(model.buildVehicle('car', 'red')).toEqual({ type: 'car' });
    expect(model.buildVehicle('motorcycle', 'yellow')).toEqual({ type: 'motorcycle', plate: 'yellow' });
    expect(model.buildVehicle('motorcycle')).toEqual({ type: 'motorcycle', plate: 'white' });
    expect(model.unresolvedPointMessage(0, 3)).toBe('起點無法解析，請改用更完整地名或座標');
    expect(model.unresolvedPointMessage(1, 3)).toBe('第 1 個停靠點無法解析，請改用更完整地名或座標');
    expect(model.unresolvedPointMessage(2, 3)).toBe('終點無法解析，請改用更完整地名或座標');
  });
});
