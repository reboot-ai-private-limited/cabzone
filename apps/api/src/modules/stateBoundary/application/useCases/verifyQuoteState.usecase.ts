import { AppError } from '../../../../shared/errors/AppError.js';
import type { StateBoundaryRepositoryPort } from '../../domain/index.js';

export interface VerifyQuoteStateInput {
  destinationStateCode: string | null | undefined;
  routeScope: 'INTRA_STATE' | 'INTERSTATE' | null | undefined;
}

/**
 * Re-checks, at ride creation, that the destination state a quote was priced against is still
 * serviceable under the CURRENT settings. A quote lives for minutes; an admin can disable a state
 * or one of its serviceability flags in that window.
 *
 * It checks current rules, not that the state is unchanged: an unrelated edit (a rename, say)
 * must not invalidate a quote.
 */
export class VerifyQuoteStateUseCase {
  constructor(private readonly repo: StateBoundaryRepositoryPort) {}

  async execute(input: VerifyQuoteStateInput): Promise<void> {
    // Quotes issued before state data was snapshotted carry no state; nothing to verify.
    if (!input.destinationStateCode) return;

    const state = await this.repo.getByCode(input.destinationStateCode);
    if (!state || state.status !== 'ACTIVE') {
      throw AppError.conflict(
        'DESTINATION_NOT_SERVICEABLE: The destination is no longer in our service area. Please fetch a fresh quote.',
      );
    }
    if (input.routeScope === 'INTRA_STATE' && !state.intrastateEnabled) {
      throw AppError.conflict(
        'INTRASTATE_SERVICE_DISABLED: Outstation trips within this state are not available right now.',
      );
    }
    if (input.routeScope === 'INTERSTATE' && !state.interstateDropOffEnabled) {
      throw AppError.conflict(
        'INTERSTATE_SERVICE_DISABLED: Drop-offs in the destination state are not available right now.',
      );
    }
  }
}
