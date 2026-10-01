import type { Position } from './coords.js';

/**
 * Decodes a Google encoded polyline string into an array of GeoJSON Positions ([lng, lat]).
 * Standard Google polyline algorithm using default precision of 5 decimals (1e-5 deg).
 */
export function decodePolyline(encoded: string, precision = 5): Position[] {
  if (!encoded || encoded.length === 0) {
    return [];
  }

  const points: Position[] = [];
  const factor = Math.pow(10, precision);
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let byte: number;
    let shift = 0;
    let result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    // GeoJSON position is [lng, lat]
    points.push([lng / factor, lat / factor]);
  }

  return points;
}

/**
 * Encodes an array of GeoJSON Positions ([lng, lat]) into a Google encoded polyline string.
 */
export function encodePolyline(points: Position[], precision = 5): string {
  const factor = Math.pow(10, precision);
  let output = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point[1] * factor);
    const lng = Math.round(point[0] * factor);

    output += encodeSignedNumber(lat - prevLat);
    output += encodeSignedNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return output;
}

function encodeSignedNumber(num: number): string {
  let sgnNum = num < 0 ? ~(num << 1) : num << 1;
  let encodeString = '';

  while (sgnNum >= 0x20) {
    encodeString += String.fromCharCode((0x20 | (sgnNum & 0x1f)) + 63);
    sgnNum >>= 5;
  }

  encodeString += String.fromCharCode(sgnNum + 63);
  return encodeString;
}

