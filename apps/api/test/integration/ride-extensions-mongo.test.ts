import { encodePolyline } from '@cabzone/geo';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MongoRideRepository,
  MongoRideEventRepository,
  RideModel,
} from '../../src/modules/rides/index.js';
import { MongoUnitOfWork } from '../../src/shared/db/unitOfWork.js';
import { RideExtensionsUseCase } from '../../src/modules/rides/application/useCases/rideExtensions.usecase.js';
import { saveRideTransition } from '../../src/modules/rides/application/rideTransition.js';
import { extensionRide } from '../helpers/extensionRide.js';

describe('Mongo extension concurrency and restart', () => {
  let server: MongoMemoryReplSet;
  const rideRepo = new MongoRideRepository();
  const rideEventRepo = new MongoRideEventRepository();
  const unitOfWork = new MongoUnitOfWork();
  const now = new Date('2026-10-29T10:00:00Z');
  const ride = extensionRide(now);
  const build = () =>
    new RideExtensionsUseCase({
      rideRepo,
      rideEventRepo,
      unitOfWork,
      now: () => now,
      getDriverLocation: async () => ({ lat: 26.725, lng: 88.435, updatedAt: now }),
      routing: {
        execute: async ({ origin, destination }) => ({
          provider: 'TEST',
          distanceM: destination.lng === ride.drop.lng ? 8000 : 13000,
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
  const propose = (requestId: string) =>
    build().propose({
      rideId: ride.id,
      riderId: 'rider-1',
      requestId,
      newDrop: { lat: 26.75, lng: 88.46, address: 'New destination' },
    });
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
    await RideModel.init();
  });
  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await RideModel.init();
    await rideRepo.save(ride);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });

  it('keeps one proposal when two requests race and one acceptance when replayed after restart', async () => {
    const attempts = await Promise.allSettled([propose('one'), propose('two')]);
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const current = await rideRepo.findById(ride.id);
    const input = {
      rideId: ride.id,
      driverId: 'driver-1',
      extensionId: current!.extensionProposal!.id,
      decision: 'ACCEPT' as const,
    };
    await Promise.all([build().respond(input), build().respond(input)]);
    await build().respond(input);
    expect((await rideRepo.findById(ride.id))?.agreedFarePaise).toBe(30000);
    const events = await rideEventRepo.findByRideId(ride.id);
    expect(events.filter((e) => e.eventType === 'EXTENSION_REQUESTED')).toHaveLength(1);
    expect(events.filter((e) => e.eventType === 'RIDE_EXTENDED')).toHaveLength(1);
  });

  it('serializes extension acceptance against completion without a stale settled fare', async () => {
    const proposed = await propose('one');
    const outcomes = await Promise.allSettled([
      build().respond({
        rideId: ride.id,
        driverId: 'driver-1',
        extensionId: proposed.extensionProposal!.id,
        decision: 'ACCEPT',
      }),
      unitOfWork.run(async () => {
        const current = (await rideRepo.findById(ride.id))!;
        return saveRideTransition(
          rideRepo,
          { ...current, status: 'PAYMENT_PENDING', version: current.version + 1 },
          current.version,
        );
      }),
    ]);
    expect(outcomes.some((r) => r.status === 'fulfilled')).toBe(true);
    const current = (await rideRepo.findById(ride.id))!;
    const accepted = (await rideEventRepo.findByRideId(ride.id)).filter(
      (e) => e.eventType === 'RIDE_EXTENDED',
    );
    expect(current.agreedFarePaise).toBe(accepted.length ? 30000 : 25000);
    expect(accepted.length).toBeLessThanOrEqual(1);
    if (current.status === 'PAYMENT_PENDING')
      await expect(
        build().propose({
          rideId: ride.id,
          riderId: 'rider-1',
          requestId: 'later',
          newDrop: ride.drop,
        }),
      ).rejects.toThrow();
  });
});
