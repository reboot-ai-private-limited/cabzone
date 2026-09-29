import { describe, expect, it } from 'vitest';
import {
  calculateCommissionPaise,
  calculateNegotiationBounds,
} from '@cabzone/contracts';
import {
  calculateBaseFareEstimate,
  CityZoneModel,
  createCityZoneSchema,
  createPricingConfigSchema,
  createStatePricingSchema,
  getEffectiveBufferDistance,
  isPricingConfigEffective,
  isStatePricingEffective,
  PricingConfigModel,
  StatePricingModel,
  type CityZoneEntity,
  type PricingConfigEntity,
  type StatePricingEntity,
} from '../src/modules/pricing/index.js';

describe('CityZone Domain Invariants', () => {
  const baseZone: CityZoneEntity = {
    id: '018f0a00-0000-7000-8000-000000000001',
    cityName: 'Siliguri',
    stateCode: 'WB',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [88.4, 26.7],
          [88.5, 26.7],
          [88.5, 26.8],
          [88.4, 26.8],
          [88.4, 26.7],
        ],
      ],
    },
    bufferDistanceM: null,
    status: 'ACTIVE',
    currentPricingConfigId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('uses global default buffer distance when city override is null (D-027)', () => {
    expect(getEffectiveBufferDistance(baseZone)).toBe(20_000);
  });

  it('uses city override buffer distance when specified (D-027)', () => {
    const overriddenZone = { ...baseZone, bufferDistanceM: 25_000 };
    expect(getEffectiveBufferDistance(overriddenZone)).toBe(25_000);
  });
});

describe('PricingConfig Domain Invariants & Fare Estimation', () => {
  const baseConfig: PricingConfigEntity = {
    id: '018f0a00-0000-7000-8000-000000000010',
    cityZoneId: '018f0a00-0000-7000-8000-000000000001',
    version: 1,
    vehicleType: 'CAB',
    baseFarePaise: 5000, // Rs. 50
    ratePerKmPaise: 1500, // Rs. 15 / km
    minimumFarePaise: 8000, // Rs. 80 minimum
    includedDistanceM: 2000, // First 2 km included in base fare
    bufferSurchargePaise: 2000, // Rs. 20 buffer surcharge (D-027)
    negotiationFloorPercent: 80,
    negotiationCeilingPercent: 150,
    negotiationWindowSeconds: 90,
    commissionPercent: 8,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    status: 'ACTIVE',
    createdByAdminId: '018f0a00-0000-7000-8000-000000000099',
    createdAt: new Date(),
  };

  it('identifies active effective pricing config', () => {
    expect(isPricingConfigEffective(baseConfig)).toBe(true);
  });

  it('rejects draft or retired configs', () => {
    expect(isPricingConfigEffective({ ...baseConfig, status: 'DRAFT' })).toBe(false);
    expect(isPricingConfigEffective({ ...baseConfig, status: 'RETIRED' })).toBe(false);
  });

  it('rejects expired config', () => {
    const expired = { ...baseConfig, effectiveTo: new Date('2026-02-01') };
    expect(isPricingConfigEffective(expired, new Date('2026-03-01'))).toBe(false);
  });

  it('rejects future-dated config where effectiveFrom is in the future', () => {
    const future = { ...baseConfig, effectiveFrom: new Date(Date.now() + 86400_000) };
    expect(isPricingConfigEffective(future)).toBe(false);
  });

  it('computes fare estimate with minimum fare enforcement', () => {
    // 1 km: within included 2km distance -> base fare 5000, but minimum is 8000
    const fare = calculateBaseFareEstimate({
      config: baseConfig,
      distanceM: 1000,
    });
    expect(fare).toBe(8000);
  });

  it('computes fare estimate for distance exceeding included distance', () => {
    // 5 km: included 2km, billable 3km -> 5000 + 3 * 1500 = 9500 paise
    const fare = calculateBaseFareEstimate({
      config: baseConfig,
      distanceM: 5000,
    });
    expect(fare).toBe(9500);
  });

  it('adds buffer surcharge when buffer fallback classification is triggered (D-027)', () => {
    // 5 km with buffer surcharge: 9500 + 2000 = 11500 paise
    const fare = calculateBaseFareEstimate({
      config: baseConfig,
      distanceM: 5000,
      isBufferFallback: true,
    });
    expect(fare).toBe(11500);
  });
});

