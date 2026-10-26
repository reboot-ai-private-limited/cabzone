import type { RideReviewRole } from '@cabzone/contracts';
import type {
  CreateRideReviewResult,
  RideReviewEntity,
  RideReviewRepositoryPort,
} from '../../domain/index.js';
import { RideReviewModel, type RideReviewDocument } from './rideReview.model.js';

export class MongoRideReviewRepository implements RideReviewRepositoryPort {
  async createOrFindExisting(review: RideReviewEntity): Promise<CreateRideReviewResult> {
    await RideReviewModel.init();
    try {
      const created = await RideReviewModel.create({
        _id: review.id,
        ride_id: review.rideId,
        reviewer_role: review.reviewerRole,
        reviewer_id: review.reviewerId,
        reviewee_role: review.revieweeRole,
        reviewee_id: review.revieweeId,
        stars: review.stars,
        tags: [...review.tags],
        comment: review.comment,
        status: review.status,
        window_expires_at: review.windowExpiresAt,
        revealed_at: review.revealedAt,
      });
      return {
        review: this.toEntity(created.toObject() as RideReviewDocument),
        created: true,
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        const existing = await RideReviewModel.findOne({
          ride_id: review.rideId,
          reviewer_role: review.reviewerRole,
        })
          .lean<RideReviewDocument | null>()
          .exec();
        if (existing) {
          return { review: this.toEntity(existing), created: false };
        }
      }
      throw error;
    }
  }

  async findByRideId(rideId: string): Promise<RideReviewEntity[]> {
    const docs = await RideReviewModel.find({ ride_id: rideId })
      .sort({ created_at: 1 })
      .lean<RideReviewDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findByRideAndRole(
    rideId: string,
    reviewerRole: RideReviewRole,
  ): Promise<RideReviewEntity | null> {
    const doc = await RideReviewModel.findOne({
      ride_id: rideId,
      reviewer_role: reviewerRole,
    })
      .lean<RideReviewDocument | null>()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findExpiredHidden(now: Date, limit: number): Promise<RideReviewEntity[]> {
    const docs = await RideReviewModel.find({
      status: 'HIDDEN',
      window_expires_at: { $lte: now },
    })
      .sort({ window_expires_at: 1 })
      .limit(limit)
      .lean<RideReviewDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async claimReveal(reviewId: string, revealedAt: Date): Promise<RideReviewEntity | null> {
    const updated = await RideReviewModel.findOneAndUpdate(
      { _id: reviewId, status: 'HIDDEN' },
      {
        $set: {
          status: 'REVEALED',
          revealed_at: revealedAt,
        },
      },
      { new: true },
    )
      .lean<RideReviewDocument | null>()
      .exec();
    return updated ? this.toEntity(updated) : null;
  }

  private toEntity(doc: RideReviewDocument): RideReviewEntity {
    return {
      id: doc._id,
      rideId: doc.ride_id,
      reviewerRole: doc.reviewer_role,
      reviewerId: doc.reviewer_id,
      revieweeRole: doc.reviewee_role,
      revieweeId: doc.reviewee_id,
      stars: doc.stars,
      tags: [...(doc.tags ?? [])],
      comment: doc.comment ?? null,
      status: doc.status,
      windowExpiresAt: doc.window_expires_at,
      revealedAt: doc.revealed_at ?? null,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
