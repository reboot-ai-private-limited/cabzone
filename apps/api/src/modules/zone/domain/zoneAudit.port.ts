import type { ZoneAuditAction, ZoneAuditDto } from '@Cabzone/contracts';

export interface ZoneAuditEntity {
  id: string;
  zoneId: string;
  action: ZoneAuditAction;
  actorId: string;
  before: unknown | null;
  after: unknown | null;
  reason: string | null;
  createdAt: Date;
}

export function zoneAuditEntityToDto(entity: ZoneAuditEntity): ZoneAuditDto {
  return {
    id: entity.id,
    zoneId: entity.zoneId,
    action: entity.action,
    actorId: entity.actorId,
    before: entity.before,
    after: entity.after,
    reason: entity.reason,
    createdAt: entity.createdAt.toISOString(),
  };
}

export interface ZoneAuditRepositoryPort {
  save(entry: ZoneAuditEntity): Promise<void>;
  findByZoneId(zoneId: string): Promise<ZoneAuditEntity[]>;
}
