import mongoose, { type Document, Schema } from 'mongoose';
import type { GeoJsonGeometry } from '@cabzone/geo';
import type { StateBoundaryStatus } from '../../domain/index.js';

export interface StateBoundaryDocument extends Document<string> {
  _id: string;
  state_code: string;
  state_name: string;
  geometry: GeoJsonGeometry;
  version: number;
  status: StateBoundaryStatus;
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
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
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
