import { describe, expect, it } from 'vitest';
import {
  createZoneSchema,
  geoJsonPolygonSchema,
  MemoryCoverageRequestRepository,
  MemoryZoneRepository,
  resolveZonesRequestSchema,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../src/modules/zone/index.js';

describe('Zone Resolution Tests', () => {
  // Test polygons around Siliguri
  // City Polygon: roughly [88.40, 26.70] to [88.50, 26.80]
  const siliguriCityZone: ZoneEntity = {
    id: '018f0a00-0000-7000-8000-000000000001',
    name: 'Siliguri City',
    zoneType: 'CITY',
    parentCityZoneId: null,
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
    bufferDistanceM: 25_000, // 25 km buffer
    status: 'ACTIVE',
    currentPricingConfigId: '018f0a00-0000-7000-8000-000000000010',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function setupRepo(): MemoryZoneRepository {
    const repo = new MemoryZoneRepository();
    repo.save(siliguriCityZone);
    return repo;
  }

  it('validates coordinate boundaries', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    await expect(
      useCase.execute({
        pickup: { lat: 100, lng: 88.43 }, // lat > 90
        drop: { lat: 26.75, lng: 88.45 },
      }),
    ).rejects.toThrow('invalid geographic coordinates');
  });

  it('resolves origin city when pickup is inside city boundary', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    // Inside Siliguri City: lat 26.75, lng 88.45
    const result = await useCase.execute({
      pickup: { lat: 26.75, lng: 88.45 },
      drop: { lat: 26.76, lng: 88.46 },
    });

    expect(result.city).not.toBeNull();
    expect(result.city?.name).toBe('Siliguri City');
    expect(result.isWithinBuffer).toBe(false);
  });

  it('allows pickup outside all cities and marks originCity null', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    // Pickup outside all cities: lat 26.83, lng 88.45
    const result = await useCase.execute({
      pickup: { lat: 26.83, lng: 88.45 },
      drop: { lat: 26.75, lng: 88.45 },
    });

    expect(result.city).toBeNull();
    expect(result.nearestCity?.name).toBe('Siliguri City');
  });

  it('evaluates drop destination buffer relative to origin city boundary', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    // Pickup in Siliguri City, drop ~4km outside northern border (26.80) -> within 25km buffer
    const result = await useCase.execute({
      pickup: { lat: 26.75, lng: 88.45 },
      drop: { lat: 26.84, lng: 88.45 },
    });

    expect(result.city?.name).toBe('Siliguri City');
    expect(result.isWithinBuffer).toBe(true);
    expect(result.destinationCity).toBeNull();
  });

  it('marks isWithinBuffer false when drop is outside origin city buffer distance', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    // Pickup in Siliguri, drop ~100 km away
    const result = await useCase.execute({
      pickup: { lat: 26.75, lng: 88.45 },
      drop: { lat: 27.5, lng: 88.45 },
    });

    expect(result.city?.name).toBe('Siliguri City');
    expect(result.isWithinBuffer).toBe(false);
  });

  it('marks isWithinBuffer false when drop is inside another active city', async () => {
    const repo = setupRepo();
    // Second city: Jalpaiguri
    const jalpaiguriCity: ZoneEntity = {
      id: '018f0a00-0000-7000-8000-000000000010',
      name: 'Jalpaiguri City',
      zoneType: 'CITY',
      parentCityZoneId: null,
      stateCode: 'WB',
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [88.6, 26.5],
            [88.75, 26.5],
            [88.75, 26.6],
            [88.6, 26.6],
            [88.6, 26.5],
          ],
        ],
      },
      bufferDistanceM: 10_000,
      status: 'ACTIVE',
      currentPricingConfigId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repo.save(jalpaiguriCity);

    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });
    // Pickup in Siliguri, drop in Jalpaiguri
    const result = await useCase.execute({
      pickup: { lat: 26.75, lng: 88.45 },
      drop: { lat: 26.55, lng: 88.65 },
    });

    expect(result.city?.name).toBe('Siliguri City');
    expect(result.destinationCity?.name).toBe('Jalpaiguri City');
    expect(result.isWithinBuffer).toBe(false);
  });

  it('ignores inactive zones', async () => {
    const repo = new MemoryZoneRepository();
    await repo.save({ ...siliguriCityZone, status: 'INACTIVE' });
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    const result = await useCase.execute({
      pickup: { lat: 26.75, lng: 88.45 },
      drop: { lat: 26.76, lng: 88.46 },
    });

    expect(result.city).toBeNull();
    expect(result.nearestCity).toBeNull();
  });
});

