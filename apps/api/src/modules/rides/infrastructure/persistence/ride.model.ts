import mongoose, { type Document, Schema } from 'mongoose';
import {
  CANCELLATION_REASONS,
  RIDE_STATUSES,
  VEHICLE_CATEGORIES,
  type CancellationReason,
  type RidePricingSnapshot,
  type RideStatus,
  type VehicleCategory,
} from '@cabzone/contracts';
import type { LocationPoint, RouteSnapshot, ZoneSnapshot } from '../../domain/ride.entity.js';

export interface RideDocument extends Document<string> {
  _id: string;
  booker_rider_id: string;
  passenger: {
    rider_id: string | null;
    name: string;
    phone_e164: string;
    pickup_otp_hash: string | null;
    pickup_otp_expires_at?: Date | null;
    otp_attempts?: number;
    max_otp_attempts?: number;
  };
  driver_id: string | null;
  vehicle_id: string | null;
  vehicle_category: VehicleCategory;
  pickup: LocationPoint;
  drop: LocationPoint;
  route_snapshot: RouteSnapshot;
  zone_snapshot: ZoneSnapshot;
  pricing_snapshot: RidePricingSnapshot;
  suggested_fare_paise: number;
  proposed_fare_paise: number | null;
  agreed_fare_paise: number | null;
  arrears_paise?: number;
  status: RideStatus;
  cancellation_reason: CancellationReason | null;
  offering_expires_at: Date | null;
  accepted_at: Date | null;
  arrived_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  settled_at: Date | null;
  cancelled_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const pointSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, default: null },
  },
  { _id: false },
);

const passengerSchema = new Schema(
  {
    rider_id: { type: String, default: null },
    name: { type: String, required: true },
    phone_e164: { type: String, required: true },
    pickup_otp_hash: { type: String, default: null },
    pickup_otp_expires_at: { type: Date, default: null },
    otp_attempts: { type: Number, default: 0 },
    max_otp_attempts: { type: Number, default: 3 },
  },
  { _id: false },
);

const rideSchema = new Schema<RideDocument>(
  {
    _id: { type: String, required: true },
    booker_rider_id: { type: String, required: true, index: true },
    passenger: { type: passengerSchema, required: true },
    driver_id: { type: String, default: null, index: true },
    vehicle_id: { type: String, default: null },
    vehicle_category: {
      type: String,
      enum: VEHICLE_CATEGORIES,
      required: true,
    },
    pickup: { type: pointSchema, required: true },
    drop: { type: pointSchema, required: true },
    route_snapshot: { type: Schema.Types.Mixed, required: true },
    zone_snapshot: { type: Schema.Types.Mixed, required: true },
    pricing_snapshot: { type: Schema.Types.Mixed, required: true },
    suggested_fare_paise: { type: Number, required: true, min: 0 },
    proposed_fare_paise: { type: Number, default: null },
    agreed_fare_paise: { type: Number, default: null },
    arrears_paise: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: RIDE_STATUSES,
      default: 'REQUESTED',
      index: true,
    },
    cancellation_reason: {
      type: String,
      enum: CANCELLATION_REASONS,
      default: null,
    },
    offering_expires_at: { type: Date, default: null },
    accepted_at: { type: Date, default: null },
    arrived_at: { type: Date, default: null },
    started_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    settled_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'rides',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

rideSchema.index({ booker_rider_id: 1, created_at: -1 });
rideSchema.index({ driver_id: 1, created_at: -1 });
rideSchema.index({ driver_id: 1 }, {
  name: 'one_active_ride_per_driver',
  unique: true,
  partialFilterExpression: {
    driver_id: { $type: 'string' },
    status: { $in: ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED'] },
  },
});
rideSchema.index({ status: 1, created_at: -1 });
rideSchema.index({ status: 1, offering_expires_at: 1 });
rideSchema.index({ vehicle_id: 1, created_at: -1 });

export const RideModel: mongoose.Model<RideDocument> =
  (mongoose.models.Ride as mongoose.Model<RideDocument>) ||
  mongoose.model<RideDocument>('Ride', rideSchema);
