import mongoose, { type Document, Schema } from 'mongoose';

export interface SessionDocument extends Document<string> {
  _id: string;
  user_id: string;
  device_id: string;
  refresh_token_hash: string;
  previous_refresh_token_hash: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  last_used_at: Date;
  created_at: Date;
}

const sessionSchema = new Schema<SessionDocument>(
  {
    _id: { type: String, required: true },
    user_id: { type: String, required: true },
    device_id: { type: String, required: true },
    refresh_token_hash: { type: String, required: true, index: true },
    previous_refresh_token_hash: { type: String, default: null, index: true },
    expires_at: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    revoked_at: { type: Date, default: null },
    last_used_at: { type: Date, default: () => new Date() },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: 'sessions',
    timestamps: false,
    _id: false,
    versionKey: false,
  }
);

sessionSchema.index({ user_id: 1, device_id: 1 });

export const SessionModel: mongoose.Model<SessionDocument> =
  (mongoose.models.Session as mongoose.Model<SessionDocument>) ||
  mongoose.model<SessionDocument>('Session', sessionSchema);
