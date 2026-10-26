import crypto from 'node:crypto';
import type { RideRatingStatusDto, RideReviewRole } from '@cabzone/contracts';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import {
  computeRatingWindowExpiresAt,
  isIdempotentReviewReplay,
  normalizeReviewComment,
  normalizeReviewTags,
  toRideReviewDto,
  type ProfileRatingApplierPort,
  type RideEntity,
  type RideEventRepositoryPort,
  type RideRepositoryPort,
  type RideReviewRepositoryPort,
} from '../../domain/index.js';

export interface RideRatingsUseCaseDeps {
  unitOfWork: UnitOfWorkPort;
  rideRepo: RideRepositoryPort;
  rideEventRepo: RideEventRepositoryPort;
  reviewRepo: RideReviewRepositoryPort;
  applyRevealedProfileRating: ProfileRatingApplierPort;
  now?: (() => Date) | undefined;
}

export interface SubmitRideRatingInput {
  rideId: string;
  actorRole: RideReviewRole;
  actorProfileId: string;
  stars: number;
  tags?: string[] | undefined;
  comment?: string | null | undefined;
  now?: Date | undefined;
}

export interface GetRideRatingStatusInput {
  ride: RideEntity;
  viewerRole: 'RIDER' | 'DRIVER' | 'ADMIN';
  viewerProfileId: string | null;
  now?: Date | undefined;
}

export class RideRatingsUseCase {
  constructor(private readonly deps: RideRatingsUseCaseDeps) {}

  private clock(override?: Date): Date {
    return override ?? this.deps.now?.() ?? new Date();
  }

  async submitRating(
    input: SubmitRideRatingInput,
  ): Promise<{ status: RideRatingStatusDto; created: boolean }> {
    const now = this.clock(input.now);

    if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
      throw AppError.badRequest(
        'INVALID_RATING_STARS: Rating stars must be an integer between 1 and 5.',
      );
    }

    let normalizedTags: string[];
    try {
      normalizedTags = normalizeReviewTags(input.actorRole, input.tags);
    } catch {
      throw AppError.badRequest(
        'INVALID_RATING_TAG: Unsupported rating tag for this participant role.',
      );
    }

