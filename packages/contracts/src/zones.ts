/**
 * Geographic Zones and Contracts
 */
export * from '@cabzone/geo';
import type { GeoJsonGeometry, GeoJsonPolygon, GeoPoint, ZoneViolation } from '@cabzone/geo';

export const ZONE_TYPES = ['CITY'] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export const PICKUP_CHARGE_TYPES = ['FREE', 'PAID'] as const;
export type PickupChargeType = (typeof PICKUP_CHARGE_TYPES)[number];

export const ZONE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ZoneStatus = (typeof ZONE_STATUSES)[number];

export const ZONE_AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE_METADATA',
  'UPDATE_GEOMETRY',
  'ACTIVATE',
  'DEACTIVATE',
  'DELETE',
] as const;
export type ZoneAuditAction = (typeof ZONE_AUDIT_ACTIONS)[number];

export interface ZoneDto {
  id: string;
  name: string;
  code: string;
  type: ZoneType;
  zoneType: ZoneType; // backwards compatibility alias
  parentCityZoneId: string | null;
  parent_city_zone_id?: string | null;
  parent_zone_id?: string | null;
  stateCode: string;
  state_code?: string;
  geometry: GeoJsonGeometry;
  boundary: GeoJsonPolygon; // backwards compatibility alias
  bufferDistanceM: number | null;
  buffer_distance_m?: number | null;
  pickupChargeType?: PickupChargeType | null | undefined;
  pickup_charge_type?: PickupChargeType | null | undefined;
  pickupChargePaise?: number | null | undefined;
  pickup_charge_paise?: number | null | undefined;
  status: ZoneStatus;
  is_active?: boolean;
  priority?: number;
  currentPricingConfigId: string | null;
  version: number;
  supersedesZoneId: string | null;
  supersedes_zone_id?: string | null;
  supersededByZoneId: string | null;
  superseded_by_zone_id?: string | null;
  createdBy: string | null;
  created_by?: string | null;
  updatedBy: string | null;
  updated_by?: string | null;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
}

export interface IncityPackageDto {
  id: string;
  name: string;
  city_zone_id?: string;
  cityZoneId?: string;
  is_active?: boolean;
}

// Backward compatibility alias
export type CityZoneDto = ZoneDto;

export interface ResolvedZones {
  city: ZoneDto | null; // Origin city containing pickup
  destinationCity: ZoneDto | null; // Destination city containing drop
  isWithinBuffer: boolean; // Drop outside all cities but within origin city's buffer
  distanceToCityBoundaryM?: number | null;
  nearestCity: ZoneDto | null;
  pickupCoverage?: ZoneDto | null;
  dropHill?: ZoneDto | null;
  pickupChargePaise?: number;
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
  pickupChargeType?: PickupChargeType | null | undefined;
  pickupChargePaise?: number | null | undefined;
  currentPricingConfigId?: string | null | undefined;
}

export type CreateZoneRequest = CreateZoneInputDto;

export interface UpdateZoneMetadataRequest {
  name?: string | undefined;
  code?: string | undefined;
  stateCode?: string | undefined;
  parentCityZoneId?: string | null | undefined;
  bufferDistanceM?: number | null | undefined;
  pickupChargeType?: PickupChargeType | null | undefined;
  pickupChargePaise?: number | null | undefined;
  status?: ZoneStatus | undefined;
  currentPricingConfigId?: string | null | undefined;
}

export interface UpdateZoneInputDto extends UpdateZoneMetadataRequest {
  boundary?: GeoJsonPolygon | undefined;
  geometry?: GeoJsonGeometry | undefined;
}

export interface UpdateZoneGeometryRequest {
  expectedVersion?: number | undefined;
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

export type ListZonesQuery = ZoneListQuery;

export type ZoneViolationDto = ZoneViolation;

export interface ZoneListResponse {
  items: ZoneDto[];
  zones?: ZoneDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface ResolveZonesInputDto {
  pickup: GeoPoint;
  drop: GeoPoint;
  riderId?: string | undefined;
}

export interface CoverageRequestDto {
  id: string;
  lat: number;
  lng: number;
  riderId?: string | null | undefined;
  createdAt: string;
}

