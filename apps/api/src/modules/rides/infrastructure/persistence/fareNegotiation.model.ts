import mongoose, { type Document, Schema } from 'mongoose';
import {
  NEGOTIATION_ACTIONS,
  NEGOTIATION_ACTORS,
  type NegotiationAction,
  type NegotiationActor,
} from '@Cabzone/contracts';

export interface FareNegotiationDocument extends Document<string> {
  _id: string;
  ride_id: string;
  actor_type: NegotiationActor;
  actor_id: string | null;
  previous_fare_paise: number | null;
  proposed_fare_paise: number;
  action: NegotiationAction;
  reason_code: string | null;
  created_at: Date;
}

const fareNegotiationSchema = new Schema<FareNegotiationDocument>(
  {
    _id: { type: String, required: true },
    ride_id: { type: String, required: true },
    actor_type: {
      type: String,
      enum: NEGOTIATION_ACTORS,
      required: true,
    },
    actor_id: { type: String, default: null },
    previous_fare_paise: { type: Number, default: null },
    proposed_fare_paise: { type: Number, required: true, min: 0 },
    action: {
      type: String,
      enum: NEGOTIATION_ACTIONS,
      default: 'PROPOSED',
      index: true,
    },
    reason_code: { type: String, default: null },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: 'fare_negotiations',
    timestamps: false,
    _id: false,
    versionKey: false,
  },
);

fareNegotiationSchema.index({ ride_id: 1, created_at: -1 });
fareNegotiationSchema.index({ ride_id: 1, action: 1 });

export const FareNegotiationModel: mongoose.Model<FareNegotiationDocument> =
  (mongoose.models.FareNegotiation as mongoose.Model<FareNegotiationDocument>) ||
  mongoose.model<FareNegotiationDocument>('FareNegotiation', fareNegotiationSchema);
