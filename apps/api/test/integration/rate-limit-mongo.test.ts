import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoRateLimitStore } from '../../src/shared/http/rateLimit.js';

describe('Mongo rate limits across API instances', () => {
  let replSet: MongoMemoryReplSet;
  const first = new MongoRateLimitStore();
  const second = new MongoRateLimitStore();

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
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  }, 60000);

  it('shares one window counter between independent stores', async () => {
    expect(await first.consume('shared', 2, 60000)).toBe(0);
    expect(await second.consume('shared', 2, 60000)).toBe(0);
    expect(await first.consume('shared', 2, 60000)).toBeGreaterThan(0);
  });

  it('admits exactly five requests from a concurrent burst of twenty', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 ? first : second).consume('burst', 5, 60000)),
    );
    expect(results.filter((retryAfter) => retryAfter === 0)).toHaveLength(5);
    expect(results.filter((retryAfter) => retryAfter > 0)).toHaveLength(15);
  });

  it('starts a fresh counter after the window expires', async () => {
    expect(await first.consume('expiry', 1, 20)).toBe(0);
    expect(await second.consume('expiry', 1, 20)).toBeGreaterThan(0);
    await setTimeout(50);
    expect(await second.consume('expiry', 1, 20)).toBe(0);
  });

  it('keeps independent keys in separate windows', async () => {
    expect(await first.consume('independent-a', 1, 60000)).toBe(0);
    expect(await second.consume('independent-b', 1, 60000)).toBe(0);
    expect(await second.consume('independent-a', 1, 60000)).toBeGreaterThan(0);
    expect(await first.consume('independent-b', 1, 60000)).toBeGreaterThan(0);
  });
});
