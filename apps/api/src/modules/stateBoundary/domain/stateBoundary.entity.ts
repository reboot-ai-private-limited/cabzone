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
  version: number;
  status: StateBoundaryStatus;
  source: string;
  sourceVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** States Cabzone launches in. Everything else is marked not serviceable for now. */
export const LAUNCH_STATE_CODES = ['WB', 'BR', 'SK', 'AS'] as const;
