import type { PricingConfigDto, UpdatePricingConfigRequest } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import {
  resolveCancellationFeeSplit,
  resolveCancellationPolicy,
  type PricingConfigRepositoryPort,
} from '../../domain/index.js';
import { getStateNameFromCode } from '@cabzone/geo';
import { toPricingConfigDto } from './createPricingConfig.usecase.js';

export class UpdatePricingConfigUseCase {
  constructor(
    private readonly pricingConfigRepo: PricingConfigRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(id: string, patch: UpdatePricingConfigRequest): Promise<PricingConfigDto> {
    return this.unitOfWork.run(() => this.update(id, patch));
  }

  private async update(id: string, patch: UpdatePricingConfigRequest): Promise<PricingConfigDto> {
    const config = await this.pricingConfigRepo.findById(id);
    if (!config) {
      throw AppError.notFound(`Pricing config ${id} not found`);
    }

    const baseFarePaise = patch.baseFarePaise ?? config.baseFarePaise;
    const minimumFarePaise = patch.minimumFarePaise ?? config.minimumFarePaise;
    if (minimumFarePaise < baseFarePaise) {
      throw AppError.badRequest('minimumFarePaise must be greater than or equal to baseFarePaise');
    }

    const outstationBaseFarePaise = patch.outstationBaseFarePaise ?? config.outstationBaseFarePaise;
    const outstationMinimumFarePaise =
      patch.outstationMinimumFarePaise ?? config.outstationMinimumFarePaise;
    if (outstationMinimumFarePaise < outstationBaseFarePaise) {
      throw AppError.badRequest(
        'outstationMinimumFarePaise must be greater than or equal to outstationBaseFarePaise',
      );
    }

    const negotiationFloorPercent = patch.negotiationFloorPercent ?? config.negotiationFloorPercent;
    const negotiationCeilingPercent =
      patch.negotiationCeilingPercent ?? config.negotiationCeilingPercent;
    if (negotiationCeilingPercent < negotiationFloorPercent) {
      throw AppError.badRequest(
        'negotiationCeilingPercent must be greater than or equal to negotiationFloorPercent',
      );
    }

    const currentPolicy = resolveCancellationPolicy(config);
    const cancellationSplit = resolveCancellationFeeSplit(
      {
        cancellationFeePaise: patch.cancellationFeePaise,
        driverCompensationPaise: patch.driverCompensationPaise,
        platformCancellationFeePaise: patch.platformCancellationFeePaise,
      },
      {
        cancellationFeePaise: currentPolicy.cancellationFeePaise,
        driverCompensationPaise: currentPolicy.driverCompensationPaise,
        platformCancellationFeePaise: currentPolicy.platformCancellationFeePaise,
      },
    );

    config.baseFarePaise = baseFarePaise;
    config.ratePerKmPaise = patch.ratePerKmPaise ?? config.ratePerKmPaise;
    config.minimumFarePaise = minimumFarePaise;
    config.outstationBaseFarePaise = outstationBaseFarePaise;
    config.outstationRatePerKmPaise =
      patch.outstationRatePerKmPaise ?? config.outstationRatePerKmPaise;
    config.outstationMinimumFarePaise = outstationMinimumFarePaise;
    config.bufferSurchargePaise = patch.bufferSurchargePaise ?? config.bufferSurchargePaise;
    config.negotiationFloorPercent = negotiationFloorPercent;
    config.negotiationCeilingPercent = negotiationCeilingPercent;
    config.negotiationWindowSeconds =
      patch.negotiationWindowSeconds ?? config.negotiationWindowSeconds;
    config.commissionPercent = patch.commissionPercent ?? config.commissionPercent;
    config.cancellationFeePaise = cancellationSplit.cancellationFeePaise;
    config.driverCompensationPaise = cancellationSplit.driverCompensationPaise;
    config.platformCancellationFeePaise = cancellationSplit.platformCancellationFeePaise;
    config.riderCancellationGraceSeconds =
      patch.riderCancellationGraceSeconds ?? currentPolicy.riderCancellationGraceSeconds;
    config.driverNoShowWaitSeconds =
      patch.driverNoShowWaitSeconds ?? currentPolicy.driverNoShowWaitSeconds;
    config.effectiveFrom = patch.effectiveFrom
      ? new Date(patch.effectiveFrom)
      : config.effectiveFrom;

    if (patch.stateCode !== undefined && config.level === 'STATE') {
      config.stateCode = patch.stateCode ? patch.stateCode.toUpperCase() : null;
      config.stateName = config.stateCode
        ? (getStateNameFromCode(config.stateCode) ?? config.stateCode)
        : null;
    }
    if (patch.status !== undefined) {
      if (patch.status === 'ACTIVE' && config.status !== 'ACTIVE') {
        const now = new Date();
        const activeExisting = await this.pricingConfigRepo.findEffectiveConfig(
          {
            cityZoneId: config.cityZoneId,
            stateCode: config.stateCode,
          },
          config.vehicleType,
          now,
        );
        if (
          activeExisting &&
          activeExisting.id !== config.id &&
          activeExisting.level === config.level
        ) {
          activeExisting.status = 'RETIRED';
          activeExisting.effectiveTo = now;
          activeExisting.version += 1;
          await this.pricingConfigRepo.save(activeExisting, activeExisting.version - 1);
        }
        config.effectiveFrom = now;
        config.effectiveTo = null;
      }
      config.status = patch.status;
    }

    config.version += 1;
    const saved = await this.pricingConfigRepo.save(config, config.version - 1);
    return toPricingConfigDto(saved);
  }
}
