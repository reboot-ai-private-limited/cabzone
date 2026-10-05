import type {
  CreatePricingConfigRequest,
  PricingConfigDto,
  PricingConfigLevel,
} from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import type {
  PricingConfigEntity,
  PricingConfigRepositoryPort,
} from '../../domain/index.js';
import { getStateNameFromCode } from '@cabzone/geo';

export function toPricingConfigDto(entity: PricingConfigEntity): PricingConfigDto {
  return {
    id: entity.id,
    level: entity.level,
    cityZoneId: entity.cityZoneId,
    stateCode: entity.stateCode,
    stateName: entity.stateName ?? (entity.stateCode ? getStateNameFromCode(entity.stateCode) : null),
    version: entity.version,
    vehicleType: entity.vehicleType,
    baseFarePaise: entity.baseFarePaise,
    ratePerKmPaise: entity.ratePerKmPaise,
    minimumFarePaise: entity.minimumFarePaise,
    outstationBaseFarePaise: entity.outstationBaseFarePaise,
    outstationRatePerKmPaise: entity.outstationRatePerKmPaise,
    outstationMinimumFarePaise: entity.outstationMinimumFarePaise,
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
    const level: PricingConfigLevel =
      input.level ??
      (input.stateCode ? 'STATE' : input.cityZoneId ? 'CITY' : 'GLOBAL');

    const stateCode = level === 'STATE' && input.stateCode ? input.stateCode.toUpperCase() : null;
    const stateName = stateCode ? getStateNameFromCode(stateCode) : null;
    const cityZoneId = level === 'CITY' ? (input.cityZoneId ?? null) : null;

    const latestVersion = await this.pricingConfigRepo.findLatestVersion(
      { cityZoneId, stateCode, level },
      input.vehicleType,
    );
    const newVersion = latestVersion + 1;
    const now = new Date();
    const status = input.status ?? 'DRAFT';

    if (status === 'ACTIVE') {
      const activeExisting = await this.pricingConfigRepo.findEffectiveConfig(
        { cityZoneId, stateCode },
        input.vehicleType,
        now,
      );
      if (activeExisting) {
        activeExisting.status = 'RETIRED';
        activeExisting.effectiveTo = now;
        await this.pricingConfigRepo.save(activeExisting);
      }
    }

    const outstationBaseFarePaise = input.outstationBaseFarePaise ?? input.baseFarePaise;
    const outstationRatePerKmPaise = input.outstationRatePerKmPaise ?? input.ratePerKmPaise;
    const outstationMinimumFarePaise = input.outstationMinimumFarePaise ?? input.minimumFarePaise;

    const config: PricingConfigEntity = {
      id: newUuid(),
      level,
      cityZoneId,
      stateCode,
      stateName,
      version: newVersion,
      vehicleType: input.vehicleType,
      baseFarePaise: input.baseFarePaise,
      ratePerKmPaise: input.ratePerKmPaise,
      minimumFarePaise: input.minimumFarePaise,
      outstationBaseFarePaise,
      outstationRatePerKmPaise,
      outstationMinimumFarePaise,
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

