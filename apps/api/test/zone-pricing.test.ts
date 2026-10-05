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
  getEffectiveBufferDistance,
  isPricingConfigEffective,
  PricingConfigModel,
  type CityZoneEntity,
  type PricingConfigEntity,
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
    outstationBaseFarePaise: 7500, // Rs. 75
    outstationRatePerKmPaise: 2200, // Rs. 22 / km (distinct from city 1500)
    outstationMinimumFarePaise: 15000, // Rs. 150 minimum (distinct from city 8000)
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
    // 1 km: 5000 + 1 * 1500 = 6500 paise, but minimum is 8000
    const fare = calculateBaseFareEstimate({
      config: baseConfig,
      distanceM: 1000,
      serviceType: 'CITY',
    });
    expect(fare).toBe(8000);
  });

  it('computes fare estimate for distance exceeding minimum fare threshold', () => {
    // 5 km: 5000 + 5 * 1500 = 12500 paise
    const fare = calculateBaseFareEstimate({
      config: baseConfig,
      distanceM: 5000,
      serviceType: 'CITY',
    });
    expect(fare).toBe(12500);
  });

  it('adds buffer surcharge when buffer fallback classification is triggered (D-027)', () => {
    // 5 km with buffer surcharge: 12500 + 2000 = 14500 paise
    const fare = calculateBaseFareEstimate({
      config: baseConfig,
      distanceM: 5000,
      serviceType: 'CITY',
      isBufferFallback: true,
    });
    expect(fare).toBe(14500);
  });

  it('computes outstation fare estimate with distinct outstation rate per km and minimum fare', () => {
    // 5 km: 7500 + 5 * 2200 = 18500 paise (> 15000 min).
    const fareMin = calculateBaseFareEstimate({
      config: baseConfig,
      distanceM: 5000,
      serviceType: 'OUTSTATION',
    });
    expect(fareMin).toBe(18500);

    // 10 km: 7500 + 10 * 2200 = 29500 paise.
    const fareDist = calculateBaseFareEstimate({
      config: baseConfig,
      distanceM: 10000,
      serviceType: 'OUTSTATION',
    });
    expect(fareDist).toBe(29500);

    // City fare for 10 km: 5000 + 10 * 1500 = 20000 paise.
    const cityFare = calculateBaseFareEstimate({
      config: baseConfig,
      distanceM: 10000,
      serviceType: 'CITY',
    });
    expect(cityFare).toBe(20000);
    expect(fareDist).not.toBe(cityFare);
  });

  it('never applies buffer surcharge to OUTSTATION serviceType', () => {
    // Buffer surcharge only applies when serviceType === 'CITY'
    const outstationWithBufferFlag = calculateBaseFareEstimate({
      config: baseConfig,
      distanceM: 10000,
      serviceType: 'OUTSTATION',
      isBufferFallback: true,
    });
    expect(outstationWithBufferFlag).toBe(29500);
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
      bufferSurchargePaise: 2000,
      negotiationFloorPercent: 80,
      negotiationCeilingPercent: 150,
      commissionPercent: 10,
      effectiveFrom: new Date().toISOString(),
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

    // Valid with outstation tier
    expect(
      createPricingConfigSchema.safeParse({
        ...valid,
        outstationBaseFarePaise: 7500,
        outstationRatePerKmPaise: 2000,
        outstationMinimumFarePaise: 15000,
      }).success,
    ).toBe(true);

    // Outstation Minimum fare < Outstation Base fare
    expect(
      createPricingConfigSchema.safeParse({
        ...valid,
        outstationBaseFarePaise: 8000,
        outstationMinimumFarePaise: 6000,
      }).success,
    ).toBe(false);
  });

});

describe('Mongoose Persistence Models', () => {
  it('registers geographic and pricing models with correct collection names', () => {
    expect(CityZoneModel.collection.name).toBe('city_zones');
    expect(PricingConfigModel.collection.name).toBe('pricing_configs');
  });
});
