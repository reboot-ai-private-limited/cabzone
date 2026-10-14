import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePricingConfigUseCase } from '../../src/modules/pricing/application/useCases/createPricingConfig.usecase.js';
import { MongoPricingConfigRepository } from '../../src/modules/pricing/infrastructure/persistence/mongoPricingConfig.repository.js';
import { PricingConfigModel } from '../../src/modules/pricing/infrastructure/persistence/pricingConfig.model.js';
import { MongoUnitOfWork } from '../../src/shared/db/unitOfWork.js';

describe('Mongo pricing replacement', () => {
  let replSet: MongoMemoryReplSet;
  const repo = new MongoPricingConfigRepository();
  const create = new CreatePricingConfigUseCase(repo, new MongoUnitOfWork());
  const base = {
    level: 'CITY' as const,
    cityZoneId: 'city-1',
    vehicleType: 'CAB' as const,
    baseFarePaise: 5000,
    ratePerKmPaise: 1000,
    minimumFarePaise: 5000,
    status: 'ACTIVE' as const,
  };

  beforeAll(async () => {
    const candidates = [
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
    const systemBinary = candidates.find((path) => existsSync(path));
    replSet = await MongoMemoryReplSet.create({
      ...(systemBinary ? { binary: { systemBinary } } : {}),
      replSet: { count: 1, name: 'rs0' },
    });
    await mongoose.connect(replSet.getUri());
    await PricingConfigModel.init();
  }, 60000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await PricingConfigModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  }, 60000);

  it('rolls back retirement if saving its replacement fails', async () => {
    const old = await create.execute(base, 'admin');
    const originalSave = repo.save.bind(repo);
    let writes = 0;
    vi.spyOn(repo, 'save').mockImplementation(async (config, version) => {
      if (++writes === 2) throw new Error('replacement failed');
      return originalSave(config, version);
    });

    await expect(
      create.execute({ ...base, baseFarePaise: 6000, minimumFarePaise: 6000 }, 'admin'),
    ).rejects.toThrow('replacement failed');

    const persisted = await repo.findById(old.id);
    expect(persisted).toMatchObject({ status: 'ACTIVE', version: 1, baseFarePaise: 5000 });
    expect(await PricingConfigModel.countDocuments()).toBe(1);
  });

  it('allows only one first active price for the same scope under concurrent creation', async () => {
    const originalFind = repo.findEffectiveConfig.bind(repo);
    let readers = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(repo, 'findEffectiveConfig').mockImplementation(async (...args) => {
      const found = await originalFind(...args);
      if (++readers === 2) release();
      await bothRead;
      return found;
    });

    const results = await Promise.allSettled([
      create.execute(base, 'admin-1'),
      create.execute({ ...base, baseFarePaise: 6000 }, 'admin-2'),
    ]);

    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await PricingConfigModel.countDocuments({ status: 'ACTIVE' })).toBe(1);
  });
});
