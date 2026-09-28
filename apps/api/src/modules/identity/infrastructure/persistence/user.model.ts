import mongoose, { type Document, Schema } from 'mongoose';
import { USER_STATUSES, type UserStatus } from '@Cabzone/contracts';

export interface UserDocument extends Document<string> {
  _id: string;
  phone_e164: string;
  phone_verified_at: Date | null;
  status: UserStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    _id: { type: String, required: true },
    phone_e164: { type: String, required: true, unique: true },
    phone_verified_at: { type: Date, default: null },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'users',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  }
);

export const UserModel: mongoose.Model<UserDocument> =
  (mongoose.models.User as mongoose.Model<UserDocument>) ||
  mongoose.model<UserDocument>('User', userSchema);
