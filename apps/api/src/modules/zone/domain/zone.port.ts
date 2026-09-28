import type { GeoPoint, ZoneStatus, ZoneType } from '@cabzone/contracts';
import type { ZoneEntity } from './zone.entity.js';

export interface ZoneFilter {
  status?: ZoneStatus | undefined;
  zoneType?: ZoneType | undefined;
  type?: ZoneType | undefined;
  parentCityZoneId?: string | null | undefined;
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface ZoneRepositoryPort {
  findActiveExclusionsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]>;
  findActiveCitiesContainingPoint(point: GeoPoint): Promise<ZoneEntity[]>;
  findActivePickupsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]>;
  findNearestActiveCity(point: GeoPoint): Promise<ZoneEntity | null>;
  findById(id: string): Promise<ZoneEntity | null>;
  findByCode(code: string): Promise<ZoneEntity | null>;
  save(zone: ZoneEntity): Promise<ZoneEntity>;
  list(filter?: ZoneFilter): Promise<ZoneEntity[]>;
  listPaginated?(filter?: ZoneFilter): Promise<{ items: ZoneEntity[]; total: number }>;
  findHistoryByZoneId?(zoneId: string): Promise<ZoneEntity[]>;
}
