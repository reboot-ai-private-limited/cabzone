import { describe, expect, it } from 'vitest';
import { calculateFare } from '../src/modules/pricing/domain/fare.js';
import type { PricingConfigEntity } from '../src/modules/pricing/domain/pricingConfig.entity.js';
import type { StatePricingEntity } from '../src/modules/pricing/domain/statePricing.entity.js';

describe('calculateFare (Assumptions A–D pure calculation)', () => {
  const baseCityConfig: PricingConfigEntity = {
    id: 'cfg-1',
    cityZoneId: 'zone-kolkata',
    version: 1,
    vehicleType: 'CAB',
    baseFarePaise: 5000, // Rs 50
    ratePerKmPaise: 1500, // Rs 15/km
    minimumFarePaise: 8000, // Rs 80
    includedDistanceM: 2000, // 2 km included
    bufferSurchargePaise: 1000,
    negotiationFloorPercent: 80,
    negotiationCeilingPercent: 150,
    negotiationWindowSeconds: 90,
    commissionPercent: 8,
    effectiveFrom: new Date(),
    effectiveTo: null,
    status: 'ACTIVE',
    createdByAdminId: 'admin-1',
    createdAt: new Date(),
  };

  const stateWB: StatePricingEntity = {
    id: 'sp-wb',
    stateCode: 'WB',
    ratePerKmPaise: 1600, // Rs 16/km
    baseFarePaise: 6000,
    minimumFarePaise: 7000,
    version: 1,
    status: 'ACTIVE',
    effectiveFrom: new Date(),
    effectiveTo: null,
    createdByAdminId: 'admin-1',
    createdAt: new Date(),
  };

  const stateBR: StatePricingEntity = {
    id: 'sp-br',
    stateCode: 'BR',
    ratePerKmPaise: 2000, // Rs 20/km
    baseFarePaise: 7000, // Rs 70
    minimumFarePaise: 10000, // Rs 100
    version: 1,
    status: 'ACTIVE',
    effectiveFrom: new Date(),
    effectiveTo: null,
    createdByAdminId: 'admin-1',
    createdAt: new Date(),
  };

  it('calculates standard INTRA_STATE or CITY fare using city config', () => {
    // 10 km (10,000m) - 2 km included = 8 km billable @ Rs 15/km = Rs 120 + Rs 50 base = Rs 170 (17,000 paise)
    const result = calculateFare({
      config: baseCityConfig,
      distanceM: 10000,
      routeScope: 'INTRA_STATE',
      destinationStateCode: 'WB',
    });

    expect(result.farePaise).toBe(17000);
    expect(result.appliedSegments.length).toBe(1);
    expect(result.appliedSegments[0]!.ratePerKmPaise).toBe(1500);
  });

  it('enforces minimum fare floor on short intra-state trip', () => {
    // 1 km (1,000m) - all within included 2km. Subtotal = Rs 50. Minimum = Rs 80 (8,000 paise).
    const result = calculateFare({
      config: baseCityConfig,
      distanceM: 1000,
      routeScope: 'INTRA_STATE',
    });

    expect(result.farePaise).toBe(8000);
  });

  it('calculates INTERSTATE fare with per-state segments (Assumption A)', () => {
    // Total 12 km: 5 km in WB, 7 km in BR. Destination is BR.
    // Base fare from destination state BR: Rs 70 (7,000 paise) (Assumption C)
    // Included distance 2 km deducted from first segment WB:
    // WB: 5 km - 2 km = 3 km @ 1600 paise = 4,800 paise (Assumption D)
    // BR: 7 km @ 2000 paise = 14,000 paise
    // Subtotal: 7000 + 4800 + 14000 = 25,800 paise (Rs 258)
    // Minimum: max(8000, 10000) = 10,000 paise
    // Final fare: 25,800 paise
    const result = calculateFare({
      config: baseCityConfig,
      distanceM: 12000,
      routeScope: 'INTERSTATE',
      destinationStateCode: 'BR',
      segments: [
        { stateCode: 'WB', distanceM: 5000 },
        { stateCode: 'BR', distanceM: 7000 },
      ],
      stateRates: { WB: stateWB, BR: stateBR },
    });

    expect(result.farePaise).toBe(25800);
    expect(result.appliedSegments).toEqual([
      { stateCode: 'WB', distanceM: 5000, ratePerKmPaise: 1600 },
      { stateCode: 'BR', distanceM: 7000, ratePerKmPaise: 2000 },
    ]);
  });

  it('falls back to city config rate when state pricing is missing (Assumption B)', () => {
    // Traversed state SK has no active state rate.
    // 10 km in SK: 2 km included -> 8 km @ city rate (1500) = 12,000 + city base (5000) = 17,000
    const result = calculateFare({
      config: baseCityConfig,
      distanceM: 10000,
      routeScope: 'INTERSTATE',
      destinationStateCode: 'SK',
      segments: [{ stateCode: 'SK', distanceM: 10000 }],
      stateRates: { WB: stateWB }, // No SK rate provided
    });

    expect(result.farePaise).toBe(17000);
    expect(result.appliedSegments[0]!.ratePerKmPaise).toBe(1500); // city fallback
  });

  it('deducts included distance spanning across state borders (Assumption D)', () => {
    // Included distance = 2,000 m.
    // Segment 1 (WB): 1,500 m -> all covered by included distance (0 billable)
    // Remaining included distance: 500 m
    // Segment 2 (BR): 4,500 m - 500 m = 4,000 m billable @ 2000 paise = 8,000 paise
    // Base from BR: 7,000 paise
    // Subtotal: 7000 + 8000 = 15,000 paise
    const result = calculateFare({
      config: baseCityConfig,
      distanceM: 6000,
      routeScope: 'INTERSTATE',
      destinationStateCode: 'BR',
      segments: [
        { stateCode: 'WB', distanceM: 1500 },
        { stateCode: 'BR', distanceM: 4500 },
      ],
      stateRates: { WB: stateWB, BR: stateBR },
    });

    expect(result.farePaise).toBe(15000);
  });

  it('respects buffer surcharge if isBufferFallback is true', () => {
    const result = calculateFare({
      config: baseCityConfig,
      distanceM: 10000,
      routeScope: 'INTRA_STATE',
      isBufferFallback: true,
    });

    // 17,000 + 1,000 buffer surcharge = 18,000
    expect(result.farePaise).toBe(18000);
  });
});

