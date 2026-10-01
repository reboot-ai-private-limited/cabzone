import { describe, expect, it, vi } from 'vitest';
import { CreateQuoteUseCase } from '../src/modules/pricing/application/useCases/createQuote.usecase.js';
import { CreateRideUseCase } from '../src/modules/rides/application/useCases/createRide.usecase.js';
import { MemoryPricingConfigRepository } from '../src/modules/pricing/infrastructure/persistence/memoryPricingConfig.repository.js';
import { MemoryStatePricingRepository } from '../src/modules/pricing/infrastructure/persistence/memoryStatePricing.repository.js';
import { MemoryStateBoundaryRepository } from '../src/modules/stateBoundary/infrastructure/persistence/memoryStateBoundary.repository.js';
import { ActiveBoundaryCache } from '../src/modules/stateBoundary/infrastructure/activeBoundaryCache.js';
import { ResolveRouteStatesUseCase } from '../src/modules/stateBoundary/application/useCases/resolveRouteStates.usecase.js';
import { MemoryZoneRepository } from '../src/modules/zone/infrastructure/persistence/memoryZone.repository.js';
import { buildZoneContainer } from '../src/modules/zone/zone.container.js';
import { MemoryRideRepository } from '../src/modules/rides/infrastructure/persistence/memoryRide.repository.js';
import { encodePolyline, type GeoJsonPolygon } from '@cabzone/geo';

