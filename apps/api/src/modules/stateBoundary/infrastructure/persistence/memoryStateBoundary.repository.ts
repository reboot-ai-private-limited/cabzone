import { isPointInGeometry, type GeoPoint } from '@cabzone/geo';
import type {
  StateBoundaryEntity,
  StateBoundaryHistoryEntry,
  StateBoundaryRepositoryPort,
} from '../../domain/index.js';

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

  async listAll(): Promise<StateBoundaryEntity[]> {
    return [...this.byCode.values()]
      .sort((a, b) => a.stateCode.localeCompare(b.stateCode))
      .map((b) => ({ ...b }));
  }

  async getByCode(stateCode: string): Promise<StateBoundaryEntity | null> {
    const b = this.byCode.get(stateCode.trim().toUpperCase());
    return b ? { ...b } : null;
  }

  private readonly history: StateBoundaryHistoryEntry[] = [];

  async appendHistory(entry: StateBoundaryHistoryEntry): Promise<void> {
    this.history.push({ ...entry });
  }

  async listHistory(stateCode: string): Promise<StateBoundaryHistoryEntry[]> {
    const code = stateCode.trim().toUpperCase();
    return this.history
      .filter((h) => h.stateCode === code)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map((h) => ({ ...h }));
  }

  async updateConfigIfVersion(
    next: StateBoundaryEntity,
    expectedConfigVersion: number,
  ): Promise<StateBoundaryEntity | null> {
    const current = this.byCode.get(next.stateCode);
    if (!current || current.configVersion !== expectedConfigVersion) return null;
    const updated: StateBoundaryEntity = {
      ...current,
      stateName: next.stateName,
      status: next.status,
      intrastateEnabled: next.intrastateEnabled,
      interstateDropOffEnabled: next.interstateDropOffEnabled,
      configVersion: expectedConfigVersion + 1,
      updatedAt: new Date(),
    };
    this.byCode.set(next.stateCode, updated);
    return { ...updated };
  }

  async upsertByCode(boundary: StateBoundaryEntity): Promise<StateBoundaryEntity> {
    this.byCode.set(boundary.stateCode, { ...boundary });
    return { ...boundary };
  }
}
