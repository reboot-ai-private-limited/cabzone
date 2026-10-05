import { createHash } from 'node:crypto';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AuthRole } from '@cabzone/contracts';
import { createApp } from '../src/app.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import type { SessionEntity, SessionRepositoryPort } from '../src/modules/identity/domain/index.js';
import type { IdentityContainer } from '../src/modules/identity/identity.container.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  requireRole,
} from '../src/modules/identity/interface/middlewares/index.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import {
  CreateQuoteUseCase,
  MemoryPricingConfigRepository,
  type PricingConfigEntity,
} from '../src/modules/pricing/index.js';
import { MemoryRideEventRepository, MemoryRideRepository } from '../src/modules/rides/index.js';
import { buildRidesContainer } from '../src/modules/rides/rides.container.js';
import {
  MemoryZoneRepository,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../src/modules/zone/index.js';

const JWT_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';
const QUOTE_SECRET = 'test-token-secret-for-quote-signature-32';

const CITY_ZONE_ID = '018f0a00-0000-7000-8000-000000000001';
const CONFIG_ID = '018f0a00-0000-7000-8000-000000000010';

// user ids (what the JWT carries) vs. profile ids (what rides reference)
const RIDER_USER = '018f0a00-0000-7000-8000-0000000000a1';
const OTHER_RIDER_USER = '018f0a00-0000-7000-8000-0000000000a2';
const DRIVER_USER = '018f0a00-0000-7000-8000-0000000000b1';
const OTHER_DRIVER_USER = '018f0a00-0000-7000-8000-0000000000b2';
const ADMIN_USER = '018f0a00-0000-7000-8000-0000000000c1';
const RIDER_ID = '018f0a00-0000-7000-8000-000000000201';
const OTHER_RIDER_ID = '018f0a00-0000-7000-8000-000000000202';
const DRIVER_ID = '018f0a00-0000-7000-8000-000000000101';
const OTHER_DRIVER_ID = '018f0a00-0000-7000-8000-000000000102';

const profileIds: Record<string, string> = {
  [RIDER_USER]: RIDER_ID,
  [OTHER_RIDER_USER]: OTHER_RIDER_ID,
  [DRIVER_USER]: DRIVER_ID,
  [OTHER_DRIVER_USER]: OTHER_DRIVER_ID,
};

const cityZone: ZoneEntity = {
  id: CITY_ZONE_ID,
  name: 'Siliguri City',
  zoneType: 'CITY',
  parentCityZoneId: null,
  stateCode: 'WB',
  boundary: {
    type: 'Polygon',
    coordinates: [
      [
        [88.4, 26.7],
        [88.5, 26.7],
        [88.5, 26.8],
        [88.4, 26.8],
        [88.4, 26.7],
      ],
    ],
  },
  bufferDistanceM: 25_000,
  status: 'ACTIVE',
  currentPricingConfigId: CONFIG_ID,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const pricingConfig: PricingConfigEntity = {
  id: CONFIG_ID,
  cityZoneId: CITY_ZONE_ID,
  version: 1,
  vehicleType: 'CAB',
  baseFarePaise: 5000,
  ratePerKmPaise: 1500,
  minimumFarePaise: 8000,
  outstationBaseFarePaise: 7500,
  outstationRatePerKmPaise: 2000,
  outstationMinimumFarePaise: 15000,
  bufferSurchargePaise: 2000,
  negotiationFloorPercent: 80,
  negotiationCeilingPercent: 150,
  negotiationWindowSeconds: 90,
  commissionPercent: 8,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  status: 'ACTIVE',
  createdByAdminId: '018f0a00-0000-7000-8000-000000000099',
  createdAt: new Date(),
};

class MemorySessionRepository implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();
  async findById(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async findByTokenHash() {
    return null;
  }
  async findByUserIdAndDeviceId() {
    return null;
  }
  async save(s: SessionEntity) {
    this.sessions.set(s.id, { ...s });
  }
  async revoke() {}
  async revokeAllForUser() {}
}

const pickup = { lat: 26.71, lng: 88.42 };
const drop = { lat: 26.75, lng: 88.45 };

async function setup() {
  const sessionRepo = new MemorySessionRepository();
  const tokenAdapter = new JoseTokenAdapter(JWT_SECRET);
  const authenticate = makeAuthenticate({ tokenVerifier: tokenAdapter, sessionRepo });
  const identity: IdentityContainer = {
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
    authenticate,
    requireRole,
    requireZoneAccess: makeRequireZoneAccess({ adminRepo: { findByUserId: async () => null } }),
  };

  const zoneRepo = new MemoryZoneRepository();
  zoneRepo.save(cityZone);
  const pricingConfigRepo = new MemoryPricingConfigRepository();
  pricingConfigRepo.save(pricingConfig);
  const quoteUseCase = new CreateQuoteUseCase({
    serviceClassificationUseCase: new ServiceClassificationUseCase({
      resolveZonesUseCase: new ResolveZonesUseCase({ zoneRepo }),
    }),
    pricingConfigRepo,
    tokenSecret: QUOTE_SECRET,
    quoteTtlSeconds: 300,
  });

  const rideRepo = new MemoryRideRepository();
  const walletRepo = new MemoryWalletRepository();
  await walletRepo.save({
    id: '018f0a00-0000-7000-8000-000000000301',
    driverId: DRIVER_ID,
    balancePaise: 250_000,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await walletRepo.save({
    id: '018f0a00-0000-7000-8000-000000000302',
    driverId: OTHER_DRIVER_ID,
    balancePaise: 250_000,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const rides = buildRidesContainer({
    rideRepo,
    rideEventRepo: new MemoryRideEventRepository(),
    walletRepo,
    pricingConfigRepo,
    tokenSecret: QUOTE_SECRET,
    pickupOtpSecret: QUOTE_SECRET,
    resolveRiderId: async (u) => (u === RIDER_USER || u === OTHER_RIDER_USER ? profileIds[u]! : null),
    resolveDriverId: async (u) =>
      u === DRIVER_USER || u === OTHER_DRIVER_USER ? profileIds[u]! : null,
  });

  const app = createApp({ identity, rides });

  async function login(userId: string, role: AuthRole) {
    const sessionId = crypto.randomUUID();
    await sessionRepo.save({
      id: sessionId,
      userId,
      deviceId: 'dev',
      refreshTokenHash: 'h',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    const token = await tokenAdapter.signAccessToken({ sub: userId, role, sessionId });
    return `Bearer ${token}`;
  }

  const riderAuth = await login(RIDER_USER, 'RIDER');
  const otherRiderAuth = await login(OTHER_RIDER_USER, 'RIDER');
  const driverAuth = await login(DRIVER_USER, 'DRIVER');
  const otherDriverAuth = await login(OTHER_DRIVER_USER, 'DRIVER');
  const adminAuth = await login(ADMIN_USER, 'SUPPORT_ADMIN');

  async function requestRide() {
    const quote = await quoteUseCase.execute({
      pickup,
      drop,
      vehicleCategory: 'CAB',
      distanceM: 6000,
      durationSeconds: 900,
    });
    const res = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', riderAuth)
      .send({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.suggestedFarePaise,
        passenger: { name: 'Subir Roy', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup,
        drop,
      });
    return { res, quote };
  }

  return {
    app,
    rideRepo,
    walletRepo,
    riderAuth,
    otherRiderAuth,
    driverAuth,
    otherDriverAuth,
    adminAuth,
    requestRide,
  };
}

describe('Rides API', () => {
  it('requires authentication', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/v1/rides')).status).toBe(401);
  });

  it('rider requests a ride; response never leaks OTP data', async () => {
    const s = await setup();
    const { res, quote } = await s.requestRide();

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('OFFERING');
    expect(res.body.data.bookerRiderId).toBe(RIDER_ID);
    expect(res.body.data.proposedFarePaise).toBe(quote.suggestedFarePaise);
    expect(res.body.data.passenger).not.toHaveProperty('pickupOtpHash');
  });

  it('rejects ride creation by a driver, a bad payload, and a tampered quote', async () => {
    const s = await setup();
    const { quote } = await s.requestRide();

    const asDriver = await request(s.app).post('/api/v1/rides').set('Authorization', s.driverAuth).send({});
    expect(asDriver.status).toBe(403);

    const invalid = await request(s.app).post('/api/v1/rides').set('Authorization', s.riderAuth).send({});
    expect(invalid.status).toBe(400);

    const mismatch = await request(s.app)
      .post('/api/v1/rides')
      .set('Authorization', s.riderAuth)
      .send({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.suggestedFarePaise,
        passenger: { name: 'X', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup: { lat: 26.72, lng: 88.42 },
        drop,
      });
    expect(mismatch.status).toBe(400);
  });

  it('runs the full lifecycle: accept → en-route → arrived → start → complete, debiting commission', async () => {
    const s = await setup();
    const { res } = await s.requestRide();
    const id = res.body.data.id as string;
    const post = (path: string, auth: string, body?: object) =>
      request(s.app).post(`/api/v1/rides/${id}/${path}`).set('Authorization', auth).send(body ?? {});

    const accepted = await post('accept', s.driverAuth);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('DRIVER_ASSIGNED');
    expect(accepted.body.data.driverId).toBe(DRIVER_ID);
    expect(JSON.stringify(accepted.body)).not.toMatch(/pickupOtp(Hash)?"?:"[0-9a-f]{4,}/);

    expect((await post('en-route', s.driverAuth)).body.data.status).toBe('DRIVER_EN_ROUTE');
    expect((await post('arrived', s.driverAuth)).body.data.status).toBe('DRIVER_ARRIVED');

    // The OTP is delivered to the rider out-of-band; pin a known one for the test.
    const stored = (await s.rideRepo.findById(id))!;
    await s.rideRepo.save({
      ...stored,
      passenger: {
        ...stored.passenger,
        pickupOtpHash: createHash('sha256').update('4321').digest('hex'),
      },
    });

    expect((await post('start', s.driverAuth, { otp: '0000' })).status).toBe(400);
    const started = await post('start', s.driverAuth, { otp: '4321' });
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe('TRIP_STARTED');

    const completed = await post('complete', s.driverAuth);
    expect(completed.status).toBe(200);
    expect(completed.body.data.ride.status).toBe('SETTLED');
    expect(completed.body.data.commissionPaise).toBeGreaterThan(0);
    expect(completed.body.data.walletBalancePaise).toBe(250_000 - completed.body.data.commissionPaise);
  });

  it('only one of two competing drivers wins the ride', async () => {
    const s = await setup();
    const id = (await s.requestRide()).res.body.data.id as string;

    const first = await request(s.app).post(`/api/v1/rides/${id}/accept`).set('Authorization', s.driverAuth);
    const second = await request(s.app)
      .post(`/api/v1/rides/${id}/accept`)
      .set('Authorization', s.otherDriverAuth);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it('a non-assigned driver cannot progress the ride, and a rider cannot use driver endpoints', async () => {
    const s = await setup();
    const id = (await s.requestRide()).res.body.data.id as string;
    await request(s.app).post(`/api/v1/rides/${id}/accept`).set('Authorization', s.driverAuth);

    const wrongDriver = await request(s.app)
      .post(`/api/v1/rides/${id}/en-route`)
      .set('Authorization', s.otherDriverAuth);
    expect(wrongDriver.status).toBe(403);

    const asRider = await request(s.app)
      .post(`/api/v1/rides/${id}/en-route`)
      .set('Authorization', s.riderAuth);
    expect(asRider.status).toBe(403);
  });

  it('scopes reads: owner rider, assigned driver and admin can view; others get 404', async () => {
    const s = await setup();
    const id = (await s.requestRide()).res.body.data.id as string;
    await request(s.app).post(`/api/v1/rides/${id}/accept`).set('Authorization', s.driverAuth);

    const get = (auth: string) => request(s.app).get(`/api/v1/rides/${id}`).set('Authorization', auth);
    expect((await get(s.riderAuth)).status).toBe(200);
    expect((await get(s.driverAuth)).status).toBe(200);
    expect((await get(s.adminAuth)).status).toBe(200);
    expect((await get(s.otherRiderAuth)).status).toBe(404);
    expect((await get(s.otherDriverAuth)).status).toBe(404);
  });

  it('lists only own rides for riders and drivers, everything for admins, with status filter', async () => {
    const s = await setup();
    const id = (await s.requestRide()).res.body.data.id as string;
    await s.requestRide();
    await request(s.app).post(`/api/v1/rides/${id}/accept`).set('Authorization', s.driverAuth);

    const list = (auth: string, qs = '') =>
      request(s.app).get(`/api/v1/rides${qs}`).set('Authorization', auth);

    expect((await list(s.riderAuth)).body.data).toHaveLength(2);
    expect((await list(s.otherRiderAuth)).body.data).toHaveLength(0);
    expect((await list(s.driverAuth)).body.data).toHaveLength(1);
    expect((await list(s.adminAuth)).body.data).toHaveLength(2);
    expect((await list(s.adminAuth, '?status=OFFERING')).body.data).toHaveLength(1);
    expect((await list(s.adminAuth, '?status=NOPE')).status).toBe(400);
  });

  it('rider can cancel an unassigned ride; a stranger cannot', async () => {
    const s = await setup();
    const id = (await s.requestRide()).res.body.data.id as string;
    const cancel = (auth: string) =>
      request(s.app)
        .post(`/api/v1/rides/${id}/cancel`)
        .set('Authorization', auth)
        .send({ reason: 'RIDER_CHANGED_MIND' });

    expect((await cancel(s.otherRiderAuth)).status).toBe(403);
    const ok = await cancel(s.riderAuth);
    expect(ok.status).toBe(200);
    expect(ok.body.data.ride.status).toBe('CANCELLED');
  });

  it('serves the ride timeline in order to those who can view the ride only', async () => {
    const s = await setup();
    const id = (await s.requestRide()).res.body.data.id as string;
    await request(s.app).post(`/api/v1/rides/${id}/accept`).set('Authorization', s.driverAuth);
    await request(s.app).post(`/api/v1/rides/${id}/en-route`).set('Authorization', s.driverAuth);
    await request(s.app).post(`/api/v1/rides/${id}/arrived`).set('Authorization', s.driverAuth);

    const events = (auth: string) =>
      request(s.app).get(`/api/v1/rides/${id}/events`).set('Authorization', auth);
    const admin = await events(s.adminAuth);
    expect(admin.status).toBe(200);
    expect(admin.body.data.map((e: { eventType: string }) => e.eventType)).toEqual([
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
    ]);
    expect((await events(s.riderAuth)).status).toBe(200);
    expect((await events(s.otherRiderAuth)).status).toBe(404);
  });

  it('admin can create a ride from quote, simulate driver acceptance, inspect OTP, and drive lifecycle', async () => {
    const s = await setup();
    const quote = await s.requestRide().then((r) => r.quote);

    // Admin creates ride
    const createRes = await request(s.app)
      .post('/api/v1/rides')
      .set('Authorization', s.adminAuth)
      .send({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.suggestedFarePaise,
        passenger: { name: 'Admin Test Rider', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup,
        drop,
        riderId: RIDER_ID,
      });

    expect(createRes.status).toBe(201);
    const rideId = createRes.body.data.id as string;
    expect(createRes.body.data.status).toBe('OFFERING');

    // Admin simulates driver acceptance
    const acceptRes = await request(s.app)
      .post(`/api/v1/rides/${rideId}/accept`)
      .set('Authorization', s.adminAuth)
      .send({ driverId: DRIVER_ID });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('DRIVER_ASSIGNED');
    expect(acceptRes.body.data.pickupOtp).toBeDefined();
    const otp = acceptRes.body.data.pickupOtp as string;
    expect(otp).toMatch(/^\d{4}$/);

    // Driver goes en route and arrives
    const enRouteRes = await request(s.app)
      .post(`/api/v1/rides/${rideId}/en-route`)
      .set('Authorization', s.adminAuth)
      .send({ driverId: DRIVER_ID });
    expect(enRouteRes.status).toBe(200);
    expect(enRouteRes.body.data.status).toBe('DRIVER_EN_ROUTE');

    const arrivedRes = await request(s.app)
      .post(`/api/v1/rides/${rideId}/arrived`)
      .set('Authorization', s.adminAuth)
      .send({ driverId: DRIVER_ID });
    expect(arrivedRes.status).toBe(200);
    expect(arrivedRes.body.data.status).toBe('DRIVER_ARRIVED');

    // Admin fetches ride and inspects OTP
    const getRes = await request(s.app)
      .get(`/api/v1/rides/${rideId}`)
      .set('Authorization', s.adminAuth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.pickupOtp).toBe(otp);

    // Start ride with valid OTP
    const startRes = await request(s.app)
      .post(`/api/v1/rides/${rideId}/start`)
      .set('Authorization', s.adminAuth)
      .send({ otp, driverId: DRIVER_ID });
    expect(startRes.status).toBe(200);
    expect(startRes.body.data.status).toBe('TRIP_STARTED');

    // Complete ride
    const completeRes = await request(s.app)
      .post(`/api/v1/rides/${rideId}/complete`)
      .set('Authorization', s.adminAuth)
      .send({ driverId: DRIVER_ID });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.ride.status).toBe('SETTLED');
  });
});
