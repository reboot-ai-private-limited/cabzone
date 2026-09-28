import type { ZoneAuditEntity, ZoneAuditRepositoryPort } from '../../domain/index.js';

export class MemoryZoneAuditRepository implements ZoneAuditRepositoryPort {
  private readonly logs: ZoneAuditEntity[] = [];

  async save(entry: ZoneAuditEntity): Promise<void> {
    this.logs.push({ ...entry });
  }

  async findByZoneId(zoneId: string): Promise<ZoneAuditEntity[]> {
    return this.logs
      .filter((l) => l.zoneId === zoneId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((l) => ({ ...l }));
  }
}
