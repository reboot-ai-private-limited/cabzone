import mongoose, { type Document, Schema } from 'mongoose';
import {
  ZONE_STATUSES,
  ZONE_TYPES,
  type GeoJsonGeometry,
  type GeoJsonPolygon,
  type ZoneStatus,
  type ZoneType,
} from '@cabzone/contracts';

export interface ZoneDocument extends Document<string> {
  _id: string;
  name: string;
  code: string;
  zone_type: ZoneType;
  parent_city_zone_id: string | null;
  state_code: string;
  geometry: GeoJsonGeometry;
  boundary: GeoJsonPolygon;
  buffer_distance_m: number | null;
  status: ZoneStatus;
  current_pricing_config_id: string | null;
  version: number;
  supersedes_zone_id: string | null;
  superseded_by_zone_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const geometrySchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Polygon', 'MultiPolygon'],
      required: true,
      default: 'Polygon',
    },
    coordinates: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  { _id: false },
);

const zoneSchema = new Schema<ZoneDocument>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true, index: true },
    zone_type: {
      type: String,
      enum: ZONE_TYPES,
      required: true,
      index: true,
    },
    parent_city_zone_id: { type: String, default: null, index: true },
    state_code: { type: String, required: true, uppercase: true, trim: true },
    geometry: { type: geometrySchema, required: true },
    boundary: { type: geometrySchema, required: false },
    buffer_distance_m: { type: Number, default: null },
    status: {
      type: String,
      enum: ZONE_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    current_pricing_config_id: { type: String, default: null },
    version: { type: Number, default: 1 },
    supersedes_zone_id: { type: String, default: null, index: true },
    superseded_by_zone_id: { type: String, default: null, index: true },
    created_by: { type: String, default: null },
    updated_by: { type: String, default: null },
  },
  {
    collection: 'zones',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

zoneSchema.index({ geometry: '2dsphere' });
zoneSchema.index({ boundary: '2dsphere' });
zoneSchema.index({ zone_type: 1, status: 1 });
zoneSchema.index({ code: 1, version: -1 });
zoneSchema.index({ state_code: 1, status: 1 });
zoneSchema.index({ parent_city_zone_id: 1, status: 1 });

export const ZoneModel: mongoose.Model<ZoneDocument> =
  (mongoose.models.Zone as mongoose.Model<ZoneDocument>) ||
  mongoose.model<ZoneDocument>('Zone', zoneSchema);
