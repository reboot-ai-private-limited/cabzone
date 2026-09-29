import type { PricingConfigDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { PricingConfigRepositoryPort } from '../../domain/index.js';
import { toPricingConfigDto } from './createPricingConfig.usecase.js';

export class ActivatePricingConfigUseCase {
  constructor(private readonly pricingConfigRepo: PricingConfigRepositoryPort) {}

  async execute(id: string): Promise<PricingConfigDto> {
    const config = await this.pricingConfigRepo.findById(id);
    if (!config) {
      throw AppError.notFound(`Pricing config ${id} not found`);
    }

    if (config.status === 'ACTIVE') {
      return toPricingConfigDto(config);
    }

    const now = new Date();
    const activeExisting = await this.pricingConfigRepo.findEffectiveConfig(
      config.cityZoneId,
      config.vehicleType,
      now,
    );

    if (activeExisting && activeExisting.id !== config.id) {
      activeExisting.status = 'RETIRED';
      activeExisting.effectiveTo = now;
      await this.pricingConfigRepo.save(activeExisting);
    }

    config.status = 'ACTIVE';
    config.effectiveFrom = now;
    config.effectiveTo = null;

    const saved = await this.pricingConfigRepo.save(config);
    return toPricingConfigDto(saved);
  }
}
