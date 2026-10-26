import type {
  RideCountFilter,
  RideEntity,
  RideListFilter,
  RideRepositoryPort,
} from '../../domain/index.js';
import { AppError } from '../../../../shared/errors/AppError.js';

export class MemoryRideRepository implements RideRepositoryPort {
  private readonly rides = new Map<string, RideEntity>();

  private matches(r: RideEntity, filter: RideCountFilter): boolean {
    return (
      (filter.riderId === undefined ||
        r.bookerRiderId === filter.riderId ||
        r.passenger.riderId === filter.riderId) &&
      (filter.driverId === undefined || r.driverId === filter.driverId) &&
      (filter.statuses === undefined || filter.statuses.includes(r.status)) &&
      (filter.vehicleCategory === undefined || r.vehicleCategory === filter.vehicleCategory) &&
      (filter.cityZoneIds === undefined ||
        (Boolean(r.zoneSnapshot?.cityZoneId) &&
          filter.cityZoneIds.includes(r.zoneSnapshot.cityZoneId!))) &&
      (filter.offeringExpiresAfter === undefined ||
        (r.offeringExpiresAt !== null && r.offeringExpiresAt > filter.offeringExpiresAfter))
    );
  }

  async save(ride: RideEntity): Promise<RideEntity> {
    this.rides.set(ride.id, structuredClone({ ...ride, updatedAt: ride.updatedAt ?? new Date() }));
    return structuredClone(this.rides.get(ride.id)!);
  }

  async update(ride: RideEntity, expectedVersion: number): Promise<RideEntity | null> {
    const current = this.rides.get(ride.id);
    if (!current || current.version !== expectedVersion) return null;
    return this.save(ride);
  }

  async findById(id: string): Promise<RideEntity | null> {
    const ride = this.rides.get(id);
    return ride ? structuredClone(ride) : null;
  }

  async list(filter: RideListFilter): Promise<RideEntity[]> {
    return [...this.rides.values()]
      .filter((r) => this.matches(r, filter))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(filter.offset, filter.offset + filter.limit)
      .map((r) => structuredClone(r));
  }

  async count(filter: RideCountFilter): Promise<number> {
    let total = 0;
    for (const r of this.rides.values()) {
      if (this.matches(r, filter)) total += 1;
    }
    return total;
  }

  async listDriverRidesInWindow(driverId: string, since: Date | null): Promise<RideEntity[]> {
    return [...this.rides.values()]
      .filter((r) => {
        if (r.driverId !== driverId) return false;
        if (!since) return true;
        return (
          (r.settledAt !== null && r.settledAt >= since) ||
          (r.completedAt !== null && r.completedAt >= since) ||
          (r.cancelledAt !== null && r.cancelledAt >= since) ||
          r.updatedAt >= since ||
          r.createdAt >= since
        );
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => structuredClone(r));
  }

  async findExpiredOfferings(now: Date, limit: number): Promise<RideEntity[]> {
    return [...this.rides.values()]
      .filter(
        (r) => r.status === 'OFFERING' && r.offeringExpiresAt !== null && r.offeringExpiresAt < now,
      )
      .sort((a, b) => a.offeringExpiresAt!.getTime() - b.offeringExpiresAt!.getTime())
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }

  async atomicClaimRide(opts: {
    rideId: string;
    driverId: string;
    vehicleId?: string | undefined;
    agreedFarePaise: number;
    expectedVersion?: number;
    pickupOtpHash: string;
    pickupOtpExpiresAt: Date;
    assignedAt?: Date;
  }): Promise<RideEntity | null> {
    const ride = this.rides.get(opts.rideId);
    if (!ride || (opts.expectedVersion !== undefined && ride.version !== opts.expectedVersion))
      return null;
    if ((ride.status !== 'REQUESTED' && ride.status !== 'OFFERING') || ride.driverId !== null) {
      return null;
    }
    const assignedAt = opts.assignedAt ?? new Date();
    if (ride.offeringExpiresAt && ride.offeringExpiresAt <= assignedAt) return null;
    if (
      [...this.rides.values()].some(
        (r) =>
          r.driverId === opts.driverId &&
          ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(
            r.status,
          ),
      )
    ) {
      throw AppError.conflict('DRIVER_BUSY: Driver already has an active ride.');
    }
    const updated: RideEntity = {
      ...ride,
      driverId: opts.driverId,
      vehicleId: opts.vehicleId ?? null,
      status: 'DRIVER_ASSIGNED',
      agreedFarePaise: opts.agreedFarePaise,
      passenger: {
        ...ride.passenger,
        pickupOtpHash: opts.pickupOtpHash,
        pickupOtpExpiresAt: opts.pickupOtpExpiresAt,
        otpAttempts: 0,
        maxOtpAttempts: 3,
      },
      acceptedAt: assignedAt,
      updatedAt: assignedAt,
      version: ride.version + 1,
    };
    this.rides.set(opts.rideId, updated);
    return structuredClone(updated);
  }

  async countDailyRiderUnassignedCancellations(riderId: string, sinceDate: Date): Promise<number> {
    let count = 0;
    for (const ride of this.rides.values()) {
      const isRider = ride.bookerRiderId === riderId || ride.passenger.riderId === riderId;
      if (
        isRider &&
        ride.status === 'CANCELLED' &&
        ride.driverId === null &&
        ride.cancelledAt !== null &&
        ride.cancelledAt >= sinceDate
      ) {
        count++;
      }
    }
    return count;
  }

  async getRiderStats(riderId: string): Promise<{
    totalRides: number;
    completedRides: number;
    cancelledRides: number;
    totalSpentPaise: number;
  }> {
    let totalRides = 0;
    let completedRides = 0;
    let cancelledRides = 0;
    let totalSpentPaise = 0;

    const isCompleted = (status: string) =>
      status === 'TRIP_COMPLETED' ||
      status === 'PAYMENT_PENDING' ||
      status === 'PAYMENT_DISPUTED' ||
      status === 'SETTLED' ||
      status === 'PAYMENT_CONFIRMED';

    for (const r of this.rides.values()) {
      if (r.bookerRiderId === riderId || r.passenger.riderId === riderId) {
        totalRides++;
        if (isCompleted(r.status)) {
          completedRides++;
          totalSpentPaise += r.agreedFarePaise ?? r.suggestedFarePaise;
        } else if (r.status === 'CANCELLED') {
          cancelledRides++;
        }
      }
    }

    return { totalRides, completedRides, cancelledRides, totalSpentPaise };
  }

  async getRiderTripCountsBatch(
    riderIds: string[],
  ): Promise<Map<string, { totalRides: number; completedRides: number; cancelledRides: number }>> {
    const map = new Map<
      string,
      { totalRides: number; completedRides: number; cancelledRides: number }
    >();
    const idSet = new Set(riderIds);
    const isCompleted = (status: string) =>
      status === 'TRIP_COMPLETED' ||
      status === 'PAYMENT_PENDING' ||
      status === 'PAYMENT_DISPUTED' ||
      status === 'SETTLED' ||
      status === 'PAYMENT_CONFIRMED';

    for (const r of this.rides.values()) {
      const id = idSet.has(r.bookerRiderId)
        ? r.bookerRiderId
        : r.passenger.riderId && idSet.has(r.passenger.riderId)
          ? r.passenger.riderId
          : null;
      if (!id) continue;

      const current = map.get(id) ?? { totalRides: 0, completedRides: 0, cancelledRides: 0 };
      current.totalRides++;
      if (r.status === 'CANCELLED') current.cancelledRides++;
      if (isCompleted(r.status)) current.completedRides++;
      map.set(id, current);
    }

    return map;
  }
}
