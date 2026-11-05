import {
  DEFAULT_CANCELLATION_FEE_PAISE,
  DEFAULT_DRIVER_COMPENSATION_PAISE,
  DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS,
  DEFAULT_PLATFORM_CANCELLATION_FEE_PAISE,
  DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS,
  type PricingConfigLevel,
  type PricingConfigStatus,
  type StateDistanceBreakdown,
  type VehicleCategory,
} from '@cabzone/contracts';
import { AppError } from '../../../shared/errors/AppError.js';

export interface PricingConfigEntity {
  id: string;
  level: PricingConfigLevel;
  cityZoneId: string | null;
  stateCode: string | null;
  stateName?: string | null;
  version: number;
  vehicleType: VehicleCategory;
  baseFarePaise: number;
  ratePerKmPaise: number;
  minimumFarePaise: number;
  outstationBaseFarePaise: number;
  outstationRatePerKmPaise: number;
  outstationMinimumFarePaise: number;
  bufferSurchargePaise: number;
  negotiationFloorPercent: number;
  negotiationCeilingPercent: number;
  negotiationWindowSeconds: number;
  commissionPercent: number;
  cancellationFeePaise?: number;
  driverCompensationPaise?: number;
  platformCancellationFeePaise?: number;
  riderCancellationGraceSeconds?: number;
  driverNoShowWaitSeconds?: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: PricingConfigStatus;
  createdByAdminId: string;
  createdAt: Date;
}

export interface ResolvedCancellationPolicy {
  cancellationFeePaise: number;
  driverCompensationPaise: number;
  platformCancellationFeePaise: number;
  riderCancellationGraceSeconds: number;
  driverNoShowWaitSeconds: number;
}

export function resolveCancellationFeeSplit(
  input: {
    cancellationFeePaise?: number | undefined;
    driverCompensationPaise?: number | undefined;
    platformCancellationFeePaise?: number | undefined;
  },
  fallback: {
    cancellationFeePaise: number;
    driverCompensationPaise: number;
    platformCancellationFeePaise: number;
  } = {
    cancellationFeePaise: DEFAULT_CANCELLATION_FEE_PAISE,
    driverCompensationPaise: DEFAULT_DRIVER_COMPENSATION_PAISE,
    platformCancellationFeePaise: DEFAULT_PLATFORM_CANCELLATION_FEE_PAISE,
  },
): {
  cancellationFeePaise: number;
  driverCompensationPaise: number;
  platformCancellationFeePaise: number;
} {
  let cancellationFeePaise: number;
  let driverCompensationPaise: number;
  let platformCancellationFeePaise: number;

  if (
    input.cancellationFeePaise !== undefined &&
    input.driverCompensationPaise !== undefined &&
    input.platformCancellationFeePaise === undefined
  ) {
    cancellationFeePaise = input.cancellationFeePaise;
    driverCompensationPaise = input.driverCompensationPaise;
    platformCancellationFeePaise = cancellationFeePaise - driverCompensationPaise;
  } else if (
    input.cancellationFeePaise !== undefined &&
    input.platformCancellationFeePaise !== undefined &&
    input.driverCompensationPaise === undefined
  ) {
    cancellationFeePaise = input.cancellationFeePaise;
    platformCancellationFeePaise = input.platformCancellationFeePaise;
    driverCompensationPaise = cancellationFeePaise - platformCancellationFeePaise;
  } else if (
    input.driverCompensationPaise !== undefined &&
    input.platformCancellationFeePaise !== undefined &&
    input.cancellationFeePaise === undefined
  ) {
    driverCompensationPaise = input.driverCompensationPaise;
    platformCancellationFeePaise = input.platformCancellationFeePaise;
    cancellationFeePaise = driverCompensationPaise + platformCancellationFeePaise;
  } else {
    cancellationFeePaise = input.cancellationFeePaise ?? fallback.cancellationFeePaise;
    driverCompensationPaise = input.driverCompensationPaise ?? fallback.driverCompensationPaise;
    platformCancellationFeePaise =
      input.platformCancellationFeePaise ?? fallback.platformCancellationFeePaise;
  }

  if (
    !Number.isSafeInteger(cancellationFeePaise) ||
    !Number.isSafeInteger(driverCompensationPaise) ||
    !Number.isSafeInteger(platformCancellationFeePaise) ||
    cancellationFeePaise < 0 ||
    driverCompensationPaise < 0 ||
    platformCancellationFeePaise < 0 ||
    driverCompensationPaise + platformCancellationFeePaise !== cancellationFeePaise
  ) {
    throw AppError.badRequest(
      'INVALID_CANCELLATION_POLICY: driverCompensationPaise + platformCancellationFeePaise must equal cancellationFeePaise and all values must be non-negative integers.',
    );
  }

  return {
    cancellationFeePaise,
    driverCompensationPaise,
    platformCancellationFeePaise,
  };
}

