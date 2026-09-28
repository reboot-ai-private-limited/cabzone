import type { GeoJsonPolygon, ZoneStatus } from '@Cabzone/contracts';

export interface CityZoneEntity {
  id: string;
  cityName: string;
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
  zone: CityZoneEntity,
  globalDefaultM: number = 20_000,
): number {
  return zone.bufferDistanceM ?? globalDefaultM;
}
