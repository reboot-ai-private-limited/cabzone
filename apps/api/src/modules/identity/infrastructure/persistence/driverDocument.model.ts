import mongoose, { type Document, Schema } from 'mongoose';
import {
  DOCUMENT_TYPES,
  DOCUMENT_VERIFICATION_STATUSES,
  type DocumentType,
  type DocumentVerificationStatus,
} from '@cabzone/contracts';

export interface DriverDocumentDocument extends Document<string> {
  _id: string;
  driver_id: string;
  application_id: string;
  vehicle_id?: string | null;
  type: DocumentType;
  storage_key: string;
  document_hash: string;
  document_number_masked: string | null;
  issued_at: Date | null;
  expires_at: Date | null;
  verification_status: DocumentVerificationStatus;
  verified_at: Date | null;
  last_expiry_reminder_days?: number | null;
  created_at: Date;
  updated_at: Date;
}

const driverDocumentSchema = new Schema<DriverDocumentDocument>(
  {
    _id: { type: String, required: true },
    driver_id: { type: String, required: true },
    application_id: { type: String, required: true, index: true },
    vehicle_id: { type: String, default: null, index: true },
    type: {
      type: String,
      enum: DOCUMENT_TYPES,
      required: true,
    },
    storage_key: { type: String, required: true },
    document_hash: { type: String, required: true },
    document_number_masked: { type: String, default: null },
    issued_at: { type: Date, default: null },
    expires_at: { type: Date, default: null, index: true },
    verification_status: {
      type: String,
      enum: DOCUMENT_VERIFICATION_STATUSES,
      default: 'PENDING',
    },
    verified_at: { type: Date, default: null },
    last_expiry_reminder_days: { type: Number, default: null },
  },
  {
    collection: 'driver_documents',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

driverDocumentSchema.index({ driver_id: 1, type: 1 });
driverDocumentSchema.index({ verification_status: 1, expires_at: 1 });

export const DriverDocumentModel: mongoose.Model<DriverDocumentDocument> =
  (mongoose.models.DriverDocument as mongoose.Model<DriverDocumentDocument>) ||
  mongoose.model<DriverDocumentDocument>('DriverDocument', driverDocumentSchema);
