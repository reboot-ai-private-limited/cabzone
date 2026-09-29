import type { GeoPoint } from '@cabzone/geo';
import type { StateBoundaryEntity } from './stateBoundary.entity.js';

export interface StateBoundaryRepositoryPort {
  /** ACTIVE boundary containing the point, or null. Never guesses the nearest state. */
  findContainingPoint(point: GeoPoint): Promise<StateBoundaryEntity | null>;
  getActiveByCode(stateCode: string): Promise<StateBoundaryEntity | null>;
  listActive(): Promise<StateBoundaryEntity[]>;
  /** Insert or replace the boundary for its stateCode (one boundary per state). */
  upsertByCode(boundary: StateBoundaryEntity): Promise<StateBoundaryEntity>;
}
