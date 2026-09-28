import {
  isValidLatitude,
  isValidLongitude,
  type Position,
} from './coords.js';
import type { GeoJsonGeometry } from './polygon.js';

export const Z_CODES = {
  Z001_INVALID_GEOMETRY: 'Z-001',
  Z002_RING_NOT_CLOSED: 'Z-002',
  Z003_MINIMUM_VERTICES: 'Z-003',
  Z004_COORDINATE_OUT_OF_BOUNDS: 'Z-004',
  Z005_SELF_INTERSECTION: 'Z-005',
  Z006_UNSUPPORTED_GEOMETRY: 'Z-006',
  Z007_SAME_TYPE_CONFLICT: 'Z-007',
  Z008_CONFLICTING_CITY: 'Z-008',
  Z009_EXCLUSION_PRECEDENCE: 'Z-009',
  Z010_MIN_AREA: 'Z-MIN-AREA',
  Z011_MAX_AREA: 'Z-MAX-AREA',
} as const;

/** Minimum operational zone area: 1 hectare = 10,000 m² */
export const MIN_ZONE_AREA_M2 = 10_000;

/** Maximum operational zone ceiling: 100,000 km² */
export const MAX_ZONE_AREA_M2 = 100_000_000_000;

export type ZoneViolationCode =
  | (typeof Z_CODES)[keyof typeof Z_CODES]
  | 'ZONE_NOT_FOUND'
  | 'ZONE_OVERLAP'
  | 'ZONE_VERSION_CONFLICT'
  | 'COORDINATES_APPEAR_SWAPPED';

export interface ZoneViolation {
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  offendingZoneId?: string;
  offendingGeometry?: GeoJsonGeometry;
}

export interface ZoneValidationResult {
  valid: boolean;
  violations: ZoneViolation[];
}

/**
 * Checks whether two line segments (p1-q1) and (p2-q2) properly intersect.
 */
function ccw(p1: Position, p2: Position, p3: Position): number {
  return (p2[1] - p1[1]) * (p3[0] - p2[0]) - (p2[0] - p1[0]) * (p3[1] - p2[1]);
}

function onSegment(p: Position, a: Position, b: Position): boolean {
  return (
    p[0] <= Math.max(a[0], b[0]) &&
    p[0] >= Math.min(a[0], b[0]) &&
    p[1] <= Math.max(a[1], b[1]) &&
    p[1] >= Math.min(a[1], b[1])
  );
}

/**
 * Returns true if segment (a1, a2) intersects segment (b1, b2).
 * If adjacent=true, segments share an endpoint which is ignored.
 */
export function doSegmentsIntersect(
  a1: Position,
  a2: Position,
  b1: Position,
  b2: Position,
  shareEndpoint = false,
): boolean {
  if (shareEndpoint) {
    // If they share an endpoint, check if they are collinear and overlapping
    const d1 = ccw(a1, a2, b1);
    const d2 = ccw(a1, a2, b2);
    if (Math.abs(d1) < 1e-9 && Math.abs(d2) < 1e-9) {
      // Collinear: check if non-shared endpoint lies on the other segment
      const sameA1B1 = Math.abs(a1[0] - b1[0]) < 1e-9 && Math.abs(a1[1] - b1[1]) < 1e-9;
      const sameA1B2 = Math.abs(a1[0] - b2[0]) < 1e-9 && Math.abs(a1[1] - b2[1]) < 1e-9;
      const sameA2B1 = Math.abs(a2[0] - b1[0]) < 1e-9 && Math.abs(a2[1] - b1[1]) < 1e-9;
      const sameA2B2 = Math.abs(a2[0] - b2[0]) < 1e-9 && Math.abs(a2[1] - b2[1]) < 1e-9;

      if ((sameA1B1 && onSegment(b2, a1, a2)) || (sameA1B2 && onSegment(b1, a1, a2))) return true;
      if ((sameA2B1 && onSegment(b2, a1, a2)) || (sameA2B2 && onSegment(b1, a1, a2))) return true;
    }
    return false;
  }

  const d1 = ccw(a1, a2, b1);
  const d2 = ccw(a1, a2, b2);
  const d3 = ccw(b1, b2, a1);
  const d4 = ccw(b1, b2, a2);

  // General case: lines cross
  if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) &&
      ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) {
    return true;
  }

  // Collinear and on segment cases
  if (Math.abs(d1) < 1e-9 && onSegment(b1, a1, a2)) return true;
  if (Math.abs(d2) < 1e-9 && onSegment(b2, a1, a2)) return true;
  if (Math.abs(d3) < 1e-9 && onSegment(a1, b1, b2)) return true;
  if (Math.abs(d4) < 1e-9 && onSegment(a2, b1, b2)) return true;

  return false;
}

