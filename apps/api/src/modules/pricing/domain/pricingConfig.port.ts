import type { PricingConfigLevel, PricingConfigStatus, VehicleCategory } from '@cabzone/contracts';
import type { PricingConfigEntity } from './pricingConfig.entity.js';

export interface PricingConfigFilter {
  allowedCityZoneIds?: string[] | undefined;
  level?: PricingConfigLevel | undefined;
  cityZoneId?: string | undefined;
  stateCode?: string | undefined;
  vehicleType?: VehicleCategory | undefined;
  status?: PricingConfigStatus | undefined;
}

export interface EffectivePricingTarget {
  cityZoneId?: string | null | undefined;
  stateCode?: string | null | undefined;
}

export interface PricingConfigRepositoryPort {
  findEffectiveConfig(
    target: string | EffectivePricingTarget,
    vehicleCategory: VehicleCategory,
    now?: Date,
  ): Promise<PricingConfigEntity | null>;
  findEffectiveConfigByState(
    stateCode: string,
    vehicleCategory: VehicleCategory,
    now?: Date,
  ): Promise<PricingConfigEntity | null>;
  findById(id: string): Promise<PricingConfigEntity | null>;
  save(config: PricingConfigEntity, expectedVersion?: number): Promise<PricingConfigEntity>;
  findConfigs(filter?: PricingConfigFilter): Promise<PricingConfigEntity[]>;
  findLatestVersion(
    target: string | { cityZoneId?: string | null; stateCode?: string | null; level?: PricingConfigLevel },
    vehicleCategory: VehicleCategory,
  ): Promise<number>;
  delete(id: string): Promise<void>;
}

