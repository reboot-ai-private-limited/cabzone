/**
 * Geographic Zones and Contracts
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export const ZONE_TYPES = ['CITY', 'PICKUP', 'EXCLUSION'] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export const ZONE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ZoneStatus = (typeof ZONE_STATUSES)[number];

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface ZoneDto {
  id: string;
  name: string;
  zoneType: ZoneType;
  parentCityZoneId: string | null;
  stateCode: string;
  boundary: GeoJsonPolygon;
  bufferDistanceM: number | null;
  status: ZoneStatus;
  currentPricingConfigId: string | null;
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
  zoneType: ZoneType;
  parentCityZoneId?: string | null | undefined;
  stateCode: string;
  boundary: GeoJsonPolygon;
  bufferDistanceM?: number | null | undefined;
  currentPricingConfigId?: string | null | undefined;
}

export interface UpdateZoneInputDto {
  name?: string | undefined;
  parentCityZoneId?: string | null | undefined;
  boundary?: GeoJsonPolygon | undefined;
  bufferDistanceM?: number | null | undefined;
  status?: ZoneStatus | undefined;
  currentPricingConfigId?: string | null | undefined;
}

export interface ResolveZonesInputDto {
  pickup: GeoPoint;
  drop: GeoPoint;
  throwOnExclusion?: boolean | undefined;
}

