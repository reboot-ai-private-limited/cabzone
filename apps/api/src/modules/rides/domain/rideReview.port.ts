import type { RideReviewRole } from '@cabzone/contracts';
import type { RideReviewEntity } from './rideReview.entity.js';

export interface CreateRideReviewResult {
  review: RideReviewEntity;
  created: boolean;
}

export interface RideReviewRepositoryPort {
  createOrFindExisting(review: RideReviewEntity): Promise<CreateRideReviewResult>;
  findByRideId(rideId: string): Promise<RideReviewEntity[]>;
  findByRideAndRole(rideId: string, reviewerRole: RideReviewRole): Promise<RideReviewEntity | null>;
  findExpiredHidden(now: Date, limit: number): Promise<RideReviewEntity[]>;
  /**
   * Atomically transitions a review from HIDDEN -> REVEALED at most once.
   * Returns the updated entity ONLY if it was HIDDEN before this call; otherwise null.
   */
  claimReveal(reviewId: string, revealedAt: Date): Promise<RideReviewEntity | null>;
}

export type ProfileRatingApplierPort = (
  targetRole: RideReviewRole,
  targetId: string,
  stars: number,
) => Promise<void>;
