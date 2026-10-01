import { describe, expect, it } from 'vitest';
import {
  AssertServiceableUseCase,
  ImportStateBoundariesUseCase,
  MemoryStateBoundaryRepository,
  ResolveStateForPointUseCase,
  type StateFeature,
} from '../src/modules/stateBoundary/index.js';
import { ServiceClassificationUseCase } from '../src/modules/zone/index.js';

function square(lng: number, lat: number, size = 1) {
  return {
    type: 'Polygon' as const,
    coordinates: [
      [
        [lng, lat],
        [lng + size, lat],
        [lng + size, lat + size],
        [lng, lat + size],
        [lng, lat],
      ],
    ],
  };
}

const features: StateFeature[] = [
  { properties: { stateCode: 'WB', stateName: 'West Bengal' }, geometry: square(87, 25) },
  { properties: { stateCode: 'BR', stateName: 'Bihar' }, geometry: square(85, 25) },
  { properties: { stateCode: 'UP', stateName: 'Uttar Pradesh' }, geometry: square(80, 25) },
];

async function setup() {
  const repo = new MemoryStateBoundaryRepository();
  const importer = new ImportStateBoundariesUseCase(repo);
  const result = await importer.execute({ features, source: 'TEST', sourceVersion: 'v1' });
  const resolve = new ResolveStateForPointUseCase(repo);
  return { repo, importer, result, resolve, guard: new AssertServiceableUseCase(resolve) };
}