    const normalizedComment = normalizeReviewComment(input.comment);
    if (normalizedComment !== null && normalizedComment.length > 280) {
      throw AppError.badRequest(
        'INVALID_RATING_COMMENT: Feedback comment must be 280 characters or fewer.',
      );
    }

    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }

    if (input.actorRole === 'RIDER') {
      if (ride.bookerRiderId !== input.actorProfileId) {
        if (ride.passenger.riderId === input.actorProfileId) {
          throw AppError.forbidden(
            'ONLY_BOOKER_RIDER_CAN_RATE: Only the booking rider can submit a rating for this ride.',
          );
        }
        throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
      }
    } else if (ride.driverId !== input.actorProfileId) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }

    // Check existing submission first so network retries replay idempotently and edit attempts fail cleanly
    const existing = await this.deps.reviewRepo.findByRideAndRole(ride.id, input.actorRole);
    if (existing) {
      if (
        !isIdempotentReviewReplay(existing, {
          stars: input.stars,
          tags: normalizedTags,
          comment: normalizedComment,
        })
      ) {
        throw AppError.conflict(
          'RATING_ALREADY_SUBMITTED: Ratings are immutable once submitted for a ride.',
        );
      }
      await this.reconcileRideReviews(ride.id, now);
      return {
        status: await this.buildRatingStatus(ride, input.actorRole, input.actorProfileId, now),
        created: false,
      };
    }

    if (ride.status !== 'SETTLED' || !ride.settledAt || !ride.driverId) {
      throw AppError.conflict(
        'RIDE_NOT_SETTLED: Ratings can only be submitted after the ride is settled.',
      );
    }

    const windowExpiresAt = computeRatingWindowExpiresAt(ride.settledAt);
    if (now.getTime() > windowExpiresAt.getTime()) {
      throw AppError.conflict(
        'RATING_WINDOW_EXPIRED: The 7-day post-ride rating window has closed.',
      );
    }

    const revieweeRole: RideReviewRole = input.actorRole === 'RIDER' ? 'DRIVER' : 'RIDER';
    const revieweeId = input.actorRole === 'RIDER' ? ride.driverId : ride.bookerRiderId;

    const { review, created } = await this.deps.reviewRepo.createOrFindExisting({
      id: crypto.randomUUID(),
      rideId: ride.id,
      reviewerRole: input.actorRole,
      reviewerId: input.actorProfileId,
      revieweeRole,
      revieweeId,
      stars: input.stars,
      tags: normalizedTags,
      comment: normalizedComment,
      status: 'HIDDEN',
      windowExpiresAt,
      revealedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    if (
      !created &&
      !isIdempotentReviewReplay(review, {
        stars: input.stars,
        tags: normalizedTags,
        comment: normalizedComment,
      })
    ) {
      throw AppError.conflict(
        'RATING_ALREADY_SUBMITTED: Ratings are immutable once submitted for a ride.',
      );
    }

    await this.reconcileRideReviews(ride.id, now);

    return {
      status: await this.buildRatingStatus(ride, input.actorRole, input.actorProfileId, now),
      created,
    };
  }

  async getRatingStatus(input: GetRideRatingStatusInput): Promise<RideRatingStatusDto> {
    const now = this.clock(input.now);
    if (input.ride.status === 'SETTLED') {
      await this.reconcileRideReviews(input.ride.id, now);
    }
    return this.buildRatingStatus(input.ride, input.viewerRole, input.viewerProfileId, now);
  }

  async revealExpiredRatings(nowOverride?: Date, limit = 100): Promise<number> {
    const now = this.clock(nowOverride);
    const expiredHidden = await this.deps.reviewRepo.findExpiredHidden(now, limit);
    let revealedCount = 0;
    for (const review of expiredHidden) {
      const revealed = await this.revealSingleReview(review.id, now);
      if (revealed) revealedCount++;
    }
    return revealedCount;
  }

  private async reconcileRideReviews(rideId: string, now: Date): Promise<void> {
    const reviews = await this.deps.reviewRepo.findByRideId(rideId);
    if (reviews.length === 0) return;

    const hasRiderReview = reviews.some((r) => r.reviewerRole === 'RIDER');
    const hasDriverReview = reviews.some((r) => r.reviewerRole === 'DRIVER');
    const bothSubmitted = hasRiderReview && hasDriverReview;

    for (const review of reviews) {
      if (
        review.status === 'HIDDEN' &&
        (bothSubmitted || now.getTime() >= review.windowExpiresAt.getTime())
      ) {
        await this.revealSingleReview(review.id, now);
      }
    }
  }

  private async revealSingleReview(reviewId: string, now: Date): Promise<boolean> {
    return this.deps.unitOfWork.run(async () => {
      const claimed = await this.deps.reviewRepo.claimReveal(reviewId, now);
      if (!claimed) return false;

      await this.deps.applyRevealedProfileRating(
        claimed.revieweeRole,
        claimed.revieweeId,
        claimed.stars,
      );

      await this.deps.rideEventRepo.save({
        id: crypto.randomUUID(),
        rideId: claimed.rideId,
        eventType: 'RIDE_RATING_REVEALED',
        actorType: 'SYSTEM',
        actorId: null,
        previousStatus: 'SETTLED',
        newStatus: 'SETTLED',
        metadata: {
          reviewId: claimed.id,
          reviewerRole: claimed.reviewerRole,
          revieweeRole: claimed.revieweeRole,
          stars: claimed.stars,
        },
        createdAt: now,
      });

      return true;
    });
  }

  private async buildRatingStatus(
    ride: RideEntity,
    viewerRole: 'RIDER' | 'DRIVER' | 'ADMIN',
    viewerProfileId: string | null,
    now: Date,
  ): Promise<RideRatingStatusDto> {
    const reviews = await this.deps.reviewRepo.findByRideId(ride.id);
    const riderReview = reviews.find((r) => r.reviewerRole === 'RIDER') ?? null;
    const driverReview = reviews.find((r) => r.reviewerRole === 'DRIVER') ?? null;

    const eligible = ride.status === 'SETTLED' && ride.settledAt !== null && ride.driverId !== null;
    const windowExpiresAt = ride.settledAt ? computeRatingWindowExpiresAt(ride.settledAt) : null;
    const isWindowExpired =
      windowExpiresAt !== null ? now.getTime() > windowExpiresAt.getTime() : false;

    if (viewerRole === 'RIDER' && viewerProfileId !== null && viewerProfileId === ride.bookerRiderId) {
      return {
        rideId: ride.id,
        eligible,
        canSubmit: eligible && !isWindowExpired && riderReview === null,
        windowExpiresAt: windowExpiresAt ? windowExpiresAt.toISOString() : null,
        isWindowExpired,
        visibilityRule: 'DOUBLE_BLIND_7D',
        myReview: riderReview ? toRideReviewDto(riderReview) : null,
        counterpartyReview:
          driverReview && driverReview.status === 'REVEALED'
            ? toRideReviewDto(driverReview)
            : null,
      };
    }

    if (viewerRole === 'DRIVER' && viewerProfileId !== null && viewerProfileId === ride.driverId) {
      return {
        rideId: ride.id,
        eligible,
        canSubmit: eligible && !isWindowExpired && driverReview === null,
        windowExpiresAt: windowExpiresAt ? windowExpiresAt.toISOString() : null,
        isWindowExpired,
        visibilityRule: 'DOUBLE_BLIND_7D',
        myReview: driverReview ? toRideReviewDto(driverReview) : null,
        counterpartyReview:
          riderReview && riderReview.status === 'REVEALED'
            ? toRideReviewDto(riderReview)
            : null,
      };
    }

    // Non-booker passenger or admin: never expose HIDDEN reviews before reveal
    return {
      rideId: ride.id,
      eligible,
      canSubmit: false,
      windowExpiresAt: windowExpiresAt ? windowExpiresAt.toISOString() : null,
      isWindowExpired,
      visibilityRule: 'DOUBLE_BLIND_7D',
      myReview:
        riderReview && riderReview.status === 'REVEALED' ? toRideReviewDto(riderReview) : null,
      counterpartyReview:
        driverReview && driverReview.status === 'REVEALED' ? toRideReviewDto(driverReview) : null,
    };
  }
}
