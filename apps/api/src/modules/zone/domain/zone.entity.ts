import type {
  GeoJsonGeometry,
  GeoJsonPolygon,
  ZoneDto,
  ZoneStatus,
  ZoneType,
} from '@cabzone/contracts';
export {
  distancePointToSegmentM,
  distanceToPolygonM,
  doBoundingBoxesOverlap,
  doSegmentsIntersect,
  fromPosition,
  getBoundingBox,
  getCentroid,
  haversineDistanceM,
  hasRingSelfIntersection,
  isPointInGeometry,
  isPointInMultiPolygon,
  isPointInPolygon,
  normalizeGeoJson,
  toGeoJsonPoint,
  toPosition,
  validateCoordinates,
  validateGeometry,
  Z_CODES,
} from '@cabzone/geo';

export interface ZoneEntity {
  id: string;
  name: string;
  code: string;
  zoneType: ZoneType;
  type?: ZoneType;
  parentCityZoneId: string | null;
  stateCode: string;
  geometry: GeoJsonGeometry;
  boundary: GeoJsonPolygon;
  bufferDistanceM: number | null;
  pickupChargeType?: 'FREE' | 'PAID' | null | undefined;
  pickupChargePaise?: number | null | undefined;
  status: ZoneStatus;
  currentPricingConfigId: string | null;
  version: number;
  supersedesZoneId: string | null;
  supersededByZoneId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function getEffectiveBufferDistance(
  zone: ZoneEntity,
  globalDefaultM: number = 20_000,
): number {
  return zone.bufferDistanceM ?? globalDefaultM;
}

export function zoneEntityToDto(entity: ZoneEntity): ZoneDto {
  const geom = entity.geometry ?? entity.boundary;
  const boundaryPoly: GeoJsonPolygon =
    geom.type === 'Polygon'
      ? geom
      : {
          type: 'Polygon',
          coordinates: (geom.coordinates[0] as GeoJsonPolygon['coordinates']) ?? [],
        };

  return {
    id: entity.id,
    name: entity.name,
    code: entity.code ?? entity.id.substring(0, 8).toUpperCase(),
    type: entity.zoneType,
    zoneType: entity.zoneType,
    parentCityZoneId: entity.parentCityZoneId,
    stateCode: entity.stateCode,
    geometry: geom,
    boundary: boundaryPoly,
    bufferDistanceM: entity.bufferDistanceM,
    pickupChargeType: entity.pickupChargeType ?? (entity.zoneType === 'PICKUP' ? 'FREE' : null),
    pickupChargePaise: entity.pickupChargePaise ?? null,
    status: entity.status,
    currentPricingConfigId: entity.currentPricingConfigId,
    version: entity.version,
    supersedesZoneId: entity.supersedesZoneId ?? null,
    supersededByZoneId: entity.supersededByZoneId ?? null,
    createdBy: entity.createdBy ?? null,
    updatedBy: entity.updatedBy ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
