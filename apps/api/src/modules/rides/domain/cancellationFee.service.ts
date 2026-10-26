import {
  DEFAULT_CANCELLATION_FEE_PAISE,
  DEFAULT_DRIVER_COMPENSATION_PAISE,
  DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS,
  DEFAULT_PLATFORM_CANCELLATION_FEE_PAISE,
  DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS,
  type CancellationReason,
  type RideEventActor,
} from '@cabzone/contracts';
import { AppError } from '../../../shared/errors/AppError.js';
import type { RideEntity } from './ride.entity.js';

export const CANCELLATION_FEE_PAISE = DEFAULT_CANCELLATION_FEE_PAISE; // Flat ₹50 default
export const DRIVER_COMPENSATION_PAISE = DEFAULT_DRIVER_COMPENSATION_PAISE; // ₹35 default
export const PLATFORM_CANCELLATION_FEE_PAISE = DEFAULT_PLATFORM_CANCELLATION_FEE_PAISE; // ₹15 default
export const RIDER_CANCELLATION_GRACE_PERIOD_MS =
  DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS * 1000; // 2 minutes (120,000 ms)
export const MIN_DRIVER_NO_SHOW_WAIT_MS =
  DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS * 1000; // 5 minutes (300,000 ms)
export const MAX_DAILY_UNASSIGNED_CANCELLATIONS = 5;

export interface CancellationFeeBreakdown {
  totalFeePaise: number;
  driverCompensationPaise: number;
  platformFeePaise: number;
  isGracePeriod: boolean;
}

function resolveSnapshotCancellationPolicy(ride: RideEntity) {
  const snap = ride.pricingSnapshot;
  const totalFeePaise = snap?.cancellationFeePaise ?? CANCELLATION_FEE_PAISE;
  const driverCompensationPaise = snap?.driverCompensationPaise ?? DRIVER_COMPENSATION_PAISE;
  const platformFeePaise =
    snap?.platformCancellationFeePaise ?? PLATFORM_CANCELLATION_FEE_PAISE;
  if (
    totalFeePaise < 0 ||
    driverCompensationPaise < 0 ||
    platformFeePaise < 0 ||
    driverCompensationPaise + platformFeePaise !== totalFeePaise
  ) {
    throw AppError.badRequest(
      'INVALID_CANCELLATION_POLICY: Snapshotted cancellation fee split is inconsistent.',
    );
  }
  const gracePeriodMs =
    (snap?.riderCancellationGraceSeconds ?? DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS) * 1000;
  const minNoShowWaitMs =
    (snap?.driverNoShowWaitSeconds ?? DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS) * 1000;

  return {
    totalFeePaise,
    driverCompensationPaise,
    platformFeePaise,
    gracePeriodMs,
    minNoShowWaitMs,
  };
}

export function calculateCancellationFee(opts: {
  ride: RideEntity;
  actorType: RideEventActor;
  reason: CancellationReason;
  now: Date;
}): CancellationFeeBreakdown {
  const { ride, actorType, reason, now } = opts;
  const policy = resolveSnapshotCancellationPolicy(ride);

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
      if (elapsedWaitMs < policy.minNoShowWaitMs) {
        const remainingSeconds = Math.ceil((policy.minNoShowWaitMs - elapsedWaitMs) / 1000);
        const waitLabel =
          policy.minNoShowWaitMs % 60_000 === 0
            ? `${policy.minNoShowWaitMs / 60_000} minutes`
            : `${Math.ceil(policy.minNoShowWaitMs / 1000)} seconds`;
        throw AppError.badRequest(
          `MINIMUM_WAIT_TIME_NOT_MET: Driver must wait at least ${waitLabel} at the curb before reporting rider no-show (${remainingSeconds}s remaining).`,
        );
      }
      return {
        totalFeePaise: policy.totalFeePaise,
        driverCompensationPaise: policy.driverCompensationPaise,
        platformFeePaise: policy.platformFeePaise,
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
        totalFeePaise: policy.totalFeePaise,
        driverCompensationPaise: policy.driverCompensationPaise,
        platformFeePaise: policy.platformFeePaise,
        isGracePeriod: false,
      };
    }

    // Assigned or En-route state: check grace period from acceptedAt
    if (
      ride.status === 'DRIVER_ASSIGNED' ||
      ride.status === 'DRIVER_EN_ROUTE'
    ) {
      const acceptedAtTime = ride.acceptedAt
        ? ride.acceptedAt.getTime()
        : ride.updatedAt.getTime();
      const elapsedMs = now.getTime() - acceptedAtTime;

      if (elapsedMs <= policy.gracePeriodMs) {
        return {
          totalFeePaise: 0,
          driverCompensationPaise: 0,
          platformFeePaise: 0,
          isGracePeriod: true,
        };
      }

      return {
        totalFeePaise: policy.totalFeePaise,
        driverCompensationPaise: policy.driverCompensationPaise,
        platformFeePaise: policy.platformFeePaise,
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
