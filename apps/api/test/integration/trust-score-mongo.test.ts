import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DriverModel,
  MongoDriverRepository,
  MongoRiderRepository,
  RiderModel,
} from '../../src/modules/identity/infrastructure/index.js';
import {
  MongoRideRepository,
  RideEventModel,
  RideModel,
  RideReviewModel,
} from '../../src/modules/rides/infrastructure/persistence/index.js';
import type { RideEntity } from '../../src/modules/rides/domain/index.js';
import { TrustScoreService } from '../../src/modules/identity/application/trustScore.service.js';
import {
  backfillCancelledBy,
  backfillDisputes,
  backfillRatingSums,
} from '../../src/scripts/backfillTrust.js';

const NOW = new Date('2026-11-03T00:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe('MongoDB Integration: trust score v2 (D-048)', () => {
  let replSet: MongoMemoryReplSet;
  const driverRepo = new MongoDriverRepository();
  const riderRepo = new MongoRiderRepository();
  const rideRepo = new MongoRideRepository();

  beforeAll(async () => {
    const candidates = [
      process.env.MONGOMS_SYSTEM_BINARY,
      resolve(process.cwd(), '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe'),
      resolve(process.cwd(), 'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe'),
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
    await Promise.all([
      DriverModel.deleteMany({}),
      RiderModel.deleteMany({}),
      RideModel.deleteMany({}),
      RideEventModel.deleteMany({}),
      RideReviewModel.deleteMany({}),
    ]);
    const created = new Date('2026-10-01T00:00:00.000Z');
    for (const id of ['rider-1', 'rider-2']) {
      await riderRepo.create({
        id,
        userId: `u-${id}`,
        name: id,
        email: null,
        emergencyContact: null,
        preferredLanguage: 'en',
        ratingAverage: null,
        ratingCount: 0,
        trustScore: null,
        version: 1,
        createdAt: created,
        updatedAt: created,
      });
    }
    await driverRepo.create({
      id: 'driver-1',
      userId: 'u-driver-1',
      name: 'Driver One',
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
      operationalStatus: 'ONLINE',
      ratingAverage: null,
      ratingCount: 0,
      trustScore: null,
      currentVehicleId: 'veh-1',
      walletId: 'wallet-1',
      version: 1,
      createdAt: created,
      updatedAt: created,
    });
  });

  function rideDoc(over: Partial<RideEntity>): RideEntity {
    return {
      id: crypto.randomUUID(),
      bookerRiderId: 'rider-1',
      passenger: {
        riderId: 'rider-1',
        name: 'Asha',
        phoneE164: '+919876543210',
        pickupOtpHash: null,
        pickupOtpExpiresAt: null,
        otpAttempts: 0,
        maxOtpAttempts: 3,
      },
      driverId: 'driver-1',
      vehicleId: 'veh-1',
      status: 'SETTLED',
      vehicleCategory: 'CAB',
      pickup: { lat: 26.7, lng: 88.4, address: 'A' },
      drop: { lat: 26.6, lng: 88.3, address: 'B' },
      routeSnapshot: { provider: 'OSRM', distanceM: 1000, durationSeconds: 100, polyline: 'x', calculatedAt: NOW.toISOString() },
      zoneSnapshot: { classification: 'IN_CITY', cityZoneId: crypto.randomUUID() },
      suggestedFarePaise: 10_000,
      proposedFarePaise: 10_000,
      agreedFarePaise: 10_000,
      pricingSnapshot: {
        pricingConfigId: 'cfg',
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
      acceptedAt: null,
      arrivedAt: null,
      startedAt: null,
      completedAt: null,
      settledAt: null,
      cancelledAt: null,
      version: 1,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(10),
      ...over,
    } as RideEntity;
  }

  describe('trip stats (F3, F4, F6)', () => {
    it('stores who cancelled and how a dispute ended, and reads both back', async () => {
      const saved = await rideRepo.save(
        rideDoc({
          status: 'SETTLED',
          cancelledBy: null,
          disputedAt: daysAgo(5),
          disputeOutcome: 'RIDER_WINS',
          disputeResolvedAt: daysAgo(4),
        }),
      );
      expect(saved.disputeOutcome).toBe('RIDER_WINS');
      expect(saved.disputedAt).toBeInstanceOf(Date);
      const cancelled = await rideRepo.save(
        rideDoc({ status: 'CANCELLED', cancellationReason: 'DRIVER_DELAYED', cancelledBy: 'DRIVER', cancelledAt: daysAgo(1) }),
      );
      expect(cancelled.cancelledBy).toBe('DRIVER');
    });

    it('gives a rider the same stats whether asked alone or in a batch, and counts bookings only', async () => {
      await rideRepo.save(rideDoc({ id: 'a', bookerRiderId: 'rider-1' }));
      // booked by rider-2 for rider-1: it belongs to the account holder who booked it
      await rideRepo.save(
        rideDoc({
          id: 'b',
          bookerRiderId: 'rider-2',
          passenger: { riderId: 'rider-1', name: 'Asha', phoneE164: '+919876543210', pickupOtpHash: null, pickupOtpExpiresAt: null, otpAttempts: 0, maxOtpAttempts: 3 },
        }),
      );
      const alone = (await rideRepo.getTripStats('RIDER', ['rider-1'], NOW)).get('rider-1')!;
      const batch = await rideRepo.getTripStats('RIDER', ['rider-1', 'rider-2'], NOW);
      expect(batch.get('rider-1')).toEqual(alone);
      expect(alone.totalRides).toBe(1);
      expect(batch.get('rider-2')!.totalRides).toBe(1);
    });

    it('attributes cancellations and disputes to the right side', async () => {
      await rideRepo.save(rideDoc({ status: 'CANCELLED', cancellationReason: 'DRIVER_NO_SHOW', cancelledBy: 'DRIVER', cancelledAt: NOW }));
      await rideRepo.save(rideDoc({ status: 'CANCELLED', cancellationReason: 'RIDER_NO_SHOW', cancelledBy: 'DRIVER', cancelledAt: NOW }));
      await rideRepo.save(rideDoc({ status: 'PAYMENT_UNPAID' }));
      await rideRepo.save(rideDoc({ status: 'SETTLED', disputeOutcome: 'DRIVER_WINS', disputeResolvedAt: NOW }));

      const rider = (await rideRepo.getTripStats('RIDER', ['rider-1'], NOW)).get('rider-1')!;
      expect(rider.cancelledRides).toBe(2);
      expect(rider.responsibleCancellations).toBe(1); // only the rider no-show
      expect(rider.noShows).toBe(1);
      expect(rider.unpaidRides).toBe(1);
      expect(rider.disputesAgainst).toBe(1);
      expect(rider.completedRides).toBe(1);

      const driver = (await rideRepo.getTripStats('DRIVER', ['driver-1'], NOW)).get('driver-1')!;
      expect(driver.responsibleCancellations).toBe(1); // only the driver no-show
      expect(driver.noShows).toBe(1);
      expect(driver.disputesAgainst).toBe(0);
      expect(driver.completedRides).toBe(2); // unpaid still counts as a completed trip for the driver
    });
  });

  describe('rating aggregates (F10)', () => {
    it('applies 20 concurrent ratings exactly, with an average derived from the sum', async () => {
      const stars = [5, 4, 3, 5, 5, 4, 4, 5, 2, 5, 4, 4, 3, 5, 5, 1, 4, 4, 5, 5];
      await Promise.all(stars.map((s) => driverRepo.applyRevealedRating('driver-1', s)));
      const driver = (await driverRepo.findById('driver-1'))!;
      const sum = stars.reduce((a, b) => a + b, 0);
      expect(driver.ratingCount).toBe(20);
      expect(driver.ratingSum).toBe(sum);
      expect(driver.ratingAverage).toBe(Number((sum / 20).toFixed(2)));
    });

    it('adopts a profile that predates rating_sum without losing its history', async () => {
      await RiderModel.collection.updateOne(
        { _id: 'rider-2' as never },
        { $set: { rating_count: 4, rating_average: 4.5 }, $unset: { rating_sum: '' } },
      );
      const result = await riderRepo.applyRevealedRating('rider-2', 5);
      expect(result.ratingCount).toBe(5);
      expect(result.ratingAverage).toBe(4.6); // (18 + 5) / 5
      expect((await riderRepo.findById('rider-2'))!.ratingSum).toBe(23);
    });

    it('does not let a stale profile object overwrite ratings or trust', async () => {
      await driverRepo.applyRevealedRating('driver-1', 5);
      // read before the score is written, but at the current version, so the update is accepted
      const stale = (await driverRepo.findById('driver-1'))!;
      await driverRepo.saveTrust('driver-1', {
        score: 92,
        tier: 'EXCELLENT',
        breakdown: { score: 92, tier: 'EXCELLENT', isPreliminary: false, factors: { completedRides: 9, cancelledRides: 0, completionRate: 1, ratingAverage: 5, ratingCount: 1, disputesCount: 0 }, summary: 's' },
        updatedAt: NOW,
      });
      await driverRepo.update({ ...stale, name: 'Renamed', version: stale.version });
      const fresh = (await driverRepo.findById('driver-1'))!;
      expect(fresh.name).toBe('Renamed');
      expect(fresh.ratingCount).toBe(1);
      expect(fresh.trustScore).toBe(92);
    });
  });

  describe('TrustScoreService with real repositories (F1, F12)', () => {
    it('computes and stores a driver score, which was never possible before', async () => {
      for (let i = 0; i < 6; i++) await rideRepo.save(rideDoc({ status: 'SETTLED' }));
      const service = new TrustScoreService({ riderRepo, driverRepo, rideRepo, mode: 'on', now: () => NOW });
      await service.refresh('DRIVER', 'driver-1');
      const driver = (await driverRepo.findById('driver-1'))!;
      expect(driver.trustScore).toBe(89); // 6 completed, no ratings yet: provisional
      expect(driver.trustTier).toBe('GOOD');
      expect(driver.trustBreakdown?.isPublic).toBe(true);
      expect(driver.trustUpdatedAt).toBeInstanceOf(Date);
    });

    it('pages through every profile and exposes only public tiers', async () => {
      for (let i = 0; i < 5; i++) await rideRepo.save(rideDoc({ status: 'SETTLED', bookerRiderId: 'rider-1' }));
      const service = new TrustScoreService({ riderRepo, driverRepo, rideRepo, mode: 'on', now: () => NOW });
      const count = await service.refreshAll({ batchSize: 1 });
      expect(count).toBe(3); // 2 riders + 1 driver, one at a time
      const tiers = await service.getPublicTiers('RIDER', ['rider-1', 'rider-2']);
      expect(tiers.get('rider-1')).toEqual({ tier: 'GOOD' });
      expect(tiers.has('rider-2')).toBe(false); // no rides yet, so no public score
    });

    it('refreshes after a ride transition through the repository hook', async () => {
      const service = new TrustScoreService({ riderRepo, driverRepo, rideRepo, mode: 'on', now: () => NOW, debounceMs: 20 });
      rideRepo.onTerminalTransition = (r) => {
        service.schedule('RIDER', r.bookerRiderId);
        if (r.driverId) service.schedule('DRIVER', r.driverId);
      };
      for (let i = 0; i < 5; i++) await rideRepo.save(rideDoc({ status: 'SETTLED' }));
      await new Promise((r) => setTimeout(r, 300));
      expect((await riderRepo.findById('rider-1'))!.trustScore).toBe(89);
      expect((await driverRepo.findById('driver-1'))!.trustScore).toBe(89);
      rideRepo.onTerminalTransition = undefined;
    });
  });

  describe('backfill', () => {
    const opts = { dryRun: false, batchSize: 2 };

    it('fills cancelled_by from events, then from the reason, and is idempotent', async () => {
      const withEvent = await rideRepo.save(rideDoc({ status: 'CANCELLED', cancellationReason: 'DRIVER_DELAYED', cancelledAt: NOW }));
      const byReason = await rideRepo.save(rideDoc({ status: 'CANCELLED', cancellationReason: 'RIDER_CHANGED_MIND', cancelledAt: NOW }));
      const ambiguous = await rideRepo.save(rideDoc({ status: 'CANCELLED', cancellationReason: 'FARE_DISAGREEMENT', cancelledAt: NOW }));
      await RideEventModel.create({
        _id: crypto.randomUUID(),
        ride_id: withEvent.id,
        event_type: 'RIDE_CANCELLED',
        actor_type: 'DRIVER',
        actor_id: 'driver-1',
        previous_status: 'DRIVER_ASSIGNED',
        new_status: 'CANCELLED',
        metadata: {},
        created_at: NOW,
      });

      const dry = await backfillCancelledBy({ ...opts, dryRun: true });
      expect(dry.changed).toBe(2);
      expect((await rideRepo.findById(byReason.id))!.cancelledBy ?? null).toBeNull();

      await backfillCancelledBy(opts);
      expect((await rideRepo.findById(withEvent.id))!.cancelledBy).toBe('DRIVER');
      expect((await rideRepo.findById(byReason.id))!.cancelledBy).toBe('RIDER');
      expect((await rideRepo.findById(ambiguous.id))!.cancelledBy ?? null).toBeNull();

      const again = await backfillCancelledBy(opts);
      expect(again.scanned).toBe(1); // only the ambiguous one is still unset
      expect(again.changed).toBe(0);
    });

    it('recovers dispute outcomes that were only in the event log', async () => {
      const ride = await rideRepo.save(rideDoc({ status: 'SETTLED' }));
      await RideEventModel.create([
        { _id: crypto.randomUUID(), ride_id: ride.id, event_type: 'PAYMENT_DISPUTED', actor_type: 'RIDER', actor_id: 'rider-1', previous_status: 'SETTLED', new_status: 'PAYMENT_DISPUTED', metadata: {}, created_at: daysAgo(3) },
        { _id: crypto.randomUUID(), ride_id: ride.id, event_type: 'PAYMENT_DISPUTE_RESOLVED', actor_type: 'ADMIN', actor_id: 'admin', previous_status: 'PAYMENT_DISPUTED', new_status: 'SETTLED', metadata: { outcome: 'DRIVER_WINS' }, created_at: daysAgo(2) },
      ]);
      await backfillDisputes(opts);
      const stored = (await rideRepo.findById(ride.id))!;
      expect(stored.disputeOutcome).toBe('DRIVER_WINS');
      expect(stored.disputedAt?.getTime()).toBe(daysAgo(3).getTime());
      expect(stored.disputeResolvedAt?.getTime()).toBe(daysAgo(2).getTime());
    });

    it('rebuilds exact rating sums from revealed reviews', async () => {
      const mk = (stars: number, status: string) => ({
        _id: crypto.randomUUID(),
        ride_id: crypto.randomUUID(),
        reviewer_role: 'RIDER',
        reviewer_id: 'rider-1',
        reviewee_role: 'DRIVER',
        reviewee_id: 'driver-1',
        stars,
        tags: [],
        comment: null,
        status,
        window_expires_at: NOW,
        revealed_at: status === 'REVEALED' ? NOW : null,
      });
      await RideReviewModel.create([mk(5, 'REVEALED'), mk(4, 'REVEALED'), mk(1, 'HIDDEN')]);
      await backfillRatingSums(opts);
      const driver = (await driverRepo.findById('driver-1'))!;
      expect(driver.ratingSum).toBe(9);
      expect(driver.ratingCount).toBe(2);
      expect(driver.ratingAverage).toBe(4.5);
    });
  });
});
