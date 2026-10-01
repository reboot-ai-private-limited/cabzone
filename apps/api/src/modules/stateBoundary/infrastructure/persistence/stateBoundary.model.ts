import mongoose, { type Document, Schema } from 'mongoose';
import type { GeoJsonGeometry } from '@cabzone/geo';
import type { StateBoundaryHistoryAction, StateBoundaryStatus } from '../../domain/index.js';

export interface StateBoundaryDocument extends Document<string> {
  _id: string;
  state_code: string;
  state_name: string;
  geometry: GeoJsonGeometry;
  version: number;
  config_version: number;
  status: StateBoundaryStatus;
  intrastate_enabled: boolean;
  interstate_drop_off_enabled: boolean;
  source: string;
  source_version: string | null;
  created_at: Date;
  updated_at: Date;
}

const geometrySchema = new Schema(
  {
    type: { type: String, enum: ['Polygon', 'MultiPolygon'], required: true },
    coordinates: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const stateBoundarySchema = new Schema<StateBoundaryDocument>(
  {
    _id: { type: String, required: true },
    state_code: { type: String, required: true, uppercase: true, trim: true, unique: true },
    state_name: { type: String, required: true, trim: true },
    geometry: { type: geometrySchema, required: true },
    version: { type: Number, default: 1 },
    config_version: { type: Number, default: 1 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    intrastate_enabled: { type: Boolean, default: true },
    interstate_drop_off_enabled: { type: Boolean, default: true },
    source: { type: String, required: true },
    source_version: { type: String, default: null },
  },
  {
    collection: 'state_boundaries',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

stateBoundarySchema.index({ geometry: '2dsphere' });
stateBoundarySchema.index({ state_code: 1, status: 1 });

export const StateBoundaryModel: mongoose.Model<StateBoundaryDocument> =
  (mongoose.models.StateBoundary as mongoose.Model<StateBoundaryDocument>) ||
  mongoose.model<StateBoundaryDocument>('StateBoundary', stateBoundarySchema);

export interface StateBoundaryHistoryDocument extends Document<string> {
  _id: string;
  state_code: string;
  action: StateBoundaryHistoryAction;
  version: number;
  config_version: number;
  source: string | null;
  source_version: string | null;
  previous_geometry: GeoJsonGeometry | null;
  at: Date;
}

const historySchema = new Schema<StateBoundaryHistoryDocument>(
  {
    _id: { type: String, required: true },
    state_code: { type: String, required: true, uppercase: true, trim: true },
    action: {
      type: String,
      enum: ['IMPORTED', 'UPDATED', 'ACTIVATED', 'DEACTIVATED'],
      required: true,
    },
    version: { type: Number, required: true },
    config_version: { type: Number, required: true },
    source: { type: String, default: null },
    source_version: { type: String, default: null },
    previous_geometry: { type: Schema.Types.Mixed, default: null },
    at: { type: Date, required: true },
  },
  { collection: 'state_boundary_history', _id: false, versionKey: false },
);
historySchema.index({ state_code: 1, at: -1 });

export const StateBoundaryHistoryModel: mongoose.Model<StateBoundaryHistoryDocument> =
  (mongoose.models.StateBoundaryHistory as mongoose.Model<StateBoundaryHistoryDocument>) ||
  mongoose.model<StateBoundaryHistoryDocument>('StateBoundaryHistory', historySchema);
