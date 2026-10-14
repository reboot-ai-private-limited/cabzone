import type { ListPricingConfigsQuery, PricingConfigDto } from '@cabzone/contracts';
import type { PricingConfigRepositoryPort } from '../../domain/index.js';
import { toPricingConfigDto } from './createPricingConfig.usecase.js';

export class ListPricingConfigsUseCase {
  constructor(private readonly pricingConfigRepo: PricingConfigRepositoryPort) {}

  async execute(query?: ListPricingConfigsQuery, allowedCityZoneIds?: string[]): Promise<PricingConfigDto[]> {
    const filter = {
      allowedCityZoneIds,
      level: query?.level,
      cityZoneId: query?.cityZoneId,
      stateCode: query?.stateCode,
      vehicleType: query?.vehicleType,
      status: query?.status,
    };
    const configs = await this.pricingConfigRepo.findConfigs(filter);
    return configs.map(toPricingConfigDto);
  }
}
