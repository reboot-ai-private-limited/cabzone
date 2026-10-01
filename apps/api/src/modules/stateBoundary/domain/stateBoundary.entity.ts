import type { GeoJsonGeometry } from '@cabzone/geo';

export type StateBoundaryStatus = 'ACTIVE' | 'INACTIVE';

/**
 * Reference GIS data, not an operational Zone. A state is serviceable if and only if it has an
 * ACTIVE boundary here; anything outside these boundaries is NOT_SERVICEABLE.
 */
export interface StateBoundaryEntity {
  id: string;
  stateCode: string;
  stateName: string;
  geometry: GeoJsonGeometry;
  /** Boundary version: bumped only when the geometry is replaced by an import. */
  version: number;
  /** Bumped on every admin edit/enable/disable; used for optimistic concurrency. */
  configVersion: number;
  status: StateBoundaryStatus;
  intrastateEnabled: boolean;
  interstateDropOffEnabled: boolean;
  source: string;
  sourceVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type StateBoundaryHistoryAction = 'IMPORTED' | 'UPDATED' | 'ACTIVATED' | 'DEACTIVATED';

/** Append-only audit of a state. A replaced border is kept here, never silently overwritten. */
export interface StateBoundaryHistoryEntry {
  id: string;
  stateCode: string;
  action: StateBoundaryHistoryAction;
  version: number;
  configVersion: number;
  source: string | null;
  sourceVersion: string | null;
  /** The geometry that was replaced (IMPORTED over an existing border only). */
  previousGeometry: GeoJsonGeometry | null;
  actorId?: string | null;
  at: Date;
}

/** States that are serviceable as soon as they are imported. Any other state is imported disabled. */
export const LAUNCH_STATE_CODES = ['WB', 'BR', 'SK', 'AS'] as const;
