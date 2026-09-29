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
  it('imports only launch states and skips the rest', async () => {
    const { result, repo } = await setup();
    expect(result.imported.sort()).toEqual(['BR', 'WB']);
    expect(result.skippedNotServiceable).toEqual(['UP']);
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
});
