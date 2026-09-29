import type { ZoneAuditDto, ZoneDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type {
  ZoneAuditRepositoryPort,
  ZoneRepositoryPort,
} from '../../domain/index.js';
import { zoneAuditEntityToDto, zoneEntityToDto } from '../../domain/index.js';

export interface GetZoneHistoryDeps {
  zoneRepo: ZoneRepositoryPort;
  auditRepo?: ZoneAuditRepositoryPort;
}

export interface ZoneHistoryResult {
  versions: ZoneDto[];
  auditLogs: ZoneAuditDto[];
}

export class GetZoneHistoryUseCase {
  constructor(private readonly deps: GetZoneHistoryDeps) {}

  async execute(zoneId: string): Promise<ZoneHistoryResult> {
    const existing = await this.deps.zoneRepo.findById(zoneId);
    if (!existing) {
      throw AppError.notFound(`Zone with ID ${zoneId} not found.`);
    }

    const versions = this.deps.zoneRepo.findHistoryByZoneId
      ? await this.deps.zoneRepo.findHistoryByZoneId(zoneId)
      : [existing];

    const auditEntities = this.deps.auditRepo
      ? await this.deps.auditRepo.findByZoneId(zoneId)
      : [];

    return {
      versions: versions.map((v) => zoneEntityToDto(v)),
      auditLogs: auditEntities.map((a) => zoneAuditEntityToDto(a)),
    };
  }
}
