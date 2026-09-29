import type { PricingConfigStatus, VehicleCategory } from '@cabzone/contracts';
import type { PricingConfigEntity } from './pricingConfig.entity.js';

export interface PricingConfigFilter {
  cityZoneId?: string | undefined;
  vehicleType?: VehicleCategory | undefined;
  status?: PricingConfigStatus | undefined;
}

export interface PricingConfigRepositoryPort {
  findEffectiveConfig(
    cityZoneId: string,
    vehicleCategory: VehicleCategory,
    now?: Date,
  ): Promise<PricingConfigEntity | null>;
  findById(id: string): Promise<PricingConfigEntity | null>;
  save(config: PricingConfigEntity): Promise<PricingConfigEntity>;
  findConfigs(filter?: PricingConfigFilter): Promise<PricingConfigEntity[]>;
  findLatestVersion(cityZoneId: string, vehicleCategory: VehicleCategory): Promise<number>;
  delete(id: string): Promise<void>;
}
