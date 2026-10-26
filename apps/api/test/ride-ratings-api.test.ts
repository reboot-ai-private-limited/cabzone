import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AuthRole, PricingConfigDto } from '@cabzone/contracts';
import { RIDE_RATING_WINDOW_MS } from '@cabzone/contracts';
import { errorHandler } from '../src/shared/http/error-handler.js';
import { MemoryWalletRepository } from '../src/modules/ledger/infrastructure/persistence/memoryWallet.repository.js';
import { MemoryPricingConfigRepository } from '../src/modules/pricing/infrastructure/persistence/memoryPricingConfig.repository.js';
import { MemoryRideRepository } from '../src/modules/rides/infrastructure/persistence/memoryRide.repository.js';
import { MemoryRideEventRepository } from '../src/modules/rides/infrastructure/persistence/memoryRideEvent.repository.js';
import { MemoryRideReviewRepository } from '../src/modules/rides/infrastructure/persistence/memoryRideReview.repository.js';
import { buildRidesContainer } from '../src/modules/rides/rides.container.js';
import type { RideEntity, RideLifecycleEvent } from '../src/modules/rides/domain/index.js';

function createRatingsTestHarness() {
  const rideRepo = new MemoryRideRepository();
  const rideEventRepo = new MemoryRideEventRepository();
  const rideReviewRepo = new MemoryRideReviewRepository();
  const walletRepo = new MemoryWalletRepository();
  const pricingConfigRepo = new MemoryPricingConfigRepository({} as PricingConfigDto);

  const riderUserToProfile = new Map<string, string>([
    ['user-rider-1', 'rider-1'],
    ['user-passenger-2', 'rider-2'],
    ['user-outsider', 'rider-outsider'],
  ]);
  const driverUserToProfile = new Map<string, string>([
    ['user-driver-1', 'driver-1'],
    ['user-driver-outsider', 'driver-outsider'],
  ]);

  const profileRatings = new Map<string, { ratingCount: number; ratingAverage: number | null }>([
    ['DRIVER:driver-1', { ratingCount: 0, ratingAverage: null }],
    ['RIDER:rider-1', { ratingCount: 0, ratingAverage: null }],
  ]);

  const emittedNotifications: { rideId: string; event: RideLifecycleEvent }[] = [];
  let currentTime = new Date('2026-10-26T10:00:00.000Z');

  const container = buildRidesContainer({
    unitOfWork: { run: <T>(work: () => Promise<T>) => work() },
    rideRepo,
    rideEventRepo,
    rideReviewRepo,
    walletRepo,
    pricingConfigRepo,
    tokenSecret: 'test-secret-for-post-ride-ratings-32b',
    pickupOtpSecret: 'test-pickup-otp-secret',
    ratingClock: () => currentTime,
    resolveRiderId: async (userId) => riderUserToProfile.get(userId) ?? null,
    resolveDriverId: async (userId) => driverUserToProfile.get(userId) ?? null,
    resolveAssignedDriver: async (driverId) => {
      const stats = profileRatings.get(`DRIVER:${driverId}`) ?? {
        ratingCount: 0,
        ratingAverage: null,
      };
      return {
        driverId,
        name: 'Subrata Ghosh',
        phoneE164: '+919000000012',
        profilePhotoUrl: null,
        ratingAverage: stats.ratingCount > 0 ? stats.ratingAverage : null,
        ratingCount: stats.ratingCount,
        vehicle: {
          vehicleId: 'veh-1',
          make: 'Maruti',
          model: 'Dzire',
          color: 'White',
          registrationNumber: 'WB74AB1234',
          vehicleCategory: 'CAB',
        },
      };
    },
    applyRevealedProfileRating: async (targetRole, targetId, stars) => {
      const key = `${targetRole}:${targetId}`;
      const prev = profileRatings.get(key) ?? { ratingCount: 0, ratingAverage: null };
      const prevCount = prev.ratingCount > 0 ? prev.ratingCount : 0;
      const prevAvg = prevCount > 0 && prev.ratingAverage !== null ? prev.ratingAverage : 0;
      const nextCount = prevCount + 1;
      const nextAvg = Number(((prevAvg * prevCount + stars) / nextCount).toFixed(2));
      profileRatings.set(key, { ratingCount: nextCount, ratingAverage: nextAvg });
    },
    notifier: {
      rideRequested: async () => undefined,
      fareNegotiation: async () => undefined,
      rideUpdated: async (ride, event) => {
        emittedNotifications.push({ rideId: ride.id, event });
      },
    },
    requireDriverEligibility: async () => 'veh-1',
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/rides',
    container.buildRidesRouter({
      authenticate: (req, _res, next) => {
        const userId = req.header('x-test-user-id');
        const role = req.header('x-test-role') as AuthRole | undefined;
        if (!userId || !role) {
          res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Auth required' } });
          return;
        }
        req.auth = { userId, role, sessionId: 'sess-test' };
        next();
      },
      requireRole:
        (...roles: AuthRole[]) =>
        (req, res, next) => {
          if (!req.auth || !roles.includes(req.auth.role)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
            return;
          }
          next();
        },
    }),
  );
  app.use(errorHandler);

  async function seedRide(overrides: Partial<RideEntity> = {}): Promise<RideEntity> {
    const settledAt =
      overrides.settledAt !== undefined
        ? overrides.settledAt
        : new Date('2026-10-26T09:30:00.000Z');
    const ride: RideEntity = {
      id: overrides.id ?? crypto.randomUUID(),
      bookerRiderId: overrides.bookerRiderId ?? 'rider-1',
      passenger: overrides.passenger ?? {
        riderId: 'rider-2',
        name: 'Guest Passenger',
        phoneE164: '+919876543211',
        pickupOtpHash: null,
        pickupOtpExpiresAt: null,
        otpAttempts: 0,
        maxOtpAttempts: 3,
      },
      driverId: overrides.driverId !== undefined ? overrides.driverId : 'driver-1',
      vehicleId: overrides.vehicleId !== undefined ? overrides.vehicleId : 'veh-1',
      status: overrides.status ?? 'SETTLED',
      vehicleCategory: 'CAB',
      pickup: { lat: 26.7271, lng: 88.3953, address: 'Hill Cart Rd, Siliguri' },
      drop: { lat: 26.7089, lng: 88.4285, address: 'NJP Station' },
      routeSnapshot: {
        provider: 'OSRM',
        distanceM: 6400,
        durationSeconds: 900,
        polyline: '}_ilDe~dpO',
        calculatedAt: '2026-10-26T09:00:00.000Z',
      },
      zoneSnapshot: {
        classification: 'IN_CITY',
        cityZoneId: crypto.randomUUID(),
      },
      suggestedFarePaise: 18000,
      proposedFarePaise: 18000,
      agreedFarePaise: 18000,
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
      acceptedAt: new Date('2026-10-26T09:05:00.000Z'),
      arrivedAt: new Date('2026-10-26T09:10:00.000Z'),
      startedAt: new Date('2026-10-26T09:12:00.000Z'),
      completedAt: new Date('2026-10-26T09:28:00.000Z'),
      settledAt,
      cancelledAt: null,
      version: 5,
      createdAt: new Date('2026-10-26T09:00:00.000Z'),
      updatedAt: new Date('2026-10-26T09:30:00.000Z'),
      ...overrides,
    };
    return rideRepo.save(ride);
  }

  return {
    app,
    container,
    rideEventRepo,
    profileRatings,
    emittedNotifications,
    setNow: (next: Date) => {
      currentTime = next;
    },
    getNow: () => currentTime,
    seedRide,
  };
}

describe('Post-Ride Double-Blind Ratings API (Decision D-046, OQ-018, OQ-019)', () => {
  it('rejects rating submissions on unsettled rides and after the 7-day window', async () => {
    const h = createRatingsTestHarness();
    const paymentPendingRide = await h.seedRide({ status: 'PAYMENT_PENDING', settledAt: null });

    const unsettledRes = await request(h.app)
      .post(`/api/v1/rides/${paymentPendingRide.id}/rating`)
      .set('x-test-user-id', 'user-rider-1')
      .set('x-test-role', 'RIDER')
      .send({ stars: 5, tags: ['SAFE_DRIVING'] });
    expect(unsettledRes.status).toBe(409);
    expect(unsettledRes.body.message).toContain('RIDE_NOT_SETTLED');

    const settledRide = await h.seedRide();
    h.setNow(new Date(settledRide.settledAt!.getTime() + RIDE_RATING_WINDOW_MS + 1000));

    const expiredRes = await request(h.app)
      .post(`/api/v1/rides/${settledRide.id}/rating`)
      .set('x-test-user-id', 'user-rider-1')
      .set('x-test-role', 'RIDER')
      .send({ stars: 4 });
    expect(expiredRes.status).toBe(409);
    expect(expiredRes.body.message).toContain('RATING_WINDOW_EXPIRED');
  });

  it('enforces participant authorization and strict payload validation', async () => {
    const h = createRatingsTestHarness();
    const ride = await h.seedRide();

    // Non-booker guest passenger cannot submit booker rider rating
    const guestRes = await request(h.app)
      .post(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-passenger-2')
      .set('x-test-role', 'RIDER')
      .send({ stars: 5 });
    expect(guestRes.status).toBe(403);
    expect(guestRes.body.message).toContain('ONLY_BOOKER_RIDER_CAN_RATE');

    // Foreign rider gets 404 anti-probing response
    const outsiderRes = await request(h.app)
      .post(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-outsider')
      .set('x-test-role', 'RIDER')
      .send({ stars: 5 });
    expect(outsiderRes.status).toBe(404);

    // Rider cannot submit a driver-only preset tag
    const wrongTagRes = await request(h.app)
      .post(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-rider-1')
      .set('x-test-role', 'RIDER')
      .send({ stars: 5, tags: ['READY_AT_PICKUP'] });
    expect(wrongTagRes.status).toBe(400);
    expect(wrongTagRes.body.message).toContain('INVALID_RATING_TAG');

    // Out-of-range stars rejected
    const badStarsRes = await request(h.app)
      .post(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-rider-1')
      .set('x-test-role', 'RIDER')
      .send({ stars: 6 });
    expect(badStarsRes.status).toBe(400);
  });

  it('enforces double-blind secrecy until mutual submission, then reveals & aggregates once', async () => {
    const h = createRatingsTestHarness();
    const ride = await h.seedRide();

    // 1. Rider submits 2-star review first
    const riderSubmit = await request(h.app)
      .post(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-rider-1')
      .set('x-test-role', 'RIDER')
      .send({ stars: 2, tags: ['LATE_PICKUP'], comment: 'Arrived 15 mins late' });

    expect(riderSubmit.status).toBe(201);
    expect(riderSubmit.body.data.myReview).toMatchObject({
      stars: 2,
      tags: ['LATE_PICKUP'],
      status: 'HIDDEN',
      revealedAt: null,
    });
    expect(riderSubmit.body.data.counterpartyReview).toBeNull();
    expect(riderSubmit.body.data.canSubmit).toBe(false);

    // Double-blind check: Driver CANNOT see rider's hidden rating, no event leaked, no aggregate change, no WS leak
    expect(h.profileRatings.get('DRIVER:driver-1')).toEqual({ ratingCount: 0, ratingAverage: null });
    expect(h.emittedNotifications).toHaveLength(0);
    expect(await h.rideEventRepo.findByRideId(ride.id)).toHaveLength(0);

    const driverPeek = await request(h.app)
      .get(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-driver-1')
      .set('x-test-role', 'DRIVER');
    expect(driverPeek.status).toBe(200);
    expect(driverPeek.body.data.myReview).toBeNull();
    expect(driverPeek.body.data.counterpartyReview).toBeNull();
    expect(driverPeek.body.data.canSubmit).toBe(true);

    // Idempotent retry of identical payload returns 200; edit attempt returns 409
    const identicalRetry = await request(h.app)
      .post(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-rider-1')
      .set('x-test-role', 'RIDER')
      .send({ stars: 2, tags: ['LATE_PICKUP'], comment: 'Arrived 15 mins late' });
    expect(identicalRetry.status).toBe(200);

    const editAttempt = await request(h.app)
      .post(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-rider-1')
      .set('x-test-role', 'RIDER')
      .send({ stars: 5, tags: ['POLITE_DRIVER'] });
    expect(editAttempt.status).toBe(409);
    expect(editAttempt.body.message).toContain('RATING_ALREADY_SUBMITTED');

    // 2. Driver submits 5-star review -> BOTH immediately reveal and aggregate onto profiles!
    const driverSubmit = await request(h.app)
      .post(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-driver-1')
      .set('x-test-role', 'DRIVER')
      .send({ stars: 5, tags: ['POLITE_RIDER', 'PROMPT_PAYMENT'] });

    expect(driverSubmit.status).toBe(201);
    expect(driverSubmit.body.data.myReview).toMatchObject({
      stars: 5,
      status: 'REVEALED',
    });
    expect(driverSubmit.body.data.counterpartyReview).toMatchObject({
      stars: 2,
      tags: ['LATE_PICKUP'],
      status: 'REVEALED',
    });

    expect(h.profileRatings.get('DRIVER:driver-1')).toEqual({ ratingCount: 1, ratingAverage: 2 });
    expect(h.profileRatings.get('RIDER:rider-1')).toEqual({ ratingCount: 1, ratingAverage: 5 });
    expect(h.emittedNotifications).toEqual([{ rideId: ride.id, event: 'ride.rating.revealed' }]);

    const events = await h.rideEventRepo.findByRideId(ride.id);
    expect(events.filter((e) => e.eventType === 'RIDE_RATING_REVEALED')).toHaveLength(2);
  });

  it('reveals unilateral rating after 7 days via scheduled sweep without double-counting', async () => {
    const h = createRatingsTestHarness();
    const ride = await h.seedRide();

    await request(h.app)
      .post(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-rider-1')
      .set('x-test-role', 'RIDER')
      .send({ stars: 4, tags: ['CLEAN_VEHICLE'] })
      .expect(201);

    // Before 7 days: sweep reveals 0
    expect(await h.container.rideRatingsUseCase.revealExpiredRatings()).toBe(0);
    expect(h.profileRatings.get('DRIVER:driver-1')).toEqual({ ratingCount: 0, ratingAverage: null });

    // Advance past 7-day window: sweep reveals unilateral review exactly once
    h.setNow(new Date(ride.settledAt!.getTime() + RIDE_RATING_WINDOW_MS + 5_000));
    expect(await h.container.rideRatingsUseCase.revealExpiredRatings()).toBe(1);
    expect(h.profileRatings.get('DRIVER:driver-1')).toEqual({ ratingCount: 1, ratingAverage: 4 });

    // Running sweep again is a no-op (never double-increments ratingCount)
    expect(await h.container.rideRatingsUseCase.revealExpiredRatings()).toBe(0);
    expect(h.profileRatings.get('DRIVER:driver-1')).toEqual({ ratingCount: 1, ratingAverage: 4 });

    // Driver can now view the revealed rating, and can no longer submit after 7 days
    const driverView = await request(h.app)
      .get(`/api/v1/rides/${ride.id}/rating`)
      .set('x-test-user-id', 'user-driver-1')
      .set('x-test-role', 'DRIVER');
    expect(driverView.status).toBe(200);
    expect(driverView.body.data.canSubmit).toBe(false);
    expect(driverView.body.data.isWindowExpired).toBe(true);
    expect(driverView.body.data.counterpartyReview).toMatchObject({
      stars: 4,
      status: 'REVEALED',
    });
  });
});
