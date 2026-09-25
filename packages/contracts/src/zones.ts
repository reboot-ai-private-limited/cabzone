/**
 * City Zones and Geographic Contracts
 */

export const ZONE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ZoneStatus = (typeof ZONE_STATUSES)[number];

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface CityZoneDto {
  id: string;
  cityName: string;
  stateCode: string;
  boundary: GeoJsonPolygon;
  bufferDistanceM: number | null;
  status: ZoneStatus;
  currentPricingConfigId: string | null;
  createdAt: string;
  updatedAt: string;
}
