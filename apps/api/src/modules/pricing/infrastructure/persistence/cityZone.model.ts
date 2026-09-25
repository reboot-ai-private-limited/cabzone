import mongoose, { type Document, Schema } from 'mongoose';
import { ZONE_STATUSES, type GeoJsonPolygon, type ZoneStatus } from '@cabzone/contracts';

export interface CityZoneDocument extends Document<string> {
  _id: string;
  city_name: string;
  state_code: string;
  boundary: GeoJsonPolygon;
  buffer_distance_m: number | null;
  status: ZoneStatus;
  current_pricing_config_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const polygonSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Polygon'],
      required: true,
      default: 'Polygon',
    },
    coordinates: {
      type: [[[Number]]],
      required: true,
    },
  },
  { _id: false },
);

const cityZoneSchema = new Schema<CityZoneDocument>(
  {
    _id: { type: String, required: true },
    city_name: { type: String, required: true, trim: true },
    state_code: { type: String, required: true, uppercase: true, trim: true },
    boundary: { type: polygonSchema, required: true },
    buffer_distance_m: { type: Number, default: null },
    status: {
      type: String,
      enum: ZONE_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    current_pricing_config_id: { type: String, default: null },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'city_zones',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

cityZoneSchema.index({ boundary: '2dsphere' });
cityZoneSchema.index({ state_code: 1, status: 1 });
cityZoneSchema.index({ city_name: 1, status: 1 });

export const CityZoneModel: mongoose.Model<CityZoneDocument> =
  (mongoose.models.CityZone as mongoose.Model<CityZoneDocument>) ||
  mongoose.model<CityZoneDocument>('CityZone', cityZoneSchema);
