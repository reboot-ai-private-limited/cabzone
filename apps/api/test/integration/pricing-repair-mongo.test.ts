import { existsSync } from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  repairActivePricingConfigs,
  type Price,
} from '../../src/scripts/repairActivePricingConfigs.js';

describe('active pricing repair', () => {
  let server: MongoMemoryServer;

  beforeAll(async () => {
    const binary = 'C:/Users/zxprg/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe';
    server = await MongoMemoryServer.create({
      ...(existsSync(binary) ? { binary: { systemBinary: binary } } : {}),
    });
    await mongoose.connect(server.getUri(), { autoIndex: false });
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (server) await server.stop();
  }, 60000);

  it('reports duplicates without changing data, then retires extras and enforces uniqueness', async () => {
    const collection = mongoose.connection.db!.collection<Price>('pricing_configs');
    const common = {
      level: 'CITY',
      city_zone_id: 'city-1',
      state_code: null,
      vehicle_type: 'CAB',
      status: 'ACTIVE',
      effective_from: new Date('2026-01-01'),
    };
    await collection.insertMany([
      { _id: 'old', ...common, state_code: 'WB', version: 1 },
      { _id: 'new', ...common, version: 2 },
    ]);

    expect(await repairActivePricingConfigs(collection, false)).toEqual({
      duplicateGroups: 1,
      retired: 0,
    });
    expect(await collection.countDocuments({ status: 'ACTIVE' })).toBe(2);

    expect(await repairActivePricingConfigs(collection, true)).toEqual({
      duplicateGroups: 1,
      retired: 1,
    });
    expect((await collection.findOne({ _id: 'new' }))?.status).toBe('ACTIVE');
    expect((await collection.findOne({ _id: 'old' }))?.status).toBe('RETIRED');
    await expect(collection.insertOne({ _id: 'third', ...common, version: 3 })).rejects.toThrow();
    expect(await repairActivePricingConfigs(collection, true)).toEqual({
      duplicateGroups: 0,
      retired: 0,
    });
  });
});
