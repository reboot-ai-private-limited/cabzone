import mongoose, { type Document, Schema } from 'mongoose';
import {
  DRIVER_KYC_STATUSES,
  DRIVER_OPERATIONAL_STATUSES,
  DRIVER_STATUSES,
  type DriverKycStatus,
  type DriverOperationalStatus,
  type DriverStatus,
} from '@cabzone/contracts';

export interface DriverDocument extends Document<string> {
  _id: string;
  user_id: string;
  status: DriverStatus;
  kyc_status: DriverKycStatus;
  operational_status: DriverOperationalStatus;
  rating_average: number | null;
  rating_count: number;
  trust_score: number | null;
  current_vehicle_id: string | null;
  wallet_id: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const driverSchema = new Schema<DriverDocument>(
  {
    _id: { type: String, required: true },
    user_id: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: DRIVER_STATUSES,
      default: 'PENDING',
    },
    kyc_status: {
      type: String,
      enum: DRIVER_KYC_STATUSES,
      default: 'PENDING',
    },
    operational_status: {
      type: String,
      enum: DRIVER_OPERATIONAL_STATUSES,
      default: 'OFFLINE',
    },
    rating_average: { type: Number, default: null },
    rating_count: { type: Number, default: 0 },
    trust_score: { type: Number, default: null },
    current_vehicle_id: { type: String, default: null },
    wallet_id: { type: String, required: true },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'drivers',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  }
);

driverSchema.index({ status: 1, kyc_status: 1, operational_status: 1 });

export const DriverModel: mongoose.Model<DriverDocument> =
  (mongoose.models.Driver as mongoose.Model<DriverDocument>) ||
  mongoose.model<DriverDocument>('Driver', driverSchema);
