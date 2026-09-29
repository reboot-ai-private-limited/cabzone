import type { VehicleCategory } from '@cabzone/contracts';
import type {
  PricingConfigEntity,
  PricingConfigFilter,
  PricingConfigRepositoryPort,
} from '../../domain/index.js';
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

  async findConfigs(filter?: PricingConfigFilter): Promise<PricingConfigEntity[]> {
    const list = Array.from(this.configs.values());
    return list
      .filter((c) => {
        if (filter?.cityZoneId && c.cityZoneId !== filter.cityZoneId) return false;
        if (filter?.vehicleType && c.vehicleType !== filter.vehicleType) return false;
        if (filter?.status && c.status !== filter.status) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findLatestVersion(cityZoneId: string, vehicleCategory: VehicleCategory): Promise<number> {
    let max = 0;
    for (const config of this.configs.values()) {
      if (config.cityZoneId === cityZoneId && config.vehicleType === vehicleCategory) {
        if (config.version > max) max = config.version;
      }
    }
    return max;
  }

  async delete(id: string): Promise<void> {
    this.configs.delete(id);
  }
}
