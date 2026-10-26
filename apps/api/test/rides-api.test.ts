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
import { rideViewSchema } from '../src/modules/rides/interface/rides.swagger.js';
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
    requireAdminScope: () => requireRole('SUPER_ADMIN'),
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
    requireDriverEligibility: async () => 'test-vehicle',
    unitOfWork,
    rideRepo,
    rideEventRepo: new MemoryRideEventRepository(),
    walletRepo,
    pricingConfigRepo,
    tokenSecret: QUOTE_SECRET,
    pickupOtpSecret: QUOTE_SECRET,
    resolveRiderId: async (u) =>
      u === RIDER_USER || u === OTHER_RIDER_USER ? profileIds[u]! : null,
    resolveDriverId: async (u) =>
      u === DRIVER_USER || u === OTHER_DRIVER_USER ? profileIds[u]! : null,
    resolveAssignedDriver: async (driverId, vehicleId) => ({
      driverId,
      name: driverId === DRIVER_ID ? 'Subrata Ghosh' : 'Rajesh Barman',
      phoneE164: '+919000000012',
      profilePhotoUrl: null,
      vehicle: {
        vehicleId: vehicleId ?? '018f0a00-0000-7000-8000-000000000401',
        make: 'Maruti',
        model: 'Dzire',
        color: 'White',
        registrationNumber: 'WB74AB1234',
        vehicleCategory: 'CAB',
      },
    }),
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
        pickup: { ...pickup, address: 'Sevoke Road, Siliguri' },
        drop: { ...drop, address: 'Hill Cart Road' },
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
    expect(rideViewSchema.safeParse(res.body.data).success).toBe(true);
    expect(res.body.data.status).toBe('OFFERING');
    expect(res.body.data.bookerRiderId).toBe(RIDER_ID);
    expect(res.body.data.proposedFarePaise).toBe(quote.suggestedFarePaise);
    expect(res.body.data.pickup.address).toBe('Sevoke Road, Siliguri');
    expect(res.body.data.drop.address).toBe('Hill Cart Road');
    expect(res.body.data.passenger).not.toHaveProperty('pickupOtpHash');
  });

  it('raises an active offer, invalidates old counters, and enforces rider and ceiling limits', async () => {
    const s = await setup();
    const { res, quote } = await s.requestRide();
    const id = res.body.data.id as string;
    const endpoint = `/api/v1/rides/${id}/fare/raise`;
    const proposedFarePaise = quote.suggestedFarePaise + 1000;
    const counter = await request(s.app).post(`/api/v1/rides/${id}/counter`)
      .set('Authorization', s.driverAuth).send({ proposedFarePaise: quote.suggestedFarePaise + 2000 });
    expect(counter.status).toBe(201);

    expect((await request(s.app).post(endpoint).set('Authorization', s.otherRiderAuth)
      .send({ proposedFarePaise })).status).toBe(404);
    const raised = await request(s.app).post(endpoint).set('Authorization', s.riderAuth)
      .send({ proposedFarePaise });
    expect(raised.status).toBe(200);
    expect(raised.body.data.proposedFarePaise).toBe(proposedFarePaise);
    const staleResponse = await request(s.app).post(`/api/v1/rides/${id}/counter/respond`)
      .set('Authorization', s.riderAuth).send({ driverId: DRIVER_ID, action: 'ACCEPTED' });
    expect(staleResponse.status).toBe(409);
    expect((await request(s.app).post(endpoint).set('Authorization', s.riderAuth)
      .send({ proposedFarePaise: quote.negotiation.ceilingPaise + 1000 })).status).toBe(400);
    const accepted = await request(s.app).post(`/api/v1/rides/${id}/accept`)
      .set('Authorization', s.driverAuth).send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.agreedFarePaise).toBe(proposedFarePaise);
    expect((await request(s.app).post(endpoint).set('Authorization', s.riderAuth)
      .send({ proposedFarePaise: proposedFarePaise + 1000 })).status).toBe(409);
  });

  it('rejects ride creation by a driver, a bad payload, and a tampered quote', async () => {
    const s = await setup();
    const { quote } = await s.requestRide();

    const asDriver = await request(s.app)
      .post('/api/v1/rides')
      .set('Authorization', s.driverAuth)
      .send({});
    expect(asDriver.status).toBe(403);

    const invalid = await request(s.app)
      .post('/api/v1/rides')
      .set('Authorization', s.riderAuth)
      .send({});
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
      request(s.app)
        .post(`/api/v1/rides/${id}/${path}`)
        .set('Authorization', auth)
        .send(body ?? {});

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
    expect(completed.body.data.ride.status).toBe('PAYMENT_PENDING');
    expect(completed.body.data.commissionPaise).toBe(0);
    expect(completed.body.data.walletBalancePaise).toBe(250_000);
    const confirmed = await post('payment/confirm', s.driverAuth);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.ride.status).toBe('SETTLED');
    expect(confirmed.body.data.commissionPaise).toBeGreaterThan(0);
    expect(confirmed.body.data.walletBalancePaise).toBe(
      250_000 - confirmed.body.data.commissionPaise,
    );
  });

  it('lets only the rider file and support resolve a confirmed-payment dispute', async () => {
    const s = await setup();
    const id = (await s.requestRide()).res.body.data.id as string;
    const post = (path: string, auth: string, body?: object) =>
      request(s.app)
        .post(`/api/v1/rides/${id}/${path}`)
        .set('Authorization', auth)
        .send(body ?? {});
    await post('accept', s.driverAuth);
    await post('en-route', s.driverAuth);
    await post('arrived', s.driverAuth);
    const ride = (await s.rideRepo.findById(id))!;
    await s.rideRepo.save({
      ...ride,
      passenger: {
        ...ride.passenger,
        pickupOtpHash: createHash('sha256').update('4321').digest('hex'),
      },
    });
    await post('start', s.driverAuth, { otp: '4321' });
    await post('complete', s.driverAuth);
    await post('payment/confirm', s.driverAuth);
    expect(
      (await post('payment/dispute', s.otherRiderAuth, { reason: 'The fare was overcharged' }))
        .status,
    ).toBe(403);
    expect(
      (await post('payment/dispute', s.driverAuth, { reason: 'The fare was overcharged' })).status,
    ).toBe(403);
    const filed = await post('payment/dispute', s.riderAuth, {
      reason: 'The fare was overcharged',
    });
    expect(filed.status).toBe(200);
    expect(filed.body.data.status).toBe('PAYMENT_DISPUTED');
    const open = await request(s.app)
      .get('/api/v1/rides/payment/disputes')
      .set('Authorization', s.adminAuth);
    expect(open.status).toBe(200);
    expect(open.body.data[0].ticket.metadata.reason).toBe('The fare was overcharged');
    expect(
      (await request(s.app).get('/api/v1/rides/payment/disputes').set('Authorization', s.riderAuth))
        .status,
    ).toBe(403);
    expect(
      (
        await post('payment/dispute/resolve', s.riderAuth, {
          outcome: 'RIDER_WINS',
          reason: 'Verified refund decision',
        })
      ).status,
    ).toBe(403);
    const resolved = await post('payment/dispute/resolve', s.adminAuth, {
      outcome: 'RIDER_WINS',
      reason: 'Verified refund decision',
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('SETTLED');
    expect(
      (await request(s.app).get('/api/v1/rides/payment/disputes').set('Authorization', s.adminAuth))
        .body.data,
    ).toHaveLength(0);
  });

  it('persists a cash switch through both app routes and settles only after assigned-driver confirmation', async () => {
    const s = await setup();
    const id = (await s.requestRide()).res.body.data.id as string;
    const post = (path: string, auth: string) => request(s.app)
      .post(`/api/v1/rides/${id}/${path}`).set('Authorization', auth).send({});
    await post('accept', s.driverAuth);
    const accepted = (await s.rideRepo.findById(id))!;
    await s.rideRepo.save({ ...accepted, status: 'PAYMENT_PENDING', completedAt: new Date() });

    expect((await post('payment/cash', s.otherRiderAuth)).status).toBe(403);
    expect((await post('payment/cash', s.otherDriverAuth)).status).toBe(403);
    const changed = await post('payment/cash', s.riderAuth);
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ method: 'CASH', paid: false, requiresReview: false });
    const rider = await request(s.app).get(`/api/v1/rides/${id}`).set('Authorization', s.riderAuth);
    expect(rider.body.data).toMatchObject({ status: 'PAYMENT_PENDING', paymentCollection: 'CASH' });
    const driver = await request(s.app).get(`/api/v1/rides/${id}/payment/upi/driver-status`).set('Authorization', s.driverAuth);
    expect(driver.body.data).toMatchObject({ method: 'CASH', paid: false });
    expect((await post('payment/confirm', s.riderAuth)).status).toBe(403);
    expect((await post('payment/confirm', s.otherDriverAuth)).status).toBe(403);
    const confirmed = await post('payment/confirm', s.driverAuth);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.ride.status).toBe('SETTLED');
    const repeated = await post('payment/confirm', s.driverAuth);
    expect(repeated.body.data.walletBalancePaise).toBe(confirmed.body.data.walletBalancePaise);
    const status = await request(s.app).get(`/api/v1/rides/${id}/payment/upi/status`).set('Authorization', s.riderAuth);
    expect(status.body.data).toMatchObject({ method: 'CASH', paid: true });
    const timeline = await request(s.app).get(`/api/v1/rides/${id}/events`).set('Authorization', s.riderAuth);
    const payments = timeline.body.data.filter((event: { eventType: string }) => event.eventType === 'PAYMENT_CONFIRMED');
    expect(payments).toHaveLength(1);
    expect(payments[0].metadata.method).toBe('CASH');
    expect(await s.walletRepo.findTransactionsByWalletId('018f0a00-0000-7000-8000-000000000301')).toHaveLength(1);
  });

  it('only one of two competing drivers wins the ride', async () => {
    const s = await setup();
    const id = (await s.requestRide()).res.body.data.id as string;

    const first = await request(s.app)
      .post(`/api/v1/rides/${id}/accept`)
      .set('Authorization', s.driverAuth);
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

    const get = (auth: string) =>
      request(s.app).get(`/api/v1/rides/${id}`).set('Authorization', auth);
    expect((await get(s.riderAuth)).status).toBe(200);
    expect((await get(s.driverAuth)).status).toBe(200);
    expect((await get(s.adminAuth)).status).toBe(200);
    expect((await get(s.otherRiderAuth)).status).toBe(404);
    expect((await get(s.otherDriverAuth)).status).toBe(404);
  });

  it('lists only own rides for riders and drivers, everything for admins, with status filter', async () => {
    const s = await setup();
    const id = (await s.requestRide()).res.body.data.id as string;
    await request(s.app).post(`/api/v1/rides/${id}/accept`).set('Authorization', s.driverAuth);
    const first = (await s.rideRepo.findById(id))!;
    await s.rideRepo.save({ ...first, status: 'SETTLED', settledAt: new Date() });
    expect((await s.requestRide()).res.status).toBe(201);

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
      'RIDE_CREATED',
      'DRIVER_ASSIGNED',
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
    ]);
    expect((await events(s.riderAuth)).status).toBe(200);
    expect((await events(s.otherRiderAuth)).status).toBe(404);
  });

  it('enforces one active ride per rider with 409 conflict link and supports idempotent retries', async () => {
    const s = await setup();
    const first = await s.requestRide();
    expect(first.res.status).toBe(201);
    const activeId = first.res.body.data.id as string;

    const duplicate = await s.requestRide();
    expect(duplicate.res.status).toBe(409);
    expect(duplicate.res.body.code).toBe('CONFLICT');
    expect(duplicate.res.body.message).toContain('ACTIVE_RIDE_EXISTS');
    expect(duplicate.res.body.data).toEqual({
      code: 'ACTIVE_RIDE_EXISTS',
      rideId: activeId,
      status: 'OFFERING',
      ridePath: `/api/v1/rides/${activeId}`,
    });

    // Cancel first ride -> unblocks rider; verify Idempotency-Key replay and mismatch guards
    await request(s.app)
      .post(`/api/v1/rides/${activeId}/cancel`)
      .set('Authorization', s.riderAuth)
      .send({ reason: 'RIDER_CHANGED_MIND' });

    const payload = {
      quoteToken: first.quote.quoteToken,
      proposedFarePaise: first.quote.suggestedFarePaise,
      passenger: { name: 'Subir Roy', phoneE164: '+919876543210' },
      vehicleCategory: 'CAB',
      pickup: { ...pickup, address: 'Sevoke Road, Siliguri' },
      drop: { ...drop, address: 'Hill Cart Road' },
    };

    const created = await request(s.app)
      .post('/api/v1/rides')
      .set('Authorization', s.riderAuth)
      .set('Idempotency-Key', 'idem-book-attempt-001')
      .send(payload);
    expect(created.status).toBe(201);
    expect(created.body.data).not.toHaveProperty('idempotencyKey');

    const replayed = await request(s.app)
      .post('/api/v1/rides')
      .set('Authorization', s.riderAuth)
      .set('Idempotency-Key', 'idem-book-attempt-001')
      .send(payload);
    expect(replayed.status).toBe(200);
    expect(replayed.body.data.id).toBe(created.body.data.id);

    const reusedDifferentFare = await request(s.app)
      .post('/api/v1/rides')
      .set('Authorization', s.riderAuth)
      .set('Idempotency-Key', 'idem-book-attempt-001')
      .send({ ...payload, proposedFarePaise: first.quote.suggestedFarePaise + 500 });
    expect(reusedDifferentFare.status).toBe(409);
    expect(reusedDifferentFare.body.data).toEqual({ code: 'IDEMPOTENCY_KEY_REUSED' });

    const headerBodyMismatch = await request(s.app)
      .post('/api/v1/rides')
      .set('Authorization', s.riderAuth)
      .set('Idempotency-Key', 'idem-header-0001')
      .send({ ...payload, idempotencyKey: 'idem-body-00002' });
    expect(headerBodyMismatch.status).toBe(400);

    // PAYMENT_DISPUTED must not block new bookings (D-043)
    const current = (await s.rideRepo.findById(created.body.data.id as string))!;
    await s.rideRepo.save({ ...current, status: 'PAYMENT_DISPUTED' });
    const afterDispute = await s.requestRide();
    expect(afterDispute.res.status).toBe(201);
    expect(afterDispute.res.body.data.id).not.toBe(created.body.data.id);
  });

  it('admin cannot impersonate a rider to create a ride', async () => {
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

    expect(createRes.status).toBe(403);
  });
});
import { unitOfWork } from './helpers/unitOfWork.js';
