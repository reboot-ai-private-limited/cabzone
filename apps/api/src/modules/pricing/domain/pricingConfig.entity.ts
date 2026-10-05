import type {
  PricingConfigLevel,
  PricingConfigStatus,
  StateDistanceBreakdown,
  VehicleCategory,
} from '@cabzone/contracts';

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
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: PricingConfigStatus;
  createdByAdminId: string;
  createdAt: Date;
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

