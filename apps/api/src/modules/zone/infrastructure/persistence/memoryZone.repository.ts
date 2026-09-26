import type { GeoPoint } from '@cabzone/contracts';
import type { ZoneEntity, ZoneFilter, ZoneRepositoryPort } from '../../domain/index.js';
import { distanceToPolygonM, isPointInPolygon } from '../../domain/index.js';

export class MemoryZoneRepository implements ZoneRepositoryPort {
  private readonly zones = new Map<string, ZoneEntity>();

  async findActiveExclusionsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const results: ZoneEntity[] = [];
    for (const zone of this.zones.values()) {
      if (zone.zoneType === 'EXCLUSION' && zone.status === 'ACTIVE') {
        if (isPointInPolygon(point, zone.boundary)) {
          results.push({ ...zone });
        }
      }
    }
    return results;
  }

  async findActiveCitiesContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const results: ZoneEntity[] = [];
    for (const zone of this.zones.values()) {
      if (zone.zoneType === 'CITY' && zone.status === 'ACTIVE') {
        if (isPointInPolygon(point, zone.boundary)) {
          results.push({ ...zone });
        }
      }
    }
    return results;
  }

  async findActivePickupsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const results: ZoneEntity[] = [];
    for (const zone of this.zones.values()) {
      if (zone.zoneType === 'PICKUP' && zone.status === 'ACTIVE') {
        if (isPointInPolygon(point, zone.boundary)) {
          results.push({ ...zone });
        }
      }
    }
    return results;
  }

  async findNearestActiveCity(point: GeoPoint): Promise<ZoneEntity | null> {
    let nearest: ZoneEntity | null = null;
    let minDistance = Infinity;

    for (const zone of this.zones.values()) {
      if (zone.zoneType === 'CITY' && zone.status === 'ACTIVE') {
        const dist = distanceToPolygonM(point, zone.boundary);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = zone;
        }
      }
    }

    return nearest ? { ...nearest } : null;
  }

  async findById(id: string): Promise<ZoneEntity | null> {
    const zone = this.zones.get(id);
    return zone ? { ...zone } : null;
  }

  async save(zone: ZoneEntity): Promise<ZoneEntity> {
    const entity = { ...zone };
    this.zones.set(zone.id, entity);
    return { ...entity };
  }

  async list(filter?: ZoneFilter): Promise<ZoneEntity[]> {
    return Array.from(this.zones.values()).filter((z) => {
      if (filter?.status && z.status !== filter.status) return false;
      if (filter?.zoneType && z.zoneType !== filter.zoneType) return false;
      if (filter?.parentCityZoneId !== undefined && z.parentCityZoneId !== filter.parentCityZoneId) {
        return false;
      }
      return true;
    });
  }
}
