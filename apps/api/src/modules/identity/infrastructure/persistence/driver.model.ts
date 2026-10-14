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
  name?: string | null;
  profile_photo_url?: string | null;
  alternate_phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  experience?: string | null;
  emergency_contact?: string | null;
  address?: string | null;
  dl_number?: string | null;
  dl_expiry?: string | null;
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
    name: { type: String, default: null },
    profile_photo_url: { type: String, default: null },
    alternate_phone: { type: String, default: null },
    gender: { type: String, default: null },
    date_of_birth: { type: String, default: null },
    experience: { type: String, default: null },
    emergency_contact: { type: String, default: null },
    address: { type: String, default: null },
    dl_number: { type: String, default: null },
    dl_expiry: { type: String, default: null },
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
  },
);

driverSchema.index({ status: 1, kyc_status: 1, operational_status: 1 });

export const DriverModel: mongoose.Model<DriverDocument> =
  (mongoose.models.Driver as mongoose.Model<DriverDocument>) ||
  mongoose.model<DriverDocument>('Driver', driverSchema);
