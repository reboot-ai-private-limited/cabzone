import { isActiveRideStatus, RIDE_COMMUNICATION_STATUSES } from '@cabzone/contracts';
import type {
  RideCountFilter,
  RideEntity,
  RideListFilter,
  RideRepositoryPort,
  TripStats,
  TripStatsRole,
} from '../../domain/index.js';
import { computeTripStats, TRUST_RELEVANT_STATUSES } from '../../domain/index.js';
import { AppError } from '../../../../shared/errors/AppError.js';

function duplicateKeyError(message: string): Error & { code: number } {
  return Object.assign(new Error(message), { code: 11000 });
}

export class MemoryRideRepository implements RideRepositoryPort {
  private readonly rides = new Map<string, RideEntity>();
  private readonly chatSequences = new Map<string, number>();

  async allocateChatSequence(rideId: string, expectedDriverId: string): Promise<number | null> {
    const ride = this.rides.get(rideId);
    if (
      !ride ||
      ride.driverId !== expectedDriverId ||
      !RIDE_COMMUNICATION_STATUSES.includes(ride.status)
    ) {
      return null;
    }
    const next = (this.chatSequences.get(rideId) ?? 0) + 1;
    this.chatSequences.set(rideId, next);
    return next;
  }

  private assertUniqueConstraints(ride: RideEntity): void {
    for (const existing of this.rides.values()) {
      if (existing.id === ride.id) continue;
      if (
        typeof ride.idempotencyKey === 'string' &&
        existing.bookerRiderId === ride.bookerRiderId &&
        existing.idempotencyKey === ride.idempotencyKey
      ) {
        throw duplicateKeyError('E11000 duplicate key error index: rider_create_idempotency');
      }
      if (
        isActiveRideStatus(ride.status) &&
        existing.bookerRiderId === ride.bookerRiderId &&
        isActiveRideStatus(existing.status)
      ) {
        throw duplicateKeyError('E11000 duplicate key error index: one_active_ride_per_rider');
      }
    }
  }

  async create(ride: RideEntity): Promise<RideEntity> {
    if (this.rides.has(ride.id)) {
      throw duplicateKeyError('E11000 duplicate key error index: _id_');
    }
    this.assertUniqueConstraints(ride);
    const stored = structuredClone({ ...ride, updatedAt: new Date() });
    this.rides.set(ride.id, stored);
    return structuredClone(stored);
  }

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
    this.assertUniqueConstraints(ride);
    this.rides.set(ride.id, structuredClone({ ...ride, updatedAt: ride.updatedAt ?? new Date() }));
    return structuredClone(this.rides.get(ride.id)!);
  }

  async update(ride: RideEntity, expectedVersion: number): Promise<RideEntity | null> {
    const current = this.rides.get(ride.id);
    if (!current || current.version !== expectedVersion) return null;
    const saved = await this.save(ride);
    if (this.onTerminalTransition && TRUST_RELEVANT_STATUSES.has(saved.status)) {
      try {
        this.onTerminalTransition(saved);
      } catch {
        // never let a trust hook break a ride transition
      }
    }
    return saved;
  }

  async findById(id: string): Promise<RideEntity | null> {
    const ride = this.rides.get(id);
    return ride ? structuredClone(ride) : null;
  }

  async findActiveByBookerRiderId(bookerRiderId: string): Promise<RideEntity | null> {
    const ride = [...this.rides.values()].find(
      (r) => r.bookerRiderId === bookerRiderId && isActiveRideStatus(r.status),
    );
    return ride ? structuredClone(ride) : null;
  }

  async findByBookerIdempotencyKey(
    bookerRiderId: string,
    idempotencyKey: string,
  ): Promise<RideEntity | null> {
    const ride = [...this.rides.values()].find(
      (r) => r.bookerRiderId === bookerRiderId && r.idempotencyKey === idempotencyKey,
    );
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

  async getTripStats(
    role: TripStatsRole,
    ids: string[],
    now: Date = new Date(),
  ): Promise<Map<string, TripStats>> {
    const result = new Map<string, TripStats>();
    for (const id of ids) {
      const mine = [...this.rides.values()].filter((r) =>
        role === 'RIDER' ? r.bookerRiderId === id : r.driverId === id,
      );
      result.set(id, computeTripStats(role, mine, now));
    }
    return result;
  }

  onTerminalTransition?: ((ride: RideEntity) => void) | undefined;
}
