import type { VehicleCategory } from '@cabzone/contracts';
import type { PricingConfigEntity, PricingConfigRepositoryPort } from '../../domain/index.js';
import { isPricingConfigEffective } from '../../domain/index.js';

export class MemoryPricingConfigRepository implements PricingConfigRepositoryPort {
  private readonly configs = new Map<string, PricingConfigEntity>();

  async findEffectiveConfig(
    cityZoneId: string,
    vehicleCategory: VehicleCategory,
    now: Date = new Date(),
  ): Promise<PricingConfigEntity | null> {
    for (const config of this.configs.values()) {
      if (
        config.cityZoneId === cityZoneId &&
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
}
