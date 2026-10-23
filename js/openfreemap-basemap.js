// OpenFreeMap geometry and text basemap subset, retrieved 2026-10-23.
// Sources: https://tiles.openfreemap.org/styles/dark
//          https://tiles.openfreemap.org/styles/positron
// OpenFreeMap modifications: MIT; upstream style code: BSD-3-Clause;
// style design: CC BY 4.0 (derived from CartoDB Basemaps, CC BY 3.0).
// Copyrights, license terms and modification details: docs/openfreemap-licenses.md.
// Included text: water/road names and places below city level; zh-Hant first.
// Omitted icons, sprites, city/state/country symbols, raster sources, railways and aeroways.
// Glyphs are configured only when fallback activates; CJK uses MapLibre system fonts.
(function() {
  'use strict';
  window.OpenFreeMapBasemap = {
    // Shared by phone/desktop renderers, including viewport-driven recreation.
    active: false,
    isBaseError: function(event) {
      if (!event || !event.error || (event.error.status !== 401 && event.error.status !== 403)) return false;
      if (event.sourceId === 'base' || event.sourceId === 'mobile-base-light') return true;
      var message = String(event.error && event.error.message || '');
      return /api\.maptiler\.com\/maps\/dataviz-(?:dark|light)\//i.test(message);
    },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    layers: {
  "dark": [
    {
      "id": "background",
      "type": "background",
      "paint": {
        "background-color": "rgb(12,12,12)"
      }
    },
    {
      "id": "water",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "water",
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPolygon",
            "Polygon"
          ],
          true,
          false
        ],
        [
          "!=",
          [
            "get",
            "brunnel"
          ],
          "tunnel"
        ]
      ],
      "paint": {
        "fill-antialias": false,
        "fill-color": "rgb(27 ,27 ,29)"
      }
    },
    {
      "id": "landuse_residential",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "landuse",
      "maxzoom": 9,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPolygon",
            "Polygon"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "residential"
        ]
      ],
      "paint": {
        "fill-color": "hsl(0,2%,5%)",
        "fill-opacity": 0.4
      }
    },
    {
      "id": "landcover_wood",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "landcover",
      "minzoom": 10,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPolygon",
            "Polygon"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "wood"
        ]
      ],
      "paint": {
        "fill-color": "rgb(32,32,32)",
        "fill-opacity": [
          "interpolate",
          [
            "exponential",
            0.3
          ],
          [
            "zoom"
          ],
          8,
          0,
          10,
          0.8,
          13,
          0.4
        ],
        "fill-translate": [
          0,
          0
        ]
      }
    },
    {
      "id": "landuse_park",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "landuse",
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPolygon",
            "Polygon"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "park"
        ]
      ],
      "paint": {
        "fill-color": "rgb(32,32,32)"
      }
    },
    {
      "id": "waterway",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "waterway",
      "filter": [
        "match",
        [
          "geometry-type"
        ],
        [
          "LineString",
          "MultiLineString"
        ],
        true,
        false
      ],
      "paint": {
        "line-color": "rgb(27 ,27 ,29)"
      }
    },
    {
      "id": "building",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "building",
      "minzoom": 12,
      "filter": [
        "match",
        [
          "geometry-type"
        ],
        [
          "MultiPolygon",
          "Polygon"
        ],
        true,
        false
      ],
      "paint": {
        "fill-antialias": true,
        "fill-color": "rgb(10,10,10)",
        "fill-outline-color": "rgb(27 ,27 ,29)"
      }
    },
    {
      "id": "highway_path",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "path"
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "rgb(27 ,27 ,29)",
        "line-dasharray": [
          1.5,
          1.5
        ],
        "line-opacity": 0.9,
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.2
          ],
          [
            "zoom"
          ],
          13,
          1,
          20,
          10
        ]
      }
    },
    {
      "id": "highway_minor",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "minzoom": 8,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "match",
          [
            "get",
            "class"
          ],
          [
            "minor",
            "service",
            "track"
          ],
          true,
          false
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#181818",
        "line-opacity": 0.9,
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.55
          ],
          [
            "zoom"
          ],
          13,
          1.8,
          20,
          20
        ]
      }
    },
    {
      "id": "highway_major_casing",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "minzoom": 11,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "match",
          [
            "get",
            "class"
          ],
          [
            "primary",
            "secondary",
            "tertiary",
            "trunk"
          ],
          true,
          false
        ]
      ],
      "layout": {
        "line-cap": "butt",
        "line-join": "miter"
      },
      "paint": {
        "line-color": "rgba(60,60,60,0.8)",
        "line-dasharray": [
          12,
          0
        ],
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.3
          ],
          [
            "zoom"
          ],
          10,
          3,
          20,
          23
        ]
      }
    },
    {
      "id": "highway_major_inner",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "minzoom": 11,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "match",
          [
            "get",
            "class"
          ],
          [
            "primary",
            "secondary",
            "tertiary",
            "trunk"
          ],
          true,
          false
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "hsl(0,0%,7%)",
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.3
          ],
          [
            "zoom"
          ],
          10,
          2,
          20,
          20
        ]
      }
    },
    {
      "id": "highway_motorway_casing",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "minzoom": 6,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "motorway"
        ]
      ],
      "layout": {
        "line-cap": "butt",
        "line-join": "miter"
      },
      "paint": {
        "line-color": "rgba(60,60,60,0.8)",
        "line-dasharray": [
          2,
          0
        ],
        "line-opacity": 1,
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.4
          ],
          [
            "zoom"
          ],
          5.8,
          0,
          6,
          3,
          20,
          40
        ]
      }
    },
    {
      "id": "highway_motorway_inner",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "minzoom": 6,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "motorway"
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          5.8,
          "hsla(0,0%,85%,0.53)",
          6,
          "#000"
        ],
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.4
          ],
          [
            "zoom"
          ],
          4,
          2,
          6,
          1.3,
          20,
          30
        ]
      }
    },
    {
      "id": "boundary_state",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "boundary",
      "filter": [
        "==",
        [
          "get",
          "admin_level"
        ],
        4
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-blur": 0.4,
        "line-color": "hsl(0,0%,21%)",
        "line-dasharray": [
          2,
          2
        ],
        "line-opacity": 1,
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.3
          ],
          [
            "zoom"
          ],
          3,
          1,
          22,
          15
        ]
      }
    },
    {
      "id": "boundary_country_z0-4",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "boundary",
      "maxzoom": 5,
      "filter": [
        "all",
        [
          "==",
          [
            "get",
            "admin_level"
          ],
          2
        ],
        [
          "!",
          [
            "has",
            "claimed_by"
          ]
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-blur": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          0,
          0.4,
          22,
          4
        ],
        "line-color": "hsl(0,0%,23%)",
        "line-opacity": 1,
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.1
          ],
          [
            "zoom"
          ],
          3,
          1,
          22,
          20
        ]
      }
    },
    {
      "id": "boundary_country_z5-",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "boundary",
      "minzoom": 5,
      "filter": [
        "==",
        [
          "get",
          "admin_level"
        ],
        2
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-blur": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          0,
          0.4,
          22,
          4
        ],
        "line-color": "hsl(0,0%,23%)",
        "line-opacity": 1,
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.1
          ],
          [
            "zoom"
          ],
          3,
          1,
          22,
          20
        ]
      }
    },
    {
      "id": "water_name",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "water_name",
      "filter": [
        "match",
        [
          "geometry-type"
        ],
        [
          "LineString",
          "MultiLineString"
        ],
        true,
        false
      ],
      "layout": {
        "symbol-placement": "line",
        "symbol-spacing": 500,
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-rotation-alignment": "map",
        "text-size": 12
      },
      "paint": {
        "text-color": "hsla(0,0%,0%,0.7)",
        "text-halo-color": "hsl(0,0%,27%)"
      }
    },
    {
      "id": "highway_name_other",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "transportation_name",
      "filter": [
        "all",
        [
          "!=",
          [
            "get",
            "class"
          ],
          "motorway"
        ],
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ]
      ],
      "layout": {
        "symbol-placement": "line",
        "symbol-spacing": 350,
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-max-angle": 30,
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "map",
        "text-size": 10
      },
      "paint": {
        "text-color": "rgba(80, 78, 78, 1)",
        "text-halo-blur": 0,
        "text-halo-color": "rgba(0, 0, 0, 1)",
        "text-halo-width": 1,
        "text-translate": [
          0,
          0
        ]
      }
    },
    {
      "id": "highway_name_motorway",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "transportation_name",
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "motorway"
        ]
      ],
      "layout": {
        "symbol-placement": "line",
        "symbol-spacing": 350,
        "text-field": [
          "to-string",
          [
            "get",
            "ref"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "text-size": 10
      },
      "paint": {
        "text-color": "hsl(0,0%,37%)",
        "text-translate": [
          0,
          2
        ]
      }
    },
    {
      "id": "place_other",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "maxzoom": 14,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPoint",
            "Point"
          ],
          true,
          false
        ],
        [
          "match",
          [
            "get",
            "class"
          ],
          [
            "hamlet",
            "isolated_dwelling",
            "neighbourhood"
          ],
          true,
          false
        ]
      ],
      "layout": {
        "text-anchor": "center",
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-justify": "center",
        "text-offset": [
          0.5,
          0
        ],
        "text-size": 10
      },
      "paint": {
        "text-color": "rgb(101,101,101)",
        "text-halo-blur": 1,
        "text-halo-color": "rgba(0,0,0,0.7)",
        "text-halo-width": 1
      }
    },
    {
      "id": "place_suburb",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "maxzoom": 15,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPoint",
            "Point"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "suburb"
        ]
      ],
      "layout": {
        "text-anchor": "center",
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-justify": "center",
        "text-offset": [
          0.5,
          0
        ],
        "text-size": 10
      },
      "paint": {
        "text-color": "rgb(101,101,101)",
        "text-halo-blur": 1,
        "text-halo-color": "rgba(0,0,0,0.7)",
        "text-halo-width": 1
      }
    },
    {
      "id": "place_village",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "maxzoom": 14,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPoint",
            "Point"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "village"
        ]
      ],
      "layout": {
        "text-anchor": "left",
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-justify": "left",
        "text-offset": [
          0.5,
          0.2
        ],
        "text-size": 10
      },
      "paint": {
        "text-color": "rgb(101,101,101)",
        "text-halo-blur": 1,
        "text-halo-color": "rgba(0,0,0,0.7)",
        "text-halo-width": 1
      }
    },
    {
      "id": "place_town",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "maxzoom": 15,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPoint",
            "Point"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "town"
        ]
      ],
      "layout": {
        "text-anchor": [
          "step",
          [
            "zoom"
          ],
          "left",
          8,
          "center"
        ],
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-justify": "left",
        "text-offset": [
          0.5,
          0.2
        ],
        "text-size": 10
      },
      "paint": {
        "text-color": "rgb(101,101,101)",
        "text-halo-blur": 1,
        "text-halo-color": "rgba(0,0,0,0.7)",
        "text-halo-width": 1
      }
    }
  ],
  "positron": [
    {
      "id": "background",
      "type": "background",
      "paint": {
        "background-color": "rgb(242,243,240)"
      }
    },
    {
      "id": "park",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "park",
      "filter": [
        "match",
        [
          "geometry-type"
        ],
        [
          "MultiPolygon",
          "Polygon"
        ],
        true,
        false
      ],
      "paint": {
        "fill-color": "rgb(230, 233, 229)"
      }
    },
    {
      "id": "water",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "water",
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPolygon",
            "Polygon"
          ],
          true,
          false
        ],
        [
          "!=",
          [
            "get",
            "brunnel"
          ],
          "tunnel"
        ]
      ],
      "paint": {
        "fill-antialias": true,
        "fill-color": "rgb(194, 200, 202)"
      }
    },
    {
      "id": "landuse_residential",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "landuse",
      "maxzoom": 16,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPolygon",
            "Polygon"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "residential"
        ]
      ],
      "paint": {
        "fill-color": "rgb(234, 234, 230)",
        "fill-opacity": [
          "interpolate",
          [
            "exponential",
            0.6
          ],
          [
            "zoom"
          ],
          8,
          0.8,
          9,
          0.6
        ]
      }
    },
    {
      "id": "landcover_wood",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "landcover",
      "minzoom": 10,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "MultiPolygon",
            "Polygon"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "wood"
        ]
      ],
      "paint": {
        "fill-color": "rgb(220,224,220)",
        "fill-opacity": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          8,
          0,
          12,
          1
        ]
      }
    },
    {
      "id": "waterway",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "waterway",
      "filter": [
        "match",
        [
          "geometry-type"
        ],
        [
          "LineString",
          "MultiLineString"
        ],
        true,
        false
      ],
      "paint": {
        "line-color": "hsl(195,17%,78%)"
      }
    },
    {
      "id": "building",
      "type": "fill",
      "source": "openmaptiles",
      "source-layer": "building",
      "minzoom": 12,
      "paint": {
        "fill-antialias": true,
        "fill-color": "rgb(234, 234, 229)",
        "fill-outline-color": "rgb(219, 219, 218)"
      }
    },
    {
      "id": "highway_path",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "path"
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "rgb(234, 234, 234)",
        "line-opacity": 0.9,
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.2
          ],
          [
            "zoom"
          ],
          13,
          1,
          20,
          10
        ]
      }
    },
    {
      "id": "highway_minor",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "minzoom": 8,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "match",
          [
            "get",
            "class"
          ],
          [
            "minor",
            "service",
            "track"
          ],
          true,
          false
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "hsl(0,0%,88%)",
        "line-opacity": 0.9,
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.55
          ],
          [
            "zoom"
          ],
          13,
          1.8,
          20,
          20
        ]
      }
    },
    {
      "id": "highway_major_casing",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "minzoom": 11,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "match",
          [
            "get",
            "class"
          ],
          [
            "primary",
            "secondary",
            "tertiary",
            "trunk"
          ],
          true,
          false
        ]
      ],
      "layout": {
        "line-cap": "butt",
        "line-join": "miter"
      },
      "paint": {
        "line-color": "rgb(213, 213, 213)",
        "line-dasharray": [
          12,
          0
        ],
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.3
          ],
          [
            "zoom"
          ],
          10,
          3,
          20,
          23
        ]
      }
    },
    {
      "id": "highway_major_inner",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "minzoom": 11,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "match",
          [
            "get",
            "class"
          ],
          [
            "primary",
            "secondary",
            "tertiary",
            "trunk"
          ],
          true,
          false
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#fff",
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.3
          ],
          [
            "zoom"
          ],
          10,
          2,
          20,
          20
        ]
      }
    },
    {
      "id": "highway_motorway_casing",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "minzoom": 6,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "all",
          [
            "match",
            [
              "get",
              "brunnel"
            ],
            [
              "bridge",
              "tunnel"
            ],
            false,
            true
          ],
          [
            "==",
            [
              "get",
              "class"
            ],
            "motorway"
          ]
        ]
      ],
      "layout": {
        "line-cap": "butt",
        "line-join": "miter"
      },
      "paint": {
        "line-color": "rgb(213, 213, 213)",
        "line-dasharray": [
          2,
          0
        ],
        "line-opacity": 1,
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.4
          ],
          [
            "zoom"
          ],
          5.8,
          0,
          6,
          3,
          20,
          40
        ]
      }
    },
    {
      "id": "highway_motorway_inner",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "transportation",
      "minzoom": 6,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "all",
          [
            "match",
            [
              "get",
              "brunnel"
            ],
            [
              "bridge",
              "tunnel"
            ],
            false,
            true
          ],
          [
            "==",
            [
              "get",
              "class"
            ],
            "motorway"
          ]
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          5.8,
          "hsla(0,0%,85%,0.53)",
          6,
          "#fff"
        ],
        "line-width": [
          "interpolate",
          [
            "exponential",
            1.4
          ],
          [
            "zoom"
          ],
          4,
          2,
          6,
          1.3,
          20,
          30
        ]
      }
    },
    {
      "id": "boundary_3",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "boundary",
      "minzoom": 8,
      "filter": [
        "all",
        [
          ">=",
          [
            "get",
            "admin_level"
          ],
          3
        ],
        [
          "<=",
          [
            "get",
            "admin_level"
          ],
          6
        ],
        [
          "!=",
          [
            "get",
            "maritime"
          ],
          1
        ],
        [
          "!=",
          [
            "get",
            "disputed"
          ],
          1
        ],
        [
          "!",
          [
            "has",
            "claimed_by"
          ]
        ]
      ],
      "paint": {
        "line-color": "hsl(0,0%,70%)",
        "line-dasharray": [
          1,
          1
        ],
        "line-width": [
          "interpolate",
          [
            "linear",
            1
          ],
          [
            "zoom"
          ],
          7,
          1,
          11,
          2
        ]
      }
    },
    {
      "id": "boundary_2",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "boundary",
      "filter": [
        "all",
        [
          "==",
          [
            "get",
            "admin_level"
          ],
          2
        ],
        [
          "!=",
          [
            "get",
            "maritime"
          ],
          1
        ],
        [
          "!=",
          [
            "get",
            "disputed"
          ],
          1
        ],
        [
          "!",
          [
            "has",
            "claimed_by"
          ]
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "hsl(0,0%,70%)",
        "line-opacity": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          0,
          0.4,
          4,
          1
        ],
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          3,
          1,
          5,
          1.2,
          12,
          3
        ]
      }
    },
    {
      "id": "boundary_disputed",
      "type": "line",
      "source": "openmaptiles",
      "source-layer": "boundary",
      "filter": [
        "all",
        [
          "!=",
          [
            "get",
            "maritime"
          ],
          1
        ],
        [
          "==",
          [
            "get",
            "disputed"
          ],
          1
        ]
      ],
      "paint": {
        "line-color": "hsl(0,0%,70%)",
        "line-dasharray": [
          1,
          2
        ],
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          3,
          1,
          5,
          1.2,
          12,
          3
        ]
      }
    },
    {
      "id": "water_name_point_label",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "water_name",
      "filter": [
        "match",
        [
          "geometry-type"
        ],
        [
          "MultiPoint",
          "Point"
        ],
        true,
        false
      ],
      "layout": {
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-letter-spacing": 0.2,
        "text-max-width": 5,
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          0,
          10,
          8,
          14
        ]
      },
      "paint": {
        "text-color": "#495e91",
        "text-halo-color": "rgba(255,255,255,0.7)",
        "text-halo-width": 1.5
      }
    },
    {
      "id": "water_name_line_label",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "water_name",
      "filter": [
        "match",
        [
          "geometry-type"
        ],
        [
          "LineString",
          "MultiLineString"
        ],
        true,
        false
      ],
      "layout": {
        "symbol-placement": "line",
        "symbol-spacing": 350,
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-letter-spacing": 0.2,
        "text-max-width": 5,
        "text-size": 14
      },
      "paint": {
        "text-color": "#495e91",
        "text-halo-color": "rgba(255,255,255,0.7)",
        "text-halo-width": 1.5
      }
    },
    {
      "id": "highway-name-path",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "transportation_name",
      "minzoom": 15.5,
      "filter": [
        "==",
        [
          "get",
          "class"
        ],
        "path"
      ],
      "layout": {
        "symbol-placement": "line",
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-rotation-alignment": "map",
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          13,
          12,
          14,
          13
        ]
      },
      "paint": {
        "text-color": "hsl(30,0%,62%)",
        "text-halo-color": "#f8f4f0",
        "text-halo-width": 0.5
      }
    },
    {
      "id": "highway-name-minor",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "transportation_name",
      "minzoom": 15,
      "filter": [
        "all",
        [
          "match",
          [
            "geometry-type"
          ],
          [
            "LineString",
            "MultiLineString"
          ],
          true,
          false
        ],
        [
          "match",
          [
            "get",
            "class"
          ],
          [
            "minor",
            "service",
            "track"
          ],
          true,
          false
        ]
      ],
      "layout": {
        "symbol-placement": "line",
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-rotation-alignment": "map",
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          13,
          12,
          14,
          13
        ]
      },
      "paint": {
        "text-color": "#666",
        "text-halo-blur": 0.5,
        "text-halo-width": 1
      }
    },
    {
      "id": "highway-name-major",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "transportation_name",
      "minzoom": 12.2,
      "filter": [
        "match",
        [
          "get",
          "class"
        ],
        [
          "primary",
          "secondary",
          "tertiary",
          "trunk"
        ],
        true,
        false
      ],
      "layout": {
        "symbol-placement": "line",
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-rotation-alignment": "map",
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          13,
          12,
          14,
          13
        ]
      },
      "paint": {
        "text-color": "#666",
        "text-halo-blur": 0.5,
        "text-halo-width": 1
      }
    },
    {
      "id": "highway-shield-non-us",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "transportation_name",
      "minzoom": 11,
      "filter": [
        "all",
        [
          "all",
          [
            "<=",
            [
              "get",
              "ref_length"
            ],
            6
          ],
          [
            "match",
            [
              "geometry-type"
            ],
            [
              "LineString",
              "MultiLineString"
            ],
            true,
            false
          ],
          [
            "match",
            [
              "get",
              "network"
            ],
            [
              "us-highway",
              "us-interstate",
              "us-state"
            ],
            false,
            true
          ]
        ],
        [
          "==",
          [
            "get",
            "class"
          ],
          "motorway"
        ]
      ],
      "layout": {
        "symbol-placement": [
          "step",
          [
            "zoom"
          ],
          "point",
          11,
          "line"
        ],
        "symbol-spacing": 200,
        "text-field": [
          "to-string",
          [
            "get",
            "ref"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-rotation-alignment": "viewport",
        "text-size": 10
      }
    },
    {
      "id": "label_other",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "minzoom": 8,
      "filter": [
        "match",
        [
          "get",
          "class"
        ],
        [
          "hamlet",
          "isolated_dwelling",
          "neighbourhood",
          "suburb"
        ],
        true,
        false
      ],
      "layout": {
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-letter-spacing": 0.1,
        "text-max-width": 9,
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          8,
          9,
          12,
          10
        ]
      },
      "paint": {
        "text-color": "#333",
        "text-halo-blur": 1,
        "text-halo-color": "#fff",
        "text-halo-width": 1
      }
    },
    {
      "id": "label_village",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "minzoom": 9,
      "filter": [
        "==",
        [
          "get",
          "class"
        ],
        "village"
      ],
      "layout": {
        "text-anchor": "bottom",
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-max-width": 8,
        "text-size": [
          "interpolate",
          [
            "exponential",
            1.2
          ],
          [
            "zoom"
          ],
          7,
          10,
          11,
          12
        ]
      },
      "paint": {
        "text-color": "#000",
        "text-halo-blur": 1,
        "text-halo-color": "#fff",
        "text-halo-width": 1
      }
    },
    {
      "id": "label_town",
      "type": "symbol",
      "source": "openmaptiles",
      "source-layer": "place",
      "minzoom": 6,
      "filter": [
        "==",
        [
          "get",
          "class"
        ],
        "town"
      ],
      "layout": {
        "text-anchor": "bottom",
        "text-field": [
          "coalesce",
          [
            "get",
            "name:zh-Hant"
          ],
          [
            "get",
            "name"
          ]
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-max-width": 8,
        "text-size": [
          "interpolate",
          [
            "exponential",
            1.2
          ],
          [
            "zoom"
          ],
          7,
          12,
          11,
          14
        ]
      },
      "paint": {
        "text-color": "#000",
        "text-halo-blur": 1,
        "text-halo-color": "#fff",
        "text-halo-width": 1
      }
    }
  ]
}
  };
})();