describe('StatePricing Domain Invariants', () => {
  const baseStatePricing: StatePricingEntity = {
    id: '018f0a00-0000-7000-8000-000000000020',
    stateCode: 'WB',
    ratePerKmPaise: 1800,
    baseFarePaise: 6000,
    minimumFarePaise: 9000,
    version: 1,
    status: 'ACTIVE',
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    createdAt: new Date(),
  };

  it('checks active state pricing effectivity', () => {
    expect(isStatePricingEffective(baseStatePricing)).toBe(true);
    expect(isStatePricingEffective({ ...baseStatePricing, status: 'RETIRED' })).toBe(false);
  });

  it('rejects future-dated state pricing where effectiveFrom is in the future', () => {
    const future = { ...baseStatePricing, effectiveFrom: new Date(Date.now() + 86400_000) };
    expect(isStatePricingEffective(future)).toBe(false);
  });

  it('rejects expired state pricing where effectiveTo is in the past', () => {
    const expired = { ...baseStatePricing, effectiveTo: new Date(Date.now() - 1000) };
    expect(isStatePricingEffective(expired)).toBe(false);
  });
});

describe('Shared Negotiation & Commission Formulas', () => {
  it('calculates commission in integer paise (D-026)', () => {
    // 10% on Rs. 250 (25000 paise) = 2500 paise
    expect(calculateCommissionPaise(25000, 10)).toBe(2500);

    // 12.5% on Rs. 333 (33300 paise) = 4163 paise (rounded)
    expect(calculateCommissionPaise(33300, 12.5)).toBe(4163);
  });

  it('calculates negotiation floor and ceiling bounds (D-028)', () => {
    // Suggested 10000 paise, min 5000:
    // Floor = MAX(5000, 10000 * 0.8) = 8000
    // Ceiling = 10000 * 1.5 = 15000
    const bounds = calculateNegotiationBounds({
      suggestedFarePaise: 10000,
      minimumFarePaise: 5000,
    });
    expect(bounds.floorPaise).toBe(8000);
    expect(bounds.ceilingPaise).toBe(15000);
  });

  it('enforces minimum fare as floor if 80% falls below minimum fare (D-028)', () => {
    // Suggested 8000 paise, min 7500:
    // 80% = 6400, but min fare is 7500 -> floor must be 7500
    const bounds = calculateNegotiationBounds({
      suggestedFarePaise: 8000,
      minimumFarePaise: 7500,
    });
    expect(bounds.floorPaise).toBe(7500);
    expect(bounds.ceilingPaise).toBe(12000);
  });
});

describe('Pricing & Zone Boundary Validations (Zod Schemas)', () => {
  it('validates createCityZone payload with GeoJSON polygon', () => {
    const valid = {
      cityName: 'Siliguri',
      stateCode: 'WB',
      boundary: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [88.4, 26.7],
            [88.5, 26.7],
            [88.5, 26.8],
            [88.4, 26.8],
            [88.4, 26.7],
          ],
        ],
      },
    };
    expect(createCityZoneSchema.safeParse(valid).success).toBe(true);

    // State code length != 2
    expect(createCityZoneSchema.safeParse({ ...valid, stateCode: 'WESTBENGAL' }).success).toBe(
      false,
    );
  });

  it('validates createPricingConfig payload with refinement invariants', () => {
    const valid = {
      cityZoneId: '018f0a00-0000-7000-8000-000000000001',
      vehicleType: 'CAB' as const,
      baseFarePaise: 5000,
      ratePerKmPaise: 1500,
      minimumFarePaise: 8000,
      includedDistanceM: 2000,
      bufferSurchargePaise: 2000,
      negotiationFloorPercent: 80,
      negotiationCeilingPercent: 150,
      commissionPercent: 10,
      effectiveFrom: new Date(),
      createdByAdminId: '018f0a00-0000-7000-8000-000000000099',
    };
    expect(createPricingConfigSchema.safeParse(valid).success).toBe(true);

    // Ceiling < Floor
    expect(
      createPricingConfigSchema.safeParse({
        ...valid,
        negotiationFloorPercent: 120,
        negotiationCeilingPercent: 100,
      }).success,
    ).toBe(false);

    // Minimum fare < Base fare
    expect(
      createPricingConfigSchema.safeParse({
        ...valid,
        baseFarePaise: 9000,
        minimumFarePaise: 5000,
      }).success,
    ).toBe(false);
  });

  it('validates createStatePricing payload', () => {
    const valid = {
      stateCode: 'BR',
      ratePerKmPaise: 1400,
      baseFarePaise: 4000,
      minimumFarePaise: 6000,
      effectiveFrom: new Date(),
    };
    expect(createStatePricingSchema.safeParse(valid).success).toBe(true);
  });
});

describe('Mongoose Persistence Models', () => {
  it('registers geographic and pricing models with correct collection names', () => {
    expect(CityZoneModel.collection.name).toBe('city_zones');
    expect(PricingConfigModel.collection.name).toBe('pricing_configs');
    expect(StatePricingModel.collection.name).toBe('state_pricing');
  });
});
