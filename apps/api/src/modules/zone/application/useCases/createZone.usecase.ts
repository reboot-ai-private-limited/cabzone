import type { CreateZoneInputDto, ZoneDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { ZoneEntity, ZoneRepositoryPort } from '../../domain/index.js';
import { zoneEntityToDto } from '../../domain/index.js';

export interface CreateZoneDeps {
  zoneRepo: ZoneRepositoryPort;
}

export class CreateZoneUseCase {
  constructor(private readonly deps: CreateZoneDeps) {}

  async execute(input: CreateZoneInputDto): Promise<ZoneDto> {
    const parentCityZoneId = input.parentCityZoneId ?? null;

    if (input.zoneType === 'PICKUP') {
      if (!parentCityZoneId) {
        throw AppError.badRequest('INVALID_PARENT_ZONE: PICKUP zone must specify a parent CITY zone.');
      }
      const parent = await this.deps.zoneRepo.findById(parentCityZoneId);
      if (!parent || parent.zoneType !== 'CITY') {
        throw AppError.badRequest('INVALID_PARENT_ZONE: Referenced parent city does not exist or is not a CITY zone.');
      }
    } else if (input.zoneType === 'CITY' && parentCityZoneId) {
      throw AppError.badRequest('CITY zone cannot have a parent zone.');
    } else if (parentCityZoneId) {
      const parent = await this.deps.zoneRepo.findById(parentCityZoneId);
      if (!parent) {
        throw AppError.badRequest('INVALID_PARENT_ZONE: Referenced parent zone does not exist.');
      }
    }

    const now = new Date();
    const zone: ZoneEntity = {
      id: newUuid(),
      name: input.name.trim(),
      zoneType: input.zoneType,
      parentCityZoneId,
      stateCode: input.stateCode.trim().toUpperCase(),
      boundary: input.boundary,
      bufferDistanceM: input.bufferDistanceM ?? null,
      status: 'ACTIVE',
      currentPricingConfigId: input.currentPricingConfigId ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.deps.zoneRepo.save(zone);
    return zoneEntityToDto(saved);
  }
}
