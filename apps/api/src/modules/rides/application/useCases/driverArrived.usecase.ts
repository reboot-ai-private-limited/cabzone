import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { saveRideTransition } from '../rideTransition.js';
import { ARRIVE_RADIUS_M, assertDriverWithin, type DriverLocationPort } from '../geofence.js';
import type {
  RideEntity,
  RideEventRepositoryPort,
  RideRepositoryPort,
} from '../../domain/index.js';

export interface DriverArrivedInput {
  rideId: string;
  driverId: string;
  metadata?: Record<string, unknown>;
  arrivedAt?: Date;
}

export interface DriverArrivedDeps {
  unitOfWork: UnitOfWorkPort;
  rideRepo: RideRepositoryPort;
  rideEventRepo?: RideEventRepositoryPort;
  /** When set, the driver must be within 200 m of pickup to mark arrival. */
  driverLocation?: DriverLocationPort | undefined;
}

export class DriverArrivedUseCase {
  constructor(private readonly deps: DriverArrivedDeps) {}

  async execute(input: DriverArrivedInput): Promise<RideEntity> {
    return this.deps.unitOfWork.run(() => this.arrive(input));
  }

  private async arrive(input: DriverArrivedInput): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }

    if (ride.driverId !== input.driverId) {
      throw AppError.forbidden(
        'UNAUTHORIZED_DRIVER: You are not the assigned driver for this ride.',
      );
    }

    if (ride.status !== 'DRIVER_EN_ROUTE') {
      throw AppError.badRequest(
        `INVALID_RIDE_STATE: Driver must be marked as DRIVER_EN_ROUTE before arriving at curb (current status: ${ride.status}).`,
      );
    }

    if (this.deps.driverLocation) {
      await assertDriverWithin(
        this.deps.driverLocation,
        input.driverId,
        ride.pickup,
        ARRIVE_RADIUS_M,
        'DRIVER_TOO_FAR_FROM_PICKUP',
      );
    }

    const now = input.arrivedAt ?? new Date();
    const updatedRide: RideEntity = {
      ...ride,
      status: 'DRIVER_ARRIVED',
      arrivedAt: now,
      updatedAt: now,
      version: ride.version + 1,
    };

    const savedRide = await saveRideTransition(this.deps.rideRepo, updatedRide, ride.version);

    if (this.deps.rideEventRepo) {
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'DRIVER_ARRIVED',
        actorType: 'DRIVER',
        actorId: input.driverId,
        previousStatus: ride.status,
        newStatus: 'DRIVER_ARRIVED',
        metadata: {
          arrivedAt: now.toISOString(),
          ...(input.metadata ?? {}),
        },
        createdAt: now,
      });
    }

    return savedRide;
  }
}
