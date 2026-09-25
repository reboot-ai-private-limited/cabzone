import type { RideEntity } from './ride.entity.js';

export interface AtomicClaimResult {
  ride: RideEntity;
  agreedFarePaise: number;
}

export interface RideRepositoryPort {
  save(ride: RideEntity): Promise<RideEntity>;
  findById(id: string): Promise<RideEntity | null>;
  /**
   * Atomically claims a ride for a driver if the ride is in SEARCHING / REQUESTED status
   * and driverId is null.
   * If already claimed or not in claimable state, returns null.
   */
  atomicClaimRide(opts: {
    rideId: string;
    driverId: string;
    agreedFarePaise: number;
    pickupOtpHash: string;
    pickupOtpExpiresAt: Date;
    assignedAt?: Date;
  }): Promise<RideEntity | null>;
}