/**
 * Checks if a ring has any self-intersections (bow-tie, overlapping non-adjacent edges).
 */
export function hasRingSelfIntersection(ring: Position[]): boolean {
  if (ring.length < 4) return false;
  const numEdges = ring.length - 1;

  for (let i = 0; i < numEdges; i++) {
    const a1 = ring[i]!;
    const a2 = ring[i + 1]!;

    for (let j = i + 1; j < numEdges; j++) {
      const b1 = ring[j]!;
      const b2 = ring[j + 1]!;

      // Adjacent edges share an endpoint:
      // - i and i+1 share ring[i+1]
      // - first edge (0) and last edge (numEdges-1) share ring[0] == ring[numEdges]
      const isAdjacent =
        j === i + 1 || (i === 0 && j === numEdges - 1);

      if (doSegmentsIntersect(a1, a2, b1, b2, isAdjacent)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Computes signed planar area using Shoelace formula.
 * Positive = Counter-Clockwise (CCW). Negative = Clockwise (CW).
 */
export function ringSignedArea(ring: Position[]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i]!;
    const p2 = ring[i + 1]!;
    sum += p1[0] * p2[1] - p2[0] * p1[1];
  }
  return sum / 2;
}

export function isRingCounterClockwise(ring: Position[]): boolean {
  return ringSignedArea(ring) > 0;
}

/**
 * Normalizes a coordinate ring to either CCW (exterior) or CW (interior hole).
 */
export function normalizeRingWinding(ring: Position[], shouldBeCcw: boolean): Position[] {
  if (ring.length < 4) return ring;
  const isCcw = isRingCounterClockwise(ring);
  if (isCcw === shouldBeCcw) {
    return ring;
  }
  return [...ring].reverse();
}

/**
 * Computes approximate area in square meters using spherical trapezoid projection.
 */
export function computeRingAreaM2(ring: Position[]): number {
  if (ring.length < 4) return 0;
  const R = 6371008.8; // Mean Earth radius in meters
  let total = 0;
  const rad = Math.PI / 180;

  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i]!;
    const p2 = ring[i + 1]!;
    const lon1 = p1[0] * rad;
    const lon2 = p2[0] * rad;
    const lat1 = p1[1] * rad;
    const lat2 = p2[1] * rad;
    total += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return Math.abs((total * R * R) / 2);
}

/**
 * Computes net polygon area in square meters (exterior ring minus all holes).
 */
export function computePolygonAreaM2(coordinates: Position[][]): number {
  if (!coordinates || coordinates.length === 0) return 0;
  const outerArea = computeRingAreaM2(coordinates[0]!);
  let holesArea = 0;
  for (let i = 1; i < coordinates.length; i++) {
    holesArea += computeRingAreaM2(coordinates[i]!);
  }
  return Math.max(0, outerArea - holesArea);
}

/**
 * Computes total area in square meters across Polygon or MultiPolygon.
 */
export function computeGeometryAreaM2(geometry: GeoJsonGeometry): number {
  if (geometry.type === 'Polygon') {
    return computePolygonAreaM2(geometry.coordinates);
  }
  let total = 0;
  for (const poly of geometry.coordinates) {
    total += computePolygonAreaM2(poly);
  }
  return total;
}

/**
 * Enforces RFC 7946 GeoJSON winding order:
 * - Exterior rings MUST be counter-clockwise (CCW).
 * - Interior rings (holes) MUST be clockwise (CW).
 *
 * This prevents MongoDB 2dsphere indexes from interpreting clockwise polygons as the entire Earth complement!
 */
export function ensureRfc7946Winding<T extends GeoJsonGeometry>(geometry: T): T {
  if (geometry.type === 'Polygon') {
    const normalizedRings = geometry.coordinates.map((ring, idx) =>
      normalizeRingWinding(ring, idx === 0),
    );
    return {
      ...geometry,
      coordinates: normalizedRings,
    };
  }

  const normalizedPolys = geometry.coordinates.map((poly) =>
    poly.map((ring, idx) => normalizeRingWinding(ring, idx === 0)),
  );
  return {
    ...geometry,
    coordinates: normalizedPolys,
  };
}

/**
 * Validates a single polygon coordinate ring against rules Z-002, Z-003, Z-004, Z-005.
 */
function validateRing(ring: unknown, ringIndex: number, violations: ZoneViolation[]): void {
  if (!Array.isArray(ring)) {
    violations.push({
      code: Z_CODES.Z001_INVALID_GEOMETRY,
      severity: 'ERROR',
      message: `Ring ${ringIndex} must be an array of coordinates.`,
    });
    return;
  }

  if (ring.length < 4) {
    violations.push({
      code: Z_CODES.Z003_MINIMUM_VERTICES,
      severity: 'ERROR',
      message: `Ring ${ringIndex} has fewer than 4 coordinates. At least 3 distinct vertices plus closing vertex required.`,
    });
    return;
  }

  const positions: Position[] = [];
  const distinctSet = new Set<string>();

  for (let i = 0; i < ring.length; i++) {
    const pt = ring[i];
    if (!Array.isArray(pt) || pt.length < 2 || typeof pt[0] !== 'number' || typeof pt[1] !== 'number') {
      violations.push({
        code: Z_CODES.Z001_INVALID_GEOMETRY,
        severity: 'ERROR',
        message: `Coordinate at index ${i} in ring ${ringIndex} is invalid. Expected [lng, lat].`,
      });
      return;
    }

    const lng = pt[0];
    const lat = pt[1];

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      violations.push({
        code: Z_CODES.Z004_COORDINATE_OUT_OF_BOUNDS,
        severity: 'ERROR',
        message: `Coordinate at index ${i} in ring ${ringIndex} contains non-finite numbers.`,
      });
      return;
    }

    // Swapped coordinate detection: lat outside [-90, 90] but inside [-180, 180]
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
      violations.push({
        code: Z_CODES.Z004_COORDINATE_OUT_OF_BOUNDS,
        severity: 'ERROR',
        message: `Latitude ${lat} in ring ${ringIndex} is out of bounds [-90, 90]. Coordinates appear to be swapped with longitude.`,
      });
      return;
    }

    if (!isValidLongitude(lng)) {
      violations.push({
        code: Z_CODES.Z004_COORDINATE_OUT_OF_BOUNDS,
        severity: 'ERROR',
        message: `Longitude ${lng} in ring ${ringIndex} must be between -180 and 180.`,
      });
      return;
    }

    if (!isValidLatitude(lat)) {
      violations.push({
        code: Z_CODES.Z004_COORDINATE_OUT_OF_BOUNDS,
        severity: 'ERROR',
        message: `Latitude ${lat} in ring ${ringIndex} must be between -90 and 90.`,
      });
      return;
    }

    const pos: Position = [lng, lat];
    positions.push(pos);
    distinctSet.add(`${lng},${lat}`);
  }

  // Z-002: Ring closure
  const first = positions[0]!;
  const last = positions[positions.length - 1]!;
  if (Math.abs(first[0] - last[0]) > 1e-9 || Math.abs(first[1] - last[1]) > 1e-9) {
    violations.push({
      code: Z_CODES.Z002_RING_NOT_CLOSED,
      severity: 'ERROR',
      message: `Ring ${ringIndex} is not closed. The first coordinate [${first[0]}, ${first[1]}] must equal the last coordinate [${last[0]}, ${last[1]}].`,
    });
  }

  // Z-003: Minimum distinct vertices
  if (distinctSet.size < 3) {
    violations.push({
      code: Z_CODES.Z003_MINIMUM_VERTICES,
      severity: 'ERROR',
      message: `Ring ${ringIndex} must have at least 3 distinct vertices. Found ${distinctSet.size}.`,
    });
  }

  // Z-005: Self-intersection
  if (hasRingSelfIntersection(positions)) {
    violations.push({
      code: Z_CODES.Z005_SELF_INTERSECTION,
      severity: 'ERROR',
      message: `Ring ${ringIndex} has self-intersecting edges (bow-tie or crossing boundary).`,
    });
  }
}

