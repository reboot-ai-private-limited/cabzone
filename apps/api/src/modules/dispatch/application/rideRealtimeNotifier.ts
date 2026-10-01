import { logger } from '../../../shared/logging/logger.js';
import type { RealtimePublisherPort } from '../../../shared/realtime/realtime.port.js';
import type {
  RideEntity,
  RideLifecycleEvent,
  RideNotifierPort,
  RideRepositoryPort,
} from '../../rides/rides.public.js';
import type { DriverLocationObserver } from './useCases/updateDriverLocation.usecase.js';
import type { DispatchLookups } from './dispatch.types.js';
import { ACTIVE_RIDE_STATUSES } from './useCases/driverOfferEligibility.js';
import type { FindCandidateDriversUseCase } from './useCases/findCandidateDrivers.usecase.js';
import { toRideOffer } from './useCases/listDriverOffers.usecase.js';

/**
 * Turns ride state changes into realtime events (websocket-contracts.md §5-7). Every event carries
 * rideVersion so clients can drop stale updates. Never throws: delivery is best effort and the
 * REST endpoints remain the source of truth.
 */
export class RideRealtimeNotifier implements RideNotifierPort, DriverLocationObserver {
  constructor(
    private readonly publisher: RealtimePublisherPort,
    private readonly findCandidates: FindCandidateDriversUseCase,
    private readonly lookups: DispatchLookups,
    private readonly rideRepo: RideRepositoryPort,
  ) {}

  async rideRequested(ride: RideEntity): Promise<void> {
    try {
      const candidates = await this.findCandidates.execute(ride);
      for (const driver of candidates) {
        this.publisher.publishToUser(
          driver.userId,
          'ride.offer.created',
          toRideOffer(ride, driver.distanceM),
        );
      }
      logger.info({ rideId: ride.id, offered: candidates.length }, 'ride offers dispatched');
    } catch (err) {
      logger.warn({ rideId: ride.id, err: String(err) }, 'offer dispatch failed');
    }
  }

  async rideUpdated(
    ride: RideEntity,
    event: RideLifecycleEvent,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      const { pickupOtp, ...shared } = extra;
      const base = {
        rideId: ride.id,
        rideVersion: ride.version,
        status: ride.status,
        driverId: ride.driverId,
        vehicleId: ride.vehicleId,
        ...shared,
      };

      const riderUserId = await this.lookups.getUserIdForRider(ride.bookerRiderId);
      if (riderUserId) {
        // The pickup OTP goes to the rider only; the driver must ask for it in person.
        this.publisher.publishToUser(
          riderUserId,
          event,
          pickupOtp === undefined ? base : { ...base, pickupOtp },
        );
      }
      if (ride.driverId) {
        const driverUserId = await this.lookups.getUserIdForDriver(ride.driverId);
        if (driverUserId) this.publisher.publishToUser(driverUserId, event, base);
      }
    } catch (err) {
      logger.warn({ rideId: ride.id, event, err: String(err) }, 'ride notification failed');
    }
  }

  /** Streams the driver's position to the rider while a ride is in progress. */
  async driverLocationUpdated(
    driverId: string,
    location: { lat: number; lng: number; heading: number | null; speedMps: number | null },
  ): Promise<void> {
    try {
      const [active] = await this.rideRepo.list({
        driverId,
        statuses: ACTIVE_RIDE_STATUSES,
        limit: 1,
        offset: 0,
      });
      if (!active) return;
      const riderUserId = await this.lookups.getUserIdForRider(active.bookerRiderId);
      if (riderUserId) {
        this.publisher.publishToUser(riderUserId, 'driver.location.updated', {
          rideId: active.id,
          ...location,
        });
      }
    } catch (err) {
      logger.warn({ driverId, err: String(err) }, 'driver location fan-out failed');
    }
  }
}
