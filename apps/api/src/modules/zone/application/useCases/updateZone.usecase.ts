import type { UpdateZoneInputDto, ZoneDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { ZoneEntity, ZoneRepositoryPort } from '../../domain/index.js';
import { zoneEntityToDto } from '../../domain/index.js';

export interface UpdateZoneDeps {
  zoneRepo: ZoneRepositoryPort;
}

export class UpdateZoneUseCase {
  constructor(private readonly deps: UpdateZoneDeps) {}

  async execute(id: string, input: UpdateZoneInputDto): Promise<ZoneDto> {
    const existing = await this.deps.zoneRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Zone with ID ${id} not found.`);
    }

    let parentCityZoneId = existing.parentCityZoneId;
    if (input.parentCityZoneId !== undefined) {
      if (existing.zoneType === 'CITY' && input.parentCityZoneId !== null) {
        throw AppError.badRequest('CITY zone cannot have a parent zone.');
      }
      if (existing.zoneType === 'PICKUP' && !input.parentCityZoneId) {
        throw AppError.badRequest('PICKUP zone must specify a parent CITY zone.');
      }
      if (input.parentCityZoneId) {
        const parent = await this.deps.zoneRepo.findById(input.parentCityZoneId);
        if (!parent || (existing.zoneType === 'PICKUP' && parent.zoneType !== 'CITY')) {
          throw AppError.badRequest('Referenced parent city does not exist or is not a CITY zone.');
        }
      }
      parentCityZoneId = input.parentCityZoneId;
    }

    const updated: ZoneEntity = {
      ...existing,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      parentCityZoneId,
      boundary: input.boundary !== undefined ? input.boundary : existing.boundary,
      bufferDistanceM: input.bufferDistanceM !== undefined ? input.bufferDistanceM : existing.bufferDistanceM,
      status: input.status !== undefined ? input.status : existing.status,
      currentPricingConfigId:
        input.currentPricingConfigId !== undefined
          ? input.currentPricingConfigId
          : existing.currentPricingConfigId,
      version: existing.version + 1,
      updatedAt: new Date(),
    };

    const saved = await this.deps.zoneRepo.save(updated);
    return zoneEntityToDto(saved);
  }
}
