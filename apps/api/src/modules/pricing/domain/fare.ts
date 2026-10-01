import type { RouteScope, RouteStateSegmentDto } from '@cabzone/contracts';
import type { PricingConfigEntity } from './pricingConfig.entity.js';
import type { StatePricingEntity } from './statePricing.entity.js';
import { calculateBaseFareEstimate } from './pricingConfig.entity.js';

export interface AppliedSegment {
  stateCode: string;
  distanceM: number;
  ratePerKmPaise: number;
}

export interface CalculateFareInput {
  config: PricingConfigEntity;
  distanceM: number;
  routeScope?: RouteScope | null | undefined;
  segments?: RouteStateSegmentDto[] | undefined;
  destinationStateCode?: string | null | undefined;
  stateRates?: Record<string, StatePricingEntity | null | undefined> | undefined;
  isBufferFallback?: boolean;
}

export interface CalculateFareResult {
  farePaise: number;
  appliedSegments: AppliedSegment[];
}

/**
 * Pure calculation function for journey fares across city, intrastate, and interstate scopes.
 * Implements Assumptions A-D:
 * - A: Traversed states' rates apply to the distance driven in each state.
 * - B: States without active state pricing fall back to the city config's ratePerKmPaise.
 * - C: Base fare comes from destination state pricing if present, else city config;
 *      minimum fare = max(city, destination state).
 * - D: Included distance is deducted from the start of the route in segment order.
 */
export function calculateFare(input: CalculateFareInput): CalculateFareResult {
  const {
    config,
    distanceM,
    routeScope,
    segments = [],
    destinationStateCode,
    stateRates = {},
    isBufferFallback = false,
  } = input;

  // CITY or INTRA_STATE: evaluate via standard city config rate
  if (!routeScope || routeScope === 'INTRA_STATE') {
    const farePaise = calculateBaseFareEstimate({
      config,
      distanceM,
      isBufferFallback,
    });
    return {
      farePaise,
      appliedSegments: [
        {
          stateCode: destinationStateCode ?? 'DEFAULT',
          distanceM,
          ratePerKmPaise: config.ratePerKmPaise,
        },
      ],
    };
  }

  // INTERSTATE (assumptions A–D)
  const destPricing = destinationStateCode ? stateRates[destinationStateCode] : null;
  const baseFarePaise = destPricing?.baseFarePaise ?? config.baseFarePaise;
  const minimumFarePaise = Math.max(
    config.minimumFarePaise,
    destPricing?.minimumFarePaise ?? 0,
  );
  const bufferSurcharge = isBufferFallback ? config.bufferSurchargePaise : 0;

  let remainingIncludedM = config.includedDistanceM;
  let distanceFarePaise = 0;
  const appliedSegments: AppliedSegment[] = [];

  const effectiveSegments =
    segments.length > 0
      ? segments
      : [{ stateCode: destinationStateCode ?? 'UNKNOWN', distanceM }];

  for (const seg of effectiveSegments) {
    const statePricing = stateRates[seg.stateCode];
    const ratePerKmPaise = statePricing?.ratePerKmPaise ?? config.ratePerKmPaise;

    let billableSegDistanceM = seg.distanceM;
    if (remainingIncludedM > 0) {
      if (billableSegDistanceM <= remainingIncludedM) {
        remainingIncludedM -= billableSegDistanceM;
        billableSegDistanceM = 0;
      } else {
        billableSegDistanceM -= remainingIncludedM;
        remainingIncludedM = 0;
      }
    }

    const segFare = Math.round((billableSegDistanceM / 1000) * ratePerKmPaise);
    distanceFarePaise += segFare;

    appliedSegments.push({
      stateCode: seg.stateCode,
      distanceM: seg.distanceM,
      ratePerKmPaise,
    });
  }

  const subtotal = baseFarePaise + distanceFarePaise + bufferSurcharge;
  const farePaise = Math.max(minimumFarePaise, subtotal);

  return {
    farePaise,
    appliedSegments,
  };
}

