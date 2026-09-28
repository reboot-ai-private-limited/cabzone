import mongoose, { type Document, Schema } from 'mongoose';
import { ZONE_AUDIT_ACTIONS, type ZoneAuditAction } from '@Cabzone/contracts';

export interface ZoneAuditDocument extends Document<string> {
  _id: string;
  zone_id: string;
  action: ZoneAuditAction;
  actor_id: string;
  before: unknown | null;
  after: unknown | null;
  reason: string | null;
  created_at: Date;
}

const zoneAuditSchema = new Schema<ZoneAuditDocument>(
  {
    _id: { type: String, required: true },
    zone_id: { type: String, required: true, index: true },
    action: {
      type: String,
      enum: ZONE_AUDIT_ACTIONS,
      required: true,
      index: true,
    },
    actor_id: { type: String, required: true, index: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: null },
  },
  {
    collection: 'zone_audit_logs',
    timestamps: { createdAt: 'created_at', updatedAt: false },
    _id: false,
    versionKey: false,
  },
);

zoneAuditSchema.index({ zone_id: 1, created_at: -1 });

export const ZoneAuditModel: mongoose.Model<ZoneAuditDocument> =
  (mongoose.models.ZoneAudit as mongoose.Model<ZoneAuditDocument>) ||
  mongoose.model<ZoneAuditDocument>('ZoneAudit', zoneAuditSchema);
