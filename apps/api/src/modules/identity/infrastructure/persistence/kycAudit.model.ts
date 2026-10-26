import mongoose, { type Document, Schema } from 'mongoose';
import { KYC_AUDIT_ACTIONS, type KycAuditAction } from '../../domain/kycAudit.port.js';

export interface KycAuditLogDocument extends Document<string> {
  _id: string;
  actor_user_id: string;
  actor_role: string;
  action: KycAuditAction;
  driver_id: string;
  application_id: string | null;
  document_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

const kycAuditLogSchema = new Schema<KycAuditLogDocument>(
  {
    _id: { type: String, required: true },
    actor_user_id: { type: String, required: true, index: true },
    actor_role: { type: String, required: true },
    action: { type: String, enum: KYC_AUDIT_ACTIONS, required: true },
    driver_id: { type: String, required: true, index: true },
    application_id: { type: String, default: null, index: true },
    document_id: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    created_at: { type: Date, required: true, default: Date.now },
  },
  {
    collection: 'kyc_audit_logs',
    _id: false,
    versionKey: false,
  },
);

kycAuditLogSchema.index({ driver_id: 1, created_at: -1 });

export const KycAuditLogModel: mongoose.Model<KycAuditLogDocument> =
  (mongoose.models.KycAuditLog as mongoose.Model<KycAuditLogDocument>) ||
  mongoose.model<KycAuditLogDocument>('KycAuditLog', kycAuditLogSchema);
