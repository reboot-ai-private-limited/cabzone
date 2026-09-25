import mongoose, { type Document, Schema } from 'mongoose';
import {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  type AdminRole,
  type AdminStatus,
} from '@cabzone/contracts';

export interface AdminUserDocument extends Document<string> {
  _id: string;
  user_id: string;
  role: AdminRole;
  city_zone_ids: string[];
  status: AdminStatus;
  created_at: Date;
  updated_at: Date;
}

const adminUserSchema = new Schema<AdminUserDocument>(
  {
    _id: { type: String, required: true },
    user_id: { type: String, required: true, unique: true },
    role: {
      type: String,
      enum: ADMIN_ROLES,
      required: true,
      index: true,
    },
    city_zone_ids: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ADMIN_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
  },
  {
    collection: 'admin_users',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  }
);

export const AdminUserModel =
  mongoose.models.AdminUser || mongoose.model<AdminUserDocument>('AdminUser', adminUserSchema);
