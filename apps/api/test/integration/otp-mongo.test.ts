import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoOtpStoreAdapter } from '../../src/modules/identity/infrastructure/mongoOtpStore.adapter.js';
import type { OtpRecord } from '../../src/modules/identity/domain/otp.port.js';

describe('Mongo OTP storage across API instances', () => {
  let replSet: MongoMemoryReplSet;
  const phone = '+919876543210';
  const first = new MongoOtpStoreAdapter();
  const second = new MongoOtpStoreAdapter();
  const record = (overrides: Partial<OtpRecord> = {}): OtpRecord => ({
    phoneE164: phone,
    otpHmac: 'hmac-current-otp',
    attempts: 0,
    expiresAt: new Date(Date.now() + 60000),
    lastSentAt: new Date(),
    ...overrides,
  });

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
    const systemBinary = candidatePaths.find((path) => existsSync(path));
    replSet = await MongoMemoryReplSet.create({
      ...(systemBinary ? { binary: { systemBinary } } : {}),
      replSet: { count: 1, name: 'rs0' },
    });
    await mongoose.connect(replSet.getUri());
  }, 60000);

  beforeEach(async () => {
    await first.delete(phone);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  }, 60000);

  it('persists the same OTP record for another API instance', async () => {
    const expected = record();
    await first.save(expected);
    expect(await second.get(phone)).toMatchObject(expected);
    await second.delete(phone);
    expect(await first.get(phone)).toBeNull();
  });

  it('rejects expired records on read and consume without waiting for TTL cleanup', async () => {
    await first.save(record({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await second.get(phone)).toBeNull();
    expect(await second.consume(phone, 'hmac-current-otp', 5)).toBe(false);
  });

  it('increments attempts atomically across instances', async () => {
    await first.save(record());
    const attempts = await Promise.all([
      first.incrementAttempts(phone),
      second.incrementAttempts(phone),
      first.incrementAttempts(phone),
    ]);
    expect(attempts.sort()).toEqual([1, 2, 3]);
    expect((await second.get(phone))?.attempts).toBe(3);
  });

  it('allows exactly one concurrent correct verification to consume the OTP', async () => {
    await first.save(record());
    const consumed = await Promise.all([
      first.consume(phone, 'hmac-current-otp', 5),
      second.consume(phone, 'hmac-current-otp', 5),
    ]);
    expect(consumed.filter(Boolean)).toHaveLength(1);
    expect(await first.get(phone)).toBeNull();
  });

  it('rejects a locked OTP at the attempt limit', async () => {
    await first.save(record({ attempts: 5 }));
    expect(await second.consume(phone, 'hmac-current-otp', 5)).toBe(false);
    expect((await first.get(phone))?.attempts).toBe(5);
  });

  it('does not consume a newer OTP using an old or incorrect HMAC', async () => {
    await first.save(record());
    await second.save(record({ otpHmac: 'hmac-reissued-otp' }));
    expect(await first.consume(phone, 'hmac-current-otp', 5)).toBe(false);
    expect((await second.get(phone))?.otpHmac).toBe('hmac-reissued-otp');
    expect(await second.consume(phone, 'hmac-reissued-otp', 5)).toBe(true);
  });
});
