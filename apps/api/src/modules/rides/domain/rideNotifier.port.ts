import type { RideEntity } from './ride.entity.js';

export type RideLifecycleEvent =
  | 'ride.driver.assigned'
  | 'ride.driver.en_route'
  | 'ride.driver.arrived'
  | 'ride.started'
  | 'ride.completed'
  | 'ride.payment.confirmed'
  | 'ride.payment.disputed'
  | 'ride.payment.dispute_resolved'
  | 'ride.cancelled'
  | 'ride.offer.expired';

/** Best-effort realtime side effects. Implementations must never throw into the request path. */
export interface RideNotifierPort {
  /** A new ride is open for offers: fan out to eligible nearby drivers. */
  rideRequested(ride: RideEntity): Promise<void>;
  /** A ride changed state: tell the rider and (if assigned) the driver. */
  rideUpdated(
    ride: RideEntity,
    event: RideLifecycleEvent,
    extra?: Record<string, unknown>,
  ): Promise<void>;
}
