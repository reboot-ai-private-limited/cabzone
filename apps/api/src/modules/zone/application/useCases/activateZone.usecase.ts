import type { ZoneDto } from '@Cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type {
  ZoneAuditRepositoryPort,
  ZoneEntity,
  ZoneRepositoryPort,
} from '../../domain/index.js';
import { zoneEntityToDto } from '../../domain/index.js';

export interface ActivateZoneDeps {
  zoneRepo: ZoneRepositoryPort;
  auditRepo?: ZoneAuditRepositoryPort;
}

export class ActivateZoneUseCase {
  constructor(private readonly deps: ActivateZoneDeps) {}

  async execute(id: string, actorId: string = 'system'): Promise<ZoneDto> {
    const existing = await this.deps.zoneRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Zone with ID ${id} not found.`);
    }

    if (existing.status === 'ACTIVE') {
      throw AppError.badRequest('ZONE_ALREADY_ACTIVE: Zone is already active.');
    }

    const now = new Date();
    const updated: ZoneEntity = {
      ...existing,
      status: 'ACTIVE',
      updatedBy: actorId,
      updatedAt: now,
    };

    const saved = await this.deps.zoneRepo.save(updated);

    if (this.deps.auditRepo) {
      await this.deps.auditRepo.save({
        id: newUuid(),
        zoneId: saved.id,
        action: 'ACTIVATE',
        actorId,
        before: zoneEntityToDto(existing),
        after: zoneEntityToDto(saved),
        reason: 'Zone activated',
        createdAt: now,
      });
    }

    return zoneEntityToDto(saved);
  }
}
