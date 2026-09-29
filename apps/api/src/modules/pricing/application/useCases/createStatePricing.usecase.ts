import type {
  CreateStatePricingRequest,
  StatePricingDto,
} from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import type {
  StatePricingEntity,
  StatePricingRepositoryPort,
} from '../../domain/index.js';

export function toStatePricingDto(entity: StatePricingEntity): StatePricingDto {
  return {
    id: entity.id,
    stateCode: entity.stateCode,
    ratePerKmPaise: entity.ratePerKmPaise,
    baseFarePaise: entity.baseFarePaise,
    minimumFarePaise: entity.minimumFarePaise,
    version: entity.version,
    status: entity.status,
    effectiveFrom: entity.effectiveFrom.toISOString(),
    effectiveTo: entity.effectiveTo ? entity.effectiveTo.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
  };
}

export class CreateStatePricingUseCase {
  constructor(private readonly statePricingRepo: StatePricingRepositoryPort) {}

  async execute(input: CreateStatePricingRequest): Promise<StatePricingDto> {
    const stateCode = input.stateCode.toUpperCase();
    const latestVersion = await this.statePricingRepo.findLatestVersion(stateCode);
    const newVersion = latestVersion + 1;
    const now = new Date();
    const status = input.status ?? 'ACTIVE';

    if (status === 'ACTIVE') {
      const activeExisting = await this.statePricingRepo.findByStateCode(stateCode, now);
      if (activeExisting) {
        activeExisting.status = 'RETIRED';
        activeExisting.effectiveTo = now;
        await this.statePricingRepo.save(activeExisting);
      }
    }

    const entity: StatePricingEntity = {
      id: newUuid(),
      stateCode,
      ratePerKmPaise: input.ratePerKmPaise,
      baseFarePaise: input.baseFarePaise,
      minimumFarePaise: input.minimumFarePaise,
      version: newVersion,
      status,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : now,
      effectiveTo: null,
      createdAt: now,
    };

    const saved = await this.statePricingRepo.save(entity);
    return toStatePricingDto(saved);
  }
}