describe('state boundaries & serviceability', () => {
  it('imports every state, disabling new non-launch states', async () => {
    const { result, repo } = await setup();
    expect(result.imported.sort()).toEqual(['BR', 'UP', 'WB']);
    expect(result.disabledOnImport).toEqual(['UP']);
    expect(result.missing.sort()).toEqual(['AS', 'SK']);
    expect((await repo.listActive()).map((b) => b.stateCode).sort()).toEqual(['BR', 'WB']);
  });

  it('rejects invalid geometry and duplicates without importing them', async () => {
    const repo = new MemoryStateBoundaryRepository();
    const result = await new ImportStateBoundariesUseCase(repo).execute({
      source: 'TEST',
      sourceVersion: null,
      features: [
        { properties: { stateCode: 'WB' }, geometry: { type: 'Polygon', coordinates: [] } },
        { properties: { stateCode: 'BR' }, geometry: square(85, 25) },
        { properties: { stateCode: 'BR' }, geometry: square(85, 25) },
      ],
    });
    expect(result.imported).toEqual(['BR']);
    expect(result.rejected.map((r) => r.stateCode).sort()).toEqual(['BR', 'WB']);
  });

  it('imports a state larger than the operational zone ceiling', async () => {
    const repo = new MemoryStateBoundaryRepository();
    // ~10 x 10 degrees is far above 100,000 km2, like a real large state.
    const result = await new ImportStateBoundariesUseCase(repo).execute({
      source: 'TEST',
      sourceVersion: null,
      features: [{ properties: { stateCode: 'WB' }, geometry: square(80, 20, 10) }],
    });
    expect(result.imported).toEqual(['WB']);
    expect(result.rejected).toEqual([]);
  });

  it('repairs a self-crossing border instead of rejecting the state', async () => {
    const repo = new MemoryStateBoundaryRepository();
    const bowTie = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [87, 25],
          [88, 26],
          [88, 25],
          [87, 26],
          [87, 25],
        ],
      ],
    };
    const result = await new ImportStateBoundariesUseCase(repo).execute({
      source: 'TEST',
      sourceVersion: null,
      features: [{ properties: { stateCode: 'WB' }, geometry: bowTie }],
    });
    expect(result.imported).toEqual(['WB']);
    expect(result.repaired).toEqual(['WB']);
    expect(result.rejected).toEqual([]);
  });

  it('still rejects an unclosed ring (not repairable)', async () => {
    const repo = new MemoryStateBoundaryRepository();
    const result = await new ImportStateBoundariesUseCase(repo).execute({
      source: 'TEST',
      sourceVersion: null,
      features: [
        {
          properties: { stateCode: 'WB' },
          geometry: { type: 'Polygon', coordinates: [[[87, 25], [88, 25], [88, 26], [87, 26]]] },
        },
      ],
    });
    expect(result.imported).toEqual([]);
    expect(result.repaired).toEqual([]);
    expect(result.rejected).toHaveLength(1);
  });

  it('re-importing bumps the boundary version', async () => {
    const { repo, importer } = await setup();
    await importer.execute({ features, source: 'TEST', sourceVersion: 'v2' });
    expect((await repo.getActiveByCode('WB'))?.version).toBe(2);
  });

  it('resolves points to a state, and null outside launch states', async () => {
    const { resolve } = await setup();
    expect((await resolve.execute({ lat: 25.5, lng: 87.5 }))?.stateCode).toBe('WB');
    expect((await resolve.execute({ lat: 25.5, lng: 85.5 }))?.stateCode).toBe('BR');
    expect(await resolve.execute({ lat: 25.5, lng: 80.5 })).toBeNull(); // UP: skipped
    expect(await resolve.execute({ lat: 10, lng: 10 })).toBeNull();
  });

  it('throws NOT_SERVICEABLE when pickup or drop is outside launch states', async () => {
    const { guard } = await setup();
    await expect(
      guard.execute({ lat: 25.5, lng: 87.5 }, { lat: 25.5, lng: 85.5 }),
    ).resolves.toMatchObject({ pickup: { stateCode: 'WB' }, drop: { stateCode: 'BR' } });
    await expect(
      guard.execute({ lat: 25.5, lng: 80.5 }, { lat: 25.5, lng: 87.5 }),
    ).rejects.toThrow(/NOT_SERVICEABLE.*Pickup/);
    await expect(
      guard.execute({ lat: 25.5, lng: 87.5 }, { lat: 25.5, lng: 80.5 }),
    ).rejects.toThrow(/NOT_SERVICEABLE.*Drop/);
  });

  it('service classification refuses unserviceable trips before resolving zones', async () => {
    const { guard } = await setup();
    const classify = new ServiceClassificationUseCase({
      serviceabilityGuard: guard,
      resolveZonesUseCase: {
        execute: () => {
          throw new Error('zones must not be resolved for unserviceable trips');
        },
      } as never,
    });
    await expect(
      classify.execute({ pickup: { lat: 25.5, lng: 80.5 }, drop: { lat: 25.5, lng: 87.5 } }),
    ).rejects.toThrow(/NOT_SERVICEABLE/);
  });

  describe('route scope and state serviceability', () => {
    const WB = { lat: 25.5, lng: 87.5 };
    const WB2 = { lat: 25.9, lng: 87.9 };
    const BR = { lat: 25.5, lng: 85.5 };
    const farBoundary = {
      type: 'Polygon',
      coordinates: [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]],
    };
    const outstationZones = {
      city: { id: 'z1', name: 'Siliguri', boundary: farBoundary },
      destinationCity: null,
      isWithinBuffer: false,
    };
    const classifier = async (
      tweak?: (repo: MemoryStateBoundaryRepository) => Promise<void>,
      zones: unknown = outstationZones,
    ) => {
      const { repo, guard } = await setup();
      await tweak?.(repo);
      return new ServiceClassificationUseCase({
        serviceabilityGuard: guard,
        resolveZonesUseCase: { execute: async () => zones } as never,
      });
    };
    const disable = (code: string, flag: 'intrastateEnabled' | 'interstateDropOffEnabled') =>
      async (repo: MemoryStateBoundaryRepository) => {
        const s = await repo.getByCode(code);
        await repo.upsertByCode({ ...s!, [flag]: false });
      };

    it('classifies a different-state drop as OUTSTATION + INTERSTATE and records the state versions', async () => {
      const c = await (await classifier()).execute({ pickup: WB, drop: BR });
      expect(c).toMatchObject({
        serviceType: 'OUTSTATION',
        routeScope: 'INTERSTATE',
        originStateCode: 'WB',
        destinationStateCode: 'BR',
        stateBoundaryVersion: 1,
        stateConfigVersion: 1,
      });
    });

    it('classifies a same-state drop as OUTSTATION + INTRA_STATE', async () => {
      const c = await (await classifier()).execute({ pickup: WB, drop: WB2, requestedService: 'OUTSTATION' });
      expect(c).toMatchObject({ serviceType: 'OUTSTATION', routeScope: 'INTRA_STATE' });
    });

    it('rejects interstate drop-off when the destination state has it disabled', async () => {
      const c = await classifier(disable('BR', 'interstateDropOffEnabled'));
      await expect(c.execute({ pickup: WB, drop: BR })).rejects.toThrow(/INTERSTATE_SERVICE_DISABLED/);
    });

    it('rejects intrastate outstation when the state has it disabled', async () => {
      const c = await classifier(disable('WB', 'intrastateEnabled'));
      await expect(
        c.execute({ pickup: WB, drop: WB2, requestedService: 'OUTSTATION' }),
      ).rejects.toThrow(/INTRASTATE_SERVICE_DISABLED/);
    });

    it('does not apply state flags to a city trip', async () => {
      const c = await classifier(disable('WB', 'intrastateEnabled'), {
        city: {
          id: 'z1',
          name: 'Siliguri',
          boundary: {
            type: 'Polygon',
            coordinates: [[[87, 25], [88, 25], [88, 26], [87, 26], [87, 25]]],
          },
        },
        destinationCity: null,
        isWithinBuffer: false,
      });
      const res = await c.execute({ pickup: WB, drop: WB2 });
      expect(res).toMatchObject({ serviceType: 'CITY', routeScope: null });
    });
  });
});
