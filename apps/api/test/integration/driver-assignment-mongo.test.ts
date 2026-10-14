import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoRideRepository, RideModel, type RideEntity } from '../../src/modules/rides/index.js';

function offeringRide(id: string): RideEntity {
  const now = new Date();
  return {
    id,
    bookerRiderId: 'rider',
    passenger: {
      riderId: 'rider',
      name: 'Passenger',
      phoneE164: '+919876543210',
      pickupOtpHash: null,
    },
    driverId: null,
    vehicleId: null,
    vehicleCategory: 'CAB',
    pickup: { lat: 26.71, lng: 88.42, address: null },
    drop: { lat: 26.75, lng: 88.45, address: null },
    routeSnapshot: {
      provider: 'TEST',
      distanceM: 6000,
      durationSeconds: 600,
      polyline: '',
      calculatedAt: now,
    },
    zoneSnapshot: { classification: 'IN_CITY', cityZoneId: 'city' },
    pricingSnapshot: {
      pricingConfigId: 'price',
      pricingConfigVersion: 1,
      vehicleCategory: 'CAB',
      baseFarePaise: 5000,
      ratePerKmPaise: 1000,
      minimumFarePaise: 5000,
      bufferSurchargePaise: 0,
      negotiationFloorPercent: 80,
      negotiationCeilingPercent: 150,
      commissionPercent: 8,
      zoneType: 'IN_CITY',
    },
    suggestedFarePaise: 11000,
    proposedFarePaise: 11000,
    agreedFarePaise: null,
    status: 'OFFERING',
    cancellationReason: null,
    offeringExpiresAt: new Date(now.getTime() + 60000),
    acceptedAt: null,
    arrivedAt: null,
    startedAt: null,
    completedAt: null,
    settledAt: null,
    cancelledAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe('Mongo driver assignment exclusivity', () => {
  let replSet: MongoMemoryReplSet;
  const repo = new MongoRideRepository();

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
    await RideModel.init();
  });

  beforeEach(async () => {
    await RideModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  it('allows one driver to claim only one of two simultaneous offers', async () => {
    await repo.save(offeringRide('ride-one'));
    await repo.save(offeringRide('ride-two'));
    const assignedAt = new Date();
    const attempts = await Promise.allSettled(
      ['ride-one', 'ride-two'].map((rideId) =>
        repo.atomicClaimRide({
          rideId,
          driverId: 'driver',
          agreedFarePaise: 11000,
          pickupOtpHash: 'hash',
          pickupOtpExpiresAt: new Date(assignedAt.getTime() + 60000),
          assignedAt,
        }),
      ),
    );
    const rides = await Promise.all(['ride-one', 'ride-two'].map((id) => repo.findById(id)));
    expect(
      attempts.filter((result) => result.status === 'fulfilled' && result.value !== null),
    ).toHaveLength(1);
    expect(
      rides.filter((ride) => ride?.driverId === 'driver' && ride.status === 'DRIVER_ASSIGNED'),
    ).toHaveLength(1);
    expect(
      rides.filter((ride) => ride?.driverId === null && ride.status === 'OFFERING'),
    ).toHaveLength(1);
    for (const ride of rides) {
      expect(ride?.driverId === 'driver').toBe(ride?.status === 'DRIVER_ASSIGNED');
    }
  });
});
