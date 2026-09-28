import mongoose, { type Document, Schema } from 'mongoose';
import { STATE_PRICING_STATUSES, type StatePricingStatus } from '@Cabzone/contracts';

export interface StatePricingDocument extends Document<string> {
  _id: string;
  state_code: string;
  rate_per_km_paise: number;
  base_fare_paise: number;
  minimum_fare_paise: number;
  version: number;
  status: StatePricingStatus;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Date;
}

const statePricingSchema = new Schema<StatePricingDocument>(
  {
    _id: { type: String, required: true },
    state_code: { type: String, required: true, uppercase: true, trim: true },
    rate_per_km_paise: { type: Number, required: true, min: 0 },
    base_fare_paise: { type: Number, required: true, min: 0 },
    minimum_fare_paise: { type: Number, required: true, min: 0 },
    version: { type: Number, default: 1 },
    status: {
      type: String,
      enum: STATE_PRICING_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    effective_from: { type: Date, required: true },
    effective_to: { type: Date, default: null },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: 'state_pricing',
    timestamps: false,
    _id: false,
    versionKey: false,
  },
);

statePricingSchema.index({ state_code: 1, status: 1 });
statePricingSchema.index({ state_code: 1, version: -1 });

export const StatePricingModel: mongoose.Model<StatePricingDocument> =
  (mongoose.models.StatePricing as mongoose.Model<StatePricingDocument>) ||
  mongoose.model<StatePricingDocument>('StatePricing', statePricingSchema);
