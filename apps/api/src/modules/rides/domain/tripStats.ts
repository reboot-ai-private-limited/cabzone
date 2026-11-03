import type {
  CancellationReason,
  DisputeOutcome,
  RideEventActor,
  RideStatus,
} from '@cabzone/contracts';
import { cancellationFault, inferCancelledBy } from './cancellationPolicy.js';

export const TRUST_DECAY_HALF_LIFE_DAYS = 90;

/** Rides where the trip itself happened. PAYMENT_UNPAID is handled separately. */
const COMPLETED_STATUSES: ReadonlySet<RideStatus> = new Set<RideStatus>([
  'TRIP_COMPLETED',
  'PAYMENT_PENDING',
  'PAYMENT_CASH_CLAIMED',
  'PAYMENT_DISPUTED',
  'SETTLED',
  'PAYMENT_CONFIRMED',
]);

/** Statuses whose write can change someone's trust score. */
export const TRUST_RELEVANT_STATUSES: ReadonlySet<RideStatus> = new Set<RideStatus>([
  'TRIP_COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'PAYMENT_UNPAID',
  'PAYMENT_DISPUTED',
  'SETTLED',
]);

export type TripStatsRole = 'RIDER' | 'DRIVER';

/** The minimum a ride must expose for trust statistics. */
export interface TripStatsRide {
  status: RideStatus;
  driverId: string | null;
  bookerRiderId: string;
  cancellationReason: CancellationReason | null;
  cancelledBy?: RideEventActor | null | undefined;
  cancelledAt: Date | null;
  disputeOutcome?: DisputeOutcome | null | undefined;
  disputeResolvedAt?: Date | null | undefined;
  agreedFarePaise: number | null;
  suggestedFarePaise: number;
  updatedAt: Date;
}

export interface TripStats {
  /** Every ride this user was part of (as booker, or as the assigned driver). */
  totalRides: number;
  /** Rides where the trip happened. For riders this excludes PAYMENT_UNPAID. */
  completedRides: number;
  /** Raw count of CANCELLED rides, whoever caused them. */
  cancelledRides: number;
  /** Cancellations this user caused, decayed. */
  responsibleCancellations: number;
  /** No-shows this user caused, decayed. A no-show is also a responsible cancellation. */
  noShows: number;
  /** Disputes an admin resolved against this user, decayed. */
  disputesAgainst: number;
  /** Rides left unpaid by this rider (riders only). */
  unpaidRides: number;
  /** Disputes still waiting for an admin decision. Informational, not scored. */
  openDisputes: number;
  totalSpentPaise: number;
}

export function emptyTripStats(): TripStats {
  return {
    totalRides: 0,
    completedRides: 0,
    cancelledRides: 0,
    responsibleCancellations: 0,
    noShows: 0,
    disputesAgainst: 0,
    unpaidRides: 0,
    openDisputes: 0,
    totalSpentPaise: 0,
  };
}

export function decayWeight(
  eventAt: Date,
  now: Date,
  halfLifeDays = TRUST_DECAY_HALF_LIFE_DAYS,
): number {
  const ageDays = Math.max(0, (now.getTime() - eventAt.getTime()) / 86_400_000);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Single source of truth for trust statistics. Both repositories call this, so the admin list,
 * the detail view and the score refresher can never disagree (finding F4).
 * Rides must already be limited to the user: booked by the rider, or assigned to the driver.
 */
export function computeTripStats(
  role: TripStatsRole,
  rides: readonly TripStatsRide[],
  now: Date,
  halfLifeDays = TRUST_DECAY_HALF_LIFE_DAYS,
): TripStats {
  const stats = emptyTripStats();
  for (const ride of rides) {
    stats.totalRides += 1;

    const isUnpaid = ride.status === 'PAYMENT_UNPAID';
    if (COMPLETED_STATUSES.has(ride.status) || (isUnpaid && role === 'DRIVER')) {
      stats.completedRides += 1;
    }
    if (isUnpaid && role === 'RIDER') stats.unpaidRides += 1;

    if (COMPLETED_STATUSES.has(ride.status) || isUnpaid) {
      stats.totalSpentPaise += ride.agreedFarePaise ?? ride.suggestedFarePaise;
    }

    if (ride.status === 'CANCELLED') {
      stats.cancelledRides += 1;
      const fault = cancellationFault({
        cancelledBy: ride.cancelledBy ?? inferCancelledBy(ride.cancellationReason),
        reason: ride.cancellationReason,
        wasAssigned: ride.driverId !== null,
      });
      if (fault.party === role) {
        const w = decayWeight(ride.cancelledAt ?? ride.updatedAt, now, halfLifeDays);
        stats.responsibleCancellations += w;
        if (fault.noShow) stats.noShows += w;
      }
    }

    if (ride.status === 'PAYMENT_DISPUTED' && !ride.disputeOutcome) {
      stats.openDisputes += 1;
    }
    if (ride.disputeOutcome) {
      const loser: TripStatsRole = ride.disputeOutcome === 'RIDER_WINS' ? 'DRIVER' : 'RIDER';
      if (loser === role) {
        stats.disputesAgainst += decayWeight(
          ride.disputeResolvedAt ?? ride.updatedAt,
          now,
          halfLifeDays,
        );
      }
    }
  }
  stats.responsibleCancellations = round3(stats.responsibleCancellations);
  stats.noShows = round3(stats.noShows);
  stats.disputesAgainst = round3(stats.disputesAgainst);
  return stats;
}
