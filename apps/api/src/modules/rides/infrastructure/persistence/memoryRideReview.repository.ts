import type { RideReviewRole } from '@cabzone/contracts';
import type {
  CreateRideReviewResult,
  RideReviewEntity,
  RideReviewRepositoryPort,
} from '../../domain/index.js';

export class MemoryRideReviewRepository implements RideReviewRepositoryPort {
  private readonly byId = new Map<string, RideReviewEntity>();
  private readonly byRideRole = new Map<string, string>();

  private key(rideId: string, reviewerRole: RideReviewRole): string {
    return `${rideId}:${reviewerRole}`;
  }

  async createOrFindExisting(review: RideReviewEntity): Promise<CreateRideReviewResult> {
    const compositeKey = this.key(review.rideId, review.reviewerRole);
    const existingId = this.byRideRole.get(compositeKey);
    if (existingId) {
      const existing = this.byId.get(existingId)!;
      return { review: structuredClone(existing), created: false };
    }
    const stored = structuredClone(review);
    this.byId.set(stored.id, stored);
    this.byRideRole.set(compositeKey, stored.id);
    return { review: structuredClone(stored), created: true };
  }

  async findByRideId(rideId: string): Promise<RideReviewEntity[]> {
    return [...this.byId.values()]
      .filter((r) => r.rideId === rideId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => structuredClone(r));
  }

  async findByRideAndRole(
    rideId: string,
    reviewerRole: RideReviewRole,
  ): Promise<RideReviewEntity | null> {
    const id = this.byRideRole.get(this.key(rideId, reviewerRole));
    if (!id) return null;
    const found = this.byId.get(id);
    return found ? structuredClone(found) : null;
  }

  async findExpiredHidden(now: Date, limit: number): Promise<RideReviewEntity[]> {
    return [...this.byId.values()]
      .filter((r) => r.status === 'HIDDEN' && r.windowExpiresAt.getTime() <= now.getTime())
      .sort((a, b) => a.windowExpiresAt.getTime() - b.windowExpiresAt.getTime())
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }

  async claimReveal(reviewId: string, revealedAt: Date): Promise<RideReviewEntity | null> {
    const current = this.byId.get(reviewId);
    if (!current || current.status !== 'HIDDEN') {
      return null;
    }
    const updated: RideReviewEntity = {
      ...current,
      status: 'REVEALED',
      revealedAt,
      updatedAt: revealedAt,
    };
    this.byId.set(reviewId, updated);
    return structuredClone(updated);
  }
}
