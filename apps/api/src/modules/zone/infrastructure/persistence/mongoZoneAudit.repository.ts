import type { ZoneAuditEntity, ZoneAuditRepositoryPort } from '../../domain/index.js';
import { ZoneAuditModel, type ZoneAuditDocument } from './zoneAudit.model.js';

export class MongoZoneAuditRepository implements ZoneAuditRepositoryPort {
  async save(entry: ZoneAuditEntity): Promise<void> {
    await ZoneAuditModel.create({
      _id: entry.id,
      zone_id: entry.zoneId,
      action: entry.action,
      actor_id: entry.actorId,
      before: entry.before,
      after: entry.after,
      reason: entry.reason ?? null,
      created_at: entry.createdAt,
    });
  }

  async findByZoneId(zoneId: string): Promise<ZoneAuditEntity[]> {
    const docs = await ZoneAuditModel.find({ zone_id: zoneId })
      .sort({ created_at: -1 })
      .lean<ZoneAuditDocument[]>();

    return docs.map((doc) => this.toEntity(doc));
  }

  private toEntity(doc: ZoneAuditDocument): ZoneAuditEntity {
    return {
      id: doc._id,
      zoneId: doc.zone_id,
      action: doc.action,
      actorId: doc.actor_id,
      before: doc.before,
      after: doc.after,
      reason: doc.reason ?? null,
      createdAt: doc.created_at,
    };
  }
}
