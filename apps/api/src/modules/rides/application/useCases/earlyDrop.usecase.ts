import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { saveRideTransition } from '../rideTransition.js';
import type { RideEntity, RideEventRepositoryPort, RideRepositoryPort } from '../../domain/index.js';
import type { CompleteRideResult } from './completeRide.usecase.js';

export interface EarlyDropDeps {
  unitOfWork: UnitOfWorkPort;
  rideRepo: RideRepositoryPort;
  rideEventRepo: RideEventRepositoryPort;
  completeRide: (input: {
    rideId: string;
    driverId: string;
    earlyDrop: true;
    metadata?: Record<string, unknown>;
  }) => Promise<CompleteRideResult>;
}

/** Rider asks to end the trip before the destination; the driver confirms (completes) or declines. */
export class EarlyDropUseCase {
  constructor(private readonly deps: EarlyDropDeps) {}

  async request(input: { rideId: string; riderId: string }): Promise<RideEntity> {
    return this.deps.unitOfWork.run(async () => {
      const ride = await this.deps.rideRepo.findById(input.rideId);
      if (!ride) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
      if (ride.bookerRiderId !== input.riderId) {
        throw AppError.forbidden('UNAUTHORIZED_RIDER: This is not your ride.');
      }
      if (ride.status !== 'TRIP_STARTED') {
        throw AppError.badRequest(
          `INVALID_RIDE_STATE: Early drop can only be requested during the trip (current status: ${ride.status}).`,
        );
      }
      if (ride.earlyDropRequestedAt) return ride;
      const now = new Date();
      const saved = await saveRideTransition(
        this.deps.rideRepo,
        { ...ride, earlyDropRequestedAt: now, updatedAt: now, version: ride.version + 1 },
        ride.version,
      );
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'EARLY_DROP_REQUESTED',
        actorType: 'RIDER',
        actorId: input.riderId,
        previousStatus: ride.status,
        newStatus: ride.status,
        metadata: {},
        createdAt: now,
      });
      return saved;
    });
  }

  /** Accept completes the trip (full agreed fare); decline clears the request. */
  async respond(input: {
    rideId: string;
    driverId: string;
    decision: 'ACCEPT' | 'DECLINE';
  }): Promise<{ ride: RideEntity; completed: boolean }> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    if (ride.driverId !== input.driverId) {
      throw AppError.forbidden('UNAUTHORIZED_DRIVER: You are not the assigned driver for this ride.');
    }
    if (ride.status !== 'TRIP_STARTED' || !ride.earlyDropRequestedAt) {
      throw AppError.badRequest('NO_EARLY_DROP_REQUEST: There is no pending early drop request.');
    }
    if (input.decision === 'ACCEPT') {
      const result = await this.deps.completeRide({
        rideId: ride.id,
        driverId: input.driverId,
        earlyDrop: true,
        metadata: { earlyDrop: true },
      });
      return { ride: result.ride, completed: true };
    }
    const declined = await this.deps.unitOfWork.run(async () => {
      const now = new Date();
      const saved = await saveRideTransition(
        this.deps.rideRepo,
        { ...ride, earlyDropRequestedAt: null, updatedAt: now, version: ride.version + 1 },
        ride.version,
      );
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'EARLY_DROP_DECLINED',
        actorType: 'DRIVER',
        actorId: input.driverId,
        previousStatus: ride.status,
        newStatus: ride.status,
        metadata: {},
        createdAt: now,
      });
      return saved;
    });
    return { ride: declined, completed: false };
  }
}
