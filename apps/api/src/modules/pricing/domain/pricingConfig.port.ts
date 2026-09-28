import type { VehicleCategory } from '@Cabzone/contracts';
import type { PricingConfigEntity } from './pricingConfig.entity.js';

export interface PricingConfigRepositoryPort {
  findEffectiveConfig(
    cityZoneId: string,
    vehicleCategory: VehicleCategory,
    now?: Date,
  ): Promise<PricingConfigEntity | null>;
  findById(id: string): Promise<PricingConfigEntity | null>;
  save(config: PricingConfigEntity): Promise<PricingConfigEntity>;
}
