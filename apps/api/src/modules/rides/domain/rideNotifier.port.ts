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
  | 'ride.fare.raised'
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
  /** Fare negotiation traffic: a counter goes to the rider, the answer goes back to that driver. */
  fareNegotiation(
    ride: RideEntity,
    event: 'ride.fare.countered' | 'ride.fare.counter_rejected',
    payload: { driverId: string; proposedFarePaise: number },
  ): Promise<void>;
}
