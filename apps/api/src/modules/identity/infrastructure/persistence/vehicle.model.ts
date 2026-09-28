import mongoose, { Schema } from 'mongoose';
import {
  VEHICLE_CATEGORIES,
  VEHICLE_VERIFICATION_STATUSES,
  type VehicleCategory,
  type VehicleVerificationStatus,
} from '@Cabzone/contracts';

export type VehicleDocument = {
  _id: string;
  driver_id: string;
  vehicle_type: VehicleCategory;
  make: string;
  model: string;
  registration_number: string;
  color: string | null;
  manufacture_year: number | null;
  verification_status: VehicleVerificationStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
};

const vehicleSchema = new Schema<VehicleDocument>(
  {
    _id: { type: String, required: true },
    driver_id: { type: String, required: true, index: true },
    vehicle_type: {
      type: String,
      enum: VEHICLE_CATEGORIES,
      required: true,
    },
    make: { type: String, required: true },
    model: { type: String, required: true },
    registration_number: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    color: { type: String, default: null },
    manufacture_year: { type: Number, default: null },
    verification_status: {
      type: String,
      enum: VEHICLE_VERIFICATION_STATUSES,
      default: 'PENDING',
      index: true,
    },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'vehicles',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

vehicleSchema.index({ driver_id: 1, verification_status: 1 });
vehicleSchema.index({ driver_id: 1, vehicle_type: 1 });

export const VehicleModel: mongoose.Model<VehicleDocument> =
  (mongoose.models.Vehicle as mongoose.Model<VehicleDocument>) ||
  mongoose.model<VehicleDocument>('Vehicle', vehicleSchema);
