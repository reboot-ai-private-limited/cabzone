import {
  DRIVER_TO_RIDER_RATING_TAGS,
  RIDE_RATING_WINDOW_MS,
  RIDER_TO_DRIVER_RATING_TAGS,
  type RideReviewDto,
  type RideReviewRole,
  type RideReviewStatus,
} from '@cabzone/contracts';

export interface RideReviewEntity {
  id: string;
  rideId: string;
  reviewerRole: RideReviewRole;
  reviewerId: string;
  revieweeRole: RideReviewRole;
  revieweeId: string;
  stars: number;
  tags: string[];
  comment: string | null;
  status: RideReviewStatus;
  windowExpiresAt: Date;
  revealedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const RIDER_TAG_SET: ReadonlySet<string> = new Set(RIDER_TO_DRIVER_RATING_TAGS);
const DRIVER_TAG_SET: ReadonlySet<string> = new Set(DRIVER_TO_RIDER_RATING_TAGS);

export function computeRatingWindowExpiresAt(settledAt: Date): Date {
  return new Date(settledAt.getTime() + RIDE_RATING_WINDOW_MS);
}

export function normalizeReviewTags(reviewerRole: RideReviewRole, rawTags?: string[]): string[] {
  if (!rawTags || rawTags.length === 0) return [];
  const allowed = reviewerRole === 'RIDER' ? RIDER_TAG_SET : DRIVER_TAG_SET;
  const deduped: string[] = [];
  for (const raw of rawTags) {
    const tag = raw.trim().toUpperCase();
    if (!allowed.has(tag)) {
      throw new Error(`INVALID_RATING_TAG:${tag}`);
    }
    if (!deduped.includes(tag)) {
      deduped.push(tag);
    }
  }
  return deduped.slice(0, 5);
}

export function normalizeReviewComment(comment?: string | null): string | null {
  if (comment === undefined || comment === null) return null;
  const trimmed = comment.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isIdempotentReviewReplay(
  existing: RideReviewEntity,
  incoming: { stars: number; tags: string[]; comment: string | null },
): boolean {
  if (existing.stars !== incoming.stars) return false;
  if ((existing.comment ?? null) !== incoming.comment) return false;
  if (existing.tags.length !== incoming.tags.length) return false;
  const existingSorted = [...existing.tags].sort();
  const incomingSorted = [...incoming.tags].sort();
  return existingSorted.every((t, i) => t === incomingSorted[i]);
}

export function toRideReviewDto(entity: RideReviewEntity): RideReviewDto {
  return {
    id: entity.id,
    rideId: entity.rideId,
    reviewerRole: entity.reviewerRole,
    revieweeRole: entity.revieweeRole,
    stars: entity.stars,
    tags: [...entity.tags],
    comment: entity.comment,
    status: entity.status,
    windowExpiresAt: entity.windowExpiresAt.toISOString(),
    revealedAt: entity.revealedAt ? entity.revealedAt.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
  };
}