describe('Phase 4: Quote & Ride Routing Integration', () => {
  const secret = 'super-secret-key-32-chars-minimum-length-for-test!';

  const polyWB: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.0, 26.0],
        [88.5, 26.0],
        [88.5, 27.0],
        [88.0, 27.0],
        [88.0, 26.0],
      ],
    ],
  };

  const polyBR: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.5, 26.0],
        [89.0, 26.0],
        [89.0, 27.0],
        [88.5, 27.0],
        [88.5, 26.0],
      ],
    ],
  };

  const cityZonePoly: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [88.1, 26.1],
        [88.3, 26.1],
        [88.3, 26.3],
        [88.1, 26.3],
        [88.1, 26.1],
      ],
    ],
  };

  async function setupTestEnvironment() {
    const stateBoundaryRepo = new MemoryStateBoundaryRepository();
    await stateBoundaryRepo.upsertByCode({
      id: 'state-wb',
      stateCode: 'WB',
      stateName: 'West Bengal',
      geometry: polyWB,
      version: 1,
      configVersion: 1,
      status: 'ACTIVE',
      intrastateEnabled: true,
      interstateDropOffEnabled: true,
      source: 'test',
      sourceVersion: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await stateBoundaryRepo.upsertByCode({
      id: 'state-br',
      stateCode: 'BR',
      stateName: 'Bihar',
      geometry: polyBR,
      version: 1,
      configVersion: 1,
      status: 'ACTIVE',
      intrastateEnabled: true,
      interstateDropOffEnabled: true,
      source: 'test',
      sourceVersion: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const boundaryCache = new ActiveBoundaryCache(stateBoundaryRepo);
    const resolveRouteStatesUseCase = new ResolveRouteStatesUseCase(boundaryCache);

    const zoneRepo = new MemoryZoneRepository();
    await zoneRepo.save({
      id: 'zone-city-1',
      name: 'Siliguri City',
      code: 'SILIGURI',
      stateCode: 'WB',
      zoneType: 'CITY',
      geometry: cityZonePoly,
      status: 'ACTIVE',
      version: 1,
      cityZoneId: null,
      bufferDistanceM: null,
      effectivePricingConfigId: 'cfg-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const guard = {
      execute: async (pickup: any, drop: any) => {
        const p = await stateBoundaryRepo.findContainingPoint(pickup);
        const d = await stateBoundaryRepo.findContainingPoint(drop);
        if (!p || p.status !== 'ACTIVE') throw new Error('PICKUP_NOT_SERVICEABLE: Pickup not serviceable');
        if (!d || d.status !== 'ACTIVE') throw new Error('DESTINATION_NOT_SERVICEABLE: Destination not serviceable');
        return {
          pickup: {
            stateCode: p.stateCode,
            boundaryVersion: p.version,
            configVersion: p.configVersion,
            intrastateEnabled: p.intrastateEnabled,
            interstateDropOffEnabled: p.interstateDropOffEnabled,
          },
          drop: {
            stateCode: d.stateCode,
            boundaryVersion: d.version,
            configVersion: d.configVersion,
            intrastateEnabled: d.intrastateEnabled,
            interstateDropOffEnabled: d.interstateDropOffEnabled,
          },
        };
      },
    };

    const zoneContainer = buildZoneContainer({ zoneRepo, serviceabilityGuard: guard });
    const serviceClassificationUseCase = zoneContainer.serviceClassificationUseCase;

    const pricingConfigRepo = new MemoryPricingConfigRepository();
    await pricingConfigRepo.save({
      id: 'cfg-1',
      cityZoneId: 'zone-city-1',
      version: 1,
      vehicleType: 'CAB',
      baseFarePaise: 5000,
      ratePerKmPaise: 1500,
      minimumFarePaise: 8000,
      includedDistanceM: 2000,
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
    });

    const statePricingRepo = new MemoryStatePricingRepository();
    await statePricingRepo.createNewVersionAtomically({
      id: 'sp-wb',
      stateCode: 'WB',
      ratePerKmPaise: 1600,
      baseFarePaise: 6000,
      minimumFarePaise: 8000,
      version: 1,
      status: 'ACTIVE',
      effectiveFrom: new Date(),
      effectiveTo: null,
      createdByAdminId: 'admin-1',
      createdAt: new Date(),
    });

    await statePricingRepo.createNewVersionAtomically({
      id: 'sp-br',
      stateCode: 'BR',
      ratePerKmPaise: 2000,
      baseFarePaise: 7000,
      minimumFarePaise: 10000,
      version: 1,
      status: 'ACTIVE',
      effectiveFrom: new Date(),
      effectiveTo: null,
      createdByAdminId: 'admin-1',
      createdAt: new Date(),
    });

    const rideRepo = new MemoryRideRepository();

    return {
      stateBoundaryRepo,
      boundaryCache,
      resolveRouteStatesUseCase,
      zoneRepo,
      serviceClassificationUseCase,
      pricingConfigRepo,
      statePricingRepo,
      rideRepo,
    };
  }

  it('creates quote for CITY trip with distance and duration from routing provider', async () => {
    const env = await setupTestEnvironment();

    const mockRouting = {
      execute: vi.fn().mockResolvedValue({
        provider: 'GOOGLE_ROUTES',
        distanceM: 5200,
        durationS: 780,
        polyline: encodePolyline([
          [88.15, 26.15],
          [88.2, 26.2],
        ]),
      }),
    };

    const quoteUseCase = new CreateQuoteUseCase({
      serviceClassificationUseCase: env.serviceClassificationUseCase,
      pricingConfigRepo: env.pricingConfigRepo,
      statePricingRepo: env.statePricingRepo,
      routingUseCase: mockRouting,
      resolveRouteStatesUseCase: env.resolveRouteStatesUseCase,
      tokenSecret: secret,
    });

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.15, lng: 88.15 },
      drop: { lat: 26.2, lng: 88.2 },
      vehicleCategory: 'CAB',
    });

    expect(mockRouting.execute).toHaveBeenCalledTimes(1);
    expect(quote.routeProvider).toBe('GOOGLE_ROUTES');
    expect(quote.distanceM).toBe(5200);
    expect(quote.estimatedDurationSeconds).toBe(780);
    expect(quote.serviceType).toBe('IN_CITY');
  });

  it('creates quote for INTERSTATE trip across WB and BR', async () => {
    const env = await setupTestEnvironment();

    const mockRouting = {
      execute: vi.fn().mockResolvedValue({
        provider: 'GOOGLE_ROUTES',
        distanceM: 12000,
        durationS: 1500,
        polyline: encodePolyline([
          [88.2, 26.2],
          [88.7, 26.2],
        ]),
      }),
    };

    const quoteUseCase = new CreateQuoteUseCase({
      serviceClassificationUseCase: env.serviceClassificationUseCase,
      pricingConfigRepo: env.pricingConfigRepo,
      statePricingRepo: env.statePricingRepo,
      routingUseCase: mockRouting,
      resolveRouteStatesUseCase: env.resolveRouteStatesUseCase,
      tokenSecret: secret,
    });

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.2, lng: 88.2 }, // WB
      drop: { lat: 26.2, lng: 88.7 }, // BR
      vehicleCategory: 'CAB',
    });

    expect(quote.routeScope).toBe('INTERSTATE');
    expect(quote.stateSegments).toBeDefined();
    expect(quote.stateSegments!.length).toBe(2);
    expect(quote.stateSegments![0]!.stateCode).toBe('WB');
    expect(quote.stateSegments![1]!.stateCode).toBe('BR');
  });

  it('unserviceable trip fails before calling routing provider', async () => {
    const env = await setupTestEnvironment();

    const mockRouting = {
      execute: vi.fn(),
    };

    const quoteUseCase = new CreateQuoteUseCase({
      serviceClassificationUseCase: env.serviceClassificationUseCase,
      pricingConfigRepo: env.pricingConfigRepo,
      statePricingRepo: env.statePricingRepo,
      routingUseCase: mockRouting,
      tokenSecret: secret,
    });

    // Point outside all serviceable states
    await expect(
      quoteUseCase.execute({
        pickup: { lat: 10.0, lng: 10.0 },
        drop: { lat: 26.2, lng: 88.2 },
        vehicleCategory: 'CAB',
      }),
    ).rejects.toThrow();

    // The paid routing API was NEVER invoked
    expect(mockRouting.execute).not.toHaveBeenCalled();
  });

  it('fails with 409 PRICING_VERSION_MISMATCH when state pricing is bumped before ride creation', async () => {
    const env = await setupTestEnvironment();

    const mockRouting = {
      execute: vi.fn().mockResolvedValue({
        provider: 'GOOGLE_ROUTES',
        distanceM: 10000,
        durationS: 1200,
        polyline: encodePolyline([
          [88.2, 26.2],
          [88.7, 26.2],
        ]),
      }),
    };

    const quoteUseCase = new CreateQuoteUseCase({
      serviceClassificationUseCase: env.serviceClassificationUseCase,
      pricingConfigRepo: env.pricingConfigRepo,
      statePricingRepo: env.statePricingRepo,
      routingUseCase: mockRouting,
      resolveRouteStatesUseCase: env.resolveRouteStatesUseCase,
      tokenSecret: secret,
    });

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.2, lng: 88.2 },
      drop: { lat: 26.2, lng: 88.7 },
      vehicleCategory: 'CAB',
    });

    const rideUseCase = new CreateRideUseCase({
      rideRepo: env.rideRepo,
      pricingConfigRepo: env.pricingConfigRepo,
      statePricingRepo: env.statePricingRepo,
      tokenSecret: secret,
    });

    // Bump Bihar (BR) state pricing version
    await env.statePricingRepo.createNewVersionAtomically({
      id: 'sp-br-v2',
      stateCode: 'BR',
      ratePerKmPaise: 2500,
      baseFarePaise: 8000,
      minimumFarePaise: 12000,
      version: 2,
      status: 'ACTIVE',
      effectiveFrom: new Date(),
      effectiveTo: null,
      createdByAdminId: 'admin-1',
      createdAt: new Date(),
    });

    // Attempt to create ride with the quote that used v1 state pricing
    await expect(
      rideUseCase.execute({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.suggestedFarePaise,
        riderId: 'rider-1',
        passengerName: 'John',
        passengerPhoneE164: '+919876543210',
        pickup: quote.pickup,
        drop: quote.drop,
        vehicleCategory: 'CAB',
      }),
    ).rejects.toThrow(/PRICING_VERSION_MISMATCH/);
  });
});
