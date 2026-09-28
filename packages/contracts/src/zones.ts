/**
 * Geographic Zones and Contracts
 */
export * from '@cabzone/geo';
import type { GeoJsonGeometry, GeoJsonPolygon, GeoPoint } from '@cabzone/geo';

export const ZONE_TYPES = ['CITY', 'PICKUP', 'EXCLUSION'] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export const ZONE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ZoneStatus = (typeof ZONE_STATUSES)[number];

export const ZONE_AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE_METADATA',
  'UPDATE_GEOMETRY',
  'ACTIVATE',
  'DEACTIVATE',
] as const;
export type ZoneAuditAction = (typeof ZONE_AUDIT_ACTIONS)[number];

export interface ZoneDto {
  id: string;
  name: string;
  code: string;
  type: ZoneType;
  zoneType: ZoneType; // backwards compatibility alias
  parentCityZoneId: string | null;
  stateCode: string;
  geometry: GeoJsonGeometry;
  boundary: GeoJsonPolygon; // backwards compatibility alias
  bufferDistanceM: number | null;
  status: ZoneStatus;
  currentPricingConfigId: string | null;
  version: number;
  supersedesZoneId: string | null;
  supersededByZoneId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// Backward compatibility alias
export type CityZoneDto = ZoneDto;

export interface ResolvedZones {
  pickupExclusion: ZoneDto | null;
  dropExclusion: ZoneDto | null;
  city: ZoneDto | null;
  pickupCoverage: ZoneDto | null;
  nearestCity: ZoneDto | null;
  isWithinBuffer: boolean;
}

export interface CreateZoneInputDto {
  name: string;
  code?: string | undefined;
  type?: ZoneType | undefined;
  zoneType?: ZoneType | undefined;
  parentCityZoneId?: string | null | undefined;
  stateCode: string;
  geometry?: GeoJsonGeometry | undefined;
  boundary?: GeoJsonPolygon | undefined;
  bufferDistanceM?: number | null | undefined;
  currentPricingConfigId?: string | null | undefined;
}

export type CreateZoneRequest = CreateZoneInputDto;

export interface UpdateZoneMetadataRequest {
  name?: string | undefined;
  code?: string | undefined;
  stateCode?: string | undefined;
  parentCityZoneId?: string | null | undefined;
  bufferDistanceM?: number | null | undefined;
  status?: ZoneStatus | undefined;
  currentPricingConfigId?: string | null | undefined;
}

export interface UpdateZoneInputDto extends UpdateZoneMetadataRequest {
  boundary?: GeoJsonPolygon | undefined;
  geometry?: GeoJsonGeometry | undefined;
}

export interface UpdateZoneGeometryRequest {
  expectedVersion: number;
  geometry: GeoJsonGeometry;
}

export interface ValidateZoneRequest {
  type: ZoneType;
  geometry: GeoJsonGeometry;
  excludeZoneId?: string | null | undefined;
}

export interface ZoneAuditDto {
  id: string;
  zoneId: string;
  action: ZoneAuditAction;
  actorId: string;
  before: unknown | null;
  after: unknown | null;
  reason?: string | null | undefined;
  createdAt: string;
}

export interface ZoneListQuery {
  type?: ZoneType | undefined;
  zoneType?: ZoneType | undefined;
  status?: ZoneStatus | undefined;
  parentCityZoneId?: string | undefined;
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface ZoneListResponse {
  items: ZoneDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface ResolveZonesInputDto {
  pickup: GeoPoint;
  drop: GeoPoint;
  throwOnExclusion?: boolean | undefined;
}
