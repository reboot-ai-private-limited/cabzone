import type { RideEntity, RideRepositoryPort } from '../../domain/index.js';

export class MemoryRideRepository implements RideRepositoryPort {
  private readonly rides = new Map<string, RideEntity>();

  async save(ride: RideEntity): Promise<RideEntity> {
    this.rides.set(ride.id, { ...ride, updatedAt: new Date() });
    return { ...this.rides.get(ride.id)! };
  }

  async findById(id: string): Promise<RideEntity | null> {
    const ride = this.rides.get(id);
    return ride ? { ...ride } : null;
  }

  async atomicClaimRide(opts: {
    rideId: string;
    driverId: string;
    agreedFarePaise: number;
    pickupOtpHash: string;
    pickupOtpExpiresAt: Date;
    assignedAt?: Date;
  }): Promise<RideEntity | null> {
    const ride = this.rides.get(opts.rideId);
    if (!ride) return null;

    // Must be in claimable broadcast status (REQUESTED or OFFERING) and unassigned
    if (
      (ride.status !== 'REQUESTED' && ride.status !== 'OFFERING') ||
      ride.driverId !== null
    ) {
      return null;
    }

    const assignedAt = opts.assignedAt ?? new Date();
    const updated: RideEntity = {
      ...ride,
      driverId: opts.driverId,
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
    return { ...updated };
  }
}
