import mongoose, { type Document, Schema } from 'mongoose';
import {
  RIDE_REVIEW_ROLES,
  RIDE_REVIEW_STATUSES,
  type RideReviewRole,
  type RideReviewStatus,
} from '@cabzone/contracts';

export interface RideReviewDocument extends Document<string> {
  _id: string;
  ride_id: string;
  reviewer_role: RideReviewRole;
  reviewer_id: string;
  reviewee_role: RideReviewRole;
  reviewee_id: string;
  stars: number;
  tags: string[];
  comment: string | null;
  status: RideReviewStatus;
  window_expires_at: Date;
  revealed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const rideReviewSchema = new Schema<RideReviewDocument>(
  {
    _id: { type: String, required: true },
    ride_id: { type: String, required: true, index: true },
    reviewer_role: { type: String, enum: RIDE_REVIEW_ROLES, required: true },
    reviewer_id: { type: String, required: true },
    reviewee_role: { type: String, enum: RIDE_REVIEW_ROLES, required: true },
    reviewee_id: { type: String, required: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    tags: { type: [String], default: [] },
    comment: { type: String, default: null },
    status: { type: String, enum: RIDE_REVIEW_STATUSES, default: 'HIDDEN', required: true },
    window_expires_at: { type: Date, required: true },
    revealed_at: { type: Date, default: null },
  },
  {
    collection: 'ride_reviews',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    _id: false,
    versionKey: false,
  },
);

// D-046: Strictly at most one immutable review per participant role per ride
rideReviewSchema.index({ ride_id: 1, reviewer_role: 1 }, { unique: true });
// D-046: Efficient 7-day double-blind expiry sweep
rideReviewSchema.index({ status: 1, window_expires_at: 1 });
// Profile lookup index
rideReviewSchema.index({ reviewee_role: 1, reviewee_id: 1, status: 1 });

export const RideReviewModel: mongoose.Model<RideReviewDocument> =
  (mongoose.models.RideReview as mongoose.Model<RideReviewDocument>) ||
  mongoose.model<RideReviewDocument>('RideReview', rideReviewSchema);
