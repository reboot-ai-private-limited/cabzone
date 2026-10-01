import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  ImportStateBoundariesUseCase,
  ManageStateUseCase,
  MongoStateBoundaryRepository,
  StateBoundaryHistoryModel,
  StateBoundaryModel,
  type StateBoundaryEntity,
} from '../../src/modules/stateBoundary/index.js';

/** A many-vertex, gently wobbling ring: the shape of a real state border, not a box. */
function bigRing(cx: number, cy: number, radius: number, points: number) {
  const ring: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    const r = radius * (1 + 0.05 * Math.sin(37 * angle));
    ring.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  ring.push(ring[0]!);
  return ring;
}

const square = (lng: number, lat: number, size = 1) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [lng, lat],
      [lng + size, lat],
      [lng + size, lat + size],
      [lng, lat + size],
      [lng, lat],
    ] as [number, number][],
  ],
});

describe('State boundaries against real MongoDB', () => {
  let replSet: MongoMemoryReplSet;
  let repo: MongoStateBoundaryRepository;
  let importer: ImportStateBoundariesUseCase;
  let manage: ManageStateUseCase;

  beforeAll(async () => {
    const candidatePaths = [
      process.env.MONGOMS_SYSTEM_BINARY,
      resolve(process.cwd(), '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe'),
      resolve(process.cwd(), 'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe'),
      'C:/Users/zxprg/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe',
    ].filter(Boolean) as string[];
    const systemBinary = candidatePaths.find((p) => existsSync(p));

    replSet = await MongoMemoryReplSet.create({
      ...(systemBinary ? { binary: { systemBinary } } : {}),
      replSet: { count: 1, name: 'rs0' },
    });
    await mongoose.connect(replSet.getUri());
    // The 2dsphere index is what rejects invalid geometry, so it must exist before any import.
    await StateBoundaryModel.syncIndexes();
    await StateBoundaryHistoryModel.syncIndexes();

    repo = new MongoStateBoundaryRepository();
    importer = new ImportStateBoundariesUseCase(repo);
    manage = new ManageStateUseCase(repo);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });

  beforeEach(async () => {
    await StateBoundaryModel.deleteMany({});
    await StateBoundaryHistoryModel.deleteMany({});
  });

  it('stores a large real-world-sized border and resolves points inside and outside it', async () => {
    const result = await importer.execute({
      source: 'TEST',
      sourceVersion: 'v1',
      features: [
        {
          properties: { stateCode: 'WB', stateName: 'West Bengal' },
          // ~30,000 vertices, a state larger than 100,000 km2
          geometry: { type: 'Polygon', coordinates: [bigRing(88, 24, 5.5, 30_000)] },
        },
      ],
    });
    expect(result.rejected).toEqual([]);
    expect(result.imported).toEqual(['WB']);

    expect((await repo.findContainingPoint({ lat: 24, lng: 88 }))?.stateCode).toBe('WB');
    expect(await repo.findContainingPoint({ lat: 10, lng: 10 })).toBeNull();
  });

  it('stores an auto-repaired self-crossing border (Mongo would refuse the raw one)', async () => {
    const result = await importer.execute({
      source: 'TEST',
      sourceVersion: null,
      features: [
        {
          properties: { stateCode: 'BR' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[85, 25], [86, 26], [86, 25], [85, 26], [85, 25]]],
          },
        },
      ],
    });
    expect(result.repaired).toEqual(['BR']);
    expect((await repo.getByCode('BR'))?.geometry).toBeDefined();
  });

  it('disabled states do not resolve points; re-import keeps history and status', async () => {
    const feature = { properties: { stateCode: 'WB' }, geometry: square(87, 25) };
    await importer.execute({ source: 'TEST', sourceVersion: 'v1', features: [feature] });
    await manage.setStatus('WB', 1, 'INACTIVE');
    expect(await repo.findContainingPoint({ lat: 25.5, lng: 87.5 })).toBeNull();

    await importer.execute({ source: 'TEST', sourceVersion: 'v2', features: [feature] });
    const state = await repo.getByCode('WB');
    expect(state).toMatchObject({ version: 2, status: 'INACTIVE' });

    const history = await repo.listHistory('WB');
    expect(history.map((h) => h.action).sort()).toEqual(['DEACTIVATED', 'IMPORTED', 'IMPORTED']);
    expect(history.filter((h) => h.previousGeometry !== null)).toHaveLength(1);
  });

  it('an edit made while another is in flight loses cleanly: exactly one wins, no lost update', async () => {
    await importer.execute({
      source: 'TEST',
      sourceVersion: null,
      features: [{ properties: { stateCode: 'WB' }, geometry: square(87, 25) }],
    });

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        manage.update({ stateCode: 'WB', expectedVersion: 1, stateName: `Name ${i}` }),
      ),
    );

    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.filter((a): a is PromiseRejectedResult => a.status === 'rejected');
    expect(rejected).toHaveLength(9);
    expect(rejected.every((r) => (r.reason as { statusCode?: number }).statusCode === 409)).toBe(true);
    expect((await repo.getByCode('WB'))?.configVersion).toBe(2);
  });

  it('a config edit never touches the geometry', async () => {
    await importer.execute({
      source: 'TEST',
      sourceVersion: null,
      features: [{ properties: { stateCode: 'WB' }, geometry: square(87, 25) }],
    });
    const before = (await repo.getByCode('WB')) as StateBoundaryEntity;
    await manage.update({ stateCode: 'WB', expectedVersion: 1, intrastateEnabled: false });
    const after = (await repo.getByCode('WB')) as StateBoundaryEntity;
    expect(after.geometry).toEqual(before.geometry);
    expect(after.version).toBe(before.version);
  });

  it('treats a document written before configVersion existed as version 1', async () => {
    await StateBoundaryModel.collection.insertOne({
      _id: 'legacy-1' as never,
      state_code: 'SK',
      state_name: 'Sikkim',
      geometry: square(88, 27),
      version: 1,
      status: 'ACTIVE',
      source: 'LEGACY',
      source_version: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const updated = await manage.update({
      stateCode: 'SK',
      expectedVersion: 1,
      interstateDropOffEnabled: false,
    });
    expect(updated).toMatchObject({ configVersion: 2, interstateDropOffEnabled: false });
  });
});
