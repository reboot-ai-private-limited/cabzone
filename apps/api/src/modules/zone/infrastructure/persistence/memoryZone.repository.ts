import type { GeoPoint } from '@Cabzone/contracts';
import type { ZoneEntity, ZoneFilter, ZoneRepositoryPort } from '../../domain/index.js';
import { distanceToPolygonM, isPointInGeometry } from '../../domain/index.js';

export class MemoryZoneRepository implements ZoneRepositoryPort {
  private readonly zones = new Map<string, ZoneEntity>();

  async findActiveExclusionsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const results: ZoneEntity[] = [];
    for (const zone of this.zones.values()) {
      if (zone.zoneType === 'EXCLUSION' && zone.status === 'ACTIVE') {
        const geom = zone.geometry ?? zone.boundary;
        if (geom && isPointInGeometry(point, geom)) {
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
        const geom = zone.geometry ?? zone.boundary;
        if (geom && isPointInGeometry(point, geom)) {
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
        const geom = zone.geometry ?? zone.boundary;
        if (geom && isPointInGeometry(point, geom)) {
          results.push({ ...zone });
        }
      }
    }
    return results;
  }

  async findActiveHillsContainingPoint(point: GeoPoint): Promise<ZoneEntity[]> {
    const results: ZoneEntity[] = [];
    for (const zone of this.zones.values()) {
      if (zone.zoneType === 'HILL' && zone.status === 'ACTIVE') {
        const geom = zone.geometry ?? zone.boundary;
        if (geom && isPointInGeometry(point, geom)) {
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
        const geom = zone.geometry ?? zone.boundary;
        if (geom) {
          const dist = distanceToPolygonM(point, geom);
          if (dist < minDistance) {
            minDistance = dist;
            nearest = zone;
          }
        }
      }
    }

    return nearest ? { ...nearest } : null;
  }

  async findById(id: string): Promise<ZoneEntity | null> {
    const zone = this.zones.get(id);
    return zone ? { ...zone } : null;
  }

  async findByCode(code: string): Promise<ZoneEntity | null> {
    const normalized = code.trim().toUpperCase();
    for (const zone of this.zones.values()) {
      const zoneCode = (zone.code ?? zone.id).toUpperCase();
      if (zoneCode === normalized) {
        return { ...zone };
      }
    }
    return null;
  }

  async save(zone: ZoneEntity): Promise<ZoneEntity> {
    const entity = {
      ...zone,
      code: zone.code ?? zone.id.substring(0, 8).toUpperCase(),
      geometry: zone.geometry ?? zone.boundary,
      boundary: zone.boundary ?? (zone.geometry as unknown as ZoneEntity['boundary']),
    };
    this.zones.set(zone.id, entity);
    return { ...entity };
  }

  async list(filter?: ZoneFilter): Promise<ZoneEntity[]> {
    const matched = this.filterZones(filter);
    return matched.map((z) => ({ ...z }));
  }

  async listPaginated(filter?: ZoneFilter): Promise<{ items: ZoneEntity[]; total: number }> {
    const matched = this.filterZones(filter);
    const total = matched.length;

    const page = Math.max(1, filter?.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter?.limit ?? 20));
    const offset = (page - 1) * limit;

    const items = matched.slice(offset, offset + limit).map((z) => ({ ...z }));
    return { items, total };
  }

  async findHistoryByZoneId(zoneId: string): Promise<ZoneEntity[]> {
    const target = this.zones.get(zoneId);
    if (!target) return [];

    // Find all versions sharing the same code or linked by supersedes/supersededBy
    const history: ZoneEntity[] = [];
    for (const zone of this.zones.values()) {
      if (zone.code === target.code || zone.id === target.id) {
        history.push({ ...zone });
      }
    }

    return history.sort((a, b) => b.version - a.version);
  }

  private filterZones(filter?: ZoneFilter): ZoneEntity[] {
    const targetType = filter?.type ?? filter?.zoneType;
    const search = filter?.search?.trim().toLowerCase();

    return Array.from(this.zones.values()).filter((z) => {
      if (filter?.status && z.status !== filter.status) return false;
      if (targetType && z.zoneType !== targetType) return false;
      if (filter?.parentCityZoneId !== undefined && z.parentCityZoneId !== filter.parentCityZoneId) {
        return false;
      }
      if (search) {
        const matchesName = z.name.toLowerCase().includes(search);
        const matchesCode = z.code.toLowerCase().includes(search);
        if (!matchesName && !matchesCode) return false;
      }
      return true;
    });
  }
}
