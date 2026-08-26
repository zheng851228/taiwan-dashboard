// Pure route-search input and request preparation helpers.
// Keeps DOM access, geocoding and route API calls out of this module.
(function() {
  'use strict';

  function normalizeValue(value) {
    return String(value || '').trim();
  }

  function prepareEndpoints(startValue, endValue) {
    var start = normalizeValue(startValue);
    var end = normalizeValue(endValue);
    return {
      ok: Boolean(start && end),
      startValue: start,
      endValue: end,
      message: start && end ? '' : '請分別填入起點和終點'
    };
  }

  function buildAddressPlan(options) {
    options = options || {};
    var startValue = normalizeValue(options.startValue);
    var endValue = normalizeValue(options.endValue);
    var waypoints = Array.isArray(options.waypoints)
      ? options.waypoints.map(normalizeValue)
      : [];
    var displayAddrs = [startValue].concat(waypoints).concat([endValue]);
    var resolutionAddrs = displayAddrs.slice();

    if (options.startRoutePoint && normalizeValue(options.startRoutePointLabel) === startValue) {
      resolutionAddrs[0] = options.startRoutePoint;
    }
    if (options.endRoutePoint && normalizeValue(options.endRoutePointLabel) === endValue) {
      resolutionAddrs[resolutionAddrs.length - 1] = options.endRoutePoint;
    }

    return {
      displayAddrs: displayAddrs,
      resolutionAddrs: resolutionAddrs
    };
  }

  function buildVehicle(mode, plate) {
    if (mode === 'car') return { type: 'car' };
    return { type: 'motorcycle', plate: plate || 'white' };
  }

  function unresolvedPointLabel(index, total) {
    if (index === 0) return '起點';
    if (index === total - 1) return '終點';
    return '第 ' + index + ' 個停靠點';
  }

  function unresolvedPointMessage(index, total) {
    return unresolvedPointLabel(index, total) + '無法解析，請改用更完整地名或座標';
  }

  window.RouteSearchModel = {
    normalizeValue: normalizeValue,
    prepareEndpoints: prepareEndpoints,
    buildAddressPlan: buildAddressPlan,
    buildVehicle: buildVehicle,
    unresolvedPointLabel: unresolvedPointLabel,
    unresolvedPointMessage: unresolvedPointMessage
  };
})();
