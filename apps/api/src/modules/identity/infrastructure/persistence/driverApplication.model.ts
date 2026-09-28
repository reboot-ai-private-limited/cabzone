import mongoose, { type Document, Schema } from 'mongoose';
import {
  DRIVER_APPLICATION_STATUSES,
  REJECTION_TYPES,
  VERIFICATION_PROVIDERS,
  type DriverApplicationStatus,
  type RejectionType,
  type VerificationProvider,
} from '@Cabzone/contracts';

export interface DriverApplicationDocument extends Document<string> {
  _id: string;
  driver_id: string;
  status: DriverApplicationStatus;
  rejection_type: RejectionType | null;
  rejection_reason: string | null;
  verification_provider: VerificationProvider | null;
  verification_reference: string | null;
  verification_result: Record<string, unknown> | null;
  reapply_count: number;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  reviewer_admin_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const driverApplicationSchema = new Schema<DriverApplicationDocument>(
  {
    _id: { type: String, required: true },
    driver_id: { type: String, required: true },
    status: {
      type: String,
      enum: DRIVER_APPLICATION_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    rejection_type: {
      type: String,
      enum: REJECTION_TYPES,
      default: null,
    },
    rejection_reason: { type: String, default: null },
    verification_provider: {
      type: String,
      enum: VERIFICATION_PROVIDERS,
      default: null,
    },
    verification_reference: { type: String, default: null },
    verification_result: { type: Schema.Types.Mixed, default: null },
    reapply_count: { type: Number, default: 0 },
    submitted_at: { type: Date, default: null },
    reviewed_at: { type: Date, default: null },
    reviewer_admin_id: { type: String, default: null },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'driver_applications',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

driverApplicationSchema.index({ driver_id: 1, created_at: -1 });
driverApplicationSchema.index({ status: 1, created_at: -1 });

export const DriverApplicationModel: mongoose.Model<DriverApplicationDocument> =
  (mongoose.models.DriverApplication as mongoose.Model<DriverApplicationDocument>) ||
  mongoose.model<DriverApplicationDocument>('DriverApplication', driverApplicationSchema);
