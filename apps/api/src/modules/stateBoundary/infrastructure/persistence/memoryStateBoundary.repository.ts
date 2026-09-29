import { isPointInGeometry, type GeoPoint } from '@cabzone/geo';
import type { StateBoundaryEntity, StateBoundaryRepositoryPort } from '../../domain/index.js';

export class MemoryStateBoundaryRepository implements StateBoundaryRepositoryPort {
  private readonly byCode = new Map<string, StateBoundaryEntity>();

  async findContainingPoint(point: GeoPoint): Promise<StateBoundaryEntity | null> {
    for (const b of this.byCode.values()) {
      if (b.status === 'ACTIVE' && isPointInGeometry(point, b.geometry)) return { ...b };
    }
    return null;
  }

  async getActiveByCode(stateCode: string): Promise<StateBoundaryEntity | null> {
    const b = this.byCode.get(stateCode.trim().toUpperCase());
    return b && b.status === 'ACTIVE' ? { ...b } : null;
  }

  async listActive(): Promise<StateBoundaryEntity[]> {
    return [...this.byCode.values()].filter((b) => b.status === 'ACTIVE').map((b) => ({ ...b }));
  }

  async upsertByCode(boundary: StateBoundaryEntity): Promise<StateBoundaryEntity> {
    this.byCode.set(boundary.stateCode, { ...boundary });
    return { ...boundary };
  }
}
