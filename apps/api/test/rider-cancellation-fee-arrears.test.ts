import crypto, { createHash } from 'node:crypto';
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
import { buildLedgerContainer } from '../src/modules/ledger/ledger.container.js';
import { MemoryPricingConfigRepository, type PricingConfigEntity } from '../src/modules/pricing/index.js';
import { buildPricingContainer } from '../src/modules/pricing/pricing.container.js';
import { MemoryRideEventRepository, MemoryRideRepository } from '../src/modules/rides/index.js';
import { RideUpiPaymentUseCase } from '../src/modules/rides/application/useCases/rideUpiPayment.usecase.js';
import { buildRidesContainer } from '../src/modules/rides/rides.container.js';
import { rideViewSchema } from '../src/modules/rides/interface/rides.swagger.js';
import {
  MemoryZoneRepository,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../src/modules/zone/index.js';
import type { UnitOfWorkPort } from '../src/shared/db/unitOfWork.port.js';

const JWT_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';
const QUOTE_SECRET = 'test-token-secret-for-quote-signature-32';

const CITY_ZONE_ID = '018f0a00-0000-7000-8000-000000000001';
const CONFIG_ID = '018f0a00-0000-7000-8000-000000000010';

const RIDER_USER = '018f0a00-0000-7000-8000-0000000000a1';
const OTHER_RIDER_USER = '018f0a00-0000-7000-8000-0000000000a2';
const DRIVER_USER = '018f0a00-0000-7000-8000-0000000000b1';
const OTHER_DRIVER_USER = '018f0a00-0000-7000-8000-0000000000b2';
const SUPER_ADMIN_USER = '018f0a00-0000-7000-8000-0000000000c1';
const SUPPORT_ADMIN_USER = '018f0a00-0000-7000-8000-0000000000c2';
const FINANCE_ADMIN_USER = '018f0a00-0000-7000-8000-0000000000c3';
const CITY_ADMIN_USER = '018f0a00-0000-7000-8000-0000000000c4';

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

const basePricingConfig: PricingConfigEntity = {
  id: CONFIG_ID,
  level: 'CITY',
  cityZoneId: CITY_ZONE_ID,
  stateCode: null,
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
  cancellationFeePaise: 5000,
  driverCompensationPaise: 3500,
  platformCancellationFeePaise: 1500,
  riderCancellationGraceSeconds: 120,
  driverNoShowWaitSeconds: 300,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  status: 'ACTIVE',
  createdByAdminId: SUPER_ADMIN_USER,
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

const pickup = { lat: 26.71, lng: 88.42, address: 'Hill Cart Road' };
const drop = { lat: 26.75, lng: 88.45, address: 'Sevoke Road' };

async function setup(customConfig?: Partial<PricingConfigEntity>) {
  const unitOfWork: UnitOfWorkPort = { run: (work) => work() };
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
    verifyToken: async (token: string) => {
      try {
        const claims = await tokenAdapter.verifyAccessToken(token);
        const session = await sessionRepo.findById(claims.sessionId);
        if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
        return { userId: claims.sub, role: claims.role };
      } catch {
        return null;
      }
    },
  };

  const zoneRepo = new MemoryZoneRepository();
  zoneRepo.save(cityZone);

  const pricingConfigRepo = new MemoryPricingConfigRepository();
  pricingConfigRepo.save({ ...basePricingConfig, ...customConfig });

  const walletRepo = new MemoryWalletRepository();
  await walletRepo.save({
    id: '018f0a00-0000-7000-8000-000000000301',
    ownerType: 'DRIVER',
    driverId: DRIVER_ID,
    balancePaise: 250_000,
    earningsBalancePaise: 0,
    owedPaise: 0,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await walletRepo.save({
    id: '018f0a00-0000-7000-8000-000000000302',
    ownerType: 'DRIVER',
    driverId: OTHER_DRIVER_ID,
    balancePaise: 250_000,
    earningsBalancePaise: 0,
    owedPaise: 0,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const serviceClassificationUseCase = new ServiceClassificationUseCase({
    resolveZonesUseCase: new ResolveZonesUseCase({ zoneRepo }),
  });

  const pricing = buildPricingContainer({
    unitOfWork,
    pricingConfigRepo,
    walletRepo,
    serviceClassificationUseCase,
    tokenSecret: QUOTE_SECRET,
    quoteTtlSeconds: 300,
    resolveRiderIdFromAuthHeader: async (authHeader?: string) => {
      if (!authHeader?.startsWith('Bearer ')) return null;
      const verified = await identity.verifyToken!(authHeader.slice(7).trim());
      if (!verified || verified.role !== 'RIDER') return null;
      return profileIds[verified.userId] ?? null;
    },
  });

  const rideRepo = new MemoryRideRepository();
  const rideEventRepo = new MemoryRideEventRepository();
  const rides = buildRidesContainer({
    requireDriverEligibility: async () => '018f0a00-0000-7000-8000-000000000401',
    unitOfWork,
    rideRepo,
    rideEventRepo,
    walletRepo,
    pricingConfigRepo,
    tokenSecret: QUOTE_SECRET,
    pickupOtpSecret: QUOTE_SECRET,
    resolveRiderId: async (u) =>
      u === RIDER_USER || u === OTHER_RIDER_USER ? profileIds[u]! : null,
    resolveDriverId: async (u) =>
      u === DRIVER_USER || u === OTHER_DRIVER_USER ? profileIds[u]! : null,
  });

  const ledger = buildLedgerContainer({
    unitOfWork,
    walletRepo,
    resolveDriverId: async (u) =>
      u === DRIVER_USER || u === OTHER_DRIVER_USER ? profileIds[u]! : null,
  });

  const app = createApp({ identity, pricing, rides, ledger });

  async function login(userId: string, role: AuthRole): Promise<string> {
    const sessionId = crypto.randomUUID();
    await sessionRepo.save({
      id: sessionId,
      userId,
      deviceId: 'dev',
      refreshTokenHash: createHash('sha256').update(sessionId).digest('hex'),
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    const token = await tokenAdapter.signAccessToken({ sub: userId, role, sessionId });
    return `Bearer ${token}`;
  }

  async function assertWalletConservation(walletId: string, initialBalancePaise = 0) {
    const wallet = await walletRepo.findById(walletId);
    expect(wallet).not.toBeNull();
    const { items } = await walletRepo.listTransactions({ walletId, limit: 200 });
    // Single wallet: online earnings post to the main balance, so only legacy EARNINGS-bucket
    // rows count toward the (now always zero) earnings balance.
    const commissionItems = items.filter((tx) => tx.bucket !== 'EARNINGS');
    const earningsItems = items.filter((tx) => tx.bucket === 'EARNINGS');
    const netDelta = commissionItems.reduce(
      (sum, tx) => sum + (tx.type === 'CREDIT' ? tx.amountPaise : -tx.amountPaise),
      0,
    );
    const earningsDelta = earningsItems.reduce(
      (sum, tx) => sum + (tx.type === 'CREDIT' ? tx.amountPaise : -tx.amountPaise),
      0,
    );
    expect(wallet!.balancePaise).toBe(initialBalancePaise + netDelta);
    expect(wallet!.earningsBalancePaise ?? 0).toBe(earningsDelta);
    expect(wallet!.owedPaise).toBe(Math.max(0, -wallet!.balancePaise));
  }

  return {
    app,
    login,
    rideRepo,
    rideEventRepo,
    walletRepo,
    pricingConfigRepo,
    rides,
    pricing,
    ledger,
    unitOfWork,
    assertWalletConservation,
  };
}

describe('Step 3: Rider Cancellation & No-Show Fees, Arrears Ledger, Recovery & Waivers', () => {
  it('validates configurable cancellation fee split on admin pricing endpoints and snapshots custom policy onto rides', async () => {
    const { app, login, rideRepo } = await setup();
    const adminAuth = await login(SUPER_ADMIN_USER, 'SUPER_ADMIN');
    const riderAuth = await login(RIDER_USER, 'RIDER');
    const driverAuth = await login(DRIVER_USER, 'DRIVER');

    // 1. Rejects inconsistent cancellation split (4000 + 1500 !== 6000)
    const badCreate = await request(app)
      .post('/api/v1/admin/pricing/configs')
      .set('Authorization', adminAuth)
      .send({
        level: 'CITY',
        cityZoneId: CITY_ZONE_ID,
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
        cancellationFeePaise: 6000,
        driverCompensationPaise: 4000,
        platformCancellationFeePaise: 1500,
        riderCancellationGraceSeconds: 90,
        driverNoShowWaitSeconds: 240,
        effectiveFrom: '2026-06-01T00:00:00.000Z',
        createdByAdminId: SUPER_ADMIN_USER,
      });
    expect(badCreate.status).toBe(400);

    // 2. Creates and activates custom cancellation policy (₹70 total = ₹50 driver + ₹20 platform, 90s grace, 240s no-show wait)
    const goodCreate = await request(app)
      .post('/api/v1/admin/pricing/configs')
      .set('Authorization', adminAuth)
      .send({
        level: 'CITY',
        cityZoneId: CITY_ZONE_ID,
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
        cancellationFeePaise: 7000,
        driverCompensationPaise: 5000,
        platformCancellationFeePaise: 2000,
        riderCancellationGraceSeconds: 90,
        driverNoShowWaitSeconds: 240,
        effectiveFrom: '2026-06-01T00:00:00.000Z',
        createdByAdminId: SUPER_ADMIN_USER,
      });
    expect(goodCreate.status).toBe(201);
    expect(goodCreate.body.data.cancellationFeePaise).toBe(7000);
    expect(goodCreate.body.data.driverCompensationPaise).toBe(5000);
    expect(goodCreate.body.data.platformCancellationFeePaise).toBe(2000);

    const activateRes = await request(app)
      .post(`/api/v1/admin/pricing/configs/${goodCreate.body.data.id}/activate`)
      .set('Authorization', adminAuth);
    expect(activateRes.status).toBe(200);

    // 3. Quote + Create Ride snapshots the custom cancellation policy
    const quoteRes = await request(app)
      .post('/api/v1/pricing/quotes')
      .set('Authorization', riderAuth)
      .send({ pickup, drop, vehicleCategory: 'CAB' });
    expect(quoteRes.status).toBe(200);

    const cabQuote = quoteRes.body.data;
    expect(cabQuote.arrearsPaise).toBe(0);
    expect(cabQuote.cashAllowed).toBe(true);

    const rideRes = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', riderAuth)
      .send({
        quoteToken: cabQuote.quoteToken,
        proposedFarePaise: cabQuote.suggestedFarePaise,
        passenger: { name: 'Asha', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup,
        drop,
      });
    expect(rideRes.status).toBe(201);
    const parsedRide = rideViewSchema.parse(rideRes.body.data);
    expect(parsedRide.pricingSnapshot.cancellationFeePaise).toBe(7000);
    expect(parsedRide.pricingSnapshot.driverCompensationPaise).toBe(5000);
    expect(parsedRide.pricingSnapshot.platformCancellationFeePaise).toBe(2000);
    expect(parsedRide.pricingSnapshot.riderCancellationGraceSeconds).toBe(90);
    expect(parsedRide.pricingSnapshot.driverNoShowWaitSeconds).toBe(240);

    // 4. Driver accepts; rider cancels at 100s (> 90s custom grace, even though < 120s default!) -> incurs ₹70 fee!
    await request(app)
      .post(`/api/v1/rides/${parsedRide.id}/accept`)
      .set('Authorization', driverAuth)
      .expect(200);

    const stored = (await rideRepo.findById(parsedRide.id))!;
    stored.acceptedAt = new Date(Date.now() - 100_000);
    await rideRepo.save(stored);

    const cancelRes = await request(app)
      .post(`/api/v1/rides/${parsedRide.id}/cancel`)
      .set('Authorization', riderAuth)
      .send({ reason: 'RIDER_CHANGED_MIND' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.feeBreakdown).toEqual({
      totalFeePaise: 7000,
      driverCompensationPaise: 5000,
      platformFeePaise: 2000,
      isGracePeriod: false,
    });
    expect(cancelRes.body.data.riderArrearsPaise).toBe(7000);
  });

  it('enforces grace period, no-show wait window, idempotent sequential/concurrent cancel replay, and rejects mismatched replay', async () => {
    const { app, login, rideRepo, walletRepo, assertWalletConservation } = await setup();
    const riderAuth = await login(RIDER_USER, 'RIDER');
    const driverAuth = await login(DRIVER_USER, 'DRIVER');

    // Helper to create & accept a ride
    const createAcceptedRide = async () => {
      const qRes = await request(app)
        .post('/api/v1/pricing/quotes')
        .set('Authorization', riderAuth)
        .send({ pickup, drop, vehicleCategory: 'CAB' });
      const q = qRes.body.data;
      const rRes = await request(app)
        .post('/api/v1/rides')
        .set('Authorization', riderAuth)
        .send({
          quoteToken: q.quoteToken,
          proposedFarePaise: q.suggestedFarePaise,
          passenger: { name: 'Asha', phoneE164: '+919876543210' },
          vehicleCategory: 'CAB',
          pickup,
          drop,
        });
      const id = rRes.body.data.id as string;
      await request(app)
        .post(`/api/v1/rides/${id}/accept`)
        .set('Authorization', driverAuth)
        .expect(200);
      return id;
    };

    // 1. Within 2-min grace period -> free cancellation, zero rider arrears
    const freeRideId = await createAcceptedRide();
    const freeStored = (await rideRepo.findById(freeRideId))!;
    freeStored.acceptedAt = new Date(Date.now() - 60_000);
    await rideRepo.save(freeStored);

    // A rider cannot cancel with a reason that only the other side or the system may use (D-048)
    const wrongReason = await request(app)
      .post(`/api/v1/rides/${freeRideId}/cancel`)
      .set('Authorization', riderAuth)
      .send({ reason: 'RIDER_NO_SHOW' });
    expect(wrongReason.status).toBe(400);
    expect(wrongReason.body.message).toContain('INVALID_CANCELLATION_REASON');
    expect((await rideRepo.findById(freeRideId))!.status).toBe('DRIVER_ASSIGNED');

    const freeCancel = await request(app)
      .post(`/api/v1/rides/${freeRideId}/cancel`)
      .set('Authorization', riderAuth)
      .send({ reason: 'RIDER_CHANGED_MIND' });
    expect(freeCancel.status).toBe(200);
    expect((await rideRepo.findById(freeRideId))!.cancelledBy).toBe('RIDER');
    expect(freeCancel.body.data.feeBreakdown.totalFeePaise).toBe(0);
    expect(freeCancel.body.data.riderArrearsPaise).toBe(0);
    expect(await walletRepo.findByRiderId(RIDER_ID)).toBeNull();

    // 2. Driver RIDER_NO_SHOW before 5-min wait -> 400; at >= 5 min -> ₹50 rider arrears + ₹35 driver comp
    const noShowRideId = await createAcceptedRide();
    await request(app)
      .post(`/api/v1/rides/${noShowRideId}/en-route`)
      .set('Authorization', driverAuth)
      .expect(200);
    await request(app)
      .post(`/api/v1/rides/${noShowRideId}/arrived`)
      .set('Authorization', driverAuth)
      .expect(200);

    const earlyNoShow = await request(app)
      .post(`/api/v1/rides/${noShowRideId}/cancel`)
      .set('Authorization', driverAuth)
      .send({ reason: 'RIDER_NO_SHOW' });
    expect(earlyNoShow.status).toBe(400);
    expect(earlyNoShow.body.message).toContain('MINIMUM_WAIT_TIME_NOT_MET');

    const arrivedStored = (await rideRepo.findById(noShowRideId))!;
    arrivedStored.arrivedAt = new Date(Date.now() - 305_000);
    await rideRepo.save(arrivedStored);

    // Simultaneous duplicate HTTP cancellations + sequential replay
    const [c1, c2] = await Promise.all([
      request(app)
        .post(`/api/v1/rides/${noShowRideId}/cancel`)
        .set('Authorization', driverAuth)
        .send({ reason: 'RIDER_NO_SHOW' }),
      request(app)
        .post(`/api/v1/rides/${noShowRideId}/cancel`)
        .set('Authorization', driverAuth)
        .send({ reason: 'RIDER_NO_SHOW' }),
    ]);
    expect(c1.status).toBe(200);
    expect(c2.status).toBe(200);
    expect(c1.body.data.feeBreakdown.totalFeePaise).toBe(5000);
    expect(c2.body.data.feeBreakdown.totalFeePaise).toBe(5000);
    expect(c1.body.data.riderArrearsPaise).toBe(5000);
    expect(c2.body.data.riderArrearsPaise).toBe(5000);
    expect((await rideRepo.findById(noShowRideId))!.cancelledBy).toBe('DRIVER');
    expect(c1.body.data.ride.cancelledBy).toBe('DRIVER');

    // Mismatched actor/reason replay rejected with 409
    const mismatchCancel = await request(app)
      .post(`/api/v1/rides/${noShowRideId}/cancel`)
      .set('Authorization', riderAuth)
      .send({ reason: 'RIDER_CHANGED_MIND' });
    expect(mismatchCancel.status).toBe(409);

    const riderWallet = await walletRepo.findByRiderId(RIDER_ID);
    expect(riderWallet?.balancePaise).toBe(-5000);
    expect(riderWallet?.owedPaise).toBe(5000);
    await assertWalletConservation(riderWallet!.id, 0);
    await assertWalletConservation('018f0a00-0000-7000-8000-000000000301', 250_000);
  });

  it('blocks cash at the arrears threshold and settles full arrears via UPI', async () => {
    const { app, login, rideRepo, rideEventRepo, walletRepo, unitOfWork, assertWalletConservation } =
      await setup();
    const riderAuth = await login(RIDER_USER, 'RIDER');
    const driverAuth = await login(DRIVER_USER, 'DRIVER');

    // 1. Incur ₹50 late cancellation fee on Ride 1
    const q1Res = await request(app)
      .post('/api/v1/pricing/quotes')
      .set('Authorization', riderAuth)
      .send({ pickup, drop, vehicleCategory: 'CAB' });
    const q1 = q1Res.body.data;
    const r1Res = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', riderAuth)
      .send({
        quoteToken: q1.quoteToken,
        proposedFarePaise: q1.suggestedFarePaise,
        passenger: { name: 'Asha', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup,
        drop,
      });
    const ride1Id = r1Res.body.data.id as string;
    await request(app)
      .post(`/api/v1/rides/${ride1Id}/accept`)
      .set('Authorization', driverAuth)
      .expect(200);
    const ride1Entity = (await rideRepo.findById(ride1Id))!;
    ride1Entity.acceptedAt = new Date(Date.now() - 180_000);
    await rideRepo.save(ride1Entity);
    await request(app)
      .post(`/api/v1/rides/${ride1Id}/cancel`)
      .set('Authorization', riderAuth)
      .send({ reason: 'RIDER_CHANGED_MIND' })
      .expect(200);

    // 2. Unauthenticated quote has no arrears; the rider's arrears block cash.
    const unauthQuoteRes = await request(app)
      .post('/api/v1/pricing/quotes')
      .send({ pickup, drop, vehicleCategory: 'CAB' });
    expect(unauthQuoteRes.status).toBe(200);
    expect(unauthQuoteRes.body.data.arrearsPaise).toBe(0);
    expect(unauthQuoteRes.body.data.cashAllowed).toBe(true);

    const authQuoteRes = await request(app)
      .post('/api/v1/pricing/quotes')
      .set('Authorization', riderAuth)
      .send({ pickup, drop, vehicleCategory: 'CAB' });
    expect(authQuoteRes.status).toBe(200);
    const q2 = authQuoteRes.body.data;
    expect(q2.arrearsPaise).toBe(5000);
    expect(q2.totalEstimatedPayablePaise).toBe(q2.suggestedFarePaise + 5000);
    expect(q2.cashAllowed).toBe(false);

    await request(app)
      .post('/api/v1/rides')
      .set('Authorization', riderAuth)
      .send({
        quoteToken: q2.quoteToken,
        proposedFarePaise: q2.suggestedFarePaise,
        passenger: { name: 'Asha', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup,
        drop,
        paymentMethod: 'CASH',
      })
      .expect(409);

    // 3. Create Ride 2, progress to PAYMENT_PENDING
    const r2Res = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', riderAuth)
      .send({
        quoteToken: q2.quoteToken,
        proposedFarePaise: q2.suggestedFarePaise,
        passenger: { name: 'Asha', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup,
        drop,
      });
    expect(r2Res.status).toBe(201);
    expect(r2Res.body.data.arrearsPaise).toBe(5000);
    expect(r2Res.body.data.totalPayablePaise).toBe(q2.suggestedFarePaise + 5000);
    const ride2Id = r2Res.body.data.id as string;

    await request(app)
      .post(`/api/v1/rides/${ride2Id}/accept`)
      .set('Authorization', driverAuth)
      .expect(200);
    const getRideRes = await request(app)
      .get(`/api/v1/rides/${ride2Id}`)
      .set('Authorization', riderAuth)
      .expect(200);
    const otp = getRideRes.body.data.pickupOtp as string;

    await request(app)
      .post(`/api/v1/rides/${ride2Id}/en-route`)
      .set('Authorization', driverAuth)
      .expect(200);
    await request(app)
      .post(`/api/v1/rides/${ride2Id}/arrived`)
      .set('Authorization', driverAuth)
      .expect(200);
    await request(app)
      .post(`/api/v1/rides/${ride2Id}/start`)
      .set('Authorization', driverAuth)
      .send({ otp })
      .expect(200);
    await request(app)
      .post(`/api/v1/rides/${ride2Id}/complete`)
      .set('Authorization', driverAuth)
      .expect(200);

    await request(app)
      .post(`/api/v1/rides/${ride2Id}/payment/cash`)
      .set('Authorization', riderAuth)
      .expect(409);
    await request(app)
      .post(`/api/v1/rides/${ride2Id}/payment/claim-cash`)
      .set('Authorization', riderAuth)
      .expect(409);
    await request(app)
      .post(`/api/v1/rides/${ride2Id}/payment/confirm`)
      .set('Authorization', driverAuth)
      .expect(409);

    // 4. Settle Ride 2 via UPI -> captures agreedFare + 5000, settles rider arrears once, keeps commission strictly on agreedFare
    const agreedFare = q2.suggestedFarePaise as number;
    const expectedTotal = agreedFare + 5000;
    const upiUseCase = new RideUpiPaymentUseCase({
      unitOfWork,
      rideRepo,
      rideEventRepo,
      walletRepo,
      gateway: {
        live: false,
        keyId: 'rzp_test_123',
        createOrder: async () => 'order_httpstep3',
        verifySignature: () => {},
        findCapturedPayment: async (_orderId, amountPaise) =>
          amountPaise === expectedTotal ? 'pay_httpstep3' : null,
        createQr: async () => {
          throw new Error('unused');
        },
        findQrPayment: async () => null,
        closeQrForCash: async () => {},
      },
    });
    const session = await upiUseCase.session(ride2Id, RIDER_ID);
    expect(session.kind).toBe('checkout');
    if (session.kind === 'checkout') {
      expect(session.checkout.amountPaise).toBe(expectedTotal);
    }
    const settled = await upiUseCase.reconcile(ride2Id, RIDER_ID);
    expect(settled.status).toBe('SETTLED');

    const riderWallet = await walletRepo.findByRiderId(RIDER_ID);
    expect(riderWallet?.balancePaise).toBe(0);
    expect(riderWallet?.owedPaise).toBe(0);
    await assertWalletConservation(riderWallet!.id, 0);

    const driverWallet = await walletRepo.findByDriverId(DRIVER_ID);
    const expectedCommission = Math.round((agreedFare * 8) / 100);
    // Single wallet: net online earnings are one ledger credit inside the main balance.
    const driverTxs = await walletRepo.findTransactionsByWalletId(driverWallet!.id);
    expect(
      driverTxs.find((tx) => tx.referenceType === 'ONLINE_RIDE_EARNINGS')?.amountPaise,
    ).toBe(agreedFare - expectedCommission);
    expect(driverWallet?.earningsBalancePaise ?? 0).toBe(0);
    await assertWalletConservation(driverWallet!.id, 250_000);
  });

  it('recovers partial arrears (< threshold) via direct cash confirmPayment, debits driver once, and reverses on RIDER_WINS dispute', async () => {
    const { app, login, rideRepo, walletRepo, assertWalletConservation } = await setup();
    const riderAuth = await login(RIDER_USER, 'RIDER');
    const driverAuth = await login(DRIVER_USER, 'DRIVER');
    const financeAuth = await login(FINANCE_ADMIN_USER, 'FINANCE_ADMIN');
    const supportAuth = await login(SUPPORT_ADMIN_USER, 'SUPPORT_ADMIN');

    // 1. Incur ₹50 late cancellation fee, then apply ₹20 partial credit via POST /api/v1/admin/wallets/adjust -> ₹30 unpaid arrears (< ₹50 threshold)
    const q1 = (
      await request(app)
        .post('/api/v1/pricing/quotes')
        .set('Authorization', riderAuth)
        .send({ pickup, drop, vehicleCategory: 'CAB' })
    ).body.data;
    const r1Id = (
      await request(app)
        .post('/api/v1/rides')
        .set('Authorization', riderAuth)
        .send({
          quoteToken: q1.quoteToken,
          proposedFarePaise: q1.suggestedFarePaise,
          passenger: { name: 'Asha', phoneE164: '+919876543210' },
          vehicleCategory: 'CAB',
          pickup,
          drop,
        })
    ).body.data.id as string;
    await request(app).post(`/api/v1/rides/${r1Id}/accept`).set('Authorization', driverAuth).expect(200);
    const r1Entity = (await rideRepo.findById(r1Id))!;
    r1Entity.acceptedAt = new Date(Date.now() - 180_000);
    await rideRepo.save(r1Entity);
    await request(app)
      .post(`/api/v1/rides/${r1Id}/cancel`)
      .set('Authorization', riderAuth)
      .send({ reason: 'RIDER_CHANGED_MIND' })
      .expect(200);

    const adjustRes = await request(app)
      .post('/api/v1/admin/wallets/adjustments')
      .set('Authorization', financeAuth)
      .send({
        riderId: RIDER_ID,
        ownerType: 'RIDER',
        amountPaise: 2000,
        type: 'CREDIT',
        reason: 'Partial goodwill adjustment',
        idempotencyKey: 'goodwill_2000_http',
      });
    expect(adjustRes.status).toBe(201);

    // 2. Next quote allows cash (3000 < 5000); rider books with paymentMethod = CASH
    const q2 = (
      await request(app)
        .post('/api/v1/pricing/quotes')
        .set('Authorization', riderAuth)
        .send({ pickup, drop, vehicleCategory: 'CAB' })
    ).body.data;
    expect(q2.arrearsPaise).toBe(3000);
    expect(q2.cashAllowed).toBe(true);

    const r2Res = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', riderAuth)
      .send({
        quoteToken: q2.quoteToken,
        proposedFarePaise: q2.suggestedFarePaise,
        passenger: { name: 'Asha', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup,
        drop,
        paymentMethod: 'CASH',
      });
    expect(r2Res.status).toBe(201);
    expect(r2Res.body.data.arrearsPaise).toBe(3000);
    expect(r2Res.body.data.totalPayablePaise).toBe(q2.suggestedFarePaise + 3000);
    const ride2Id = r2Res.body.data.id as string;

    await request(app).post(`/api/v1/rides/${ride2Id}/accept`).set('Authorization', driverAuth).expect(200);
    const otp = (
      await request(app).get(`/api/v1/rides/${ride2Id}`).set('Authorization', riderAuth).expect(200)
    ).body.data.pickupOtp as string;
    await request(app).post(`/api/v1/rides/${ride2Id}/en-route`).set('Authorization', driverAuth).expect(200);
    await request(app).post(`/api/v1/rides/${ride2Id}/arrived`).set('Authorization', driverAuth).expect(200);
    await request(app)
      .post(`/api/v1/rides/${ride2Id}/start`)
      .set('Authorization', driverAuth)
      .send({ otp })
      .expect(200);
    await request(app).post(`/api/v1/rides/${ride2Id}/complete`).set('Authorization', driverAuth).expect(200);

    // 3. Driver confirms cash receipt (+ duplicate replay)
    const driverBefore = (await walletRepo.findByDriverId(DRIVER_ID))!.balancePaise;
    const confirm1 = await request(app)
      .post(`/api/v1/rides/${ride2Id}/payment/confirm`)
      .set('Authorization', driverAuth);
    const confirm2 = await request(app)
      .post(`/api/v1/rides/${ride2Id}/payment/confirm`)
      .set('Authorization', driverAuth);
    expect(confirm1.status).toBe(200);
    expect(confirm2.status).toBe(200);

    const expectedCommission = Math.round(((q2.suggestedFarePaise as number) * 8) / 100);
    expect(confirm1.body.data.arrearsCollectedPaise).toBe(3000);
    expect(confirm1.body.data.totalPayablePaise).toBe((q2.suggestedFarePaise as number) + 3000);
    expect(confirm1.body.data.walletBalancePaise).toBe(driverBefore - expectedCommission - 3000);
    expect(confirm2.body.data.walletBalancePaise).toBe(driverBefore - expectedCommission - 3000);

    expect((await walletRepo.findByRiderId(RIDER_ID))?.balancePaise).toBe(0);

    // 4. Rider disputes & support resolves RIDER_WINS -> driver refunded commission + collected arrears, rider arrears reinstated
    await request(app)
      .post(`/api/v1/rides/${ride2Id}/payment/dispute`)
      .set('Authorization', riderAuth)
      .send({ reason: 'Driver collected wrong cash amount' })
      .expect(200);
    await request(app)
      .post(`/api/v1/rides/${ride2Id}/payment/dispute/resolve`)
      .set('Authorization', supportAuth)
      .send({ outcome: 'RIDER_WINS', reason: 'Verified cash collection discrepancy' })
      .expect(200);

    // The outcome and timestamps stay on the ride after it returns to SETTLED, so the trust score
    // can count the dispute against the driver (D-048).
    const resolvedRide = (await rideRepo.findById(ride2Id))!;
    expect(resolvedRide.status).toBe('SETTLED');
    expect(resolvedRide.disputeOutcome).toBe('RIDER_WINS');
    expect(resolvedRide.disputedAt).toBeInstanceOf(Date);
    expect(resolvedRide.disputeResolvedAt).toBeInstanceOf(Date);

    expect((await walletRepo.findByDriverId(DRIVER_ID))?.balancePaise).toBe(driverBefore);
    const riderWallet = await walletRepo.findByRiderId(RIDER_ID);
    expect(riderWallet?.balancePaise).toBe(-3000);
    expect(riderWallet?.owedPaise).toBe(3000);

    await assertWalletConservation(riderWallet!.id, 0);
    await assertWalletConservation('018f0a00-0000-7000-8000-000000000301', 250_000);
  });

  it('enforces RBAC and idempotency on POST /api/v1/rides/:id/cancellation-fee/waive while preserving historical ledger entries', async () => {
    const { app, login, rideRepo, walletRepo, assertWalletConservation } = await setup();
    const riderAuth = await login(RIDER_USER, 'RIDER');
    const driverAuth = await login(DRIVER_USER, 'DRIVER');
    const cityAdminAuth = await login(CITY_ADMIN_USER, 'CITY_ADMIN');
    const supportAdminAuth = await login(SUPPORT_ADMIN_USER, 'SUPPORT_ADMIN');

    // Create & late-cancel ride -> ₹50 arrears
    const q1 = (
      await request(app)
        .post('/api/v1/pricing/quotes')
        .set('Authorization', riderAuth)
        .send({ pickup, drop, vehicleCategory: 'CAB' })
    ).body.data;
    const rideId = (
      await request(app)
        .post('/api/v1/rides')
        .set('Authorization', riderAuth)
        .send({
          quoteToken: q1.quoteToken,
          proposedFarePaise: q1.suggestedFarePaise,
          passenger: { name: 'Asha', phoneE164: '+919876543210' },
          vehicleCategory: 'CAB',
          pickup,
          drop,
        })
    ).body.data.id as string;
    await request(app).post(`/api/v1/rides/${rideId}/accept`).set('Authorization', driverAuth).expect(200);
    const rideEntity = (await rideRepo.findById(rideId))!;
    rideEntity.acceptedAt = new Date(Date.now() - 180_000);
    await rideRepo.save(rideEntity);
    await request(app)
      .post(`/api/v1/rides/${rideId}/cancel`)
      .set('Authorization', riderAuth)
      .send({ reason: 'RIDER_CHANGED_MIND' })
      .expect(200);

    // RIDER, DRIVER, and CITY_ADMIN cannot waive cancellation fees (403)
    for (const forbiddenAuth of [riderAuth, driverAuth, cityAdminAuth]) {
      const res = await request(app)
        .post(`/api/v1/rides/${rideId}/cancellation-fee/waive`)
        .set('Authorization', forbiddenAuth)
        .send({ reason: 'Unauthorized attempt' });
      expect(res.status).toBe(403);
    }

    // SUPPORT_ADMIN waives fee -> compensating RIDER_REFUND credit appended; duplicate call replays idempotently
    const w1 = await request(app)
      .post(`/api/v1/rides/${rideId}/cancellation-fee/waive`)
      .set('Authorization', supportAdminAuth)
      .send({ reason: 'Driver drove away from pickup' });
    const w2 = await request(app)
      .post(`/api/v1/rides/${rideId}/cancellation-fee/waive`)
      .set('Authorization', supportAdminAuth)
      .send({ reason: 'Driver drove away from pickup' });
    expect(w1.status).toBe(200);
    expect(w2.status).toBe(200);
    expect(w1.body.data.waivedPaise).toBe(5000);
    expect(w1.body.data.riderArrearsPaise).toBe(0);
    expect(w2.body.data.riderWalletBalancePaise).toBe(0);

    // Historical CANCELLATION_FEE_ARREARS debit is preserved alongside compensating RIDER_REFUND credit
    const riderWallet = (await walletRepo.findByRiderId(RIDER_ID))!;
    const { items } = await walletRepo.listTransactions({ walletId: riderWallet.id, limit: 20 });
    expect(items).toHaveLength(2);
    expect(items.map((tx) => tx.referenceType).sort()).toEqual([
      'CANCELLATION_FEE_ARREARS',
      'RIDER_REFUND',
    ]);
    await assertWalletConservation(riderWallet.id, 0);
  });

  it('unblocks both driver and rider on pending payment: claim-cash (max 1 cap), mark-unpaid (0 commission), and UPI recovery', async () => {
    const { app, login, rideRepo, rideEventRepo, walletRepo, unitOfWork } = await setup();
    const riderAuth = await login(RIDER_USER, 'RIDER');
    const otherRiderAuth = await login(OTHER_RIDER_USER, 'RIDER');
    const driverAuth = await login(DRIVER_USER, 'DRIVER');

    const progressToPaymentPending = async (rAuth: string, paymentMethod?: 'CASH' | 'UPI') => {
      const q = (
        await request(app)
          .post('/api/v1/pricing/quotes')
          .set('Authorization', rAuth)
          .send({ pickup, drop, vehicleCategory: 'CAB' })
      ).body.data;
      const createRes = await request(app)
        .post('/api/v1/rides')
        .set('Authorization', rAuth)
        .send({
          quoteToken: q.quoteToken,
          proposedFarePaise: q.suggestedFarePaise,
          passenger: { name: 'Asha', phoneE164: '+919876543210' },
          vehicleCategory: 'CAB',
          pickup,
          drop,
          ...(paymentMethod ? { paymentMethod } : {}),
        });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id as string;
      await request(app).post(`/api/v1/rides/${id}/accept`).set('Authorization', driverAuth).expect(200);
      const otp = (
        await request(app).get(`/api/v1/rides/${id}`).set('Authorization', rAuth).expect(200)
      ).body.data.pickupOtp as string;
      await request(app).post(`/api/v1/rides/${id}/en-route`).set('Authorization', driverAuth).expect(200);
      await request(app).post(`/api/v1/rides/${id}/arrived`).set('Authorization', driverAuth).expect(200);
      await request(app)
        .post(`/api/v1/rides/${id}/start`)
        .set('Authorization', driverAuth)
        .send({ otp })
        .expect(200);
      await request(app).post(`/api/v1/rides/${id}/complete`).set('Authorization', driverAuth).expect(200);
      return { id, quote: q };
    };

    // 1. Complete Ride A -> PAYMENT_PENDING; driver is NOT blocked from accepting another rider's ride!
    const rideA = await progressToPaymentPending(riderAuth);
    const qOther = (
      await request(app)
        .post('/api/v1/pricing/quotes')
        .set('Authorization', otherRiderAuth)
        .send({ pickup, drop, vehicleCategory: 'CAB' })
    ).body.data;
    const otherRideId = (
      await request(app)
        .post('/api/v1/rides')
        .set('Authorization', otherRiderAuth)
        .send({
          quoteToken: qOther.quoteToken,
          proposedFarePaise: qOther.suggestedFarePaise,
          passenger: { name: 'Rohan', phoneE164: '+919876543211' },
          vehicleCategory: 'CAB',
          pickup,
          drop,
        })
    ).body.data.id as string;
    await request(app).post(`/api/v1/rides/${otherRideId}/accept`).set('Authorization', driverAuth).expect(200);
    await request(app)
      .post(`/api/v1/rides/${otherRideId}/cancel`)
      .set('Authorization', otherRiderAuth)
      .send({ reason: 'RIDER_CHANGED_MIND' })
      .expect(200);

    // 2. Rider claims cash paid on Ride A -> PAYMENT_CASH_CLAIMED -> unblocks Ride B immediately!
    const claimRes = await request(app)
      .post(`/api/v1/rides/${rideA.id}/payment/claim-cash`)
      .set('Authorization', riderAuth);
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.status).toBe('PAYMENT_CASH_CLAIMED');

    // 3. Complete Ride B while Ride A is still PAYMENT_CASH_CLAIMED -> 2nd cash claim hits 409 CASH_CLAIM_LIMIT_REACHED
    const rideB = await progressToPaymentPending(riderAuth);
    const secondClaim = await request(app)
      .post(`/api/v1/rides/${rideB.id}/payment/claim-cash`)
      .set('Authorization', riderAuth);
    expect(secondClaim.status).toBe(409);
    expect(secondClaim.body.details?.code ?? secondClaim.body.message).toContain(
      'CASH_CLAIM_LIMIT_REACHED',
    );

    // 4. Driver marks Ride A (which was PAYMENT_CASH_CLAIMED) unpaid -> auto-escalates to PAYMENT_DISPUTED with ₹0 commission
    const driverBefore = (await walletRepo.findByDriverId(DRIVER_ID))!.balancePaise;
    const unpaidClaimed = await request(app)
      .post(`/api/v1/rides/${rideA.id}/payment/unpaid`)
      .set('Authorization', driverAuth);
    expect(unpaidClaimed.status).toBe(200);
    expect(unpaidClaimed.body.data.status).toBe('PAYMENT_DISPUTED');
    expect((await walletRepo.findByDriverId(DRIVER_ID))!.balancePaise).toBe(driverBefore);

    // 5. Driver marks Ride B (PAYMENT_PENDING) unpaid -> PAYMENT_UNPAID with ₹0 commission; blocks rider's next booking until UPI settles
    const unpaidPending = await request(app)
      .post(`/api/v1/rides/${rideB.id}/payment/unpaid`)
      .set('Authorization', driverAuth);
    expect(unpaidPending.status).toBe(200);
    expect(unpaidPending.body.data.status).toBe('PAYMENT_UNPAID');
    expect((await walletRepo.findByDriverId(DRIVER_ID))!.balancePaise).toBe(driverBefore);

    const qBlocked = (
      await request(app)
        .post('/api/v1/pricing/quotes')
        .set('Authorization', riderAuth)
        .send({ pickup, drop, vehicleCategory: 'CAB' })
    ).body.data;
    const blockedCreate = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', riderAuth)
      .send({
        quoteToken: qBlocked.quoteToken,
        proposedFarePaise: qBlocked.suggestedFarePaise,
        passenger: { name: 'Asha', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup,
        drop,
      });
    expect(blockedCreate.status).toBe(409);

    // Rider pays Ride B via UPI even from PAYMENT_UNPAID -> settles and credits driver!
    const expectedFare = rideB.quote.suggestedFarePaise as number;
    const upiUseCase = new RideUpiPaymentUseCase({
      unitOfWork,
      rideRepo,
      rideEventRepo,
      walletRepo,
      gateway: {
        live: false,
        keyId: 'rzp_test_123',
        createOrder: async () => 'order_unpaid_recover',
        verifySignature: () => {},
        findCapturedPayment: async (_orderId, amountPaise) =>
          amountPaise === expectedFare ? 'pay_unpaid_recover' : null,
        createQr: async () => {
          throw new Error('unused');
        },
        findQrPayment: async () => null,
        closeQrForCash: async () => {},
      },
    });
    await upiUseCase.session(rideB.id, RIDER_ID);
    const settledFromUnpaid = await upiUseCase.reconcile(rideB.id, RIDER_ID);
    expect(settledFromUnpaid.status).toBe('SETTLED');
  });
});