/**
 * Validates a GeoJSON Polygon or MultiPolygon geometry against Z-001 through Z-006.
 */
export function validateGeometry(geometry: unknown): ZoneValidationResult {
  const violations: ZoneViolation[] = [];

  if (!geometry || typeof geometry !== 'object') {
    return {
      valid: false,
      violations: [
        {
          code: Z_CODES.Z001_INVALID_GEOMETRY,
          severity: 'ERROR',
          message: 'Geometry must be a valid GeoJSON object.',
        },
      ],
    };
  }

  const geom = geometry as Record<string, unknown>;

  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') {
    return {
      valid: false,
      violations: [
        {
          code: Z_CODES.Z006_UNSUPPORTED_GEOMETRY,
          severity: 'ERROR',
          message: `Geometry type "${String(geom.type)}" is unsupported. Only "Polygon" and "MultiPolygon" are supported.`,
        },
      ],
    };
  }

  if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
    return {
      valid: false,
      violations: [
        {
          code: Z_CODES.Z001_INVALID_GEOMETRY,
          severity: 'ERROR',
          message: 'Geometry coordinates array cannot be empty.',
        },
      ],
    };
  }

  if (geom.type === 'Polygon') {
    const polyCoords = geom.coordinates;
    for (let r = 0; r < polyCoords.length; r++) {
      validateRing(polyCoords[r], r, violations);
    }
  } else if (geom.type === 'MultiPolygon') {
    const multiCoords = geom.coordinates;
    for (let p = 0; p < multiCoords.length; p++) {
      const poly = multiCoords[p];
      if (!Array.isArray(poly) || poly.length === 0) {
        violations.push({
          code: Z_CODES.Z001_INVALID_GEOMETRY,
          severity: 'ERROR',
          message: `MultiPolygon polygon ${p} must contain at least one ring.`,
        });
        continue;
      }
      for (let r = 0; r < poly.length; r++) {
        validateRing(poly[r], r, violations);
      }
    }
  }

  // Z-MIN-AREA and Z-MAX-AREA checks
  if (violations.length === 0) {
    try {
      const areaM2 = computeGeometryAreaM2(geom as unknown as GeoJsonGeometry);
      if (areaM2 < MIN_ZONE_AREA_M2) {
        violations.push({
          code: Z_CODES.Z010_MIN_AREA,
          severity: 'ERROR',
          message: `Polygon area of ${(areaM2 / 10_000).toFixed(2)} hectares is below minimum operational threshold of 1 hectare (10,000 m²).`,
        });
      } else if (areaM2 > MAX_ZONE_AREA_M2) {
        violations.push({
          code: Z_CODES.Z011_MAX_AREA,
          severity: 'ERROR',
          message: `Polygon area of ${(areaM2 / 1_000_000).toFixed(0)} km² exceeds maximum operational ceiling of 100,000 km².`,
        });
      }
    } catch {
      // Ignore math errors if geometry was invalid
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Normalizes input GeoJSON from raw Geometry, Feature, or FeatureCollection into GeoJsonGeometry,
 * and enforces RFC 7946 winding order (CCW exterior ring, CW interior holes).
 */
export function normalizeGeoJson(input: unknown): GeoJsonGeometry {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid GeoJSON input: must be an object.');
  }

  const raw = input as Record<string, unknown>;

  if (raw.type === 'Polygon' || raw.type === 'MultiPolygon') {
    return ensureRfc7946Winding(raw as unknown as GeoJsonGeometry);
  }

  if (raw.type === 'Feature' && raw.geometry && typeof raw.geometry === 'object') {
    const geom = raw.geometry as Record<string, unknown>;
    if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      return ensureRfc7946Winding(geom as unknown as GeoJsonGeometry);
    }
    throw new Error(`Unsupported feature geometry type: ${String(geom.type)}`);
  }

  if (raw.type === 'FeatureCollection' && Array.isArray(raw.features) && raw.features.length > 0) {
    const validGeoms: GeoJsonGeometry[] = [];
    for (const f of raw.features) {
      if (f && typeof f === 'object' && f.geometry) {
        const g = f.geometry as Record<string, unknown>;
        if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
          validGeoms.push(g as unknown as GeoJsonGeometry);
        }
      }
    }

    if (validGeoms.length === 0) {
      throw new Error('FeatureCollection contains no Polygon or MultiPolygon features.');
    }

    if (validGeoms.length === 1) {
      return ensureRfc7946Winding(validGeoms[0]!);
    }

    // Merge multiple polygons into a MultiPolygon
    const multiCoords: Position[][][] = [];
    for (const g of validGeoms) {
      if (g.type === 'Polygon') {
        multiCoords.push(g.coordinates);
      } else {
        multiCoords.push(...g.coordinates);
      }
    }

    return ensureRfc7946Winding({
      type: 'MultiPolygon',
      coordinates: multiCoords,
    });
  }

  throw new Error(`Unsupported GeoJSON root type: ${String(raw.type)}`);
}
