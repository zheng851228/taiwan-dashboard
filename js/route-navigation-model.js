// Pure route navigation target and intent decisions.
(function() {
  'use strict';

  var APPLE_MULTI_STOP_MESSAGE = 'Apple Maps 請依順序開啟各段路線';

  function routePoints(route) {
    return (route && route.locations || []).map(function(location) {
      return Number(location.lat).toFixed(6) + ',' + Number(location.lng).toFixed(6);
    });
  }

  function googleUrl(points, mode, plate) {
    if (!Array.isArray(points) || points.length < 2) return '#';
    var params = new URLSearchParams({
      api: '1',
      origin: points[0],
      destination: points[points.length - 1],
      travelmode: mode === 'car' ? 'driving' : 'two-wheeler',
      dir_action: 'navigate'
    });
    if (points.length > 2) params.set('waypoints', points.slice(1, -1).join('|'));
    if (mode === 'motorcycle' && plate === 'white') params.set('avoid', 'highways,tolls');
    return 'https://www.google.com/maps/dir/?' + params.toString();
  }

  function appleUrl(from, to) {
    if (!from || !to) return '#';
    var params = new URLSearchParams({ saddr: from, daddr: to, dirflg: 'd' });
    return 'https://maps.apple.com/?' + params.toString();
  }

  function appleLegs(points) {
    if (!Array.isArray(points) || points.length < 2) return [];
    var legs = [];
    for (var index = 0; index < points.length - 1; index += 1) {
      legs.push({
        index: index + 1,
        from: points[index],
        to: points[index + 1],
        href: appleUrl(points[index], points[index + 1])
      });
    }
    return legs;
  }

  function buildNavigation(route, mode, plate) {
    var points = routePoints(route);
    var enabled = points.length >= 2;
    return {
      enabled: enabled,
      points: points,
      googleHref: enabled ? googleUrl(points, mode, plate) : '#',
      appleHref: enabled ? appleUrl(points[0], points[1]) : '#',
      appleLegs: enabled ? appleLegs(points) : [],
      appleRequiresLegHandoff: points.length > 2
    };
  }

  function appleClickIntent(points) {
    var count = Array.isArray(points) ? points.length : 0;
    if (count < 2) {
      return { preventDefault: true, revealLegs: false, message: '' };
    }
    if (count === 2) {
      return { preventDefault: false, revealLegs: false, message: '' };
    }
    return {
      preventDefault: true,
      revealLegs: true,
      message: APPLE_MULTI_STOP_MESSAGE
    };
  }

  window.RouteNavigationModel = {
    routePoints: routePoints,
    googleUrl: googleUrl,
    appleUrl: appleUrl,
    appleLegs: appleLegs,
    buildNavigation: buildNavigation,
    appleClickIntent: appleClickIntent
  };
})();
