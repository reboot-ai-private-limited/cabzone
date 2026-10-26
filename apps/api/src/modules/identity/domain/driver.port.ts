import type { DriverEntity } from './driver.entity.js';

export interface DriverRepositoryPort {
  findById(driverId: string): Promise<DriverEntity | null>;
  findByUserId(userId: string): Promise<DriverEntity | null>;
  create(driver: DriverEntity): Promise<DriverEntity>;
  update(driver: DriverEntity): Promise<DriverEntity>;
  applyRevealedRating?(
    driverId: string,
    stars: number,
  ): Promise<{ ratingAverage: number; ratingCount: number }>;
}
