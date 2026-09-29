import type { ZoneDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type {
  ZoneAuditRepositoryPort,
  ZoneEntity,
  ZoneRepositoryPort,
} from '../../domain/index.js';
import { zoneEntityToDto } from '../../domain/index.js';

export interface DeactivateZoneDeps {
  zoneRepo: ZoneRepositoryPort;
  auditRepo?: ZoneAuditRepositoryPort;
}

export class DeactivateZoneUseCase {
  constructor(private readonly deps: DeactivateZoneDeps) {}

  async execute(
    id: string,
    actorId: string = 'system',
    reason?: string,
  ): Promise<ZoneDto> {
    const existing = await this.deps.zoneRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Zone with ID ${id} not found.`);
    }

    if (existing.status === 'INACTIVE') {
      throw AppError.badRequest('ZONE_ALREADY_INACTIVE: Zone is already inactive.');
    }

    const now = new Date();
    const updated: ZoneEntity = {
      ...existing,
      status: 'INACTIVE',
      updatedBy: actorId,
      updatedAt: now,
    };

    const saved = await this.deps.zoneRepo.save(updated);

    if (this.deps.auditRepo) {
      await this.deps.auditRepo.save({
        id: newUuid(),
        zoneId: saved.id,
        action: 'DEACTIVATE',
        actorId,
        before: zoneEntityToDto(existing),
        after: zoneEntityToDto(saved),
        reason: reason ?? 'Zone deactivated',
        createdAt: now,
      });
    }

    return zoneEntityToDto(saved);
  }
}
