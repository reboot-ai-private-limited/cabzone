import type { CancellationReason, RideEventActor } from '@cabzone/contracts';
import { AppError } from '../../../shared/errors/AppError.js';
import type { RideEntity } from './ride.entity.js';

export const CANCELLATION_FEE_PAISE = 5000; // Flat ₹50
export const DRIVER_COMPENSATION_PAISE = 3500; // ₹35
export const PLATFORM_CANCELLATION_FEE_PAISE = 1500; // ₹15
export const RIDER_CANCELLATION_GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes (120,000 ms)
export const MIN_DRIVER_NO_SHOW_WAIT_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)
export const MAX_DAILY_UNASSIGNED_CANCELLATIONS = 5;

export interface CancellationFeeBreakdown {
  totalFeePaise: number;
  driverCompensationPaise: number;
  platformFeePaise: number;
  isGracePeriod: boolean;
}

export function calculateCancellationFee(opts: {
  ride: RideEntity;
  actorType: RideEventActor;
  reason: CancellationReason;
  now: Date;
}): CancellationFeeBreakdown {
  const { ride, actorType, reason, now } = opts;

  // 1. Driver initiates cancellation
  if (actorType === 'DRIVER') {
    if (reason === 'RIDER_NO_SHOW') {
      if (ride.status !== 'DRIVER_ARRIVED') {
        throw AppError.badRequest(
          `INVALID_RIDE_STATE: Driver must be marked as DRIVER_ARRIVED to report no-show (current status: ${ride.status}).`,
        );
      }
      if (!ride.arrivedAt) {
        throw AppError.badRequest(
          'INVALID_RIDE_STATE: Arrival timestamp missing for no-show calculation.',
        );
      }
      const elapsedWaitMs = now.getTime() - ride.arrivedAt.getTime();
      if (elapsedWaitMs < MIN_DRIVER_NO_SHOW_WAIT_MS) {
        const remainingSeconds = Math.ceil(
          (MIN_DRIVER_NO_SHOW_WAIT_MS - elapsedWaitMs) / 1000,
        );
        throw AppError.badRequest(
          `MINIMUM_WAIT_TIME_NOT_MET: Driver must wait at least 5 minutes at the curb before reporting rider no-show (${remainingSeconds}s remaining).`,
        );
      }
      return {
        totalFeePaise: CANCELLATION_FEE_PAISE,
        driverCompensationPaise: DRIVER_COMPENSATION_PAISE,
        platformFeePaise: PLATFORM_CANCELLATION_FEE_PAISE,
        isGracePeriod: false,
      };
    }
    // Driver cancels for other reasons (e.g. driver emergency / delay) -> zero fee to rider, no driver compensation
    return {
      totalFeePaise: 0,
      driverCompensationPaise: 0,
      platformFeePaise: 0,
      isGracePeriod: false,
    };
  }

  // 2. Rider initiates cancellation
  if (actorType === 'RIDER') {
    // Unassigned state: free cancellation
    if (
      ride.status === 'REQUESTED' ||
      ride.status === 'OFFERING' ||
      !ride.driverId
    ) {
      return {
        totalFeePaise: 0,
        driverCompensationPaise: 0,
        platformFeePaise: 0,
        isGracePeriod: true,
      };
    }

    // Driver arrived state: grace period expired, late cancel fee applies
    if (ride.status === 'DRIVER_ARRIVED') {
      return {
        totalFeePaise: CANCELLATION_FEE_PAISE,
        driverCompensationPaise: DRIVER_COMPENSATION_PAISE,
        platformFeePaise: PLATFORM_CANCELLATION_FEE_PAISE,
        isGracePeriod: false,
      };
    }

    // Assigned or En-route state: check 2-minute grace period from acceptedAt
    if (
      ride.status === 'DRIVER_ASSIGNED' ||
      ride.status === 'DRIVER_EN_ROUTE'
    ) {
      const acceptedAtTime = ride.acceptedAt
        ? ride.acceptedAt.getTime()
        : ride.updatedAt.getTime();
      const elapsedMs = now.getTime() - acceptedAtTime;

      if (elapsedMs <= RIDER_CANCELLATION_GRACE_PERIOD_MS) {
        return {
          totalFeePaise: 0,
          driverCompensationPaise: 0,
          platformFeePaise: 0,
          isGracePeriod: true,
        };
      }

      return {
        totalFeePaise: CANCELLATION_FEE_PAISE,
        driverCompensationPaise: DRIVER_COMPENSATION_PAISE,
        platformFeePaise: PLATFORM_CANCELLATION_FEE_PAISE,
        isGracePeriod: false,
      };
    }
  }

  // 3. Admin / System override: zero fee
  return {
    totalFeePaise: 0,
    driverCompensationPaise: 0,
    platformFeePaise: 0,
    isGracePeriod: true,
  };
}
