import type { UpdateZoneInputDto, ZoneDto } from '@Cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type {
  ZoneAuditRepositoryPort,
  ZoneEntity,
  ZoneRepositoryPort,
} from '../../domain/index.js';
import { normalizeGeoJson, zoneEntityToDto } from '../../domain/index.js';

export interface UpdateZoneDeps {
  zoneRepo: ZoneRepositoryPort;
  auditRepo?: ZoneAuditRepositoryPort;
}

export class UpdateZoneUseCase {
  constructor(private readonly deps: UpdateZoneDeps) {}

  async execute(
    id: string,
    input: UpdateZoneInputDto,
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

    let geometry = existing.geometry;
    let boundary = existing.boundary;

    if (input.geometry || input.boundary) {
      const raw = input.geometry ?? input.boundary;
      if (raw) {
        geometry = normalizeGeoJson(raw);
        boundary =
          geometry.type === 'Polygon'
            ? geometry
            : {
                type: 'Polygon',
                coordinates: (geometry.coordinates[0] as unknown as [number, number][][]) ?? [],
              };
      }
    }

    const now = new Date();
    const updated: ZoneEntity = {
      ...existing,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      code: input.code !== undefined ? input.code.trim().toUpperCase() : existing.code,
      parentCityZoneId,
      stateCode: input.stateCode !== undefined ? input.stateCode.trim().toUpperCase() : existing.stateCode,
      geometry,
      boundary,
      bufferDistanceM: input.bufferDistanceM !== undefined ? input.bufferDistanceM : existing.bufferDistanceM,
      status: input.status !== undefined ? input.status : existing.status,
      currentPricingConfigId:
        input.currentPricingConfigId !== undefined
          ? input.currentPricingConfigId
          : existing.currentPricingConfigId,
      version: existing.version + 1,
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
        reason: 'Zone updated',
        createdAt: now,
      });
    }

    return zoneEntityToDto(saved);
  }
}
