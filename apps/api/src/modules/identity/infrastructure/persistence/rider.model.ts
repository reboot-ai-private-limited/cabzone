import mongoose, { type Document, Schema } from 'mongoose';

export interface RiderDocument extends Document<string> {
  _id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  emergency_contact: {
    name: string;
    phone_e164: string;
  } | null;
  preferred_language: string | null;
  rating_average: number | null;
  rating_count: number;
  trust_score: number | null;
  trust_tier?: string | null;
  trust_breakdown?: Record<string, unknown> | null;
  trust_updated_at?: Date | null;
  rating_sum?: number;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const emergencyContactSchema = new Schema(
  {
    name: { type: String, required: true },
    phone_e164: { type: String, required: true },
  },
  { _id: false }
);

const riderSchema = new Schema<RiderDocument>(
  {
    _id: { type: String, required: true },
    user_id: { type: String, required: true, unique: true },
    name: { type: String, default: null },
    email: { type: String, default: null },
    emergency_contact: { type: emergencyContactSchema, default: null },
    preferred_language: { type: String, default: null },
    rating_average: { type: Number, default: null },
    rating_count: { type: Number, default: 0 },
    trust_score: { type: Number, default: null },
    trust_tier: { type: String, default: null },
    trust_breakdown: { type: Schema.Types.Mixed, default: null },
    trust_updated_at: { type: Date, default: null },
    rating_sum: { type: Number, default: 0, min: 0 },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'riders',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  }
);

export const RiderModel: mongoose.Model<RiderDocument> =
  (mongoose.models.Rider as mongoose.Model<RiderDocument>) ||
  mongoose.model<RiderDocument>('Rider', riderSchema);
