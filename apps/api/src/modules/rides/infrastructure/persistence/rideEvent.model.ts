import mongoose, { type Document, Schema } from 'mongoose';
import {
  RIDE_EVENT_ACTORS,
  RIDE_STATUSES,
  type RideEventActor,
  type RideStatus,
} from '@cabzone/contracts';

export interface RideEventDocument extends Document<string> {
  _id: string;
  ride_id: string;
  event_type: string;
  actor_type: RideEventActor;
  actor_id: string | null;
  previous_status: RideStatus | null;
  new_status: RideStatus | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

const rideEventSchema = new Schema<RideEventDocument>(
  {
    _id: { type: String, required: true },
    ride_id: { type: String, required: true },
    event_type: { type: String, required: true },
    actor_type: {
      type: String,
      enum: RIDE_EVENT_ACTORS,
      required: true,
    },
    actor_id: { type: String, default: null },
    previous_status: {
      type: String,
      enum: RIDE_STATUSES,
      default: null,
    },
    new_status: {
      type: String,
      enum: RIDE_STATUSES,
      default: null,
    },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: 'ride_events',
    timestamps: false,
    _id: false,
    versionKey: false,
  },
);

rideEventSchema.index({ ride_id: 1, created_at: -1 });
rideEventSchema.index({ event_type: 1, created_at: -1 });

export const RideEventModel: mongoose.Model<RideEventDocument> =
  (mongoose.models.RideEvent as mongoose.Model<RideEventDocument>) ||
  mongoose.model<RideEventDocument>('RideEvent', rideEventSchema);
