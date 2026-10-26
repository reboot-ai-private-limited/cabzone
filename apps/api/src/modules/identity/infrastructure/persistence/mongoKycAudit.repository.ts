import type { KycAuditLogEntry, KycAuditRepositoryPort } from '../../domain/kycAudit.port.js';
import { KycAuditLogModel, type KycAuditLogDocument } from './kycAudit.model.js';

export class MongoKycAuditRepository implements KycAuditRepositoryPort {
  async record(entry: KycAuditLogEntry): Promise<void> {
    await KycAuditLogModel.create({
      _id: entry.id,
      actor_user_id: entry.actorUserId,
      actor_role: entry.actorRole,
      action: entry.action,
      driver_id: entry.driverId,
      application_id: entry.applicationId,
      document_id: entry.documentId,
      metadata: entry.metadata,
      created_at: entry.createdAt,
    });
  }

  async listByDriverId(driverId: string): Promise<KycAuditLogEntry[]> {
    const docs = await KycAuditLogModel.find({ driver_id: driverId })
      .sort({ created_at: -1, _id: -1 })
      .lean<KycAuditLogDocument[]>()
      .exec();
    return docs.map((d) => ({
      id: d._id,
      actorUserId: d.actor_user_id,
      actorRole: d.actor_role,
      action: d.action,
      driverId: d.driver_id,
      applicationId: d.application_id,
      documentId: d.document_id,
      metadata: d.metadata,
      createdAt: d.created_at,
    }));
  }
}
