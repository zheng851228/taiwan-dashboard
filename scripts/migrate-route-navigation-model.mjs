import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index === -1) throw new Error(`Missing migration target: ${label}`);
  if (source.indexOf(before, index + before.length) !== -1) {
    throw new Error(`Migration target is not unique: ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const routeConditionsFile = 'js/route-conditions.js';
let routeConditions = fs.readFileSync(routeConditionsFile, 'utf8');

routeConditions = replaceOnce(
  routeConditions,
  `  function routePoints() {\n    return (currentRoute && currentRoute.locations || []).map(function(location) {\n      return Number(location.lat).toFixed(6) + ',' + Number(location.lng).toFixed(6);\n    });\n  }\n\n  function googleUrl(points) {\n    var params = new URLSearchParams({\n      api: '1',\n      origin: points[0],\n      destination: points[points.length - 1],\n      travelmode: RouteMod.mode === 'car' ? 'driving' : 'two-wheeler',\n      dir_action: 'navigate'\n    });\n    if (points.length > 2) params.set('waypoints', points.slice(1, -1).join('|'));\n    if (RouteMod.mode === 'motorcycle' && RouteMod.plate === 'white') params.set('avoid', 'highways,tolls');\n    return 'https://www.google.com/maps/dir/?' + params.toString();\n  }\n\n  function appleUrl(from, to) {\n    var params = new URLSearchParams({ saddr: from, daddr: to, dirflg: 'd' });\n    return 'https://maps.apple.com/?' + params.toString();\n  }`,
  `  function navigationState() {\n    return window.RouteNavigationModel.buildNavigation(\n      currentRoute,\n      RouteMod.mode,\n      RouteMod.plate\n    );\n  }`,
  'navigation target helpers'
);

routeConditions = replaceOnce(
  routeConditions,
  `  function setNavigationLinks() {\n    var points = routePoints();\n    var enabled = points.length >= 2;\n    updateNavigationLink(\n      Dom.byId('nav-google'),\n      enabled ? googleUrl(points) : '#',\n      enabled\n    );\n    updateNavigationLink(\n      Dom.byId('nav-apple'),\n      enabled ? appleUrl(points[0], points[1]) : '#',\n      enabled\n    );\n  }`,
  `  function setNavigationLinks() {\n    var state = navigationState();\n    updateNavigationLink(Dom.byId('nav-google'), state.googleHref, state.enabled);\n    updateNavigationLink(Dom.byId('nav-apple'), state.appleHref, state.enabled);\n  }`,
  'navigation links'
);

routeConditions = replaceOnce(
  routeConditions,
  `  function renderAppleLegs(reveal) {\n    var wrap = Dom.byId('apple-leg-links');\n    if (!wrap) return;\n    var points = routePoints();\n    wrap.innerHTML = '';\n    wrap.classList.toggle('hidden', !reveal || points.length <= 2);\n    if (!reveal || points.length <= 2) return;\n    var note = document.createElement('div');\n    note.textContent = 'Apple Maps Map Links \\u4e0d\\u652f\\u63f4\\u4e00\\u6b21\\u4ea4\\u63a5\\u591a\\u505c\\u9760\\u9ede\\uff0c\\u8acb\\u4f9d\\u539f\\u59cb\\u9806\\u5e8f\\u958b\\u555f\\u5404\\u6bb5\\uff1a';\n    var buttons = document.createElement('div');\n    buttons.className = 'apple-leg-buttons';\n    for (var index = 0; index < points.length - 1; index += 1) {\n      var link = document.createElement('a');\n      link.className = 'apple-leg-button';\n      link.href = appleUrl(points[index], points[index + 1]);\n      link.target = '_blank';\n      link.rel = 'noopener noreferrer';\n      link.textContent = '\\u7b2c ' + (index + 1) + ' \\u6bb5';\n      buttons.appendChild(link);\n    }\n    wrap.appendChild(note);\n    wrap.appendChild(buttons);\n  }`,
  `  function renderAppleLegs(reveal) {\n    var wrap = Dom.byId('apple-leg-links');\n    if (!wrap) return;\n    var state = navigationState();\n    wrap.innerHTML = '';\n    wrap.classList.toggle('hidden', !reveal || !state.appleRequiresLegHandoff);\n    if (!reveal || !state.appleRequiresLegHandoff) return;\n    var note = document.createElement('div');\n    note.textContent = 'Apple Maps Map Links \\u4e0d\\u652f\\u63f4\\u4e00\\u6b21\\u4ea4\\u63a5\\u591a\\u505c\\u9760\\u9ede\\uff0c\\u8acb\\u4f9d\\u539f\\u59cb\\u9806\\u5e8f\\u958b\\u555f\\u5404\\u6bb5\\uff1a';\n    var buttons = document.createElement('div');\n    buttons.className = 'apple-leg-buttons';\n    state.appleLegs.forEach(function(leg) {\n      var link = document.createElement('a');\n      link.className = 'apple-leg-button';\n      link.href = leg.href;\n      link.target = '_blank';\n      link.rel = 'noopener noreferrer';\n      link.textContent = '\\u7b2c ' + leg.index + ' \\u6bb5';\n      buttons.appendChild(link);\n    });\n    wrap.appendChild(note);\n    wrap.appendChild(buttons);\n  }`,
  'apple leg rendering'
);

routeConditions = replaceOnce(
  routeConditions,
  `  function openAppleMaps(event) {\n    var points = routePoints();\n    if (points.length < 2) {\n      event.preventDefault();\n      return;\n    }\n    if (points.length === 2) return;\n    event.preventDefault();\n    renderAppleLegs(true);\n    Toast.show('Apple Maps \\u8acb\\u4f9d\\u9806\\u5e8f\\u958b\\u555f\\u5404\\u6bb5\\u8def\\u7dda', 4000);\n  }`,
  `  function openAppleMaps(event) {\n    var state = navigationState();\n    var intent = window.RouteNavigationModel.appleClickIntent(state.points);\n    if (intent.preventDefault) event.preventDefault();\n    if (intent.revealLegs) renderAppleLegs(true);\n    if (intent.message) Toast.show(intent.message, 4000);\n  }`,
  'apple navigation intent'
);

fs.writeFileSync(routeConditionsFile, routeConditions);

const indexFile = 'index.html';
let indexHtml = fs.readFileSync(indexFile, 'utf8');
indexHtml = replaceOnce(
  indexHtml,
  `<script src="js/route-condition-view-model.js?v=43"></script>\n<script src="js/route-conditions.js?v=42"></script>`,
  `<script src="js/route-condition-view-model.js?v=43"></script>\n<script src="js/route-navigation-model.js?v=43"></script>\n<script src="js/route-conditions.js?v=42"></script>`,
  'route navigation model load order'
);
fs.writeFileSync(indexFile, indexHtml);

console.log('route-navigation model migration applied');
