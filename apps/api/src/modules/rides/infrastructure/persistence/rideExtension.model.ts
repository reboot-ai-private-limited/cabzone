import mongoose, { type Document, Schema } from 'mongoose';
import { EXTENSION_STATUSES, type ExtensionStatus } from '@cabzone/contracts';

export interface RideExtensionDocument extends Document<string> {
  _id: string;
  ride_id: string;
  requested_by: string;
  original_drop: {
    lat: number;
    lng: number;
  };
  new_drop: {
    lat: number;
    lng: number;
  };
  additional_distance_m: number;
  additional_fare_paise: number;
  status: ExtensionStatus;
  requested_at: Date;
  responded_at: Date | null;
}

const pointSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const rideExtensionSchema = new Schema<RideExtensionDocument>(
  {
    _id: { type: String, required: true },
    ride_id: { type: String, required: true, index: true },
    requested_by: { type: String, required: true },
    original_drop: { type: pointSchema, required: true },
    new_drop: { type: pointSchema, required: true },
    additional_distance_m: { type: Number, required: true, min: 0 },
    additional_fare_paise: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: EXTENSION_STATUSES,
      default: 'REQUESTED',
      index: true,
    },
    requested_at: { type: Date, default: () => new Date() },
    responded_at: { type: Date, default: null },
  },
  {
    collection: 'ride_extensions',
    timestamps: false,
    _id: false,
    versionKey: false,
  },
);

rideExtensionSchema.index({ ride_id: 1, requested_at: -1 });

export const RideExtensionModel: mongoose.Model<RideExtensionDocument> =
  (mongoose.models.RideExtension as mongoose.Model<RideExtensionDocument>) ||
  mongoose.model<RideExtensionDocument>('RideExtension', rideExtensionSchema);
