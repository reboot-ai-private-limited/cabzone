import { fromPosition, haversineDistanceM, type GeoPoint, type Position } from './coords.js';
import { isPointInGeometry } from './point-in-polygon.js';

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

export interface BoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export function getBoundingBox(geometry: GeoJsonGeometry): BoundingBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  for (const poly of polygons) {
    for (const ring of poly) {
      for (const pos of ring) {
        const lng = pos[0];
        const lat = pos[1];
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }

  return {
    minLng: Number.isFinite(minLng) ? minLng : 0,
    minLat: Number.isFinite(minLat) ? minLat : 0,
    maxLng: Number.isFinite(maxLng) ? maxLng : 0,
    maxLat: Number.isFinite(maxLat) ? maxLat : 0,
  };
}

export function doBoundingBoxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.minLng <= b.maxLng &&
    a.maxLng >= b.minLng &&
    a.minLat <= b.maxLat &&
    a.maxLat >= b.minLat
  );
}

export function getCentroid(geometry: GeoJsonGeometry): GeoPoint {
  let totalLng = 0;
  let totalLat = 0;
  let count = 0;

  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  for (const poly of polygons) {
    const exterior = poly[0];
    if (!exterior) continue;
    // Exclude the closing duplicate vertex from centroid average
    const limit = exterior.length > 1 ? exterior.length - 1 : exterior.length;
    for (let i = 0; i < limit; i++) {
      const pos = exterior[i]!;
      totalLng += pos[0];
      totalLat += pos[1];
      count++;
    }
  }

  if (count === 0) return { lat: 0, lng: 0 };
  return {
    lat: totalLat / count,
    lng: totalLng / count,
  };
}

/**
 * Calculates perpendicular or endpoint distance in meters from a point to a line segment [a, b].
 */
export function distancePointToSegmentM(point: GeoPoint, a: Position, b: Position): number {
  const pA = fromPosition(a);
  const pB = fromPosition(b);

  const dx = a[0] - b[0];
  const dy = a[1] - b[1];

  if (dx === 0 && dy === 0) {
    return haversineDistanceM(point, pA);
  }

  // Projection parameter t of point on segment [A, B]
  const t =
    ((point.lng - a[0]) * (b[0] - a[0]) + (point.lat - a[1]) * (b[1] - a[1])) /
    (dx * dx + dy * dy);

  if (t <= 0) return haversineDistanceM(point, pA);
  if (t >= 1) return haversineDistanceM(point, pB);

  const projPoint: GeoPoint = {
    lng: a[0] + t * (b[0] - a[0]),
    lat: a[1] + t * (b[1] - a[1]),
  };

  return haversineDistanceM(point, projPoint);
}

/**
 * Calculates minimum distance in meters from a point to a polygon/multipolygon boundary.
 * If point is inside geometry, returns 0.
 */
export function distanceToPolygonM(point: GeoPoint, geometry: GeoJsonGeometry): number {
  if (isPointInGeometry(point, geometry)) {
    return 0;
  }

  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  let minDistance = Infinity;

  for (const poly of polygons) {
    const exterior = poly[0];
    if (!exterior || exterior.length < 2) continue;

    for (let i = 0; i < exterior.length - 1; i++) {
      const a = exterior[i]!;
      const b = exterior[i + 1]!;
      const dist = distancePointToSegmentM(point, a, b);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }
  }

  return minDistance === Infinity ? 0 : Math.round(minDistance);
}
