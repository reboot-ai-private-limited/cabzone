import type { RideEntity } from './ride.entity.js';

export interface AtomicClaimResult {
  ride: RideEntity;
  agreedFarePaise: number;
}

export interface RideRepositoryPort {
  save(ride: RideEntity): Promise<RideEntity>;
  findById(id: string): Promise<RideEntity | null>;
  atomicClaimRide(opts: {
    rideId: string;
    driverId: string;
    agreedFarePaise: number;
    pickupOtpHash: string;
    pickupOtpExpiresAt: Date;
    assignedAt?: Date;
  }): Promise<RideEntity | null>;
  countDailyRiderUnassignedCancellations(
    riderId: string,
    sinceDate: Date,
  ): Promise<number>;
}
