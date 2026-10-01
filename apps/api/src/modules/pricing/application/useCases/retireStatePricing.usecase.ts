import type { StatePricingDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { StatePricingRepositoryPort } from '../../domain/index.js';
import { toStatePricingDto } from './createStatePricing.usecase.js';

export class RetireStatePricingUseCase {
  constructor(private readonly statePricingRepo: StatePricingRepositoryPort) {}

  async execute(id: string, expectedVersion: number): Promise<StatePricingDto> {
    const existing = await this.statePricingRepo.findById(id);
    if (!existing) {
      throw AppError.notFound('State pricing not found.');
    }
    if (existing.version !== expectedVersion) {
      throw AppError.conflict('VERSION_CONFLICT: State pricing was modified by someone else.', {
        code: 'VERSION_CONFLICT',
        currentVersion: existing.version,
      });
    }

    const retired = await this.statePricingRepo.retire(id, expectedVersion);
    if (!retired) {
      throw AppError.conflict('VERSION_CONFLICT: State pricing was modified by someone else.');
    }

    return toStatePricingDto(retired);
  }
}

