import { RIDE_CALL_RETENTION_MS } from '@cabzone/contracts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MongoRideCallRepository,
  MongoRideRepository,
  RideCallModel,
  RideCallsUseCase,
  RideModel,
} from '../../src/modules/rides/index.js';
import { RideCommunicationAccessUseCase } from '../../src/modules/rides/application/useCases/rideCommunicationAccess.usecase.js';
import { saveRideTransition } from '../../src/modules/rides/application/rideTransition.js';
import { MongoUnitOfWork } from '../../src/shared/db/unitOfWork.js';
import { extensionRide } from '../helpers/extensionRide.js';

describe('Mongo ride calls concurrency, partial unique reservations, closure races, and TTL', () => {
  let server: MongoMemoryReplSet;
  const rideRepo = new MongoRideRepository();
  const callRepo = new MongoRideCallRepository();
  const unitOfWork = new MongoUnitOfWork();
  const now = new Date('2026-10-30T11:00:00Z');
  const baseRide = extensionRide(now);
  const secondRide = {
    ...extensionRide(now),
    id: '018f0a00-0000-7000-8000-000000009992',
    bookerRiderId: 'rider-2',
    driverId: 'driver-2',
  };

  const riderActor = { userId: 'rider-user-1', role: 'RIDER' as const, deviceId: 'rider-inst-1' };
  const driverActor = { userId: 'driver-user-1', role: 'DRIVER' as const, deviceId: 'driver-inst-1' };
  const driverInstallB = { userId: 'driver-user-1', role: 'DRIVER' as const, deviceId: 'driver-inst-2' };
  const rider2Actor = { userId: 'rider-user-2', role: 'RIDER' as const, deviceId: 'rider2-inst-1' };

  const buildCalls = () => {
    const issueToken = vi.fn(async ({ roomName, participantId }) => `jwt:${roomName}:${participantId}`);
    const revokeAndClose = vi.fn(async () => {});
    const notify = vi.fn(async () => {});
    const access = new RideCommunicationAccessUseCase({
      rideRepo,
      resolveRiderId: async (u) =>
        u === 'rider-user-1' ? 'rider-1' : u === 'rider-user-2' ? 'rider-2' : null,
      resolveDriverId: async (u) =>
        u === 'driver-user-1' ? 'driver-1' : u === 'driver-user-2' ? 'driver-2' : null,
      isCommunicationAccountActive: async () => true,
    });
    const calls = new RideCallsUseCase({
      access,
      rideRepo,
      calls: callRepo,
      unitOfWork,
      provider: {
        issueToken,
        revokeAndClose,
        listParticipantIds: async () => [],
        verifyWebhook: async () => ({ id: '1', event: 'noop', roomName: '', participantId: null }),
      },
      enabled: true,
      providerUrl: 'wss://voice.test.local',
      getUserIdForRider: async (r) =>
        r === 'rider-1' ? 'rider-user-1' : r === 'rider-2' ? 'rider-user-2' : null,
      getUserIdForDriver: async (d) =>
        d === 'driver-1' ? 'driver-user-1' : d === 'driver-2' ? 'driver-user-2' : null,
      push: { notify },
      now: () => now,
    });
    return { calls, issueToken, revokeAndClose, notify };
  };

  beforeAll(async () => {
    const systemBinary = [
      process.env.MONGOMS_SYSTEM_BINARY,
      resolve(
        process.cwd(),
        '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe',
      ),
      'C:/Users/zxprg/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe',
    ].find((p) => p && existsSync(p));
    server = await MongoMemoryReplSet.create({
      ...(systemBinary ? { binary: { systemBinary } } : {}),
      replSet: { count: 1 },
    });
    await mongoose.connect(server.getUri());
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([RideModel.createIndexes(), RideCallModel.createIndexes()]);
    await rideRepo.save(baseRide);
    await rideRepo.save(secondRide);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });

  it('collapses simultaneous rider + driver start attempts on the same ride into one active call and deduplicates retries', async () => {
    const { calls, notify } = buildCalls();

    const [fromRider, fromDriver] = await Promise.all([
      calls.start(baseRide.id, riderActor, riderActor.deviceId, `req-r-${crypto.randomUUID()}`),
      calls.start(baseRide.id, driverActor, driverActor.deviceId, `req-d-${crypto.randomUUID()}`),
    ]);
    expect(fromRider.id).toBe(fromDriver.id);
    expect(await RideCallModel.countDocuments({ ride_id: baseRide.id })).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);

    // End that call and verify 5 concurrent retries with same clientRequestId create only 1 record
    await calls.end(baseRide.id, fromRider.id, riderActor);
    const retryReq = `req-retry-${crypto.randomUUID()}`;
    const retries = await Promise.all(
      Array.from({ length: 5 }, () =>
        calls.start(baseRide.id, riderActor, riderActor.deviceId, retryReq),
      ),
    );
    expect(new Set(retries.map((c) => c.id)).size).toBe(1);
    expect(await RideCallModel.countDocuments({ client_request_id: retryReq })).toBe(1);
  });

  it('binds answer to a single callee installation under race and blocks losing installation from minting tokens', async () => {
    const { calls } = buildCalls();
    const started = await calls.start(
      baseRide.id,
      riderActor,
      riderActor.deviceId,
      `req-ans-${crypto.randomUUID()}`,
    );

    const outcomes = await Promise.allSettled([
      calls.answer(baseRide.id, started.id, driverActor, driverActor.deviceId),
      calls.answer(baseRide.id, started.id, driverInstallB, driverInstallB.deviceId),
    ]);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]!.reason)).toMatch(/CALL_ALREADY_ANSWERED/);

    const doc = await callRepo.findById(started.id);
    const winnerActor =
      doc!.calleeInstallationId === driverActor.deviceId ? driverActor : driverInstallB;
    const loserActor = winnerActor === driverActor ? driverInstallB : driverActor;

    const okToken = await calls.token(baseRide.id, started.id, winnerActor, winnerActor.deviceId);
    expect(okToken.token).toContain(doc!.roomName);

    await expect(
      calls.token(baseRide.id, started.id, loserActor, loserActor.deviceId),
    ).rejects.toThrow(/CALL_INSTALLATION_MISMATCH/);
  });

  it('enforces one_active_call_per_user across rides and releases the reservation immediately upon finish', async () => {
    const { calls } = buildCalls();
    const first = await calls.start(
      secondRide.id,
      rider2Actor,
      rider2Actor.deviceId,
      `req-busy-1-${crypto.randomUUID()}`,
    );

    // Reassign baseRide to driver-2 (while driver-2 is already on an active call on secondRide)
    await RideModel.updateOne({ _id: secondRide.id }, { $set: { status: 'SETTLED' } });
    await RideModel.updateOne({ _id: baseRide.id }, { $set: { driver_id: 'driver-2' } });

    await expect(
      calls.start(
        baseRide.id,
        riderActor,
        riderActor.deviceId,
        `req-busy-2-${crypto.randomUUID()}`,
      ),
    ).rejects.toThrow(/CALL_BUSY/);

    await calls.endForUser('driver-user-2', 'access_revoked');
    expect((await callRepo.findById(first.id))?.state).toBe('CANCELLED');

    const afterRelease = await calls.start(
      baseRide.id,
      riderActor,
      riderActor.deviceId,
      `req-busy-3-${crypto.randomUUID()}`,
    );
    expect(afterRelease.state).toBe('RINGING');
  });

  it('serializes token minting against ride closure and revokes any in-flight room immediately', async () => {
    const { calls, revokeAndClose } = buildCalls();
    const started = await calls.start(
      baseRide.id,
      riderActor,
      riderActor.deviceId,
      `req-race-${crypto.randomUUID()}`,
    );
    await calls.answer(baseRide.id, started.id, driverActor, driverActor.deviceId);

    const [tokenOutcome, closeOutcome] = await Promise.allSettled([
      calls.token(baseRide.id, started.id, driverActor, driverActor.deviceId),
      (async () => {
        await unitOfWork.run(async () => {
          const current = (await rideRepo.findById(baseRide.id))!;
          return saveRideTransition(
            rideRepo,
            { ...current, status: 'PAYMENT_PENDING', completedAt: now, version: current.version + 1 },
            current.version,
          );
        });
        await calls.endForRide(baseRide.id, 'ride_completed');
      })(),
    ]);

    expect(closeOutcome.status).toBe('fulfilled');
    expect(revokeAndClose).toHaveBeenCalled();
    if (tokenOutcome.status === 'rejected') {
      expect(String(tokenOutcome.reason)).toMatch(/COMMUNICATION_CLOSED|CALL_UNAVAILABLE/);
    }

    await expect(
      calls.token(baseRide.id, started.id, riderActor, riderActor.deviceId),
    ).rejects.toThrow(/COMMUNICATION_CLOSED|CALL_UNAVAILABLE/);
  });

  it('registers partial unique + TTL indexes and enforces 24h read-time retention before TTL sweep', async () => {
    const indexes = await RideCallModel.collection.indexes();
    expect(indexes.some((i) => i.name === 'ride_call_request_once' && i.unique)).toBe(true);
    expect(indexes.some((i) => i.name === 'one_active_call_per_ride' && i.unique)).toBe(true);
    expect(indexes.some((i) => i.name === 'one_active_call_per_user' && i.unique)).toBe(true);
    expect(indexes.some((i) => i.key.expires_at === 1 && i.expireAfterSeconds === 0)).toBe(true);

    const { calls } = buildCalls();
    const started = await calls.start(
      baseRide.id,
      riderActor,
      riderActor.deviceId,
      `req-ttl-${crypto.randomUUID()}`,
    );
    const stored = await RideCallModel.findById(started.id).lean();
    expect(stored!.expires_at.getTime() - now.getTime()).toBe(RIDE_CALL_RETENTION_MS);

    await RideCallModel.updateOne(
      { _id: started.id },
      { $set: { expires_at: new Date(now.getTime() - 1_000) } },
    );
    expect(await calls.current(baseRide.id, riderActor)).toBeNull();
  });
});
