import type { RideStatus, VehicleCategory } from '@cabzone/contracts';
import type { RideEntity } from './ride.entity.js';

export interface AtomicClaimResult {
  ride: RideEntity;
  agreedFarePaise: number;
}

export interface RideListFilter {
  /** Matches the booking rider or the passenger rider. */
  riderId?: string | undefined;
  driverId?: string | undefined;
  statuses?: readonly RideStatus[] | undefined;
  vehicleCategory?: VehicleCategory | undefined;
  /** Only rides whose offer window closes after this instant. */
  offeringExpiresAfter?: Date | undefined;
  limit: number;
  offset: number;
}

export interface RideRepositoryPort {
  save(ride: RideEntity): Promise<RideEntity>;
  findById(id: string): Promise<RideEntity | null>;
  /** Newest first. */
  list(filter: RideListFilter): Promise<RideEntity[]>;
  /** OFFERING rides whose offer window closed before `now`, oldest first. */
  findExpiredOfferings(now: Date, limit: number): Promise<RideEntity[]>;
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
  getRiderStats(riderId: string): Promise<{
    totalRides: number;
    completedRides: number;
    cancelledRides: number;
    totalSpentPaise: number;
  }>;
  getRiderTripCountsBatch(
    riderIds: string[],
  ): Promise<Map<string, { totalRides: number; completedRides: number }>>;
}
