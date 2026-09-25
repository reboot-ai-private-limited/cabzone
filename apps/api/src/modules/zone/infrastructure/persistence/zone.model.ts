import mongoose, { type Document, Schema } from 'mongoose';
import {
  ZONE_STATUSES,
  ZONE_TYPES,
  type GeoJsonPolygon,
  type ZoneStatus,
  type ZoneType,
} from '@cabzone/contracts';

export interface ZoneDocument extends Document<string> {
  _id: string;
  name: string;
  zone_type: ZoneType;
  parent_city_zone_id: string | null;
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

const zoneSchema = new Schema<ZoneDocument>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    zone_type: {
      type: String,
      enum: ZONE_TYPES,
      required: true,
      index: true,
    },
    parent_city_zone_id: { type: String, default: null, index: true },
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
    collection: 'zones',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

zoneSchema.index({ boundary: '2dsphere' });
zoneSchema.index({ zone_type: 1, status: 1 });
zoneSchema.index({ state_code: 1, status: 1 });
zoneSchema.index({ parent_city_zone_id: 1, status: 1 });

export const ZoneModel: mongoose.Model<ZoneDocument> =
  (mongoose.models.Zone as mongoose.Model<ZoneDocument>) ||
  mongoose.model<ZoneDocument>('Zone', zoneSchema);
