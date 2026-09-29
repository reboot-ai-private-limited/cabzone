import type { PricingConfigDto, UpdatePricingConfigRequest } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { PricingConfigRepositoryPort } from '../../domain/index.js';
import { toPricingConfigDto } from './createPricingConfig.usecase.js';

export class UpdatePricingConfigUseCase {
  constructor(private readonly pricingConfigRepo: PricingConfigRepositoryPort) {}

  async execute(id: string, patch: UpdatePricingConfigRequest): Promise<PricingConfigDto> {
    const config = await this.pricingConfigRepo.findById(id);
    if (!config) {
      throw AppError.notFound(`Pricing config ${id} not found`);
    }

    const baseFarePaise = patch.baseFarePaise ?? config.baseFarePaise;
    const minimumFarePaise = patch.minimumFarePaise ?? config.minimumFarePaise;
    if (minimumFarePaise < baseFarePaise) {
      throw AppError.badRequest('minimumFarePaise must be greater than or equal to baseFarePaise');
    }

    const negotiationFloorPercent = patch.negotiationFloorPercent ?? config.negotiationFloorPercent;
    const negotiationCeilingPercent =
      patch.negotiationCeilingPercent ?? config.negotiationCeilingPercent;
    if (negotiationCeilingPercent < negotiationFloorPercent) {
      throw AppError.badRequest(
        'negotiationCeilingPercent must be greater than or equal to negotiationFloorPercent',
      );
    }

    config.baseFarePaise = baseFarePaise;
    config.ratePerKmPaise = patch.ratePerKmPaise ?? config.ratePerKmPaise;
    config.minimumFarePaise = minimumFarePaise;
    config.includedDistanceM = patch.includedDistanceM ?? config.includedDistanceM;
    config.bufferSurchargePaise = patch.bufferSurchargePaise ?? config.bufferSurchargePaise;
    config.negotiationFloorPercent = negotiationFloorPercent;
    config.negotiationCeilingPercent = negotiationCeilingPercent;
    config.negotiationWindowSeconds = patch.negotiationWindowSeconds ?? config.negotiationWindowSeconds;
    config.commissionPercent = patch.commissionPercent ?? config.commissionPercent;
    config.effectiveFrom = patch.effectiveFrom ? new Date(patch.effectiveFrom) : config.effectiveFrom;

    const saved = await this.pricingConfigRepo.save(config);
    return toPricingConfigDto(saved);
  }
}
