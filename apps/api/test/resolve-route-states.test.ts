import { describe, expect, it } from 'vitest';
import { encodePolyline, type GeoJsonPolygon, type Position } from '@cabzone/geo';
import { MemoryStateBoundaryRepository } from '../src/modules/stateBoundary/infrastructure/persistence/memoryStateBoundary.repository.js';
import { ActiveBoundaryCache } from '../src/modules/stateBoundary/infrastructure/activeBoundaryCache.js';
import { ResolveRouteStatesUseCase } from '../src/modules/stateBoundary/application/useCases/resolveRouteStates.usecase.js';
import type { StateBoundaryEntity } from '../src/modules/stateBoundary/domain/index.js';

describe('ResolveRouteStatesUseCase and ActiveBoundaryCache', () => {
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

  const makeState = (code: string, poly: GeoJsonPolygon, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'): StateBoundaryEntity => ({
    id: `state-${code}`,
    stateCode: code,
    stateName: `State ${code}`,
    geometry: poly,
    version: 1,
    configVersion: 1,
    status,
    intrastateEnabled: true,
    interstateDropOffEnabled: true,
    source: 'test',
    sourceVersion: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('correctly segments route crossing WB -> BR -> WB and validates distance sum', async () => {
    const repo = new MemoryStateBoundaryRepository();
    await repo.upsertByCode(makeState('WB', polyWB));
    await repo.upsertByCode(makeState('BR', polyBR));

    const cache = new ActiveBoundaryCache(repo);
    const useCase = new ResolveRouteStatesUseCase(cache);

    const points: Position[] = [
      [88.2, 26.5],
      [88.7, 26.5],
      [88.3, 26.5],
    ];
    const encoded = encodePolyline(points);

    const segments = await useCase.execute(encoded);
    expect(segments.length).toBe(3);
    expect(segments[0]!.stateCode).toBe('WB');
    expect(segments[1]!.stateCode).toBe('BR');
    expect(segments[2]!.stateCode).toBe('WB');

    const totalDist = segments.reduce((sum, s) => sum + s.distanceM, 0);
    expect(totalDist).toBeGreaterThan(0);
  });

  it('attributes entire route to one state when contained', async () => {
    const repo = new MemoryStateBoundaryRepository();
    await repo.upsertByCode(makeState('WB', polyWB));

    const cache = new ActiveBoundaryCache(repo);
    const useCase = new ResolveRouteStatesUseCase(cache);

    const points: Position[] = [
      [88.1, 26.2],
      [88.2, 26.3],
    ];
    const encoded = encodePolyline(points);

    const segments = await useCase.execute(encoded);
    expect(segments.length).toBe(1);
    expect(segments[0]!.stateCode).toBe('WB');
  });

  it('attributes to UNKNOWN when route is outside all active states', async () => {
    const repo = new MemoryStateBoundaryRepository();
    await repo.upsertByCode(makeState('WB', polyWB));

    const cache = new ActiveBoundaryCache(repo);
    const useCase = new ResolveRouteStatesUseCase(cache);

    const points: Position[] = [
      [85.0, 25.0],
      [85.5, 25.5],
    ];
    const encoded = encodePolyline(points);

    const segments = await useCase.execute(encoded);
    expect(segments.length).toBe(1);
    expect(segments[0]!.stateCode).toBe('UNKNOWN');
  });

  it('invalidates cache when a state is deactivated', async () => {
    const repo = new MemoryStateBoundaryRepository();
    await repo.upsertByCode(makeState('WB', polyWB, 'ACTIVE'));
    await repo.upsertByCode(makeState('BR', polyBR, 'ACTIVE'));

    const cache = new ActiveBoundaryCache(repo);
    const useCase = new ResolveRouteStatesUseCase(cache);

    const points: Position[] = [
      [88.6, 26.5],
      [88.8, 26.5],
    ];
    const encoded = encodePolyline(points);

    // Initial check: in BR
    const seg1 = await useCase.execute(encoded);
    expect(seg1[0]!.stateCode).toBe('BR');

    // Deactivate BR in repository
    await repo.upsertByCode(makeState('BR', polyBR, 'INACTIVE'));
    // Invalidate cache
    cache.invalidate();

    // Now BR is no longer active, should resolve to UNKNOWN
    const seg2 = await useCase.execute(encoded);
    expect(seg2[0]!.stateCode).toBe('UNKNOWN');
  });

  it('returns empty array on empty or null polyline', async () => {
    const repo = new MemoryStateBoundaryRepository();
    const cache = new ActiveBoundaryCache(repo);
    const useCase = new ResolveRouteStatesUseCase(cache);

    expect(await useCase.execute('')).toEqual([]);
    expect(await useCase.execute(null)).toEqual([]);
  });
});

