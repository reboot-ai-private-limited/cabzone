import type { GeoPoint, Position } from './coords.js';
import type { GeoJsonGeometry, GeoJsonMultiPolygon, GeoJsonPolygon } from './polygon.js';

/**
 * Standard ray-casting algorithm for point-in-ring containment.
 * Coordinates are [lng, lat].
 */
export function isPointInPolygonRing(point: GeoPoint, ring: Position[]): boolean {
  if (!ring || ring.length < 4) return false;

  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p1 = ring[i]!;
    const p2 = ring[j]!;

    const xi = p1[0];
    const yi = p1[1];
    const xj = p2[0];
    const yj = p2[1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Checks if a point is inside a GeoJSON Polygon.
 * A point is inside if it is inside the exterior ring (index 0)
 * AND NOT inside any interior hole rings (indices 1..n).
 */
export function isPointInPolygon(point: GeoPoint, polygon: GeoJsonPolygon): boolean {
  const exterior = polygon.coordinates[0];
  if (!exterior || !isPointInPolygonRing(point, exterior)) {
    return false;
  }

  // Check holes: if point is inside any hole, it is outside the polygon
  for (let h = 1; h < polygon.coordinates.length; h++) {
    const hole = polygon.coordinates[h];
    if (hole && isPointInPolygonRing(point, hole)) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a point is inside a GeoJSON MultiPolygon.
 * True if inside any of the component polygons.
 */
export function isPointInMultiPolygon(point: GeoPoint, multiPoly: GeoJsonMultiPolygon): boolean {
  for (const polyCoords of multiPoly.coordinates) {
    const singlePoly: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: polyCoords,
    };
    if (isPointInPolygon(point, singlePoly)) {
      return true;
    }
  }
  return false;
}

/**
 * Universal point-in-geometry check for Polygon or MultiPolygon.
 */
export function isPointInGeometry(point: GeoPoint, geometry: GeoJsonGeometry): boolean {
  if (geometry.type === 'Polygon') {
    return isPointInPolygon(point, geometry);
  }
  if (geometry.type === 'MultiPolygon') {
    return isPointInMultiPolygon(point, geometry);
  }
  return false;
}
