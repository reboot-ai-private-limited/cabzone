import type { GeoPoint, ZoneStatus, ZoneType } from '@cabzone/contracts';
import type { ZoneEntity } from './zone.entity.js';

export interface ZoneFilter {
  status?: ZoneStatus | undefined;
  zoneType?: ZoneType | undefined;
  parentCityZoneId?: string | null | undefined;
}

export interface ZoneRepositoryPort {
  findActiveExclusionsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]>;
  findActiveCitiesContainingPoint(point: GeoPoint): Promise<ZoneEntity[]>;
  findActivePickupsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]>;
  findNearestActiveCity(point: GeoPoint): Promise<ZoneEntity | null>;
  findById(id: string): Promise<ZoneEntity | null>;
  save(zone: ZoneEntity): Promise<ZoneEntity>;
  list(filter?: ZoneFilter): Promise<ZoneEntity[]>;
}
