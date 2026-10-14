import type { PricingConfigDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import type { PricingConfigRepositoryPort } from '../../domain/index.js';
import { toPricingConfigDto } from './createPricingConfig.usecase.js';

export class ActivatePricingConfigUseCase {
  constructor(
    private readonly pricingConfigRepo: PricingConfigRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(id: string): Promise<PricingConfigDto> {
    return this.unitOfWork.run(() => this.activate(id));
  }

  private async activate(id: string): Promise<PricingConfigDto> {
    const config = await this.pricingConfigRepo.findById(id);
    if (!config) {
      throw AppError.notFound(`Pricing config ${id} not found`);
    }

    if (config.status === 'ACTIVE') {
      return toPricingConfigDto(config);
    }

    const now = new Date();
    const activeExisting = await this.pricingConfigRepo.findEffectiveConfig(
      {
        cityZoneId: config.cityZoneId,
        stateCode: config.stateCode,
      },
      config.vehicleType,
      now,
    );

    if (
      activeExisting &&
      activeExisting.id !== config.id &&
      activeExisting.level === config.level
    ) {
      activeExisting.status = 'RETIRED';
      activeExisting.effectiveTo = now;
      activeExisting.version += 1;
      await this.pricingConfigRepo.save(activeExisting, activeExisting.version - 1);
    }

    config.status = 'ACTIVE';
    config.effectiveFrom = now;
    config.effectiveTo = null;
    config.version += 1;

    const saved = await this.pricingConfigRepo.save(config, config.version - 1);
    return toPricingConfigDto(saved);
  }
}
