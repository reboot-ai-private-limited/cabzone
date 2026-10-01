import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type {
  StateBoundaryEntity,
  StateBoundaryHistoryAction,
  StateBoundaryRepositoryPort,
  StateBoundaryStatus,
} from '../../domain/index.js';

export interface UpdateStateInput {
  stateCode: string;
  /** configVersion the admin last saw; a stale value is rejected with 409. */
  expectedVersion: number;
  stateName?: string | undefined;
  intrastateEnabled?: boolean | undefined;
  interstateDropOffEnabled?: boolean | undefined;
}

export class ManageStateUseCase {
  constructor(private readonly repo: StateBoundaryRepositoryPort) {}

  async get(stateCode: string): Promise<StateBoundaryEntity> {
    return this.require(stateCode);
  }

  async history(stateCode: string) {
    await this.require(stateCode);
    return this.repo.listHistory(stateCode);
  }

  async update(input: UpdateStateInput, actorId?: string | null): Promise<StateBoundaryEntity> {
    const current = await this.require(input.stateCode);
    this.assertVersion(current, input.expectedVersion);
    return this.persist(
      {
        ...current,
        stateName: input.stateName ?? current.stateName,
        intrastateEnabled: input.intrastateEnabled ?? current.intrastateEnabled,
        interstateDropOffEnabled: input.interstateDropOffEnabled ?? current.interstateDropOffEnabled,
      },
      'UPDATED',
      actorId,
    );
  }

  /** Disabling never deletes the boundary or its history; the state simply stops resolving. */
  async setStatus(
    stateCode: string,
    expectedVersion: number,
    status: StateBoundaryStatus,
    actorId?: string | null,
  ): Promise<StateBoundaryEntity> {
    const current = await this.require(stateCode);
    this.assertVersion(current, expectedVersion);
    if (current.status === status) return current;
    return this.persist(
      { ...current, status },
      status === 'ACTIVE' ? 'ACTIVATED' : 'DEACTIVATED',
      actorId,
    );
  }

  private async require(stateCode: string): Promise<StateBoundaryEntity> {
    const state = await this.repo.getByCode(stateCode);
    if (!state) throw AppError.notFound('State not found.');
    return state;
  }

  private versionConflict(currentVersion?: number): AppError {
    return AppError.conflict('VERSION_CONFLICT: this state was changed by someone else.', {
      code: 'VERSION_CONFLICT',
      ...(currentVersion === undefined ? {} : { currentVersion }),
    });
  }

  /** Early, friendly check; the repository's conditional write is what actually guarantees it. */
  private assertVersion(state: StateBoundaryEntity, expected: number): void {
    if (state.configVersion !== expected) throw this.versionConflict(state.configVersion);
  }

  private async persist(
    next: StateBoundaryEntity,
    action: StateBoundaryHistoryAction,
    actorId?: string | null,
  ): Promise<StateBoundaryEntity> {
    // Atomic: a concurrent edit that got in between our read and this write makes it a conflict.
    const saved = await this.repo.updateConfigIfVersion(next, next.configVersion);
    if (saved === null) throw this.versionConflict();
    await this.repo.appendHistory({
      id: newUuid(),
      stateCode: saved.stateCode,
      action,
      version: saved.version,
      configVersion: saved.configVersion,
      source: null,
      sourceVersion: null,
      previousGeometry: null,
      actorId: actorId ?? null,
      at: new Date(),
    });
    return saved;
  }
}