export function resolveCancellationPolicy(
  config?: Partial<
    Pick<
      PricingConfigEntity,
      | 'cancellationFeePaise'
      | 'driverCompensationPaise'
      | 'platformCancellationFeePaise'
      | 'riderCancellationGraceSeconds'
      | 'driverNoShowWaitSeconds'
    >
  > | null,
): ResolvedCancellationPolicy {
  const split = resolveCancellationFeeSplit({
    cancellationFeePaise: config?.cancellationFeePaise,
    driverCompensationPaise: config?.driverCompensationPaise,
    platformCancellationFeePaise: config?.platformCancellationFeePaise,
  });

  return {
    ...split,
    riderCancellationGraceSeconds:
      config?.riderCancellationGraceSeconds ?? DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS,
    driverNoShowWaitSeconds:
      config?.driverNoShowWaitSeconds ?? DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS,
  };
}

export function cashAllowedForArrears(arrearsPaise: number, cancellationFeePaise: number): boolean {
  return cancellationFeePaise === 0 || arrearsPaise < cancellationFeePaise;
}

export function isPricingConfigEffective(
  config: PricingConfigEntity,
  now: Date = new Date(),
): boolean {
  return (
    config.status === 'ACTIVE' &&
    config.effectiveFrom <= now &&
    (config.effectiveTo === null || config.effectiveTo > now)
  );
}

export function calculateBaseFareEstimate(opts: {
  config: PricingConfigEntity;
  distanceM: number;
  serviceType: 'CITY' | 'OUTSTATION';
  isBufferFallback?: boolean;
  stateBreakdown?: StateDistanceBreakdown[];
  stateRateResolver?: (stateCode: string) => number | null;
}): number {
  const { config, distanceM, serviceType, isBufferFallback = false, stateBreakdown, stateRateResolver } = opts;

  const baseFarePaise =
    serviceType === 'OUTSTATION' ? config.outstationBaseFarePaise : config.baseFarePaise;
  const defaultRatePerKmPaise =
    serviceType === 'OUTSTATION' ? config.outstationRatePerKmPaise : config.ratePerKmPaise;
  const minimumFarePaise =
    serviceType === 'OUTSTATION' ? config.outstationMinimumFarePaise : config.minimumFarePaise;

  let distanceFarePaise = 0;

  if (
    serviceType === 'OUTSTATION' &&
    stateBreakdown &&
    stateBreakdown.length > 0 &&
    typeof stateRateResolver === 'function'
  ) {
    for (const segment of stateBreakdown) {
      const stateRate = stateRateResolver(segment.stateCode) ?? defaultRatePerKmPaise;
      const segFare = Math.round((segment.distanceM / 1000) * stateRate);
      segment.ratePerKmPaise = stateRate;
      segment.distanceFarePaise = segFare;
      distanceFarePaise += segFare;
    }
  } else {
    distanceFarePaise = Math.round((distanceM / 1000) * defaultRatePerKmPaise);
  }

  const bufferSurcharge = isBufferFallback && serviceType === 'CITY' ? config.bufferSurchargePaise : 0;
  const subtotal = baseFarePaise + distanceFarePaise + bufferSurcharge;
  return Math.max(minimumFarePaise, subtotal);
}
