import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  MongoStatePricingRepository,
  StatePricingModel,
  type StatePricingEntity,
} from '../../src/modules/pricing/index.js';

describe('State pricing atomic versioning against real MongoDB (rs0)', () => {
  let replSet: MongoMemoryReplSet;
  let repo: MongoStatePricingRepository;

  beforeAll(async () => {
    const candidatePaths = [
      process.env.MONGOMS_SYSTEM_BINARY,
      resolve(
        process.cwd(),
        '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe',
      ),
      resolve(
        process.cwd(),
        'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe',
      ),
      'C:/Users/zxprg/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe',
    ].filter(Boolean) as string[];
    const systemBinary = candidatePaths.find((p) => existsSync(p));

    replSet = await MongoMemoryReplSet.create({
      ...(systemBinary ? { binary: { systemBinary } } : {}),
      replSet: { count: 1, name: 'rs0' },
    });
    await mongoose.connect(replSet.getUri());
    await StatePricingModel.syncIndexes();
    repo = new MongoStatePricingRepository();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  beforeEach(async () => {
    await StatePricingModel.deleteMany({});
  });

  it('creates new versions atomically and retires previous version', async () => {
    const v1 = await repo.createNewVersionAtomically({
      id: 'sp-wb-1',
      stateCode: 'WB',
      ratePerKmPaise: 1500,
      baseFarePaise: 5000,
      minimumFarePaise: 8000,
      version: 1,
      status: 'ACTIVE',
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      createdByAdminId: 'admin-1',
      createdAt: new Date('2026-01-01'),
    });

    expect(v1.version).toBe(1);
    expect(v1.status).toBe('ACTIVE');

    // Create v2
    const v2 = await repo.createNewVersionAtomically({
      id: 'sp-wb-2',
      stateCode: 'WB',
      ratePerKmPaise: 1800,
      baseFarePaise: 6000,
      minimumFarePaise: 9000,
      version: 1,
      status: 'ACTIVE',
      effectiveFrom: new Date('2026-06-01'),
      effectiveTo: null,
      createdByAdminId: 'admin-2',
      createdAt: new Date('2026-06-01'),
    });

    expect(v2.version).toBe(2);
    expect(v2.status).toBe('ACTIVE');

    // Verify v1 in DB is retired
    const oldV1 = await repo.findById('sp-wb-1');
    expect(oldV1?.status).toBe('RETIRED');
    expect(oldV1?.effectiveTo).toEqual(new Date('2026-06-01'));

    // Partial unique index test: verify that attempting direct insert of another ACTIVE WB fails
    const duplicateActive = new StatePricingModel({
      _id: 'sp-wb-dup',
      state_code: 'WB',
      rate_per_km_paise: 2000,
      base_fare_paise: 5000,
      minimum_fare_paise: 8000,
      version: 99,
      status: 'ACTIVE',
      effective_from: new Date(),
    });

    await expect(duplicateActive.save()).rejects.toThrow();
  });

  it('retires a state pricing rule with optimistic concurrency check', async () => {
    const v1 = await repo.createNewVersionAtomically({
      id: 'sp-br-1',
      stateCode: 'BR',
      ratePerKmPaise: 2000,
      baseFarePaise: 6000,
      minimumFarePaise: 10000,
      version: 1,
      status: 'ACTIVE',
      effectiveFrom: new Date(),
      effectiveTo: null,
      createdByAdminId: 'admin-1',
      createdAt: new Date(),
    });

    // Stale version retirement fails
    const failed = await repo.retire('sp-br-1', 999);
    expect(failed).toBeNull();

    // Matching version retirement succeeds
    const retired = await repo.retire('sp-br-1', 1);
    expect(retired?.status).toBe('RETIRED');
    expect(retired?.effectiveTo).not.toBeNull();
  });
});

