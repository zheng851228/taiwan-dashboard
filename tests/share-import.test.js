import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function loadShare(overrides = {}) {
  const source = await readFile(path.join(root, 'js/share-import.js'), 'utf8');
  const toastCalls = [];
  const busCalls = [];
  const historyCalls = [];
  const inputs = {
    'js-route-start': { value: '', dataset: {} },
    'js-route-end': { value: '', dataset: {} }
  };
  const window = {
    location: { search: '', pathname: '/', hash: '' },
    history: {
      replaceState: (...args) => { historyCalls.push(args); }
    },
    document: {
      getElementById: (id) => inputs[id] || null
    },
    Toast: {
      show: (message, ms) => { toastCalls.push({ message, ms }); }
    },
    Bus: {
      emit: (name, payload) => { busCalls.push({ name, payload }); }
    },
    ...overrides
  };
  const sandbox = {
    window,
    document: window.document,
    location: window.location,
    history: window.history,
    URL,
    URLSearchParams,
    Promise,
    console
  };
  vm.runInNewContext(source, sandbox);
  return {
    share: sandbox.window.GoogleMapsShare,
    toastCalls,
    busCalls,
    historyCalls,
    inputs
  };
}

describe('GoogleMapsShare.parseGoogleMapsUrl', () => {
  it('解析 dir 路徑式起終點地名', async () => {
    const { share } = await loadShare();
    expect(share.parseGoogleMapsUrl(
      'https://www.google.com/maps/dir/台北車站/桃園國際機場/@25.0492,121.5323,12z'
    )).toEqual({ origin: '台北車站', destination: '桃園國際機場' });
  });

  it('解析 dir 路徑式 lat,lng 座標（保留原字串）', async () => {
    const { share } = await loadShare();
    expect(share.parseGoogleMapsUrl(
      'https://www.google.com/maps/dir/25.0478,121.5170/24.9936,121.3010/'
    )).toEqual({ origin: '25.0478,121.5170', destination: '24.9936,121.3010' });
  });

  it('解析 ?api=1&origin=&destination= 參數式', async () => {
    const { share } = await loadShare();
    expect(share.parseGoogleMapsUrl(
      'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent('台北車站') +
      '&destination=' + encodeURIComponent('高雄車站')
    )).toEqual({ origin: '台北車站', destination: '高雄車站' });
  });

  it('參數式只有單邊也回傳（另一邊空字串）', async () => {
    const { share } = await loadShare();
    expect(share.parseGoogleMapsUrl(
      'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent('高雄車站')
    )).toEqual({ origin: '', destination: '高雄車站' });
  });

  it('非 Google Maps 網址回傳 null', async () => {
    const { share } = await loadShare();
    expect(share.parseGoogleMapsUrl('https://example.com/foo')).toBeNull();
    expect(share.parseGoogleMapsUrl('https://www.google.com/search?q=台北')).toBeNull();
  });

  it('空字串與非字串回傳 null', async () => {
    const { share } = await loadShare();
    expect(share.parseGoogleMapsUrl('')).toBeNull();
    expect(share.parseGoogleMapsUrl('   ')).toBeNull();
    expect(share.parseGoogleMapsUrl(null)).toBeNull();
    expect(share.parseGoogleMapsUrl(undefined)).toBeNull();
    expect(share.parseGoogleMapsUrl('not a url')).toBeNull();
  });
});

describe('GoogleMapsShare.expandAndParse', () => {
  it('短連結經展開（mock）後解析出起終點', async () => {
    const expanded = 'https://www.google.com/maps/dir/台北車站/高雄車站/@24.5,121.0,8z';
    const { share } = await loadShare({
      AppServices: {
        expandShortUrl: (url) => Promise.resolve({ data: { finalUrl: expanded } })
      }
    });
    await expect(share.expandAndParse('https://maps.app.goo.gl/xyzABC')).resolves.toEqual({
      origin: '台北車站',
      destination: '高雄車站'
    });
  });

  it('非短連結不呼叫展開、直接解析', async () => {
    let expandCalls = 0;
    const { share } = await loadShare({
      AppServices: {
        expandShortUrl: (url) => { expandCalls += 1; return Promise.resolve({ data: { finalUrl: url } }); }
      }
    });
    await expect(share.expandAndParse(
      'https://www.google.com/maps/dir/台北車站/高雄車站/'
    )).resolves.toEqual({ origin: '台北車站', destination: '高雄車站' });
    expect(expandCalls).toBe(0);
  });

  it('展開失敗時回退用原網址解析', async () => {
    const { share } = await loadShare({
      AppServices: {
        expandShortUrl: () => Promise.reject(new Error('network'))
      }
    });
    await expect(share.expandAndParse('https://maps.app.goo.gl/xyzABC')).resolves.toBeNull();
  });
});

describe('GoogleMapsShare.extractMapsUrl', () => {
  it('從夾雜文字的分享內容中抽出連結', async () => {
    const { share } = await loadShare();
    expect(share.extractMapsUrl('路線在這 https://maps.app.goo.gl/xyzABC 請參考'))
      .toBe('https://maps.app.goo.gl/xyzABC');
  });

  it('非地圖連結回傳 null', async () => {
    const { share } = await loadShare();
    expect(share.extractMapsUrl('看看這個 https://example.com/foo')).toBeNull();
    expect(share.extractMapsUrl('沒有連結')).toBeNull();
  });
});

describe('GoogleMapsShare.init（share target 啟動流程）', () => {
  it('帶 ?url= 參數時：填入起終點、觸發分析、清掉參數', async () => {
    const shared = 'https://www.google.com/maps/dir/台北車站/高雄車站/';
    const ctx = await loadShare({
      location: {
        search: '?shared=1&url=' + encodeURIComponent(shared),
        pathname: '/',
        hash: ''
      }
    });
    // 直接呼叫 importSharedUrl（與 init 同流程；init 另用 rAF 觸發分析）
    const ok = await ctx.share.importSharedUrl(shared);
    expect(ok).toBe(true);
    expect(ctx.inputs['js-route-start'].value).toBe('台北車站');
    expect(ctx.inputs['js-route-end'].value).toBe('高雄車站');
    expect(ctx.toastCalls.some((c) => c.message.includes('重新規劃機車路線'))).toBe(true);
    expect(ctx.historyCalls.length).toBeGreaterThan(0);
  });

  it('無分享參數時 init 為 no-op', async () => {
    const ctx = await loadShare();
    ctx.share.init();
    expect(ctx.busCalls.length).toBe(0);
    expect(ctx.toastCalls.length).toBe(0);
    expect(ctx.historyCalls.length).toBe(0);
  });

  it('解析失敗時 Toast 提示並清掉參數', async () => {
    const ctx = await loadShare();
    const ok = await ctx.share.importSharedUrl('https://example.com/foo');
    expect(ok).toBe(false);
    expect(ctx.toastCalls.some((c) => c.message.includes('無法解析'))).toBe(true);
    expect(ctx.historyCalls.length).toBeGreaterThan(0);
    expect(ctx.busCalls.length).toBe(0);
  });
});
