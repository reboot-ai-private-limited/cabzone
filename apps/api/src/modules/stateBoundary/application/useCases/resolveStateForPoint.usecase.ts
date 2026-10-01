import type { GeoPoint } from '@cabzone/geo';
import type { StateBoundaryRepositoryPort } from '../../domain/index.js';

export interface ResolvedState {
  stateCode: string;
  stateName: string;
  boundaryVersion: number;
  /** Version of the admin-managed serviceability settings at resolution time. */
  configVersion: number;
  intrastateEnabled: boolean;
  interstateDropOffEnabled: boolean;
}

export class ResolveStateForPointUseCase {
  constructor(private readonly repo: StateBoundaryRepositoryPort) {}

  /** null = the point is outside every ACTIVE state boundary, i.e. not serviceable. */
  async execute(point: GeoPoint): Promise<ResolvedState | null> {
    const b = await this.repo.findContainingPoint(point);
    return b
      ? {
          stateCode: b.stateCode,
          stateName: b.stateName,
          boundaryVersion: b.version,
          configVersion: b.configVersion,
          intrastateEnabled: b.intrastateEnabled,
          interstateDropOffEnabled: b.interstateDropOffEnabled,
        }
      : null;
  }
}
