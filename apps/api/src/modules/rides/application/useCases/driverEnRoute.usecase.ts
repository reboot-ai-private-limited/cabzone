import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type {
  RideEntity,
  RideEventRepositoryPort,
  RideRepositoryPort,
} from '../../domain/index.js';

export interface DriverEnRouteInput {
  rideId: string;
  driverId: string;
  metadata?: Record<string, unknown>;
}

export interface DriverEnRouteDeps {
  rideRepo: RideRepositoryPort;
  rideEventRepo?: RideEventRepositoryPort;
}

export class DriverEnRouteUseCase {
  constructor(private readonly deps: DriverEnRouteDeps) {}

  async execute(input: DriverEnRouteInput): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }

    if (ride.driverId !== input.driverId) {
      throw AppError.forbidden(
        'UNAUTHORIZED_DRIVER: You are not the assigned driver for this ride.',
      );
    }

    if (ride.status !== 'DRIVER_ASSIGNED') {
      throw AppError.badRequest(
        `INVALID_RIDE_STATE: Driver must be in DRIVER_ASSIGNED state before going en route (current status: ${ride.status}).`,
      );
    }

    const now = new Date();
    const updatedRide: RideEntity = {
      ...ride,
      status: 'DRIVER_EN_ROUTE',
      updatedAt: now,
      version: ride.version + 1,
    };

    const savedRide = await this.deps.rideRepo.save(updatedRide);

    if (this.deps.rideEventRepo) {
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'DRIVER_EN_ROUTE',
        actorType: 'DRIVER',
        actorId: input.driverId,
        previousStatus: ride.status,
        newStatus: 'DRIVER_EN_ROUTE',
        metadata: input.metadata ?? {},
        createdAt: now,
      });
    }

    return savedRide;
  }
}
