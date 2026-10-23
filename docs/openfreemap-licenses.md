# Embedded OpenFreeMap basemap styles

Retrieved 2026-10-23 from:

- https://tiles.openfreemap.org/styles/dark
- https://tiles.openfreemap.org/styles/positron

`js/openfreemap-basemap.js` contains a reduced subset of these styles: background,
water, land use, buildings, waterways, roads and boundaries, plus text-only water
names, road names/references and hamlet/neighbourhood/suburb/village/town labels.
Icons, sprites, raster sources, railways, aeroways and city/state/country symbols
were removed. Text uses `coalesce(name:zh-Hant, name)` instead of bilingual Latin
transcriptions; motorway references retain `ref`. All text uses Noto Sans Regular;
CJK characters retain MapLibre's default local system-font rendering. Glyphs from
`https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` are configured only
when fallback activates. Icon layout properties and uppercase text transforms
were removed from retained symbols.

Dark text layers: `water_name`, `highway_name_other`, `highway_name_motorway`,
`place_other`, `place_suburb`, `place_village`, `place_town`.
Positron equivalents: `water_name_point_label`, `water_name_line_label`,
`highway-name-path`, `highway-name-minor`, `highway-name-major`,
`highway-shield-non-us`, `label_other`, `label_village`, `label_town`.
The Positron ref layer is restricted to motorway class, and `label_other` to
hamlet/isolated_dwelling/neighbourhood/suburb, matching the selected Dark classes. Runtime code prefixes
layer IDs and replaces the vector source ID; the geometry paint/filter values
are unchanged except that the dark woodland sprite pattern was removed. No upstream style JSON is fetched at runtime.

OpenFreeMap styles: https://github.com/hyperknot/openfreemap-styles

Upstream Dark Matter and Positron styles are derived from CartoDB Basemaps,
designed by Stamen and Paul Norman for CartoDB Inc. (CC BY 3.0).
Style designs are CC BY 4.0: https://creativecommons.org/licenses/by/4.0/.
Data is from OpenStreetMap (ODbL): https://www.openstreetmap.org/copyright.
The map attribution links to OpenFreeMap, OpenMapTiles and OpenStreetMap.

Sources of the following notices:

- https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md
- https://github.com/openmaptiles/dark-matter-gl-style/blob/master/LICENSE.md
- https://github.com/openmaptiles/positron-gl-style/blob/master/LICENSE.md

## OpenFreeMap modifications — MIT License

Copyright (c) 2023 Zsolt Ero

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Upstream style code — BSD 3-Clause License

Copyright (c) 2024, MapTiler.com & OpenMapTiles contributors.
Copyright (c) 2015, CartoDB Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.
- Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
- Neither the name of the copyright holder nor the names of its contributors
  may be used to endorse or promote products derived from this software
  without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
