(function(global) {
  'use strict';

  var PLATE_LABELS = {
    white: '\u767d\u724c',
    yellow: '\u9ec3\u724c',
    red: '\u7d05\u724c'
  };

  function normalizeRouteInfo(route) {
    route = route || {};
    return {
      distance: Number(route.distanceKm || 0).toFixed(1),
      duration: Math.round(Number(route.durationMinutes || 0))
    };
  }

  function vehicleLabel(mode, plate) {
    if (mode === 'car') return '\ud83d\ude97 \u6c7d\u8eca';
    return '\ud83c\udfcd\ufe0f ' + PLATE_LABELS[plate];
  }

  function routeUiCopy(cameraCount, routeInfo, mode) {
    var count = cameraCount || 0;
    return {
      statusText: count > 0
        ? '\u5b89\u5168\u9a57\u8b49\u5b8c\u6210 \u00b7 ' + count + ' \u652f\u6cbf\u9014\u73fe\u5834\u756b\u9762'
        : '\u5b89\u5168\u9a57\u8b49\u5b8c\u6210 \u00b7 \u6cbf\u9014\u66ab\u7121\u73fe\u5834\u756b\u9762',
      listCountText: count > 0
        ? '\u8def\u7dda\u904e\u6ffe\uff1a\u5171 ' + count + ' \u652f'
        : '\u8def\u7dda\u904e\u6ffe\uff1a\u672a\u627e\u5230\u5408\u9069\u651d\u5f71\u6a5f',
      summaryText: routeInfo
        ? (mode === 'motorcycle' ? '\ud83c\udfcd' : '\ud83d\ude97') + ' '
          + routeInfo.distance + 'km/' + routeInfo.duration + '\u5206 \u00b7 \u5df2\u9a57\u8b49'
        : ''
    };
  }

  function completionMessage(route, routeInfo, mode, plate) {
    if (route && route.dataMode === 'fixture') {
      return '\u793a\u7bc4\u8def\u7dda\u5df2\u8f09\u5165\uff0c\u4e0d\u53ef\u7528\u65bc\u5be6\u969b\u9a0e\u4e58';
    }
    return routeInfo
      ? vehicleLabel(mode, plate) + ' ' + routeInfo.distance + 'km / \u7d04' + routeInfo.duration + '\u5206\u9418'
      : '\u8def\u7dda\u89e3\u6790\u5b8c\u6210';
  }

  global.RouteSummaryModel = {
    normalizeRouteInfo: normalizeRouteInfo,
    vehicleLabel: vehicleLabel,
    routeUiCopy: routeUiCopy,
    completionMessage: completionMessage
  };
})(window);
