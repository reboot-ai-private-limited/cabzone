import mongoose, { type Document, Schema } from 'mongoose';
import {
  PRICING_CONFIG_LEVELS,
  PRICING_CONFIG_STATUSES,
  VEHICLE_CATEGORIES,
  type PricingConfigLevel,
  type PricingConfigStatus,
  type VehicleCategory,
} from '@cabzone/contracts';

export interface PricingConfigDocument extends Document<string> {
  _id: string;
  level: PricingConfigLevel;
  city_zone_id: string | null;
  state_code: string | null;
  state_name: string | null;
  version: number;
  vehicle_type: VehicleCategory;
  base_fare_paise: number;
  rate_per_km_paise: number;
  minimum_fare_paise: number;
  outstation_base_fare_paise: number;
  outstation_rate_per_km_paise: number;
  outstation_minimum_fare_paise: number;
  buffer_surcharge_paise: number;
  negotiation_floor_percent: number;
  negotiation_ceiling_percent: number;
  negotiation_window_seconds: number;
  commission_percent: number;
  effective_from: Date;
  effective_to: Date | null;
  status: PricingConfigStatus;
  created_by_admin_id: string;
  created_at: Date;
}

const pricingConfigSchema = new Schema<PricingConfigDocument>(
  {
    _id: { type: String, required: true },
    level: {
      type: String,
      enum: PRICING_CONFIG_LEVELS,
      default: 'CITY',
      index: true,
    },
    city_zone_id: { type: String, default: null, index: true },
    state_code: { type: String, default: null, index: true },
    state_name: { type: String, default: null },
    version: { type: Number, default: 1 },
    vehicle_type: {
      type: String,
      enum: VEHICLE_CATEGORIES,
      required: true,
    },
    base_fare_paise: { type: Number, required: true, min: 0 },
    rate_per_km_paise: { type: Number, required: true, min: 0 },
    minimum_fare_paise: { type: Number, required: true, min: 0 },
    outstation_base_fare_paise: { type: Number, required: true, min: 0 },
    outstation_rate_per_km_paise: { type: Number, required: true, min: 0 },
    outstation_minimum_fare_paise: { type: Number, required: true, min: 0 },
    buffer_surcharge_paise: { type: Number, default: 0, min: 0 },
    negotiation_floor_percent: { type: Number, default: 80, min: 10, max: 100 },
    negotiation_ceiling_percent: { type: Number, default: 150, min: 100, max: 300 },
    negotiation_window_seconds: { type: Number, default: 90, min: 15, max: 300 },
    commission_percent: { type: Number, default: 0, min: 0, max: 100 },
    effective_from: { type: Date, required: true, index: true },
    effective_to: { type: Date, default: null },
    status: {
      type: String,
      enum: PRICING_CONFIG_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    created_by_admin_id: { type: String, required: true },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: 'pricing_configs',
    timestamps: false,
    _id: false,
    versionKey: false,
  },
);

pricingConfigSchema.index({ city_zone_id: 1, vehicle_type: 1, version: -1 });
pricingConfigSchema.index({ city_zone_id: 1, vehicle_type: 1, status: 1 });
pricingConfigSchema.index({ level: 1, state_code: 1, vehicle_type: 1, status: 1 });
pricingConfigSchema.index({ level: 1, vehicle_type: 1, status: 1 });

export const PricingConfigModel: mongoose.Model<PricingConfigDocument> =
  (mongoose.models.PricingConfig as mongoose.Model<PricingConfigDocument>) ||
  mongoose.model<PricingConfigDocument>('PricingConfig', pricingConfigSchema);

