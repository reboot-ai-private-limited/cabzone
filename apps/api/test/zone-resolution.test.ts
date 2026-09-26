import { describe, expect, it } from 'vitest';
import {
  createZoneSchema,
  geoJsonPolygonSchema,
  MemoryZoneRepository,
  resolveZonesRequestSchema,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../src/modules/zone/index.js';

describe('Zone Resolution & EXCLUSION Veto Tests', () => {
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

  // Pickup pocket inside Siliguri: Junction area [88.42, 26.72] to [88.45, 26.75]
  const junctionPickupZone: ZoneEntity = {
    id: '018f0a00-0000-7000-8000-000000000002',
    name: 'Siliguri Junction Coverage',
    zoneType: 'PICKUP',
    parentCityZoneId: siliguriCityZone.id,
    stateCode: 'WB',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [88.42, 26.72],
          [88.45, 26.72],
          [88.45, 26.75],
          [88.42, 26.75],
          [88.42, 26.72],
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

  // Military Cantonment inside Siliguri: [88.43, 26.73] to [88.44, 26.74]
  const cantonmentExclusionZone: ZoneEntity = {
    id: '018f0a00-0000-7000-8000-000000000003',
    name: 'Sukna / Army Cantonment Restricted Area',
    zoneType: 'EXCLUSION',
    parentCityZoneId: siliguriCityZone.id,
    stateCode: 'WB',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [88.43, 26.73],
          [88.44, 26.73],
          [88.44, 26.74],
          [88.43, 26.74],
          [88.43, 26.73],
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

  function setupRepo(): MemoryZoneRepository {
    const repo = new MemoryZoneRepository();
    repo.save(siliguriCityZone);
    repo.save(junctionPickupZone);
    repo.save(cantonmentExclusionZone);
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

  it('enforces EXCLUSION absolute veto on pickup', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    // Point inside Cantonment: lat 26.735, lng 88.435
    await expect(
      useCase.execute({
        pickup: { lat: 26.735, lng: 88.435 },
        drop: { lat: 26.76, lng: 88.46 },
      }),
    ).rejects.toThrow('PICKUP_IN_EXCLUSION_ZONE');
  });

  it('enforces EXCLUSION absolute veto on drop', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    // Drop point inside Cantonment: lat 26.735, lng 88.435
    await expect(
      useCase.execute({
        pickup: { lat: 26.76, lng: 88.46 },
        drop: { lat: 26.735, lng: 88.435 },
      }),
    ).rejects.toThrow('DROP_IN_EXCLUSION_ZONE');
  });

  it('returns exclusion info without throwing when throwOnExclusion is false', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    const result = await useCase.execute({
      pickup: { lat: 26.735, lng: 88.435 },
      drop: { lat: 26.76, lng: 88.46 },
      throwOnExclusion: false,
    });

    expect(result.pickupExclusion).not.toBeNull();
    expect(result.pickupExclusion?.name).toBe('Sukna / Army Cantonment Restricted Area');
    expect(result.dropExclusion).toBeNull();
  });

  it('resolves city and pickup zone when inside active service pocket', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    // Inside Junction pocket: lat 26.725, lng 88.425 (outside cantonment)
    const result = await useCase.execute({
      pickup: { lat: 26.725, lng: 88.425 },
      drop: { lat: 26.76, lng: 88.46 },
    });

    expect(result.pickupExclusion).toBeNull();
    expect(result.dropExclusion).toBeNull();
    expect(result.city).not.toBeNull();
    expect(result.city?.name).toBe('Siliguri City');
    expect(result.pickupCoverage).not.toBeNull();
    expect(result.pickupCoverage?.name).toBe('Siliguri Junction Coverage');
    expect(result.isWithinBuffer).toBe(false);
  });

  it('resolves city when inside city boundary but outside specific pickup pocket', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    // Inside Siliguri City: lat 26.78, lng 88.48 (outside junction pocket)
    const result = await useCase.execute({
      pickup: { lat: 26.78, lng: 88.48 },
      drop: { lat: 26.71, lng: 88.41 },
    });

    expect(result.city?.name).toBe('Siliguri City');
    expect(result.pickupCoverage).toBeNull();
    expect(result.isWithinBuffer).toBe(false);
  });

  it('resolves derived buffer coverage when pickup is outside city but within buffer distance', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    // Point ~5 km outside Siliguri boundary: lat 26.83, lng 88.45 (Siliguri northern border is 26.80)
    // 0.03 deg lat ~ 3.3 km, well within 25 km buffer
    const result = await useCase.execute({
      pickup: { lat: 26.83, lng: 88.45 },
      drop: { lat: 26.75, lng: 88.45 },
    });

    expect(result.city).toBeNull();
    expect(result.isWithinBuffer).toBe(true);
    expect(result.nearestCity?.name).toBe('Siliguri City');
  });

  it('marks isWithinBuffer false when pickup is far outside city and outside buffer', async () => {
    const repo = setupRepo();
    const useCase = new ResolveZonesUseCase({ zoneRepo: repo });

    // Point ~100 km away: lat 27.50, lng 88.45 (0.7 deg lat ~ 77 km + distance to polygon > 25km)
    const result = await useCase.execute({
      pickup: { lat: 27.5, lng: 88.45 },
      drop: { lat: 27.52, lng: 88.46 },
    });

    expect(result.city).toBeNull();
    expect(result.isWithinBuffer).toBe(false);
    expect(result.nearestCity?.name).toBe('Siliguri City');
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

  it('requires parentCityZoneId when zoneType is PICKUP', () => {
    const validPickup = {
      name: 'Baghdogra Airport Pocket',
      zoneType: 'PICKUP' as const,
      parentCityZoneId: '018f0a00-0000-7000-8000-000000000001',
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
    expect(createZoneSchema.safeParse(validPickup).success).toBe(true);

    // Missing parentCityZoneId for PICKUP
    const invalidPickup = {
      ...validPickup,
      parentCityZoneId: null,
    };
    expect(createZoneSchema.safeParse(invalidPickup).success).toBe(false);
  });

  it('validates resolveZonesRequestSchema', () => {
    const valid = {
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      throwOnExclusion: true,
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

  const cantonmentExclusionZone: ZoneEntity = {
    id: '018f0a00-0000-7000-8000-000000000003',
    name: 'Army Cantonment',
    zoneType: 'EXCLUSION',
    parentCityZoneId: siliguriCityZone.id,
    stateCode: 'WB',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [88.43, 26.73],
          [88.44, 26.73],
          [88.44, 26.74],
          [88.43, 26.74],
          [88.43, 26.73],
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

  function setupServiceClassifier() {
    const repo = new MemoryZoneRepository();
    repo.save(siliguriCityZone);
    repo.save(cantonmentExclusionZone);
    const resolveZonesUseCase = new ResolveZonesUseCase({ zoneRepo: repo });
    const serviceClassifier = new ServiceClassificationUseCase({ resolveZonesUseCase });
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
    const { serviceClassifier } = setupServiceClassifier();
    const result = await serviceClassifier.execute({
      pickup: { lat: 26.75, lng: 88.45 },
      drop: { lat: 27.3, lng: 88.6 }, // Gangtok, Sikkim
      routeStateSegments: [
        { stateCode: 'WB', distanceM: 40_000 },
        { stateCode: 'SK', distanceM: 60_000 },
      ],
    });

    expect(result.type).toBe('INTERSTATE');
  });

  it('enforces absolute EXCLUSION veto during service classification', async () => {
    const { serviceClassifier } = setupServiceClassifier();
    await expect(
      serviceClassifier.execute({
        pickup: { lat: 26.735, lng: 88.435 }, // inside cantonment
        drop: { lat: 26.78, lng: 88.48 },
      }),
    ).rejects.toThrow('PICKUP_IN_EXCLUSION_ZONE');
  });
});
