// js/snapshot-honesty.js — 快照誠實化表述 + 降級 UX + 30 秒總結條。
//
// 背景（jack 裁示 2026-10-04）：全站改用「快照路況（X 分鐘前）」的誠實表述；
// 前端顯示的時間必須是真實的資料時間（fetched_at / updatedAt），絕不偽造；
// proxy / 推估資料要有視覺區分（設計語言，不是免責聲明）。
//
// ES5 風格；以 IIFE 包裝，透過 window.SnapshotHonesty 暴露可測試的純函式。
// 所有 DOM 寫入都走 data-snapshot-for 屬性與 refreshSnapshotLabels()，
// 由 status:changed 事件 + 60 秒 ticker 驅動更新。
(function() {
  'use strict';

  // 各資料來源的快照過期門檻（ms）：超過即視為「快照已過期」
  var STALE_MS = {
    conditions: 30 * 60 * 1000,
    weather: 60 * 60 * 1000,
    cams: 6 * 60 * 60 * 1000,
    route: 30 * 60 * 1000,
    geocode: 30 * 60 * 1000
  };

  // ---------- 純函式（可單元測試） ----------

  function toMs(value) {
    if (value === null || value === undefined || value === '') return NaN;
    var ms = (value instanceof Date) ? value.getTime() : new Date(value).getTime();
    return ms;
  }

  // 快照年齡（ms）；時間未知回傳 null（絕不偽造）
  function ageMs(updatedAt, nowMs) {
    var ts = toMs(updatedAt);
    if (!isFinite(ts)) return null;
    var now = (typeof nowMs === 'number') ? nowMs : Date.now();
    var diff = now - ts;
    return diff >= 0 ? diff : 0;
  }

  function formatAge(ms) {
    if (ms === null || ms === undefined || !isFinite(ms)) return '時間未知';
    if (ms < 60 * 1000) return '剛剛';
    if (ms < 60 * 60 * 1000) return Math.floor(ms / 60000) + ' 分鐘前';
    if (ms < 24 * 60 * 60 * 1000) return Math.floor(ms / 3600000) + ' 小時前';
    return Math.floor(ms / 86400000) + ' 天前';
  }

  // 「快照路況（X 分鐘前）」——全站統一的誠實表述
  function formatSnapshotLabel(updatedAt, nowMs) {
    var age = ageMs(updatedAt, nowMs);
    if (age === null) return '快照路況（時間未知）';
    return '快照路況（' + formatAge(age) + '）';
  }

  // 短版（徽章 / 晶片用）：「快照·12 分鐘前」
  function formatSnapshotShort(updatedAt, nowMs) {
    var age = ageMs(updatedAt, nowMs);
    if (age === null) return '快照·時間未知';
    return '快照·' + formatAge(age);
  }

  // 資料時間（絕對時間）：今天顯示 HH:MM，跨日顯示 M/D HH:MM
  function formatDataTime(updatedAt) {
    var ts = toMs(updatedAt);
    if (!isFinite(ts)) return '--';
    var d = new Date(ts);
    var now = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var sameDay = d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
    return sameDay ? (hh + ':' + mm) : ((d.getMonth() + 1) + '/' + d.getDate() + ' ' + hh + ':' + mm);
  }

  // 新鮮度：fresh / stale / unknown
  function freshness(updatedAt, sourceKey, nowMs) {
    var age = ageMs(updatedAt, nowMs);
    if (age === null) return 'unknown';
    var limit = STALE_MS[sourceKey] || STALE_MS.conditions;
    return age > limit ? 'stale' : 'fresh';
  }

  // 官方快照 vs 推估資料的視覺區分（設計語言：不同色調 + 標籤，不貼工程術語）
  function chipHtml(kind, updatedAt, nowMs) {
    if (kind === 'proxy') {
      return '<span class="snapshot-chip is-proxy" title="依現場載入狀況推估，非官方拍攝時間">推估</span>';
    }
    var label = formatSnapshotShort(updatedAt, nowMs);
    var age = ageMs(updatedAt, nowMs);
    var cls = 'snapshot-chip' + (age !== null && age > STALE_MS.conditions ? ' is-stale' : '');
    var title = '資料時間 ' + formatDataTime(updatedAt) + '（快照）';
    return '<span class="' + cls + '" title="' + escapeHtmlAttr(title) + '">' + escapeHtmlAttr(label) + '</span>';
  }

  function escapeHtmlAttr(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- 降級 UX：誠實的缺席（行動 7） ----------
  // 每種缺席都告訴使用者：發生什麼事 + 該怎麼辦；不留白、不給假資料、
  // 不把工程術語丟到介面上。

  var NOTICES = {
    'cams-error': {
      icon: 'fa-camera',
      title: 'CCTV 影像暫時無法取得',
      body: '可以先看天氣快照與道路事件判斷路況；想看現場畫面請稍後再試。',
      cta: '重試',
      retry: 'cams'
    },
    'cams-empty': {
      icon: 'fa-camera',
      title: '目前沒有可用的沿線影像',
      body: '這段路線附近沒有攝影機，可改用天氣快照與道路事件判斷。',
      cta: '',
      retry: ''
    },
    'weather-error': {
      icon: 'fa-cloud-sun',
      title: '天氣快照暫時無法取得',
      body: '出發前請先到中央氣象署確認最新天氣，或稍後再試。',
      cta: '重試',
      retry: 'weather'
    },
    'conditions-error': {
      icon: 'fa-triangle-exclamation',
      title: '沿途路況快照暫時無法取得',
      body: '可以先用天氣快照與 CCTV 影像輔助判斷，稍後再試。',
      cta: '重試',
      retry: 'conditions'
    },
    'snapshot-stale': {
      icon: 'fa-clock-rotate-left',
      title: '快照已過期',
      body: '這份資料是 {age} 的快照，可能已經不準，建議重新整理後再判斷。',
      cta: '重新整理',
      retry: 'conditions'
    },
    'snapshot-unknown-time': {
      icon: 'fa-circle-question',
      title: '快照時間未知',
      body: '無法確認這份資料的新舊，判斷時請保守一點。',
      cta: '',
      retry: ''
    }
  };

  function notice(kind, detail) {
    var base = NOTICES[kind];
    if (!base) return null;
    var body = base.body;
    if (detail && detail.age) body = body.replace('{age}', detail.age);
    return { icon: base.icon, title: base.title, body: body, cta: base.cta, retry: base.retry };
  }

  function noticeHtml(kind, detail) {
    var n = notice(kind, detail);
    if (!n) return '';
    var html = '<div class="data-notice" role="status">'
      + '<i class="fa-solid ' + n.icon + ' data-notice-icon" aria-hidden="true"></i>'
      + '<div class="data-notice-copy">'
      + '<div class="data-notice-title">' + escapeHtmlAttr(n.title) + '</div>'
      + '<div class="data-notice-body">' + escapeHtmlAttr(n.body) + '</div>'
      + '</div>';
    if (n.cta && n.retry) {
      html += '<button type="button" class="data-notice-retry" data-sh-retry="' + n.retry + '">'
        + escapeHtmlAttr(n.cta) + '</button>';
    }
    return html + '</div>';
  }

  // ---------- 30 秒總結條（行動 10） ----------
  // 規則保持簡單、可解釋；只依據快照資料計算。

  var HEAVY_RAIN_RE = /豪雨|大雨|雷雨|颱風|特報/;

  // 純函式：input = { hasRoute, fullClosures, heavyRain, rainSections,
  //   congestedSections, incidentCount, lowCoverage, snapshotAgeText, snapshotStale }
  function rideVerdictFromData(input) {
    input = input || {};
    if (!input.hasRoute) {
      return {
        level: 'idle',
        headline: '還沒規劃路線',
        sub: '規劃路線後，這裡 30 秒告訴你今天能不能騎'
      };
    }
    var v;
    if (Number(input.fullClosures) > 0) {
      v = { level: 'stop', headline: '今天別騎',
        sub: '沿途有 ' + input.fullClosures + ' 處全線封閉，改天再出發' };
    } else if (input.heavyRain) {
      v = { level: 'stop', headline: '今天別騎',
        sub: '沿途有豪雨等級降雨訊號，安全第一' };
    } else if (Number(input.rainSections) > 0 || Number(input.congestedSections) >= 3 || Number(input.incidentCount) > 0) {
      var bits = [];
      if (Number(input.rainSections) > 0) bits.push(input.rainSections + ' 段降雨');
      if (Number(input.incidentCount) > 0) bits.push(input.incidentCount + ' 件道路事件');
      if (Number(input.congestedSections) >= 3) bits.push(input.congestedSections + ' 段壅塞');
      v = { level: 'caution', headline: '小心騎乘',
        sub: '沿途 ' + bits.join('、') + '，保守騎乘' };
    } else if (input.lowCoverage) {
      v = { level: 'caution', headline: '小心騎乘',
        sub: '部分路段沒有資料，灰色路段別當順暢' };
    } else {
      v = { level: 'go', headline: '可以出發',
        sub: '官方快照未顯示明顯壅塞、降雨或道路事件' };
    }
    // 快照過期：結論最多只到「小心」，並誠實告知
    if (input.snapshotStale && v.level === 'go') {
      v = { level: 'caution', headline: '小心騎乘',
        sub: '快照已過期，出發前請重新整理確認' };
    }
    if (input.snapshotAgeText) v.sub += ' · ' + input.snapshotAgeText;
    return v;
  }

  function currentVerdictInput() {
    var st = (typeof window !== 'undefined' && window.AppState) ? window.AppState : {};
    var conditions = st.routeConditions || null;
    var hasRoute = !!(conditions && conditions.sections && conditions.sections.length);
    var input = { hasRoute: hasRoute };
    if (hasRoute) {
      var overall = conditions.overall || {};
      var sections = conditions.sections || [];
      var summary = { incidentCount: 0, activeFullClosureCount: 0 };
      try {
        if (window.RouteConditionViewModel && window.RouteConditionViewModel.summarizeRoadEvents) {
          summary = window.RouteConditionViewModel.summarizeRoadEvents(sections);
        }
      } catch (e) { /* 降級：沒有事件摘要就當作 0 */ }
      var heavyRain = sections.some(function(s) {
        var cond = s && s.weather && s.weather.condition;
        return typeof cond === 'string' && HEAVY_RAIN_RE.test(cond);
      });
      var trafficCoverage = Number(overall.coveragePercent || 0);
      var weatherCoverage = Number(overall.weatherCoveragePercent || 0);
      var updatedAt = st.updatedAt && st.updatedAt.conditions;
      var age = ageMs(updatedAt);
      input.fullClosures = summary.activeFullClosureCount || 0;
      input.heavyRain = heavyRain;
      input.rainSections = Number(overall.rainSections || 0);
      input.congestedSections = Number(overall.congestedSections || 0);
      input.incidentCount = summary.incidentCount || 0;
      input.lowCoverage = trafficCoverage < 60 || weatherCoverage < 60;
      input.snapshotStale = freshness(updatedAt, 'conditions') !== 'fresh';
      input.snapshotAgeText = age === null ? '快照時間未知' : ('快照（' + formatAge(age) + '）');
    }
    return input;
  }

  // ---------- DOM ----------

  function byId(id) {
    return (typeof document === 'undefined') ? null : document.getElementById(id);
  }

  function appState() {
    return (typeof window !== 'undefined' && window.AppState) ? window.AppState : {};
  }

  // 刷新所有 data-snapshot-for 標籤 + 30 秒總結條
  function refreshSnapshotLabels() {
    if (typeof document === 'undefined') return;
    var st = appState();
    var nodes = document.querySelectorAll('[data-snapshot-for]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-snapshot-for');
      var updatedAt = st.updatedAt && st.updatedAt[key];
      nodes[i].textContent = '（' + formatAge(ageMs(updatedAt)) + '）';
      nodes[i].setAttribute('title', '資料時間 ' + formatDataTime(updatedAt) + '（快照）');
      nodes[i].classList.toggle('is-stale', freshness(updatedAt, key) === 'stale');
    }
    refreshVerdict();
  }

  function refreshVerdict() {
    var bar = byId('ride-verdict-bar');
    if (!bar) return;
    var v = rideVerdictFromData(currentVerdictInput());
    var dot = byId('ride-verdict-dot');
    var headline = byId('ride-verdict-headline');
    var sub = byId('ride-verdict-sub');
    if (dot) dot.className = 'ride-verdict-dot is-' + v.level;
    if (headline) headline.textContent = v.headline;
    if (sub) sub.textContent = v.sub;
    bar.setAttribute('data-verdict', v.level);
  }

  // 重試按鈕委派：data-sh-retry="cams|weather|conditions"
  function bindRetryDelegation() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('click', function(event) {
      var target = event.target && event.target.closest
        ? event.target.closest('[data-sh-retry]')
        : null;
      if (!target) return;
      var kind = target.getAttribute('data-sh-retry');
      if (typeof window === 'undefined') return;
      if (kind === 'cams' && window.Data && typeof window.Data.loadDynamic === 'function') {
        window.Data.camsState = 'idle';
        window.Data.loadDynamic();
      } else if (kind === 'weather' && window.Data && typeof window.Data.fetchWeather === 'function') {
        window.Data.fetchWeather();
      } else if (kind === 'conditions') {
        var btn = document.getElementById('condition-retry');
        if (btn) btn.click();
        else if (window.Bus) window.Bus.emit('route:request', { action: 'refresh-conditions' });
      }
    });
  }

  function init() {
    if (typeof document === 'undefined') return;
    bindRetryDelegation();
    var refresh = function() { refreshSnapshotLabels(); };
    if (typeof window !== 'undefined' && window.Bus && window.Bus.on) {
      window.Bus.on('status:changed', refresh);
      window.Bus.on('conditions:updated', refresh);
      window.Bus.on('route:updated', refresh);
      window.Bus.on('route:cleared', refresh);
      window.Bus.on('weather:updated', refresh);
      window.Bus.on('cams:updated', refresh);
    }
    refreshSnapshotLabels();
    if (typeof setInterval !== 'undefined') {
      setInterval(refreshSnapshotLabels, 60 * 1000); // 年齡文字每分鐘更新
    }
  }

  window.SnapshotHonesty = {
    STALE_MS: STALE_MS,
    ageMs: ageMs,
    formatAge: formatAge,
    formatSnapshotLabel: formatSnapshotLabel,
    formatSnapshotShort: formatSnapshotShort,
    formatDataTime: formatDataTime,
    freshness: freshness,
    chipHtml: chipHtml,
    notice: notice,
    noticeHtml: noticeHtml,
    rideVerdictFromData: rideVerdictFromData,
    currentVerdictInput: currentVerdictInput,
    refreshSnapshotLabels: refreshSnapshotLabels,
    refreshVerdict: refreshVerdict,
    init: init
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
