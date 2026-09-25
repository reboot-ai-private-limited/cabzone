import type { GeoJsonPolygon, GeoPoint, ZoneDto, ZoneStatus, ZoneType } from '@cabzone/contracts';

export interface ZoneEntity {
  id: string;
  name: string;
  zoneType: ZoneType;
  parentCityZoneId: string | null;
  stateCode: string;
  boundary: GeoJsonPolygon;
  bufferDistanceM: number | null;
  status: ZoneStatus;
  currentPricingConfigId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function getEffectiveBufferDistance(
  zone: ZoneEntity,
  globalDefaultM: number = 20_000,
): number {
  return zone.bufferDistanceM ?? globalDefaultM;
}

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineDistanceM(p1: GeoPoint, p2: GeoPoint): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Standard ray-casting point-in-polygon algorithm for GeoJSON Polygon coordinates [lng, lat].
 */
export function isPointInPolygon(point: GeoPoint, polygon: GeoJsonPolygon): boolean {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) return false;

  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calculates minimum distance in meters from a point to a polygon boundary.
 * If point is inside polygon, returns 0.
 */
export function distanceToPolygonM(point: GeoPoint, polygon: GeoJsonPolygon): number {
  if (isPointInPolygon(point, polygon)) return 0;

  const ring = polygon.coordinates[0];
  if (!ring || ring.length === 0) return Infinity;

  let minDistance = Infinity;
  for (const vertex of ring) {
    const vPoint: GeoPoint = { lat: vertex[1]!, lng: vertex[0]! };
    const d = haversineDistanceM(point, vPoint);
    if (d < minDistance) minDistance = d;
  }

  return minDistance;
}

export function zoneEntityToDto(entity: ZoneEntity): ZoneDto {
  return {
    id: entity.id,
    name: entity.name,
    zoneType: entity.zoneType,
    parentCityZoneId: entity.parentCityZoneId,
    stateCode: entity.stateCode,
    boundary: entity.boundary,
    bufferDistanceM: entity.bufferDistanceM,
    status: entity.status,
    currentPricingConfigId: entity.currentPricingConfigId,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
