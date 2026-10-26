import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RIDE_RATING_WINDOW_MS } from '@cabzone/contracts';
import { MongoUnitOfWork } from '../../src/shared/db/unitOfWork.js';
import {
  DriverModel,
  MongoDriverRepository,
  MongoRiderRepository,
  RiderModel,
} from '../../src/modules/identity/infrastructure/index.js';
import {
  MongoRideEventRepository,
  MongoRideRepository,
  MongoRideReviewRepository,
  RideEventModel,
  RideModel,
  RideReviewModel,
} from '../../src/modules/rides/infrastructure/persistence/index.js';
import { RideRatingsUseCase } from '../../src/modules/rides/application/useCases/rideRatings.usecase.js';
import type { RideEntity } from '../../src/modules/rides/domain/index.js';

describe('MongoDB rs0 Integration: Post-Ride Ratings Concurrency & Aggregates (D-046)', () => {
  let replSet: MongoMemoryReplSet;
  const unitOfWork = new MongoUnitOfWork();
  const driverRepo = new MongoDriverRepository();
  const riderRepo = new MongoRiderRepository();
  const rideRepo = new MongoRideRepository();
  const rideEventRepo = new MongoRideEventRepository();
  const reviewRepo = new MongoRideReviewRepository();

  let currentTime = new Date('2026-10-26T12:00:00.000Z');

  const ratingsUseCase = new RideRatingsUseCase({
    unitOfWork,
    rideRepo,
    rideEventRepo,
    reviewRepo,
    now: () => currentTime,
    applyRevealedProfileRating: async (targetRole, targetId, stars) => {
      if (targetRole === 'DRIVER') {
        await driverRepo.applyRevealedRating(targetId, stars);
      } else {
        await riderRepo.applyRevealedRating(targetId, stars);
      }
    },
  });

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
    const systemBinary = candidates.find((p) => existsSync(p));
    replSet = await MongoMemoryReplSet.create({
      ...(systemBinary ? { binary: { systemBinary } } : {}),
      replSet: { count: 1, name: 'rs0' },
    });
    await mongoose.connect(replSet.getUri());
    await Promise.all([
      DriverModel.init(),
      RiderModel.init(),
      RideModel.init(),
      RideEventModel.init(),
      RideReviewModel.init(),
    ]);
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  beforeEach(async () => {
    currentTime = new Date('2026-10-26T12:00:00.000Z');
    await Promise.all([
      DriverModel.deleteMany({}),
      RiderModel.deleteMany({}),
      RideModel.deleteMany({}),
      RideEventModel.deleteMany({}),
      RideReviewModel.deleteMany({}),
    ]);

    const now = new Date('2026-10-26T10:00:00.000Z');
    await driverRepo.create({
      id: 'driver-mongo-1',
      userId: 'user-driver-mongo-1',
      name: 'Rajesh Barman',
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
      operationalStatus: 'ONLINE',
      // Verify anti-fabrication: even if someone passes 5.0 with ratingCount 0, DB stores null
      ratingAverage: 5.0,
      ratingCount: 0,
      trustScore: null,
      currentVehicleId: 'veh-1',
      walletId: 'wallet-1',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await riderRepo.create({
      id: 'rider-mongo-1',
      userId: 'user-rider-mongo-1',
      name: 'Ananya Sen',
      email: null,
      emergencyContact: null,
      preferredLanguage: 'en',
      ratingAverage: 5.0,
      ratingCount: 0,
      trustScore: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  });

  async function createSettledRide(id = crypto.randomUUID()): Promise<RideEntity> {
    return rideRepo.save({
      id,
      bookerRiderId: 'rider-mongo-1',
      passenger: {
        riderId: 'rider-mongo-1',
        name: 'Ananya Sen',
        phoneE164: '+919876543210',
        pickupOtpHash: null,
        pickupOtpExpiresAt: null,
        otpAttempts: 0,
        maxOtpAttempts: 3,
      },
      driverId: 'driver-mongo-1',
      vehicleId: 'veh-1',
      status: 'SETTLED',
      vehicleCategory: 'CAB',
      pickup: { lat: 26.7271, lng: 88.3953, address: 'Siliguri Junction' },
      drop: { lat: 26.6897, lng: 88.3264, address: 'Bagdogra Airport' },
      routeSnapshot: {
        provider: 'OSRM',
        distanceM: 12400,
        durationSeconds: 1500,
        polyline: '}_ilDe~dpO',
        calculatedAt: '2026-10-26T11:00:00.000Z',
      },
      zoneSnapshot: {
        classification: 'IN_CITY',
        cityZoneId: crypto.randomUUID(),
      },
      suggestedFarePaise: 32000,
      proposedFarePaise: 32000,
      agreedFarePaise: 32000,
      pricingSnapshot: {
        pricingConfigId: 'cfg-1',
        pricingConfigVersion: 1,
        vehicleCategory: 'CAB',
        baseFarePaise: 5000,
        ratePerKmPaise: 1800,
        minimumFarePaise: 10000,
        bufferSurchargePaise: 0,
        negotiationFloorPercent: 80,
        negotiationCeilingPercent: 130,
        commissionPercent: 8,
        zoneType: 'IN_CITY',
      },
      cancellationReason: null,
      offeringExpiresAt: null,
      acceptedAt: new Date('2026-10-26T11:05:00.000Z'),
      arrivedAt: new Date('2026-10-26T11:10:00.000Z'),
      startedAt: new Date('2026-10-26T11:12:00.000Z'),
      completedAt: new Date('2026-10-26T11:40:00.000Z'),
      settledAt: new Date('2026-10-26T11:45:00.000Z'),
      cancelledAt: null,
      version: 5,
      createdAt: new Date('2026-10-26T11:00:00.000Z'),
      updatedAt: new Date('2026-10-26T11:45:00.000Z'),
    });
  }

  it('strips fabricated 5.0 defaults on unrated profiles and deduplicates concurrent duplicate submissions', async () => {
    const initialDriver = await driverRepo.findById('driver-mongo-1');
    const initialRider = await riderRepo.findById('rider-mongo-1');
    expect(initialDriver?.ratingAverage).toBeNull();
    expect(initialDriver?.ratingCount).toBe(0);
    expect(initialRider?.ratingAverage).toBeNull();
    expect(initialRider?.ratingCount).toBe(0);

    const ride = await createSettledRide();

    // 5 simultaneous duplicate submissions from the same rider
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ratingsUseCase.submitRating({
          rideId: ride.id,
          actorRole: 'RIDER',
          actorProfileId: 'rider-mongo-1',
          stars: 4,
          tags: ['SAFE_DRIVING', 'ON_TIME_PICKUP'],
        }),
      ),
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await RideReviewModel.countDocuments({ ride_id: ride.id })).toBe(1);
    expect((await driverRepo.findById('driver-mongo-1'))?.ratingCount).toBe(0);
  });

  it('reveals and updates both profile aggregates without write-skew on simultaneous rider + driver submissions', async () => {
    const ride = await createSettledRide();

    await Promise.all([
      ratingsUseCase.submitRating({
        rideId: ride.id,
        actorRole: 'RIDER',
        actorProfileId: 'rider-mongo-1',
        stars: 3,
        tags: ['LATE_PICKUP'],
      }),
      ratingsUseCase.submitRating({
        rideId: ride.id,
        actorRole: 'DRIVER',
        actorProfileId: 'driver-mongo-1',
        stars: 5,
        tags: ['POLITE_RIDER', 'READY_AT_PICKUP'],
      }),
    ]);

    const reviews = await reviewRepo.findByRideId(ride.id);
    expect(reviews).toHaveLength(2);
    expect(reviews.every((r) => r.status === 'REVEALED' && r.revealedAt !== null)).toBe(true);

    const driver = await driverRepo.findById('driver-mongo-1');
    const rider = await riderRepo.findById('rider-mongo-1');
    // Driver gets exact 3.0 (never blended with synthetic 5.0!), Rider gets exact 5.0
    expect(driver).toMatchObject({ ratingCount: 1, ratingAverage: 3 });
    expect(rider).toMatchObject({ ratingCount: 1, ratingAverage: 5 });
  });

  it('prevents double-counting when concurrent expiry sweeps and status reads race at 7 days', async () => {
    const ride1 = await createSettledRide();
    const ride2 = await createSettledRide();

    await ratingsUseCase.submitRating({
      rideId: ride1.id,
      actorRole: 'RIDER',
      actorProfileId: 'rider-mongo-1',
      stars: 4,
    });
    await ratingsUseCase.submitRating({
      rideId: ride2.id,
      actorRole: 'RIDER',
      actorProfileId: 'rider-mongo-1',
      stars: 5,
    });

    currentTime = new Date(ride1.settledAt!.getTime() + RIDE_RATING_WINDOW_MS + 10_000);

    await Promise.all([
      ratingsUseCase.revealExpiredRatings(),
      ratingsUseCase.revealExpiredRatings(),
      ratingsUseCase.getRatingStatus({
        ride: ride1,
        viewerRole: 'DRIVER',
        viewerProfileId: 'driver-mongo-1',
      }),
      ratingsUseCase.getRatingStatus({
        ride: ride2,
        viewerRole: 'DRIVER',
        viewerProfileId: 'driver-mongo-1',
      }),
    ]);

    const driver = await driverRepo.findById('driver-mongo-1');
    expect(driver).toMatchObject({
      ratingCount: 2,
      ratingAverage: 4.5,
    });
  });
});
