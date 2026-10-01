import type { RiderEntity } from './rider.entity.js';

export interface RiderRepositoryPort {
  findById(riderId: string): Promise<RiderEntity | null>;
  findByUserId(userId: string): Promise<RiderEntity | null>;
  create(rider: RiderEntity): Promise<RiderEntity>;
}
