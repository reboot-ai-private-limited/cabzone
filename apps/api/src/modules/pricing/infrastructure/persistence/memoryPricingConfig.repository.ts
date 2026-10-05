import type { PricingConfigLevel, VehicleCategory } from '@cabzone/contracts';
import type {
  EffectivePricingTarget,
  PricingConfigEntity,
  PricingConfigFilter,
  PricingConfigRepositoryPort,
} from '../../domain/index.js';
import { isPricingConfigEffective } from '../../domain/index.js';

export class MemoryPricingConfigRepository implements PricingConfigRepositoryPort {
  private readonly configs = new Map<string, PricingConfigEntity>();

  async findEffectiveConfig(
    target: string | EffectivePricingTarget,
    vehicleCategory: VehicleCategory,
    now: Date = new Date(),
  ): Promise<PricingConfigEntity | null> {
    const cityZoneId = typeof target === 'string' ? target : target.cityZoneId;
    const stateCode = typeof target === 'object' ? target.stateCode : undefined;

    // 1. City Zone level override
    if (cityZoneId) {
      for (const config of this.configs.values()) {
        if (
          config.cityZoneId === cityZoneId &&
          config.vehicleType === vehicleCategory &&
          isPricingConfigEffective(config, now)
        ) {
          return { ...config };
        }
      }
    }

    // 2. State level pricing
    if (stateCode) {
      for (const config of this.configs.values()) {
        if (
          config.level === 'STATE' &&
          config.stateCode?.toUpperCase() === stateCode.toUpperCase() &&
          config.vehicleType === vehicleCategory &&
          isPricingConfigEffective(config, now)
        ) {
          return { ...config };
        }
      }
    }

    // 3. Global baseline pricing
    for (const config of this.configs.values()) {
      if (
        config.level === 'GLOBAL' &&
        config.vehicleType === vehicleCategory &&
        isPricingConfigEffective(config, now)
      ) {
        return { ...config };
      }
    }

    return null;
  }

  async findEffectiveConfigByState(
    stateCode: string,
    vehicleCategory: VehicleCategory,
    now: Date = new Date(),
  ): Promise<PricingConfigEntity | null> {
    // 1. State level
    for (const config of this.configs.values()) {
      if (
        config.level === 'STATE' &&
        config.stateCode?.toUpperCase() === stateCode.toUpperCase() &&
        config.vehicleType === vehicleCategory &&
        isPricingConfigEffective(config, now)
      ) {
        return { ...config };
      }
    }

    // 2. Global fallback
    for (const config of this.configs.values()) {
      if (
        config.level === 'GLOBAL' &&
        config.vehicleType === vehicleCategory &&
        isPricingConfigEffective(config, now)
      ) {
        return { ...config };
      }
    }

    return null;
  }

  async findById(id: string): Promise<PricingConfigEntity | null> {
    const config = this.configs.get(id);
    return config ? { ...config } : null;
  }

  async save(config: PricingConfigEntity): Promise<PricingConfigEntity> {
    this.configs.set(config.id, { ...config });
    return { ...config };
  }

  async findConfigs(filter?: PricingConfigFilter): Promise<PricingConfigEntity[]> {
    const list = Array.from(this.configs.values());
    return list
      .filter((c) => {
        if (filter?.level && c.level !== filter.level) return false;
        if (filter?.cityZoneId && c.cityZoneId !== filter.cityZoneId) return false;
        if (filter?.stateCode && c.stateCode?.toUpperCase() !== filter.stateCode.toUpperCase()) return false;
        if (filter?.vehicleType && c.vehicleType !== filter.vehicleType) return false;
        if (filter?.status && c.status !== filter.status) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findLatestVersion(
    target: string | { cityZoneId?: string | null; stateCode?: string | null; level?: PricingConfigLevel },
    vehicleCategory: VehicleCategory,
  ): Promise<number> {
    const cityZoneId = typeof target === 'string' ? target : target.cityZoneId;
    const stateCode = typeof target === 'object' ? target.stateCode : undefined;
    const level = typeof target === 'object' ? target.level : undefined;

    let max = 0;
    for (const config of this.configs.values()) {
      if (config.vehicleType !== vehicleCategory) continue;

      if (level === 'GLOBAL') {
        if (config.level === 'GLOBAL' && config.version > max) max = config.version;
      } else if (stateCode || level === 'STATE') {
        if (config.level === 'STATE' && config.stateCode?.toUpperCase() === stateCode?.toUpperCase() && config.version > max) {
          max = config.version;
        }
      } else if (cityZoneId) {
        if (config.cityZoneId === cityZoneId && config.version > max) max = config.version;
      }
    }
    return max;
  }

  async delete(id: string): Promise<void> {
    this.configs.delete(id);
  }
}

