import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { ZoneAuditRepositoryPort, ZoneRepositoryPort } from '../../domain/index.js';
import { zoneEntityToDto } from '../../domain/index.js';

export interface DeleteZoneDeps {
  zoneRepo: ZoneRepositoryPort;
  auditRepo?: ZoneAuditRepositoryPort;
}

export class DeleteZoneUseCase {
  constructor(private readonly deps: DeleteZoneDeps) {}

  async execute(id: string, actorId: string = 'system'): Promise<void> {
    const existing = await this.deps.zoneRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Zone with ID ${id} not found.`);
    }

    const children = await this.deps.zoneRepo.list({ parentCityZoneId: existing.id });
    if (children.length > 0) {
      throw AppError.conflict(
        `ZONE_HAS_DEPENDENTS: ${children.length} zone(s) use this zone as their parent city. Delete or reassign them first.`,
      );
    }

    await this.deps.zoneRepo.deleteById(id);

    if (this.deps.auditRepo) {
      await this.deps.auditRepo.save({
        id: newUuid(),
        zoneId: id,
        action: 'DELETE',
        actorId,
        before: zoneEntityToDto(existing),
        after: null,
        reason: 'Zone deleted',
        createdAt: new Date(),
      });
    }
  }
}
