import type { DriverEntity } from './driver.entity.js';
import type { TrustSnapshot } from './trustSnapshot.js';

export interface DriverRepositoryPort {
  findById(driverId: string): Promise<DriverEntity | null>;
  findByUserId(userId: string): Promise<DriverEntity | null>;
  create(driver: DriverEntity): Promise<DriverEntity>;
  update(driver: DriverEntity): Promise<DriverEntity>;
  applyRevealedRating?(
    driverId: string,
    stars: number,
  ): Promise<{ ratingAverage: number; ratingCount: number }>;
  findManyByIds?(ids: string[]): Promise<DriverEntity[]>;
  /** Stores a refreshed trust score without touching the profile version. */
  saveTrust?(id: string, trust: TrustSnapshot): Promise<void>;
  /** Cursor pagination over profile ids, used by the nightly refresh and backfills. */
  listIds?(afterId: string | null, limit: number): Promise<string[]>;
}
