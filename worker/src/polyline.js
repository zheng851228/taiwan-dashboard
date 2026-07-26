export function decodePolyline6(value) {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < value.length) {
    const latChunk = decodeChunk(value, index);
    index = latChunk.index;
    lat += latChunk.delta;

    const lngChunk = decodeChunk(value, index);
    index = lngChunk.index;
    lng += lngChunk.delta;
    coordinates.push([lat / 1e6, lng / 1e6]);
  }

  return coordinates;
}

function decodeChunk(value, startIndex) {
  let result = 0;
  let shift = 0;
  let byte;
  let index = startIndex;
  do {
    byte = value.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < value.length);
  return {
    index,
    delta: (result & 1) ? ~(result >> 1) : result >> 1
  };
}

export function encodePolyline6(coordinates) {
  let lastLat = 0;
  let lastLng = 0;
  let output = '';

  for (const [latValue, lngValue] of coordinates) {
    const lat = Math.round(latValue * 1e6);
    const lng = Math.round(lngValue * 1e6);
    output += encodeChunk(lat - lastLat);
    output += encodeChunk(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return output;
}

function encodeChunk(delta) {
  let value = delta < 0 ? ~(delta << 1) : delta << 1;
  let output = '';
  while (value >= 0x20) {
    output += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  return output + String.fromCharCode(value + 63);
}

export function haversineKm(a, b) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function cumulativeDistances(coordinates) {
  const values = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    values.push(values[index - 1] + haversineKm(coordinates[index - 1], coordinates[index]));
  }
  return values;
}

export function bearingDegrees(a, b) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const toDegrees = (radians) => radians * 180 / Math.PI;
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const deltaLng = toRadians(b[1] - a[1]);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function mergeLegShapes(encodedShapes) {
  const merged = [];
  for (const shape of encodedShapes) {
    const leg = decodePolyline6(shape);
    if (merged.length && leg.length) leg.shift();
    merged.push(...leg);
  }
  return merged;
}

export function nearestCoordinateIndex(cumulative, targetKm) {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulative[middle] < targetKm) low = middle + 1;
    else high = middle;
  }
  return low;
}
