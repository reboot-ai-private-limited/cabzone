import type { RiderEntity } from './rider.entity.js';

export interface RiderRepositoryPort {
  findByUserId(userId: string): Promise<RiderEntity | null>;
  create(rider: RiderEntity): Promise<RiderEntity>;
}
