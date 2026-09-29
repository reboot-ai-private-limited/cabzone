import type {
  CreatePricingConfigRequest,
  PricingConfigDto,
} from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import type {
  PricingConfigEntity,
  PricingConfigRepositoryPort,
} from '../../domain/index.js';

export function toPricingConfigDto(entity: PricingConfigEntity): PricingConfigDto {
  return {
    id: entity.id,
    cityZoneId: entity.cityZoneId,
    version: entity.version,
    vehicleType: entity.vehicleType,
    baseFarePaise: entity.baseFarePaise,
    ratePerKmPaise: entity.ratePerKmPaise,
    minimumFarePaise: entity.minimumFarePaise,
    includedDistanceM: entity.includedDistanceM,
    bufferSurchargePaise: entity.bufferSurchargePaise,
    negotiationFloorPercent: entity.negotiationFloorPercent,
    negotiationCeilingPercent: entity.negotiationCeilingPercent,
    negotiationWindowSeconds: entity.negotiationWindowSeconds,
    commissionPercent: entity.commissionPercent,
    effectiveFrom: entity.effectiveFrom.toISOString(),
    effectiveTo: entity.effectiveTo ? entity.effectiveTo.toISOString() : null,
    status: entity.status,
    createdByAdminId: entity.createdByAdminId,
    createdAt: entity.createdAt.toISOString(),
  };
}

export class CreatePricingConfigUseCase {
  constructor(private readonly pricingConfigRepo: PricingConfigRepositoryPort) {}

  async execute(input: CreatePricingConfigRequest, adminId: string): Promise<PricingConfigDto> {
    const latestVersion = await this.pricingConfigRepo.findLatestVersion(
      input.cityZoneId,
      input.vehicleType,
    );
    const newVersion = latestVersion + 1;
    const now = new Date();
    const status = input.status ?? 'DRAFT';

    if (status === 'ACTIVE') {
      const activeExisting = await this.pricingConfigRepo.findEffectiveConfig(
        input.cityZoneId,
        input.vehicleType,
        now,
      );
      if (activeExisting) {
        activeExisting.status = 'RETIRED';
        activeExisting.effectiveTo = now;
        await this.pricingConfigRepo.save(activeExisting);
      }
    }

    const config: PricingConfigEntity = {
      id: newUuid(),
      cityZoneId: input.cityZoneId,
      version: newVersion,
      vehicleType: input.vehicleType,
      baseFarePaise: input.baseFarePaise,
      ratePerKmPaise: input.ratePerKmPaise,
      minimumFarePaise: input.minimumFarePaise,
      includedDistanceM: input.includedDistanceM ?? 0,
      bufferSurchargePaise: input.bufferSurchargePaise ?? 0,
      negotiationFloorPercent: input.negotiationFloorPercent ?? 80,
      negotiationCeilingPercent: input.negotiationCeilingPercent ?? 150,
      negotiationWindowSeconds: input.negotiationWindowSeconds ?? 90,
      commissionPercent: input.commissionPercent ?? 8,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : now,
      effectiveTo: null,
      status,
      createdByAdminId: adminId,
      createdAt: now,
    };

    const saved = await this.pricingConfigRepo.save(config);
    return toPricingConfigDto(saved);
  }
}
