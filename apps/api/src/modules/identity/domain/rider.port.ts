import type { UserStatus } from '@cabzone/contracts';
import type { RiderEntity } from './rider.entity.js';

export interface RiderListFilter {
  search?: string | undefined;
  status?: UserStatus | undefined;
  limit: number;
  offset: number;
}

export interface RiderWithUser {
  rider: RiderEntity;
  status: UserStatus;
  totalRides: number;
  completedRides: number;
}

export interface RiderRideStats {
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  totalSpentPaise: number;
}

export interface RiderRepositoryPort {
  findById(riderId: string): Promise<RiderEntity | null>;
  findByUserId(userId: string): Promise<RiderEntity | null>;
  create(rider: RiderEntity): Promise<RiderEntity>;
  update(rider: RiderEntity): Promise<RiderEntity>;
  list(filter: RiderListFilter): Promise<{ items: RiderWithUser[]; total: number }>;
  getRideStats?(riderId: string): Promise<RiderRideStats>;
  applyRevealedRating?(
    riderId: string,
    stars: number,
  ): Promise<{ ratingAverage: number; ratingCount: number }>;
}
