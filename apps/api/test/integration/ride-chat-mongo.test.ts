import { RIDE_CHAT_RETENTION_MS } from '@cabzone/contracts';
import { encodePolyline } from '@cabzone/geo';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MongoRideChatRepository,
  MongoRideEventRepository,
  MongoRideRepository,
  RideChatModel,
  RideModel,
} from '../../src/modules/rides/index.js';
import { RideChatUseCase } from '../../src/modules/rides/application/useCases/rideChat.usecase.js';
import { RideCommunicationAccessUseCase } from '../../src/modules/rides/application/useCases/rideCommunicationAccess.usecase.js';
import { RideExtensionsUseCase } from '../../src/modules/rides/application/useCases/rideExtensions.usecase.js';
import { saveRideTransition } from '../../src/modules/rides/application/rideTransition.js';
import { MongoUnitOfWork } from '../../src/shared/db/unitOfWork.js';
import { extensionRide } from '../helpers/extensionRide.js';

describe('Mongo ride chat concurrency, closure races, and retention', () => {
  let server: MongoMemoryReplSet;
  const rideRepo = new MongoRideRepository();
  const rideEventRepo = new MongoRideEventRepository();
  const chatRepo = new MongoRideChatRepository();
  const unitOfWork = new MongoUnitOfWork();
  const now = new Date('2026-10-30T10:00:00Z');
  const baseRide = extensionRide(now);
  const riderActor = { userId: 'rider-user-1', role: 'RIDER' as const };
  const driverActor = { userId: 'driver-user-1', role: 'DRIVER' as const };

  const buildChat = () => {
    const notifyFn = vi.fn(async () => {});
    const access = new RideCommunicationAccessUseCase({
      rideRepo,
      resolveRiderId: async (u) => (u === 'rider-user-1' ? 'rider-1' : null),
      resolveDriverId: async (u) => (u === 'driver-user-1' ? 'driver-1' : null),
      isCommunicationAccountActive: async () => true,
    });
    const chat = new RideChatUseCase({
      access,
      rideRepo,
      messages: chatRepo,
      unitOfWork,
      notify: notifyFn,
    });
    return { chat, notifyFn };
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
    await Promise.all([RideModel.createIndexes(), RideChatModel.createIndexes()]);
    await rideRepo.save(baseRide);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });

  it('deduplicates 5 concurrent retries with the same clientMessageId and rejects text conflict', async () => {
    const { chat, notifyFn } = buildChat();
    const key = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => chat.send(baseRide.id, riderActor, key, '  At Gate 2  ')),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results[0]).toMatchObject({
      rideId: baseRide.id,
      sequence: 1,
      senderRole: 'RIDER',
      text: 'At Gate 2',
      clientMessageId: key,
    });
    expect(await RideChatModel.countDocuments({ rideId: baseRide.id })).toBe(1);
    expect(notifyFn).toHaveBeenCalledTimes(1);

    await expect(chat.send(baseRide.id, riderActor, key, 'At Gate 3')).rejects.toThrow(
      /MESSAGE_RETRY_CONFLICT/,
    );
  });

  it('allocates contiguous sequences 1..10 across concurrent rider+driver writes without bumping ride.version', async () => {
    const { chat, notifyFn } = buildChat();
    const sent = await Promise.all(
      Array.from({ length: 10 }, (_, idx) =>
        chat.send(
          baseRide.id,
          idx % 2 === 0 ? riderActor : driverActor,
          crypto.randomUUID(),
          `Msg ${idx + 1}`,
        ),
      ),
    );
    expect(sent.map((m) => m.sequence).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(notifyFn).toHaveBeenCalledTimes(10);
    expect((await rideRepo.findById(baseRide.id))?.version).toBe(baseRide.version);
  });

  it('preserves pending mid-trip extension baselineRideVersion when chat messages are exchanged', async () => {
    const { chat } = buildChat();
    const extensions = new RideExtensionsUseCase({
      rideRepo,
      rideEventRepo,
      unitOfWork,
      now: () => now,
      getDriverLocation: async () => ({ lat: 26.725, lng: 88.435, updatedAt: now }),
      routing: {
        execute: async ({ origin, destination }) => ({
          provider: 'TEST',
          distanceM: destination.lng === baseRide.drop.lng ? 8000 : 13000,
          durationS: 600,
          polyline: encodePolyline([
            [origin.lng, origin.lat],
            [destination.lng, destination.lat],
          ]),
        }),
      },
      classify: async () => ({
        classification: 'IN_CITY',
        cityZoneId: 'city-1',
        destinationStateCode: 'WB',
        routeScope: 'INTRA_STATE',
      }),
      segmentRoute: ({ totalDistanceM }) => [
        {
          stateCode: 'WB',
          stateName: 'WB',
          distanceM: totalDistanceM,
          distanceKm: totalDistanceM / 1000,
          percentage: 100,
        },
      ],
    });

    const proposed = await extensions.propose({
      rideId: baseRide.id,
      riderId: 'rider-1',
      requestId: 'ext-1',
      newDrop: { lat: 26.75, lng: 88.46, address: 'Extended stop' },
    });
    await chat.send(baseRide.id, riderActor, crypto.randomUUID(), 'Requested extra stop');
    await chat.send(baseRide.id, driverActor, crypto.randomUUID(), 'Accepting now');
    const accepted = await extensions.respond({
      rideId: baseRide.id,
      driverId: 'driver-1',
      extensionId: proposed.extensionProposal!.id,
      decision: 'ACCEPT',
    });
    expect(accepted.agreedFarePaise).toBe(30000);
  });

  it('serializes chat writes against ride closure so no message commits after closure and closure never fails on chat', async () => {
    const { chat } = buildChat();
    await chat.send(baseRide.id, riderActor, crypto.randomUUID(), 'Before completion');

    const [sendOutcome, closeOutcome] = await Promise.allSettled([
      chat.send(baseRide.id, driverActor, crypto.randomUUID(), 'Racing completion'),
      unitOfWork.run(async () => {
        const current = (await rideRepo.findById(baseRide.id))!;
        return saveRideTransition(
          rideRepo,
          { ...current, status: 'PAYMENT_PENDING', completedAt: now, version: current.version + 1 },
          current.version,
        );
      }),
    ]);

    expect(closeOutcome.status).toBe('fulfilled');
    expect((await rideRepo.findById(baseRide.id))?.status).toBe('PAYMENT_PENDING');
    if (sendOutcome.status === 'rejected') {
      expect(String(sendOutcome.reason)).toMatch(/COMMUNICATION_CLOSED/);
      expect(await RideChatModel.countDocuments({ rideId: baseRide.id })).toBe(1);
    } else {
      expect(sendOutcome.value.sequence).toBe(2);
      expect(await RideChatModel.countDocuments({ rideId: baseRide.id })).toBe(2);
    }

    await expect(
      chat.send(baseRide.id, riderActor, crypto.randomUUID(), 'After closure'),
    ).rejects.toThrow(/COMMUNICATION_CLOSED/);
    await expect(chat.list(baseRide.id, driverActor, { limit: 30 })).rejects.toThrow(
      /COMMUNICATION_CLOSED/,
    );
  });

  it('registers TTL + unique indexes and hides expired messages immediately before TTL sweep', async () => {
    const indexes = await RideChatModel.collection.indexes();
    expect(indexes.some((i) => i.unique && i.key.rideId === 1 && i.key.sequence === 1)).toBe(true);
    expect(
      indexes.some(
        (i) =>
          i.unique &&
          i.key.rideId === 1 &&
          i.key.senderUserId === 1 &&
          i.key.clientMessageId === 1,
      ),
    ).toBe(true);
    expect(indexes.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0)).toBe(true);

    const { chat } = buildChat();
    const key = crypto.randomUUID();
    const sent = await chat.send(baseRide.id, riderActor, key, 'Short-lived note');
    const doc = await RideChatModel.findOne({ id: sent.id }).lean();
    expect(doc!.expiresAt.getTime() - new Date(doc!.createdAt).getTime()).toBe(
      RIDE_CHAT_RETENTION_MS,
    );

    await RideChatModel.updateOne(
      { id: sent.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const listed = await chat.list(baseRide.id, driverActor, { limit: 30 });
    expect(listed.messages).toEqual([]);
  });
});
