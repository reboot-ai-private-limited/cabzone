import type { GeoPoint } from '@cabzone/geo';
import type { StateBoundaryEntity, StateBoundaryHistoryEntry } from './stateBoundary.entity.js';

export interface StateBoundaryRepositoryPort {
  /** ACTIVE boundary containing the point, or null. Never guesses the nearest state. */
  findContainingPoint(point: GeoPoint): Promise<StateBoundaryEntity | null>;
  getActiveByCode(stateCode: string): Promise<StateBoundaryEntity | null>;
  listActive(): Promise<StateBoundaryEntity[]>;
  /** Any status, for admin screens. */
  listAll(): Promise<StateBoundaryEntity[]>;
  /** Any status. */
  getByCode(stateCode: string): Promise<StateBoundaryEntity | null>;
  appendHistory(entry: StateBoundaryHistoryEntry): Promise<void>;
  listHistory(stateCode: string): Promise<StateBoundaryHistoryEntry[]>;
  /** Insert or replace the boundary for its stateCode (one boundary per state). */
  upsertByCode(boundary: StateBoundaryEntity): Promise<StateBoundaryEntity>;
  /**
   * Atomic admin edit: applies name, status and serviceability flags and bumps `configVersion`,
   * but only if the stored `configVersion` still equals `expectedConfigVersion`. Never touches the
   * geometry. Returns null when the version no longer matches (someone else changed the state).
   */
  updateConfigIfVersion(
    next: StateBoundaryEntity,
    expectedConfigVersion: number,
  ): Promise<StateBoundaryEntity | null>;
}
