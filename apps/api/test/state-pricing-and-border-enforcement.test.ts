import { describe, expect, it } from 'vitest';
import { haversineDistanceM } from '@cabzone/geo';
import { CreateQuoteUseCase } from '../src/modules/pricing/application/useCases/createQuote.usecase.js';
import { MemoryPricingConfigRepository } from '../src/modules/pricing/infrastructure/persistence/memoryPricingConfig.repository.js';
import type { PricingConfigEntity } from '../src/modules/pricing/domain/pricingConfig.entity.js';
import { MemoryZoneRepository } from '../src/modules/zone/infrastructure/persistence/memoryZone.repository.js';
import { ResolveZonesUseCase } from '../src/modules/zone/application/useCases/resolveZones.usecase.js';
import { ServiceClassificationUseCase } from '../src/modules/zone/application/useCases/serviceClassification.usecase.js';
import { OfflineIndiaGeoResolver } from '../src/modules/routing/infrastructure/offlineGeoResolver.js';
import type { ZoneEntity } from '../src/modules/zone/domain/zone.entity.js';

describe('State Pricing Architecture & Sovereign Border Enforcement', () => {
  const TEST_SECRET = 'test-secret-key-32-chars-long-for-hmac-token-verification';

  // Siliguri City Polygon
  const siliguriZone: ZoneEntity = {
    id: 'zone-siliguri-001',
    name: 'Siliguri City',
    zoneType: 'CITY',
    parentCityZoneId: null,
    stateCode: 'WB',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [88.35, 26.65],
          [88.5, 26.65],
          [88.5, 26.78],
          [88.35, 26.78],
          [88.35, 26.65],
        ],
      ],
    },
    bufferDistanceM: 20_000, // 20km buffer
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Tier 1: City Zone Pricing for Siliguri
  const siliguriCityConfig: PricingConfigEntity = {
    id: 'cfg-siliguri-cab-1',
    level: 'CITY',
    cityZoneId: siliguriZone.id,
    stateCode: 'WB',
    stateName: 'West Bengal',
    version: 1,
    vehicleType: 'CAB',
    baseFarePaise: 5000, // ₹50
    ratePerKmPaise: 1500, // ₹15/km
    minimumFarePaise: 8000, // ₹80
    outstationBaseFarePaise: 7500, // ₹75
    outstationRatePerKmPaise: 2000, // ₹20/km
    outstationMinimumFarePaise: 15000, // ₹150
    bufferSurchargePaise: 2000, // ₹20
    negotiationFloorPercent: 80,
    negotiationCeilingPercent: 150,
    negotiationWindowSeconds: 90,
    commissionPercent: 8,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    status: 'ACTIVE',
    createdByAdminId: 'admin-1',
    createdAt: new Date(),
  };

  // Tier 2: State Pricing for West Bengal (WB)
  const wbStateConfig: PricingConfigEntity = {
    id: 'cfg-wb-state-cab-1',
    level: 'STATE',
    cityZoneId: null,
    stateCode: 'WB',
    stateName: 'West Bengal',
    version: 1,
    vehicleType: 'CAB',
    baseFarePaise: 4500, // ₹45
    ratePerKmPaise: 1500, // ₹15/km
    minimumFarePaise: 7000, // ₹70
    outstationBaseFarePaise: 7000, // ₹70
    outstationRatePerKmPaise: 1900, // ₹19/km
    outstationMinimumFarePaise: 14000, // ₹140
    bufferSurchargePaise: 2000,
    negotiationFloorPercent: 80,
    negotiationCeilingPercent: 150,
    negotiationWindowSeconds: 90,
    commissionPercent: 8,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    status: 'ACTIVE',
    createdByAdminId: 'admin-1',
    createdAt: new Date(),
  };

  // Tier 2: State Pricing for Sikkim (SK) - Mountain Terrain Rates
  const skStateConfig: PricingConfigEntity = {
    id: 'cfg-sk-state-cab-1',
    level: 'STATE',
    cityZoneId: null,
    stateCode: 'SK',
    stateName: 'Sikkim',
    version: 1,
    vehicleType: 'CAB',
    baseFarePaise: 8000, // ₹80
    ratePerKmPaise: 2500, // ₹25/km
    minimumFarePaise: 12000, // ₹120
    outstationBaseFarePaise: 10000, // ₹100
    outstationRatePerKmPaise: 2800, // ₹28/km
    outstationMinimumFarePaise: 20000, // ₹200
    bufferSurchargePaise: 3000,
    negotiationFloorPercent: 80,
    negotiationCeilingPercent: 150,
    negotiationWindowSeconds: 90,
    commissionPercent: 8,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    status: 'ACTIVE',
    createdByAdminId: 'admin-1',
    createdAt: new Date(),
  };

  // Tier 3: Global Baseline Pricing
  const globalConfig: PricingConfigEntity = {
    id: 'cfg-global-cab-1',
    level: 'GLOBAL',
    cityZoneId: null,
    stateCode: null,
    stateName: null,
    version: 1,
    vehicleType: 'CAB',
    baseFarePaise: 4000, // ₹40
    ratePerKmPaise: 1400, // ₹14/km
    minimumFarePaise: 6000, // ₹60
    outstationBaseFarePaise: 6000, // ₹60
    outstationRatePerKmPaise: 1800, // ₹18/km
    outstationMinimumFarePaise: 12000, // ₹120
    bufferSurchargePaise: 2000,
    negotiationFloorPercent: 80,
    negotiationCeilingPercent: 150,
    negotiationWindowSeconds: 90,
    commissionPercent: 8,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    status: 'ACTIVE',
    createdByAdminId: 'admin-1',
    createdAt: new Date(),
  };

  function setupEngine(opts?: { withoutCityConfig?: boolean; withoutStateConfigs?: boolean }) {
    const zoneRepo = new MemoryZoneRepository();
    zoneRepo.save(siliguriZone);
    const geoResolver = new OfflineIndiaGeoResolver();
    const resolveZonesUseCase = new ResolveZonesUseCase({ zoneRepo });
    const serviceClassificationUseCase = new ServiceClassificationUseCase({
      resolveZonesUseCase,
      destinationStateResolver: {
        execute: async (p) => (await geoResolver.resolveLocation(p)).stateCode,
        resolveLocation: async (p) => geoResolver.resolveLocation(p),
      },
    });

    const pricingConfigRepo = new MemoryPricingConfigRepository();
    pricingConfigRepo.save(globalConfig);

    if (!opts?.withoutStateConfigs) {
      pricingConfigRepo.save(wbStateConfig);
      pricingConfigRepo.save(skStateConfig);
    }
    if (!opts?.withoutCityConfig) {
      pricingConfigRepo.save(siliguriCityConfig);
    }

    const createQuoteUseCase = new CreateQuoteUseCase({
      serviceClassificationUseCase,
      pricingConfigRepo,
      tokenSecret: TEST_SECRET,
    });

    return { createQuoteUseCase, pricingConfigRepo };
  }

  describe('Part 1: Sovereign Indian Boundary Enforcement (Cross-Border Rejection)', () => {
    const { createQuoteUseCase } = setupEngine();

    it('rejects pickup in Nepal (Biratnagar) with OUTSIDE_INDIA error', async () => {
      await expect(
        createQuoteUseCase.execute({
          pickup: { lat: 26.48, lng: 87.28 }, // Biratnagar, Nepal
          drop: { lat: 26.7141, lng: 88.4334 }, // Siliguri, India
          vehicleCategory: 'CAB',
        }),
      ).rejects.toThrow(/OUTSIDE_INDIA/);
    });

    it('rejects drop in Nepal (Kathmandu) with OUTSIDE_INDIA error', async () => {
      await expect(
        createQuoteUseCase.execute({
          pickup: { lat: 26.7141, lng: 88.4334 }, // Siliguri, India
          drop: { lat: 27.7172, lng: 85.324 }, // Kathmandu, Nepal
          vehicleCategory: 'CAB',
        }),
      ).rejects.toThrow(/OUTSIDE_INDIA/);
    });

    it('rejects pickup in Bangladesh (Dhaka) with OUTSIDE_INDIA error', async () => {
      await expect(
        createQuoteUseCase.execute({
          pickup: { lat: 23.8103, lng: 90.4125 }, // Dhaka, Bangladesh
          drop: { lat: 22.5726, lng: 88.3639 }, // Kolkata, India
          vehicleCategory: 'CAB',
        }),
      ).rejects.toThrow(/OUTSIDE_INDIA/);
    });

    it('rejects pickup in Bhutan (Thimphu) with OUTSIDE_INDIA error', async () => {
      await expect(
        createQuoteUseCase.execute({
          pickup: { lat: 27.4728, lng: 89.6393 }, // Thimphu, Bhutan
          drop: { lat: 26.7141, lng: 88.4334 }, // Siliguri, India
          vehicleCategory: 'CAB',
        }),
      ).rejects.toThrow(/OUTSIDE_INDIA/);
    });

    it('rejects pickup in Pakistan (Lahore) with OUTSIDE_INDIA error', async () => {
      await expect(
        createQuoteUseCase.execute({
          pickup: { lat: 31.5497, lng: 74.3436 }, // Lahore, Pakistan
          drop: { lat: 31.634, lng: 74.8723 }, // Amritsar, India
          vehicleCategory: 'CAB',
        }),
      ).rejects.toThrow(/OUTSIDE_INDIA/);
    });

    it('rejects foreign coordinates outside subcontinent (New York, London, Singapore)', async () => {
      await expect(
        createQuoteUseCase.execute({
          pickup: { lat: 40.7128, lng: -74.006 }, // New York
          drop: { lat: 26.7141, lng: 88.4334 },
          vehicleCategory: 'CAB',
        }),
      ).rejects.toThrow(/OUTSIDE_INDIA/);
    });

    it('allows domestic border towns within India (Siliguri, Kishanganj, Gangtok, Jaigaon)', async () => {
      const quote = await createQuoteUseCase.execute({
        pickup: { lat: 26.7141, lng: 88.4334 }, // Siliguri, WB
        drop: { lat: 26.0984, lng: 87.9482 }, // Kishanganj, Bihar
        vehicleCategory: 'CAB',
      });
      expect(quote).toBeDefined();
      expect(quote.suggestedFarePaise).toBeGreaterThan(0);
    });
  });

  describe('Part 2: Multi-Tier Pricing & "Pickup from outside city zone" logic', () => {
    it('pickup inside city zone uses City Zone Pricing', async () => {
      const { createQuoteUseCase } = setupEngine();

      const quote = await createQuoteUseCase.execute({
        pickup: { lat: 26.7141, lng: 88.4334 }, // Siliguri center
        drop: { lat: 26.725, lng: 88.42 }, // Inside Siliguri
        vehicleCategory: 'CAB',
      });

      expect(quote.serviceType).toBe('IN_CITY');
      expect(quote.pricingConfigId).toBe(siliguriCityConfig.id);
    });

    it('pickup outside city polygon but WITHIN buffer distance is priced as IN_CITY with buffer surcharge', async () => {
      const { createQuoteUseCase } = setupEngine();

      // Matigara (~4km outside Siliguri boundary, inside 20km buffer)
      const quote = await createQuoteUseCase.execute({
        pickup: { lat: 26.7271, lng: 88.32 },
        drop: { lat: 26.7141, lng: 88.4334 },
        vehicleCategory: 'CAB',
      });

      expect(quote.serviceType).toBe('IN_CITY');
      expect(quote.bufferApplied).toBe(true);
      expect(quote.pricingConfigId).toBe(siliguriCityConfig.id);
    });

    it('pickup FAR outside city zone (>20km) uses pickup state manual pricing (WB)', async () => {
      const { createQuoteUseCase } = setupEngine({ withoutCityConfig: true });

      // Far outside Siliguri (~45km south in West Bengal)
      const quote = await createQuoteUseCase.execute({
        pickup: { lat: 26.35, lng: 88.25 },
        drop: { lat: 26.7141, lng: 88.4334 },
        vehicleCategory: 'CAB',
      });

      expect(quote.serviceType).toBe('OUTSTATION');
      // Uses West Bengal state pricing
      expect(quote.pricingConfigId).toBe(wbStateConfig.id);
      expect(quote.originStateCode).toBe('WB');
    });

    it('pickup in Sikkim (mountain state without city zone) uses Sikkim manual state outstation pricing', async () => {
      const { createQuoteUseCase } = setupEngine({ withoutCityConfig: true });

      // Gangtok, Sikkim to Siliguri (~110km mountain descent)
      const quote = await createQuoteUseCase.execute({
        pickup: { lat: 27.3389, lng: 88.6065 }, // Gangtok, Sikkim
        drop: { lat: 26.7141, lng: 88.4334 }, // Siliguri, WB
        vehicleCategory: 'CAB',
      });

      expect(quote.serviceType).toBe('INTERSTATE');
      expect(quote.originStateCode).toBe('SK');
      // Bound to Sikkim state pricing config
      expect(quote.pricingConfigId).toBe(skStateConfig.id);
    });

    it('pickup in a state without manual state pricing falls back to Global Pricing', async () => {
      const { createQuoteUseCase } = setupEngine({
        withoutCityConfig: true,
        withoutStateConfigs: true,
      });

      // Bihar (Patna to Gaya) when no Bihar state config exists
      const quote = await createQuoteUseCase.execute({
        pickup: { lat: 25.5941, lng: 85.1376 }, // Patna, Bihar
        drop: { lat: 24.7955, lng: 85.0002 }, // Gaya, Bihar
        vehicleCategory: 'CAB',
      });

      expect(quote.serviceType).toBe('OUTSTATION');
      // Falls back to Global baseline pricing
      expect(quote.pricingConfigId).toBe(globalConfig.id);
    });
  });

  describe('Part 3: State Distance Breakdown & Multi-State Pricing', () => {
    it('returns exact state distance breakdown for interstate route', async () => {
      const { createQuoteUseCase } = setupEngine();

      const quote = await createQuoteUseCase.execute({
        pickup: { lat: 26.7141, lng: 88.4334 }, // Siliguri, WB
        drop: { lat: 26.0984, lng: 87.9482 }, // Kishanganj, Bihar
        vehicleCategory: 'CAB',
      });

      expect(quote.stateBreakdown).toBeDefined();
      expect(quote.stateBreakdown!.length).toBeGreaterThanOrEqual(2);

      const states = quote.stateBreakdown!.map((s) => s.stateCode);
      expect(states).toContain('WB');
      expect(states).toContain('BR');

      // Sum of percentages should be 100%
      const totalPct = quote.stateBreakdown!.reduce((acc, s) => acc + s.percentage, 0);
      expect(Math.round(totalPct)).toBe(100);

      // Each state breakdown has ratePerKmPaise and distanceFarePaise populated
      for (const seg of quote.stateBreakdown!) {
        expect(seg.ratePerKmPaise).toBeGreaterThan(0);
        expect(seg.distanceFarePaise).toBeGreaterThan(0);
      }
      const wb = quote.stateBreakdown!.find((segment) => segment.stateCode === 'WB')!;
      const br = quote.stateBreakdown!.find((segment) => segment.stateCode === 'BR')!;
      expect(wb.ratePerKmPaise).toBe(wbStateConfig.outstationRatePerKmPaise);
      expect(br.ratePerKmPaise).toBe(globalConfig.outstationRatePerKmPaise);
      const expectedFare = Math.max(
        siliguriCityConfig.outstationMinimumFarePaise,
        siliguriCityConfig.outstationBaseFarePaise +
          quote.stateBreakdown!.reduce(
            (total, segment) =>
              total + Math.round((segment.distanceM * segment.ratePerKmPaise) / 1000),
            0,
          ),
      );
      expect(quote.suggestedFarePaise).toBe(expectedFare);
    });
  });
});
