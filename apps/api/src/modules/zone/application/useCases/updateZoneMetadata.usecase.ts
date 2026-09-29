import type { UpdateZoneMetadataRequest, ZoneDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type {
  ZoneAuditRepositoryPort,
  ZoneEntity,
  ZoneRepositoryPort,
} from '../../domain/index.js';
import { zoneEntityToDto } from '../../domain/index.js';

export interface UpdateZoneMetadataDeps {
  zoneRepo: ZoneRepositoryPort;
  auditRepo?: ZoneAuditRepositoryPort;
}

export class UpdateZoneMetadataUseCase {
  constructor(private readonly deps: UpdateZoneMetadataDeps) {}

  async execute(
    id: string,
    input: UpdateZoneMetadataRequest,
    actorId: string = 'system',
  ): Promise<ZoneDto> {
    const existing = await this.deps.zoneRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Zone with ID ${id} not found.`);
    }

    let parentCityZoneId = existing.parentCityZoneId;
    if (input.parentCityZoneId !== undefined) {
      if (existing.zoneType === 'CITY' && input.parentCityZoneId !== null) {
        throw AppError.badRequest('CITY zone cannot have a parent zone.');
      }
      if (input.parentCityZoneId) {
        const parent = await this.deps.zoneRepo.findById(input.parentCityZoneId);
        if (!parent || parent.zoneType !== 'CITY') {
          throw AppError.badRequest('Referenced parent city does not exist or is not a CITY zone.');
        }
      }
      parentCityZoneId = input.parentCityZoneId;
    }

    const now = new Date();
    const updated: ZoneEntity = {
      ...existing,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      stateCode: input.stateCode !== undefined ? input.stateCode.trim().toUpperCase() : existing.stateCode,
      parentCityZoneId,
      bufferDistanceM: input.bufferDistanceM !== undefined ? input.bufferDistanceM : existing.bufferDistanceM,
      pickupChargeType:
        input.pickupChargeType !== undefined
          ? input.pickupChargeType
          : existing.pickupChargeType,
      pickupChargePaise:
        input.pickupChargePaise !== undefined
          ? input.pickupChargePaise
          : existing.pickupChargePaise,
      status: input.status !== undefined ? input.status : existing.status,
      currentPricingConfigId:
        input.currentPricingConfigId !== undefined
          ? input.currentPricingConfigId
          : existing.currentPricingConfigId,
      updatedBy: actorId,
      updatedAt: now,
    };

    const saved = await this.deps.zoneRepo.save(updated);

    if (this.deps.auditRepo) {
      await this.deps.auditRepo.save({
        id: newUuid(),
        zoneId: saved.id,
        action: 'UPDATE_METADATA',
        actorId,
        before: zoneEntityToDto(existing),
        after: zoneEntityToDto(saved),
        reason: 'Zone metadata updated',
        createdAt: now,
      });
    }

    return zoneEntityToDto(saved);
  }
}
