import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
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
  rideRepo: RideRepositoryPort;
  rideEventRepo?: RideEventRepositoryPort;
}

export class DriverArrivedUseCase {
  constructor(private readonly deps: DriverArrivedDeps) {}

  async execute(input: DriverArrivedInput): Promise<RideEntity> {
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

    const now = input.arrivedAt ?? new Date();
    const updatedRide: RideEntity = {
      ...ride,
      status: 'DRIVER_ARRIVED',
      arrivedAt: now,
      updatedAt: now,
      version: ride.version + 1,
    };

    const savedRide = await this.deps.rideRepo.save(updatedRide);

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
