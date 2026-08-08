// Desktop rail sizing and resize interactions.
// Loaded after desktop-dashboard.js as a migration seam: it replaces the
// resizer controls to detach the legacy listeners, then keeps the shared
// dashboard state in sync so viewport changes continue to use the same layout.
(function() {
  'use strict';

  var LAYOUT_PREF_KEY = 'tw_desktop_layout_v1';
  var initialized = false;
  var layoutDrag = null;

  function dashboardState() {
    return window.DesktopDashboardMod && window.DesktopDashboardMod.state;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function defaultLayout() {
    var narrow = window.innerWidth < 1400;
    return {
      left: narrow ? 240 : 296,
      right: narrow ? 195 : 240,
      bottom: window.innerHeight <= 820 ? 272 : 312
    };
  }

  function rootMetrics() {
    var root = document.documentElement;
    var style = window.getComputedStyle(root);
    var rootFontSize = parseFloat(style.fontSize) || 16;
    var gapRem = parseFloat(style.getPropertyValue('--desktop-gap')) || 0.55;
    var headerRem = parseFloat(style.getPropertyValue('--desktop-header-height')) || 4.55;
    return {
      root: root,
      rootFontSize: rootFontSize,
      gap: gapRem * rootFontSize,
      headerHeight: headerRem * rootFontSize
    };
  }

  function layoutBounds() {
    var metrics = rootMetrics();
    var minLeft = 240;
    var minRight = 220;
    var maxLeft = 420;
    var maxRight = 420;
    var minCenter = 30 * metrics.rootFontSize;
    var sideBudget = Math.max(minLeft + minRight, window.innerWidth - minCenter - metrics.gap * 2);
    var availableHeight = Math.max(0, window.innerHeight - metrics.headerHeight - metrics.gap);
    var maxBottom = Math.min(360, Math.max(160, availableHeight - 280));
    return {
      left: { min: minLeft, max: Math.min(maxLeft, sideBudget - minRight) },
      right: { min: minRight, max: Math.min(maxRight, sideBudget - minLeft) },
      bottom: { min: 160, max: maxBottom }
    };
  }

  function normalizeLayout(value) {
    var defaults = defaultLayout();
    var candidate = value && typeof value === 'object' ? value : defaults;
    var bounds = layoutBounds();
    var metrics = rootMetrics();
    var left = clamp(Number(candidate.left) || defaults.left, bounds.left.min, bounds.left.max);
    var right = clamp(Number(candidate.right) || defaults.right, bounds.right.min, bounds.right.max);
    var sideBudget = window.innerWidth - metrics.gap * 2 - 30 * metrics.rootFontSize;

    if (left + right > sideBudget) {
      var overflow = left + right - sideBudget;
      if (right - bounds.right.min >= overflow) right -= overflow;
      else {
        overflow -= right - bounds.right.min;
        right = bounds.right.min;
        left = clamp(left - overflow, bounds.left.min, bounds.left.max);
      }
    }

    return {
      left: Math.round(left),
      right: Math.round(right),
      bottom: Math.round(clamp(Number(candidate.bottom) || defaults.bottom, bounds.bottom.min, bounds.bottom.max))
    };
  }

  function layoutHandle(key) {
    var ids = {
      left: 'desktop-resize-left',
      right: 'desktop-resize-right',
      bottom: 'desktop-resize-bottom'
    };
    return document.getElementById(ids[key]);
  }

  function syncSeparators(layout) {
    var bounds = layoutBounds();
    [['left', layout.left], ['right', layout.right], ['bottom', layout.bottom]].forEach(function(pair) {
      var handle = layoutHandle(pair[0]);
      var range = bounds[pair[0]];
      if (!handle || !range) return;
      handle.setAttribute('aria-valuemin', String(Math.round(range.min)));
      handle.setAttribute('aria-valuemax', String(Math.round(range.max)));
      handle.setAttribute('aria-valuenow', String(Math.round(pair[1])));
    });
  }

  function setSharedLayout(layout) {
    var state = dashboardState();
    if (state) state.layout = layout;
  }

  function syncSettingState(customized) {
    var element = document.getElementById('desktop-layout-setting-state');
    if (element) element.textContent = customized ? '已自訂' : '可拖曳調整';
  }

  function applyLayout(value, persist) {
    var layout = normalizeLayout(value);
    var root = document.documentElement;
    root.style.setProperty('--desktop-left-rail', layout.left + 'px');
    root.style.setProperty('--desktop-right-rail', layout.right + 'px');
    root.style.setProperty('--desktop-bottom-rail', layout.bottom + 'px');
    setSharedLayout(layout);
    syncSeparators(layout);

    if (persist && window.Storage) {
      Storage.setJson(LAYOUT_PREF_KEY, layout);
      syncSettingState(true);
    }
    return layout;
  }

  function currentLayout() {
    var state = dashboardState();
    if (state && state.layout) return state.layout;
    if (window.Storage) return Storage.getJson(LAYOUT_PREF_KEY, defaultLayout());
    return defaultLayout();
  }

  function layoutKeyFor(element) {
    if (!element) return null;
    if (element.id === 'desktop-resize-left') return 'left';
    if (element.id === 'desktop-resize-right') return 'right';
    if (element.id === 'desktop-resize-bottom') return 'bottom';
    return null;
  }

  function updateLayoutFromPointer(key, drag, event) {
    var next = {
      left: drag.layout.left,
      right: drag.layout.right,
      bottom: drag.layout.bottom
    };
    if (key === 'left') next.left = drag.layout.left + (event.clientX - drag.x);
    if (key === 'right') next.right = drag.layout.right - (event.clientX - drag.x);
    if (key === 'bottom') next.bottom = drag.layout.bottom - (event.clientY - drag.y);
    applyLayout(next, false);
  }

  function saveLayout() {
    var layout = currentLayout();
    if (window.Storage) Storage.setJson(LAYOUT_PREF_KEY, layout);
    syncSeparators(layout);
    syncSettingState(true);
  }

  function startDrag(element, event) {
    var state = dashboardState();
    if (!state || !state.desktop || !element || (event.button !== undefined && event.button !== 0)) return;
    var key = layoutKeyFor(element);
    var layout = currentLayout();
    if (!key || !layout) return;

    event.preventDefault();
    layoutDrag = {
      key: key,
      x: event.clientX,
      y: event.clientY,
      layout: { left: layout.left, right: layout.right, bottom: layout.bottom }
    };
    document.body.classList.add('desktop-resizing');
    document.body.dataset.resizeAxis = key === 'bottom' ? 'row' : 'col';
    var pointerId = event.pointerId;

    function finish() {
      if (!layoutDrag) return;
      layoutDrag = null;
      document.body.classList.remove('desktop-resizing');
      delete document.body.dataset.resizeAxis;
      saveLayout();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    }

    function move(moveEvent) {
      if (!layoutDrag || moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      updateLayoutFromPointer(key, layoutDrag, moveEvent);
    }

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
  }

  function adjustWithKeyboard(element, event) {
    var key = layoutKeyFor(element);
    var layout = currentLayout();
    if (!key || !layout) return;
    var step = event.shiftKey ? 24 : 8;
    var delta = 0;
    var bounds = layoutBounds();

    if (key === 'left' && event.key === 'ArrowLeft') delta = -step;
    if (key === 'left' && event.key === 'ArrowRight') delta = step;
    if (key === 'right' && event.key === 'ArrowLeft') delta = step;
    if (key === 'right' && event.key === 'ArrowRight') delta = -step;
    if (key === 'bottom' && event.key === 'ArrowUp') delta = step;
    if (key === 'bottom' && event.key === 'ArrowDown') delta = -step;
    if (event.key === 'Home') delta = bounds[key].min - layout[key];
    if (event.key === 'End') delta = bounds[key].max - layout[key];
    if (!delta) return;

    event.preventDefault();
    var next = { left: layout.left, right: layout.right, bottom: layout.bottom };
    next[key] += delta;
    applyLayout(next, true);
  }

  function resetLayout() {
    if (window.Storage && window.localStorage) localStorage.removeItem(LAYOUT_PREF_KEY);
    applyLayout(defaultLayout(), false);
    syncSettingState(false);
    if (window.Toast) Toast.show('版面配置已重置', 1800);
  }

  function replaceControl(element) {
    if (!element || !element.parentNode) return element;
    var clone = element.cloneNode(true);
    element.parentNode.replaceChild(clone, element);
    return clone;
  }

  function bindControls() {
    ['desktop-resize-left', 'desktop-resize-right', 'desktop-resize-bottom'].forEach(function(id) {
      var handle = replaceControl(document.getElementById(id));
      if (!handle) return;
      handle.addEventListener('pointerdown', function(event) { startDrag(handle, event); });
      handle.addEventListener('keydown', function(event) { adjustWithKeyboard(handle, event); });
      handle.addEventListener('dblclick', resetLayout);
    });

    var reset = replaceControl(document.getElementById('desktop-layout-reset'));
    if (reset) reset.addEventListener('click', resetLayout);
  }

  function syncViewportLayout() {
    applyLayout(currentLayout(), false);
  }

  function init() {
    if (initialized || !window.DesktopDashboardMod) return;
    initialized = true;
    bindControls();
    applyLayout(currentLayout(), false);
    window.addEventListener('resize', function() {
      window.requestAnimationFrame(syncViewportLayout);
    });
  }

  window.DesktopLayoutMod = {
    init: init,
    apply: applyLayout,
    reset: resetLayout,
    get: function() {
      var layout = currentLayout();
      return { left: layout.left, right: layout.right, bottom: layout.bottom };
    },
    normalize: normalizeLayout,
    bounds: layoutBounds
  };

  init();
})();
