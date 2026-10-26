import type { RideStatus, VehicleCategory } from '@cabzone/contracts';
import type { RideEntity } from './ride.entity.js';

export interface AtomicClaimResult {
  ride: RideEntity;
  agreedFarePaise: number;
}

export interface RideCountFilter {
  /** Matches the booking rider or the passenger rider. */
  riderId?: string | undefined;
  driverId?: string | undefined;
  statuses?: readonly RideStatus[] | undefined;
  vehicleCategory?: VehicleCategory | undefined;
  cityZoneIds?: readonly string[] | undefined;
  /** Only rides whose offer window closes after this instant. */
  offeringExpiresAfter?: Date | undefined;
}

export interface RideListFilter extends RideCountFilter {
  limit: number;
  offset: number;
}

export interface RideRepositoryPort {
  save(ride: RideEntity): Promise<RideEntity>;
  /** Updates an existing ride only when its version still matches. Never upserts. */
  update(ride: RideEntity, expectedVersion: number): Promise<RideEntity | null>;
  findById(id: string): Promise<RideEntity | null>;
  /** Newest first. */
  list(filter: RideListFilter): Promise<RideEntity[]>;
  count(filter: RideCountFilter): Promise<number>;
  /**
   * All rides assigned to `driverId` whose activity timestamps may fall on or after `since`
   * (or all assigned rides when `since` is null). Used by server-owned earnings aggregation.
   */
  listDriverRidesInWindow(driverId: string, since: Date | null): Promise<RideEntity[]>;
  /** OFFERING rides whose offer window closed before `now`, oldest first. */
  findExpiredOfferings(now: Date, limit: number): Promise<RideEntity[]>;
  atomicClaimRide(opts: {
    rideId: string;
    driverId: string;
    vehicleId?: string | undefined;
    agreedFarePaise: number;
    expectedVersion?: number;
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
  ): Promise<Map<string, { totalRides: number; completedRides: number; cancelledRides: number }>>;
}