describe('Zone Validation Schemas (Zod)', () => {
  it('validates closed GeoJSON polygon with at least 4 coordinates', () => {
    const valid = {
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
    };
    expect(geoJsonPolygonSchema.safeParse(valid).success).toBe(true);

    // Unclosed polygon (first != last)
    const unclosed = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [88.4, 26.7],
          [88.5, 26.7],
          [88.5, 26.8],
          [88.4, 26.8],
        ],
      ],
    };
    expect(geoJsonPolygonSchema.safeParse(unclosed).success).toBe(false);
  });

  it('validates zoneType enum in createZoneSchema', () => {
    const validCity = {
      name: 'Siliguri City Area',
      zoneType: 'CITY' as const,
      stateCode: 'WB',
      boundary: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [88.3, 26.6],
            [88.4, 26.6],
            [88.4, 26.7],
            [88.3, 26.7],
            [88.3, 26.6],
          ],
        ],
      },
    };
    expect(createZoneSchema.safeParse(validCity).success).toBe(true);

    const invalidType = {
      ...validCity,
      zoneType: 'INVALID_TYPE',
    };
    expect(createZoneSchema.safeParse(invalidType).success).toBe(false);
  });

  it('validates resolveZonesRequestSchema', () => {
    const valid = {
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
    };
    expect(resolveZonesRequestSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      pickup: { lat: 95, lng: 88.42 }, // Lat > 90
      drop: { lat: 26.75, lng: 88.45 },
    };
    expect(resolveZonesRequestSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('ServiceClassificationUseCase Tests', () => {
  const siliguriCityZone: ZoneEntity = {
    id: '018f0a00-0000-7000-8000-000000000001',
    name: 'Siliguri City',
    zoneType: 'CITY',
    parentCityZoneId: null,
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
    bufferDistanceM: 25_000,
    status: 'ACTIVE',
    currentPricingConfigId: '018f0a00-0000-7000-8000-000000000010',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function setupServiceClassifier(destinationStateResolver?: { execute: (p: unknown) => Promise<string | null> }) {
    const repo = new MemoryZoneRepository();
    repo.save(siliguriCityZone);
    const resolveZonesUseCase = new ResolveZonesUseCase({ zoneRepo: repo });
    const serviceClassifier = new ServiceClassificationUseCase({
      resolveZonesUseCase,
      destinationStateResolver,
    });
    return { serviceClassifier };
  }

  it('classifies trip inside city as IN_CITY with bufferApplied false', async () => {
    const { serviceClassifier } = setupServiceClassifier();
    const result = await serviceClassifier.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.78, lng: 88.48 },
    });

    expect(result.type).toBe('IN_CITY');
    expect(result.bufferApplied).toBe(false);
    expect(result.cityName).toBe('Siliguri City');
  });

  it('classifies trip with drop in derived buffer as IN_CITY with bufferApplied true', async () => {
    const { serviceClassifier } = setupServiceClassifier();
    const result = await serviceClassifier.execute({
      pickup: { lat: 26.75, lng: 88.45 },
      // Drop ~5km outside city north edge (26.80) -> within 25km buffer
      drop: { lat: 26.84, lng: 88.45 },
    });

    expect(result.type).toBe('IN_CITY');
    expect(result.bufferApplied).toBe(true);
    expect(result.cityName).toBe('Siliguri City');
  });

  it('classifies trip with drop far away as OUTSTATION', async () => {
    const { serviceClassifier } = setupServiceClassifier();
    const result = await serviceClassifier.execute({
      pickup: { lat: 26.75, lng: 88.45 },
      // Drop ~100km away
      drop: { lat: 27.5, lng: 88.45 },
    });

    expect(result.type).toBe('OUTSTATION');
    expect(result.bufferApplied).toBe(false);
  });

  it('classifies trip crossing state borders as INTERSTATE', async () => {
    // Drop (Gangtok, Sikkim) isn't inside any known city zone, so the destination state comes
    // from the (Google-backed in production) destinationStateResolver.
    const { serviceClassifier } = setupServiceClassifier({ execute: async () => 'SK' });
    const result = await serviceClassifier.execute({
      pickup: { lat: 26.75, lng: 88.45 },
      drop: { lat: 27.3, lng: 88.6 }, // Gangtok, Sikkim
    });

    expect(result.type).toBe('INTERSTATE');
    expect(result.routeScope).toBe('INTERSTATE');
    expect(result.originStateCode).toBe('WB');
    expect(result.destinationStateCode).toBe('SK');
  });

  it('every destination state is serviceable — no gating on state support', async () => {
    const { serviceClassifier } = setupServiceClassifier({ execute: async () => 'XX' });
    const result = await serviceClassifier.execute({
      pickup: { lat: 26.75, lng: 88.45 },
      drop: { lat: 27.3, lng: 88.6 },
    });

    expect(result.type).toBe('INTERSTATE');
    expect(result.destinationStateCode).toBe('XX');
  });

  it('classifies pickup outside city polygon but within buffer as IN_CITY with bufferApplied true', async () => {
    const { serviceClassifier } = setupServiceClassifier();
    const result = await serviceClassifier.execute({
      pickup: { lat: 26.83, lng: 88.45 }, // ~3.3km outside Siliguri City polygon, well within 25km buffer
      drop: { lat: 26.75, lng: 88.45 }, // Inside Siliguri City
    });

    expect(result.type).toBe('IN_CITY');
    expect(result.serviceType).toBe('CITY');
    expect(result.cityZoneId).toBe(siliguriCityZone.id);
    expect(result.cityName).toBe('Siliguri City');
    expect(result.bufferApplied).toBe(true);
  });

  it('classifies pickup far outside every zone (> buffer) as OUTSTATION and falls back to nearest city zone id', async () => {
    const { serviceClassifier } = setupServiceClassifier();
    const result = await serviceClassifier.execute({
      pickup: { lat: 27.20, lng: 88.45 }, // ~44km outside Siliguri City polygon (> 25km buffer)
      drop: { lat: 26.75, lng: 88.45 },
    });

    expect(result.type).toBe('OUTSTATION');
    expect(result.serviceType).toBe('OUTSTATION');
    expect(result.cityZoneId).toBe(siliguriCityZone.id);
    expect(result.cityName).toBe('Siliguri City');
    expect(result.originStateCode).toBe('WB');
    expect(result.bufferApplied).toBe(false);
  });
});
