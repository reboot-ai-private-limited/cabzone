import {
  DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS,
  DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS,
  type CreatePricingConfigRequest,
  type PricingConfigDto,
  type PricingConfigLevel,
} from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import {
  resolveCancellationFeeSplit,
  resolveCancellationPolicy,
  type PricingConfigEntity,
  type PricingConfigRepositoryPort,
} from '../../domain/index.js';
import { getStateNameFromCode } from '@cabzone/geo';

export function toPricingConfigDto(entity: PricingConfigEntity): PricingConfigDto {
  const policy = resolveCancellationPolicy(entity);
  return {
    id: entity.id,
    level: entity.level,
    cityZoneId: entity.cityZoneId,
    stateCode: entity.stateCode,
    stateName:
      entity.stateName ?? (entity.stateCode ? getStateNameFromCode(entity.stateCode) : null),
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
    cancellationFeePaise: policy.cancellationFeePaise,
    driverCompensationPaise: policy.driverCompensationPaise,
    platformCancellationFeePaise: policy.platformCancellationFeePaise,
    riderCancellationGraceSeconds: policy.riderCancellationGraceSeconds,
    driverNoShowWaitSeconds: policy.driverNoShowWaitSeconds,
    effectiveFrom: entity.effectiveFrom.toISOString(),
    effectiveTo: entity.effectiveTo ? entity.effectiveTo.toISOString() : null,
    status: entity.status,
    createdByAdminId: entity.createdByAdminId,
    createdAt: entity.createdAt.toISOString(),
  };
}

export class CreatePricingConfigUseCase {
  constructor(
    private readonly pricingConfigRepo: PricingConfigRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(input: CreatePricingConfigRequest, adminId: string): Promise<PricingConfigDto> {
    return this.unitOfWork.run(() => this.create(input, adminId));
  }

  private async create(
    input: CreatePricingConfigRequest,
    adminId: string,
  ): Promise<PricingConfigDto> {
    const level: PricingConfigLevel =
      input.level ?? (input.stateCode ? 'STATE' : input.cityZoneId ? 'CITY' : 'GLOBAL');

    const stateCode = level === 'STATE' && input.stateCode ? input.stateCode.toUpperCase() : null;
    const stateName = stateCode ? getStateNameFromCode(stateCode) : null;
    const cityZoneId = level === 'CITY' ? (input.cityZoneId ?? null) : null;

    const cancellationSplit = resolveCancellationFeeSplit({
      cancellationFeePaise: input.cancellationFeePaise,
      driverCompensationPaise: input.driverCompensationPaise,
      platformCancellationFeePaise: input.platformCancellationFeePaise,
    });

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
      if (activeExisting && activeExisting.level === level) {
        activeExisting.status = 'RETIRED';
        activeExisting.effectiveTo = now;
        activeExisting.version += 1;
        await this.pricingConfigRepo.save(activeExisting, activeExisting.version - 1);
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
      cancellationFeePaise: cancellationSplit.cancellationFeePaise,
      driverCompensationPaise: cancellationSplit.driverCompensationPaise,
      platformCancellationFeePaise: cancellationSplit.platformCancellationFeePaise,
      riderCancellationGraceSeconds:
        input.riderCancellationGraceSeconds ?? DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS,
      driverNoShowWaitSeconds:
        input.driverNoShowWaitSeconds ?? DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS,
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
