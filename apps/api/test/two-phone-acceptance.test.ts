import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Router } from 'express';
import QRCode from 'qrcode';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { AuthRole, RideStatus, RideUpiIntentDto } from '@cabzone/contracts';
import { createApp } from '../src/app.js';
import { buildDispatchContainer } from '../src/modules/dispatch/dispatch.container.js';
import { MemoryPresenceRepository } from '../src/modules/dispatch/infrastructure/memoryPresence.repository.js';
import type { SessionEntity, SessionRepositoryPort } from '../src/modules/identity/domain/index.js';
import type { IdentityContainer } from '../src/modules/identity/identity.container.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  makeTokenVerifier,
  requireRole,
} from '../src/modules/identity/interface/middlewares/index.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import { MemoryWalletOperationRepository } from '../src/modules/ledger/infrastructure/persistence/walletOperation.repository.js';
import { buildLedgerContainer } from '../src/modules/ledger/ledger.container.js';
import {
  CreateQuoteUseCase,
  MemoryPricingConfigRepository,
  type PricingConfigEntity,
} from '../src/modules/pricing/index.js';
import type { RidePaymentGateway } from '../src/modules/rides/domain/ridePayment.port.js';
import { MemoryRideEventRepository, MemoryRideRepository } from '../src/modules/rides/index.js';
import { buildRidesContainer } from '../src/modules/rides/rides.container.js';
import {
  MemoryZoneRepository,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../src/modules/zone/index.js';
import { RealtimeHub } from '../src/shared/realtime/index.js';
import { unitOfWork } from './helpers/unitOfWork.js';

const JWT_SECRET = 'two-phone-acceptance-jwt-secret-at-least-32-chars!';
const QUOTE_SECRET = 'two-phone-acceptance-quote-secret-32-chars!';
const WEBHOOK_SECRET = 'two-phone-acceptance-webhook-secret';
const GATEWAY_SECRET = 'two-phone-acceptance-rzp-secret';
const CITY_ZONE_ID = '018f0a00-0000-7000-8000-000000000001';
const CONFIG_ID = '018f0a00-0000-7000-8000-000000000010';

const id = (n: number) => `018f0a00-0000-7000-8000-${String(n).padStart(12, '0')}`;

const RIDER_1_USER = id(0xa1);
const RIDER_1_ID = id(0x201);
const RIDER_2_USER = id(0xa2);
const RIDER_2_ID = id(0x202);
const DRIVER_1_USER = id(0xb1);
const DRIVER_1_ID = id(0x101);
const DRIVER_1_WALLET_ID = id(0x301);
const ADMIN_USER = id(0xc1);

const pickup = { lat: 26.712, lng: 88.421, address: 'City Centre, Siliguri' };
const drop = { lat: 26.745, lng: 88.442, address: 'Sevoke Road, Siliguri' };

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
  createdByAdminId: ADMIN_USER,
  createdAt: new Date(),
};

class MemorySessionRepository implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();
  async findById(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
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

class WsProbe {
  readonly messages: Array<{ event: string; data: Record<string, unknown> }> = [];
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (raw) => this.messages.push(JSON.parse(raw.toString())));
  }

  static async connect(url: string, token: string): Promise<WsProbe> {
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
    const probe = new WsProbe(ws);
    await probe.waitFor('connection.ready');
    return probe;
  }

  async waitFor(
    event: string,
    predicate: (data: Record<string, unknown>) => boolean = () => true,
    timeoutMs = 1500,
  ): Promise<Record<string, unknown>> {
    const started = Date.now();
    for (;;) {
      const hit = this.messages.find((m) => m.event === event && predicate(m.data ?? {}));
      if (hit) return hit.data;
      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `Timed out waiting for WS event "${event}" (received: ${this.messages.map((m) => m.event).join(', ')})`,
        );
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  clear() {
    this.messages.splice(0);
  }
}

const openSockets: WebSocket[] = [];
const openServers: Array<{ close: () => void }> = [];

afterEach(() => {
  vi.restoreAllMocks();
  openSockets.splice(0).forEach((s) => s.terminate());
  openServers.splice(0).forEach((s) => s.close());
});

async function setupTwoPhoneHarness() {
  const sessionRepo = new MemorySessionRepository();
  const tokenAdapter = new JoseTokenAdapter(JWT_SECRET);
  const verifyToken = makeTokenVerifier({ tokenVerifier: tokenAdapter, sessionRepo });
  const identity: IdentityContainer = {
    requireAdminScope: () => requireRole('SUPER_ADMIN'),
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
    authenticate: makeAuthenticate({ tokenVerifier: tokenAdapter, sessionRepo }),
    verifyToken,
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
  const rideEventRepo = new MemoryRideEventRepository();
  const walletRepo = new MemoryWalletRepository();
  const walletOperations = new MemoryWalletOperationRepository();

  await walletRepo.save({
    id: DRIVER_1_WALLET_ID,
    driverId: DRIVER_1_ID,
    balancePaise: 25_000,
    earningsBalancePaise: 0,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  let orderSeq = 0;
  let failNextOrder = false;
  const capturedPaymentsByOrder = new Map<string, { paymentId: string; amountPaise: number }>();

  const signProof = (orderId: string, paymentId: string) =>
    createHmac('sha256', GATEWAY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

  const paymentGateway: RidePaymentGateway = {
    live: false,
    keyId: 'rzp_test_twophone',
    createOrder: vi.fn(async () => {
      if (failNextOrder) {
        failNextOrder = false;
        throw new Error('Razorpay temporarily unreachable');
      }
      orderSeq += 1;
      return `order_twophone${orderSeq}`;
    }),
    createQr: vi.fn(async (): Promise<RideUpiIntentDto> => {
      throw new Error('Live mode QR is disabled in test mode');
    }),
    findQrPayment: vi.fn(async () => null),
    closeQrForCash: vi.fn(async () => {}),
    verifySignature: vi.fn((orderId: string, paymentId: string, signature: string) => {
      if (signProof(orderId, paymentId) !== signature) {
        throw new Error('Payment signature is invalid.');
      }
    }),
    findCapturedPayment: vi.fn(async (orderId: string, amountPaise: number) => {
      const captured = capturedPaymentsByOrder.get(orderId);
      if (!captured || captured.amountPaise !== amountPaise) return null;
      return captured.paymentId;
    }),
  };

  let driverEligible = true;
  const hub = new RealtimeHub();
  const dispatch = buildDispatchContainer({
    presence: new MemoryPresenceRepository(),
    publisher: hub,
    rideRepo,
    walletRepo,
    lookups: {
      getDriverProfileByUserId: async (userId) => {
        if (userId !== DRIVER_1_USER) return null;
        return {
          driverId: DRIVER_1_ID,
          userId: DRIVER_1_USER,
          eligibleToGoOnline: driverEligible,
          ineligibleReason: driverEligible ? undefined : 'KYC renewal pending',
          vehicleCategory: 'CAB',
        };
      },
      getUserIdForRider: async (riderId) => {
        if (riderId === RIDER_1_ID) return RIDER_1_USER;
        if (riderId === RIDER_2_ID) return RIDER_2_USER;
        return null;
      },
      getUserIdForDriver: async (driverId) => (driverId === DRIVER_1_ID ? DRIVER_1_USER : null),
    },
  });

  const rides = buildRidesContainer({
    requireDriverEligibility: async () => {
      if (!driverEligible) throw new Error('Driver KYC restricted');
      return 'veh-twophone-1';
    },
    unitOfWork,
    rideRepo,
    rideEventRepo,
    walletRepo,
    pricingConfigRepo,
    tokenSecret: QUOTE_SECRET,
    resolveRiderId: async (userId) => {
      if (userId === RIDER_1_USER) return RIDER_1_ID;
      if (userId === RIDER_2_USER) return RIDER_2_ID;
      return null;
    },
    resolveDriverId: async (userId) => (userId === DRIVER_1_USER ? DRIVER_1_ID : null),
    notifier: dispatch.notifier,
    pickupOtpSecret: 'two-phone-otp-secret',
    paymentGateway,
    webhookSecret: WEBHOOK_SECRET,
  });

  const ledger = buildLedgerContainer({
    unitOfWork,
    walletRepo,
    walletOperations,
    walletPaymentGateway: {
      live: false,
      keyId: 'rzp_test_twophone',
      createOrder: paymentGateway.createOrder,
      findCapturedPayment: paymentGateway.findCapturedPayment,
    },
    resolveDriverId: async (userId) => (userId === DRIVER_1_USER ? DRIVER_1_ID : null),
  });

  const app = createApp({ identity, rides, dispatch, ledger });
  const server = app.listen(0);
  hub.attach(server, verifyToken);
  openServers.push({
    close: () => {
      hub.close();
      server.close();
    },
  });
  const wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;

  async function login(userId: string, role: AuthRole) {
    const sessionId = crypto.randomUUID();
    await sessionRepo.save({
      id: sessionId,
      userId,
      deviceId: `device-${role.toLowerCase()}`,
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    return tokenAdapter.signAccessToken({ sub: userId, role, sessionId });
  }

  async function connectPhone(token: string) {
    const probe = await WsProbe.connect(wsUrl, token);
    openSockets.push(probe.ws);
    return probe;
  }

  const rider1Token = await login(RIDER_1_USER, 'RIDER');
  const rider2Token = await login(RIDER_2_USER, 'RIDER');
  const driverToken = await login(DRIVER_1_USER, 'DRIVER');
  const adminToken = await login(ADMIN_USER, 'SUPER_ADMIN');
  const bearer = (t: string) => `Bearer ${t}`;

  async function bookRide(token = rider1Token) {
    const quote = await quoteUseCase.execute({
      pickup,
      drop,
      vehicleCategory: 'CAB',
      distanceM: 6000,
      durationSeconds: 900,
    });
    const res = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', bearer(token))
      .send({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.suggestedFarePaise,
        passenger: { name: 'Ananya Sen', phoneE164: '+919876543210' },
        vehicleCategory: 'CAB',
        pickup,
        drop,
      });
    expect(res.status).toBe(201);
    return res.body.data as {
      id: string;
      status: RideStatus;
      suggestedFarePaise: number;
      proposedFarePaise: number;
    };
  }

  async function assertRelaunchConsistent(rideId: string, expectedStatus: RideStatus) {
    const [riderList, riderDetail, driverList, driverDetail] = await Promise.all([
      request(app).get('/api/v1/rides').set('Authorization', bearer(rider1Token)),
      request(app).get(`/api/v1/rides/${rideId}`).set('Authorization', bearer(rider1Token)),
      request(app).get('/api/v1/rides').set('Authorization', bearer(driverToken)),
      request(app).get(`/api/v1/rides/${rideId}`).set('Authorization', bearer(driverToken)),
    ]);
    expect(riderList.status).toBe(200);
    expect(riderDetail.status).toBe(200);
    expect(riderDetail.body.data.status).toBe(expectedStatus);
    expect(
      (riderList.body.data as Array<{ id: string; status: RideStatus }>).find(
        (r) => r.id === rideId,
      )?.status,
    ).toBe(expectedStatus);

    if (expectedStatus === 'OFFERING') {
      expect(driverDetail.status).toBe(404);
    } else {
      expect(driverList.status).toBe(200);
      expect(driverDetail.status).toBe(200);
      expect(driverDetail.body.data.status).toBe(expectedStatus);
      expect(driverDetail.body.data.pickupOtp).toBeUndefined();
      expect(
        (driverList.body.data as Array<{ id: string; status: RideStatus }>).find(
          (r) => r.id === rideId,
        )?.status,
      ).toBe(expectedStatus);
    }
  }

  return {
    app,
    bearer,
    rider1Token,
    rider2Token,
    driverToken,
    adminToken,
    rideRepo,
    walletRepo,
    rideEventRepo,
    paymentGateway,
    connectPhone,
    bookRide,
    assertRelaunchConsistent,
    signProof,
    captureOrder(orderId: string, paymentId: string, amountPaise: number) {
      capturedPaymentsByOrder.set(orderId, { paymentId, amountPaise });
    },
    setFailNextOrder(value: boolean) {
      failNextOrder = value;
    },
    setDriverEligible(value: boolean) {
      driverEligible = value;
    },
  };
}

describe('Step 7 — Two-Phone Ride & Wallet Acceptance Pass (Rider + Driver + WS + Ledger)', () => {
  it('completes booking -> counter -> OTP -> live GPS -> QR/UPI test checkout -> repeated verify/webhook idempotency with relaunch checks at every stage', async () => {
    const h = await setupTwoPhoneHarness();
    const qrEncodeSpy = vi.spyOn(QRCode, 'toDataURL');

    const riderPhone = await h.connectPhone(h.rider1Token);
    const driverPhone = await h.connectPhone(h.driverToken);

    // 1. Driver goes online near pickup
    const onlineRes = await request(h.app)
      .post('/api/v1/driver/status')
      .set('Authorization', h.bearer(h.driverToken))
      .send({ status: 'ONLINE', lat: 26.713, lng: 88.422 });
    expect(onlineRes.status).toBe(200);

    // 2. Rider books ride -> OFFERING; Driver receives WS offer + relaunch check
    const booked = await h.bookRide();
    expect(booked.status).toBe('OFFERING');
    await driverPhone.waitFor('ride.offer.created', (d) => d.rideId === booked.id);
    await h.assertRelaunchConsistent(booked.id, 'OFFERING');

    const offersRes = await request(h.app)
      .get('/api/v1/driver/offers')
      .set('Authorization', h.bearer(h.driverToken));
    expect(offersRes.body.data.map((o: { rideId: string }) => o.rideId)).toContain(booked.id);

    // 3. Driver sends counter-offer -> Rider receives WS counter & accepts -> DRIVER_ASSIGNED
    const counteredFarePaise = booked.suggestedFarePaise + 1000;
    const counterRes = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/counter`)
      .set('Authorization', h.bearer(h.driverToken))
      .send({ proposedFarePaise: counteredFarePaise });
    expect(counterRes.status).toBe(201);
    await riderPhone.waitFor('ride.fare.countered', (d) => d.rideId === booked.id);

    const acceptCounterRes = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/counter/respond`)
      .set('Authorization', h.bearer(h.rider1Token))
      .send({ driverId: DRIVER_1_ID, action: 'ACCEPTED' });
    expect(acceptCounterRes.status).toBe(200);
    const driverAssignedWs = await driverPhone.waitFor(
      'ride.driver.assigned',
      (d) => d.rideId === booked.id,
    );
    const riderAssignedWs = await riderPhone.waitFor(
      'ride.driver.assigned',
      (d) => d.rideId === booked.id,
    );
    expect(driverAssignedWs.pickupOtp).toBeUndefined();
    expect(riderAssignedWs.pickupOtp).toMatch(/^\d{4}$/);
    await h.assertRelaunchConsistent(booked.id, 'DRIVER_ASSIGNED');

    // Rider receives 4-digit OTP; Driver never sees OTP
    const riderAssignedView = await request(h.app)
      .get(`/api/v1/rides/${booked.id}`)
      .set('Authorization', h.bearer(h.rider1Token));
    const pickupOtp = riderAssignedView.body.data.pickupOtp as string;
    expect(pickupOtp).toMatch(/^\d{4}$/);

    // 4. En-route + live GPS telemetry + Arrived + OTP verification -> TRIP_STARTED
    expect(
      (
        await request(h.app)
          .post(`/api/v1/rides/${booked.id}/en-route`)
          .set('Authorization', h.bearer(h.driverToken))
      ).status,
    ).toBe(200);
    await riderPhone.waitFor('ride.driver.en_route', (d) => d.rideId === booked.id);
    await h.assertRelaunchConsistent(booked.id, 'DRIVER_EN_ROUTE');

    expect(
      (
        await request(h.app)
          .post('/api/v1/driver/location')
          .set('Authorization', h.bearer(h.driverToken))
          .send({ lat: 26.7125, lng: 88.4215 })
      ).status,
    ).toBe(200);
    await riderPhone.waitFor('driver.location.updated', (d) => d.rideId === booked.id);

    expect(
      (
        await request(h.app)
          .post(`/api/v1/rides/${booked.id}/arrived`)
          .set('Authorization', h.bearer(h.driverToken))
      ).status,
    ).toBe(200);
    await riderPhone.waitFor('ride.driver.arrived', (d) => d.rideId === booked.id);
    await h.assertRelaunchConsistent(booked.id, 'DRIVER_ARRIVED');

    // Wrong OTP rejected cleanly
    const wrongOtp = pickupOtp === '0000' ? '9999' : '0000';
    expect(
      (
        await request(h.app)
          .post(`/api/v1/rides/${booked.id}/start`)
          .set('Authorization', h.bearer(h.driverToken))
          .send({ otp: wrongOtp })
      ).status,
    ).toBe(400);

    expect(
      (
        await request(h.app)
          .post(`/api/v1/rides/${booked.id}/start`)
          .set('Authorization', h.bearer(h.driverToken))
          .send({ otp: pickupOtp })
      ).status,
    ).toBe(200);
    await riderPhone.waitFor('ride.started', (d) => d.rideId === booked.id);

    // Mid-trip KYC restriction check: Driver can still read active ride, complete trip & settle
    h.setDriverEligible(false);
    await h.assertRelaunchConsistent(booked.id, 'TRIP_STARTED');

    // 5. Complete trip -> PAYMENT_PENDING; busy driver cannot receive or accept a second ride
    expect(
      (
        await request(h.app)
          .post(`/api/v1/rides/${booked.id}/complete`)
          .set('Authorization', h.bearer(h.driverToken))
      ).status,
    ).toBe(200);
    await riderPhone.waitFor('ride.completed', (d) => d.rideId === booked.id);
    await h.assertRelaunchConsistent(booked.id, 'PAYMENT_PENDING');

    h.setDriverEligible(true);
    const secondRide = await h.bookRide(h.rider2Token);
    const busyOffers = await request(h.app)
      .get('/api/v1/driver/offers')
      .set('Authorization', h.bearer(h.driverToken));
    expect(busyOffers.body.data).toEqual([]);
    expect(
      (
        await request(h.app)
          .post(`/api/v1/rides/${secondRide.id}/accept`)
          .set('Authorization', h.bearer(h.driverToken))
      ).status,
    ).toBe(409);
    expect(
      (
        await request(h.app)
          .post(`/api/v1/rides/${secondRide.id}/counter`)
          .set('Authorization', h.bearer(h.driverToken))
          .send({ proposedFarePaise: secondRide.suggestedFarePaise + 500 })
      ).status,
    ).toBe(409);

    // 6. Driver generates QR & Rider opens UPI session -> single shared Razorpay order
    const driverQrRes = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/payment/upi/qr`)
      .set('Authorization', h.bearer(h.driverToken));
    expect(driverQrRes.status).toBe(200);
    expect(driverQrRes.body.data.imageDataUrl).toMatch(/^data:image\/png;base64,/);

    const qrUrl = new URL(qrEncodeSpy.mock.calls.at(-1)![0] as string);
    const qrTicket = qrUrl.hash.slice(1);
    const scannedSession = await request(h.app)
      .post('/api/v1/rides/payment/upi/checkout/session')
      .send({ ticket: qrTicket });
    expect(scannedSession.status).toBe(200);

    const riderSession = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/payment/upi/session`)
      .set('Authorization', h.bearer(h.rider1Token));
    expect(riderSession.status).toBe(200);
    const orderId = riderSession.body.data.checkout.orderId as string;
    expect(scannedSession.body.data.checkout.orderId).toBe(orderId);
    expect(h.paymentGateway.createOrder).toHaveBeenCalledTimes(1);

    // 7. Forged proof is rejected, and uncaptured payment reports paid: false without settling
    const forgedVerify = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/payment/upi/verify`)
      .set('Authorization', h.bearer(h.rider1Token))
      .send({
        orderId,
        paymentId: 'pay_forged1',
        signature: '0'.repeat(64),
      });
    expect(forgedVerify.status).toBeGreaterThanOrEqual(400);

    const uncapturedVerify = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/payment/upi/verify`)
      .set('Authorization', h.bearer(h.rider1Token))
      .send({
        orderId,
        paymentId: 'pay_uncaptured1',
        signature: h.signProof(orderId, 'pay_uncaptured1'),
      });
    expect(uncapturedVerify.status).toBe(200);
    expect(uncapturedVerify.body.data.paid).toBe(false);
    await h.assertRelaunchConsistent(booked.id, 'PAYMENT_PENDING');

    // 8. Capture succeeds -> QR verify + Rider verify + signed webhook replay settle exactly once
    const paymentId = 'pay_captured1';
    h.captureOrder(orderId, paymentId, counteredFarePaise);

    const [qrVerify, riderVerify] = await Promise.all([
      request(h.app)
        .post('/api/v1/rides/payment/upi/checkout/verify')
        .send({
          ticket: qrTicket,
          orderId,
          paymentId,
          signature: h.signProof(orderId, paymentId),
        }),
      request(h.app)
        .post(`/api/v1/rides/${booked.id}/payment/upi/verify`)
        .set('Authorization', h.bearer(h.rider1Token))
        .send({
          orderId,
          paymentId,
          signature: h.signProof(orderId, paymentId),
        }),
    ]);
    expect(qrVerify.status).toBe(200);
    expect(riderVerify.status).toBe(200);

    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: counteredFarePaise,
            currency: 'INR',
            method: 'upi',
            status: 'captured',
            amount_refunded: 0,
            notes: { rideId: booked.id },
          },
        },
      },
    });
    const webhookSig = createHmac('sha256', WEBHOOK_SECRET).update(webhookBody).digest('hex');
    const webhookRes = await request(h.app)
      .post('/api/v1/rides/payment/upi/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', webhookSig)
      .send(webhookBody);
    expect(webhookRes.status).toBe(200);

    await riderPhone.waitFor('ride.payment.confirmed', (d) => d.rideId === booked.id);
    await driverPhone.waitFor('ride.payment.confirmed', (d) => d.rideId === booked.id);
    await h.assertRelaunchConsistent(booked.id, 'SETTLED');

    const expectedCommission = Math.round(counteredFarePaise * 0.08);
    const expectedNet = counteredFarePaise - expectedCommission;
    const wallet = await h.walletRepo.findByDriverId(DRIVER_1_ID);
    expect(wallet?.balancePaise).toBe(25_000); // Prepaid commission balance untouched on online UPI
    expect(wallet?.earningsBalancePaise).toBe(expectedNet);
    const txs = await h.walletRepo.findTransactionsByWalletId(DRIVER_1_WALLET_ID);
    expect(txs).toHaveLength(1);
    expect(txs[0]?.referenceType).toBe('ONLINE_RIDE_EARNINGS');
    expect(txs[0]?.amountPaise).toBe(expectedNet);
  });

  it('switches payment from UPI to cash, revokes old QR/checkout, settles cash once, and flags late UPI capture as PAYMENT_DISPUTED on both phones', async () => {
    const h = await setupTwoPhoneHarness();
    const qrEncodeSpy = vi.spyOn(QRCode, 'toDataURL');
    const riderPhone = await h.connectPhone(h.rider1Token);
    const driverPhone = await h.connectPhone(h.driverToken);

    await request(h.app)
      .post('/api/v1/driver/status')
      .set('Authorization', h.bearer(h.driverToken))
      .send({ status: 'ONLINE', lat: 26.713, lng: 88.422 });

    const booked = await h.bookRide();
    expect(
      (
        await request(h.app)
          .post(`/api/v1/rides/${booked.id}/accept`)
          .set('Authorization', h.bearer(h.driverToken))
      ).status,
    ).toBe(200);
    const otp = (
      await request(h.app)
        .get(`/api/v1/rides/${booked.id}`)
        .set('Authorization', h.bearer(h.rider1Token))
    ).body.data.pickupOtp as string;

    await request(h.app)
      .post(`/api/v1/rides/${booked.id}/en-route`)
      .set('Authorization', h.bearer(h.driverToken));
    await request(h.app)
      .post(`/api/v1/rides/${booked.id}/arrived`)
      .set('Authorization', h.bearer(h.driverToken));
    await request(h.app)
      .post(`/api/v1/rides/${booked.id}/start`)
      .set('Authorization', h.bearer(h.driverToken))
      .send({ otp });
    await request(h.app)
      .post(`/api/v1/rides/${booked.id}/complete`)
      .set('Authorization', h.bearer(h.driverToken));

    // Open UPI checkout + Driver QR first
    const riderUpi = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/payment/upi/session`)
      .set('Authorization', h.bearer(h.rider1Token));
    const orderId = riderUpi.body.data.checkout.orderId as string;
    await request(h.app)
      .post(`/api/v1/rides/${booked.id}/payment/upi/qr`)
      .set('Authorization', h.bearer(h.driverToken));
    const oldTicket = new URL(qrEncodeSpy.mock.calls.at(-1)![0] as string).hash.slice(1);

    // Direct cash confirmation is blocked before switching to CASH
    expect(
      (
        await request(h.app)
          .post(`/api/v1/rides/${booked.id}/payment/confirm`)
          .set('Authorization', h.bearer(h.driverToken))
      ).status,
    ).toBe(409);

    // Rider switches to CASH -> WS notifies Driver, QR & browser checkout revoked
    const switchRes = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/payment/cash`)
      .set('Authorization', h.bearer(h.rider1Token));
    expect(switchRes.status).toBe(200);
    expect(switchRes.body.data).toMatchObject({ paid: false, method: 'CASH' });
    await driverPhone.waitFor('ride.payment.method.changed', (d) => d.rideId === booked.id);

    expect(
      (
        await request(h.app)
          .post('/api/v1/rides/payment/upi/checkout/session')
          .send({ ticket: oldTicket })
      ).status,
    ).toBe(409);
    const driverQrAfterCash = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/payment/upi/qr`)
      .set('Authorization', h.bearer(h.driverToken));
    expect(driverQrAfterCash.status).toBe(200);
    expect(driverQrAfterCash.body.data).toMatchObject({ paid: false, method: 'CASH' });
    expect(driverQrAfterCash.body.data.imageDataUrl).toBeUndefined();

    // Driver confirms cash receipt (+ duplicate retry) -> single RIDE_COMMISSION debit
    const confirm1 = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/payment/confirm`)
      .set('Authorization', h.bearer(h.driverToken));
    const confirm2 = await request(h.app)
      .post(`/api/v1/rides/${booked.id}/payment/confirm`)
      .set('Authorization', h.bearer(h.driverToken));
    expect(confirm1.status).toBe(200);
    expect(confirm2.status).toBe(200);
    const settledCashView = await request(h.app)
      .get(`/api/v1/rides/${booked.id}`)
      .set('Authorization', h.bearer(h.driverToken));
    expect(settledCashView.body.data.paymentCollection).toBe('CASH');

    const expectedCommission = Math.round(booked.suggestedFarePaise * 0.08);
    expect((await h.walletRepo.findByDriverId(DRIVER_1_ID))?.balancePaise).toBe(
      25_000 - expectedCommission,
    );

    // Late UPI capture arrives after cash confirmation -> transitions to PAYMENT_DISPUTED & notifies WS
    riderPhone.clear();
    driverPhone.clear();
    h.captureOrder(orderId, 'pay_late_after_cash', booked.suggestedFarePaise);
    const lateStatus = await request(h.app)
      .get(`/api/v1/rides/${booked.id}/payment/upi/status`)
      .set('Authorization', h.bearer(h.rider1Token));
    expect(lateStatus.status).toBe(200);

    await riderPhone.waitFor('ride.payment.disputed', (d) => d.rideId === booked.id);
    await driverPhone.waitFor('ride.payment.disputed', (d) => d.rideId === booked.id);
    await h.assertRelaunchConsistent(booked.id, 'PAYMENT_DISPUTED');
    expect((await h.walletRepo.findByDriverId(DRIVER_1_ID))?.earningsBalancePaise ?? 0).toBe(0);
  });

  it('handles cancellations across unassigned OFFERING and post-arrival RIDER_NO_SHOW with idempotent compensation', async () => {
    const h = await setupTwoPhoneHarness();
    const riderPhone = await h.connectPhone(h.rider1Token);
    const driverPhone = await h.connectPhone(h.driverToken);

    await request(h.app)
      .post('/api/v1/driver/status')
      .set('Authorization', h.bearer(h.driverToken))
      .send({ status: 'ONLINE', lat: 26.713, lng: 88.422 });

    // 1. Unassigned OFFERING cancel -> ₹0 fee, offer cleared on Driver phone
    const unassigned = await h.bookRide();
    await driverPhone.waitFor('ride.offer.created', (d) => d.rideId === unassigned.id);

    const cancelOffer = await request(h.app)
      .post(`/api/v1/rides/${unassigned.id}/cancel`)
      .set('Authorization', h.bearer(h.rider1Token))
      .send({ reason: 'RIDER_CHANGED_MIND' });
    const cancelOfferRetry = await request(h.app)
      .post(`/api/v1/rides/${unassigned.id}/cancel`)
      .set('Authorization', h.bearer(h.rider1Token))
      .send({ reason: 'RIDER_CHANGED_MIND' });
    expect(cancelOffer.status).toBe(200);
    expect(cancelOfferRetry.status).toBe(200);
    expect(cancelOffer.body.data.feeBreakdown.totalFeePaise).toBe(0);
    await driverPhone.waitFor('ride.cancelled', (d) => d.rideId === unassigned.id);
    expect(
      (
        await request(h.app)
          .get('/api/v1/driver/offers')
          .set('Authorization', h.bearer(h.driverToken))
      ).body.data,
    ).toEqual([]);

    // 2. Post-arrival RIDER_NO_SHOW cancel -> single CANCELLATION_COMPENSATION credit + Rider WS notified
    const assigned = await h.bookRide();
    await request(h.app)
      .post(`/api/v1/rides/${assigned.id}/accept`)
      .set('Authorization', h.bearer(h.driverToken));
    await request(h.app)
      .post(`/api/v1/rides/${assigned.id}/en-route`)
      .set('Authorization', h.bearer(h.driverToken));
    await request(h.app)
      .post(`/api/v1/rides/${assigned.id}/arrived`)
      .set('Authorization', h.bearer(h.driverToken));

    // Early RIDER_NO_SHOW before 5-min curb wait is rejected; after 5+ mins wait, compensation credits once
    expect(
      (
        await request(h.app)
          .post(`/api/v1/rides/${assigned.id}/cancel`)
          .set('Authorization', h.bearer(h.driverToken))
          .send({ reason: 'RIDER_NO_SHOW' })
      ).status,
    ).toBe(400);
    const arrivedEntity = (await h.rideRepo.findById(assigned.id))!;
    await h.rideRepo.save({
      ...arrivedEntity,
      arrivedAt: new Date(Date.now() - 6 * 60_000),
      version: arrivedEntity.version + 1,
    });

    riderPhone.clear();
    const noShow1 = await request(h.app)
      .post(`/api/v1/rides/${assigned.id}/cancel`)
      .set('Authorization', h.bearer(h.driverToken))
      .send({ reason: 'RIDER_NO_SHOW' });
    const noShow2 = await request(h.app)
      .post(`/api/v1/rides/${assigned.id}/cancel`)
      .set('Authorization', h.bearer(h.driverToken))
      .send({ reason: 'RIDER_NO_SHOW' });
    expect(noShow1.status).toBe(200);
    expect(noShow2.status).toBe(200);
    expect(noShow1.body.data.feeBreakdown.driverCompensationPaise).toBeGreaterThan(0);

    await riderPhone.waitFor('ride.cancelled', (d) => d.rideId === assigned.id);
    await h.assertRelaunchConsistent(assigned.id, 'CANCELLED');

    const txs = await h.walletRepo.findTransactionsByWalletId(DRIVER_1_WALLET_ID);
    const compTxs = txs.filter((tx) => tx.referenceType === 'CANCELLATION_COMPENSATION');
    expect(compTxs).toHaveLength(1);
    expect(compTxs[0]?.amountPaise).toBe(noShow1.body.data.feeBreakdown.driverCompensationPaise);
  });

  it('recovers interrupted wallet recharges and reconciles cashout reservation, admin rejection, and payout via HTTP', async () => {
    const h = await setupTwoPhoneHarness();

    // Seed ₹200 online ride earnings alongside ₹250 initial prepaid balance
    const initialWallet = (await h.walletRepo.findByDriverId(DRIVER_1_ID))!;
    await h.walletRepo.save({
      ...initialWallet,
      balancePaise: 25_000,
      earningsBalancePaise: 20_000,
    });

    // 1. Interrupted recharge order creation -> operation persisted -> resumed via status endpoint
    h.setFailNextOrder(true);
    const failedCreate = await request(h.app)
      .post('/api/v1/driver/wallet/me/recharges')
      .set('Authorization', h.bearer(h.driverToken))
      .send({ amountPaise: 10_000, idempotencyKey: 'recharge-interrupt-01' });
    expect(failedCreate.status).toBe(500);

    const activityAfterFail = await request(h.app)
      .get('/api/v1/driver/wallet/me/activity')
      .set('Authorization', h.bearer(h.driverToken));
    const pendingOpId = activityAfterFail.body.data.operations[0]?.id as string;
    expect(pendingOpId).toBeTruthy();

    const resumed = await request(h.app)
      .post(`/api/v1/driver/wallet/me/recharges/${pendingOpId}/status`)
      .set('Authorization', h.bearer(h.driverToken));
    expect(resumed.status).toBe(200);
    const rechargeTicket = new URL(resumed.body.data.checkoutUrl as string).hash.slice(1);

    // 2. Public browser recharge session + captured status poll (repeated) credits wallet once
    const publicSession = await request(h.app)
      .post('/api/v1/driver/wallet/recharge-checkout/session')
      .send({ ticket: rechargeTicket });
    expect(publicSession.status).toBe(200);
    const rechargeOrderId = publicSession.body.data.checkout.orderId as string;
    expect(rechargeOrderId).toMatch(/^order_twophone/);

    h.captureOrder(rechargeOrderId, 'pay_wallet_recharge1', 10_000);
    const [status1, status2] = await Promise.all([
      request(h.app)
        .post('/api/v1/driver/wallet/recharge-checkout/status')
        .send({ ticket: rechargeTicket }),
      request(h.app)
        .post(`/api/v1/driver/wallet/me/recharges/${pendingOpId}/status`)
        .set('Authorization', h.bearer(h.driverToken)),
    ]);
    expect(status1.status).toBe(200);
    expect(status2.status).toBe(200);

    const afterRecharge = await request(h.app)
      .get('/api/v1/driver/wallet/me/activity')
      .set('Authorization', h.bearer(h.driverToken));
    expect(afterRecharge.body.data).toMatchObject({
      commissionBalancePaise: 35_000,
      earningsBalancePaise: 20_000,
      availableCashoutPaise: 55_000,
    });

    // 3. Cashout reserves ₹200 earnings + ₹100 prepaid recharge; duplicate key is idempotent
    const cashout1 = await request(h.app)
      .post('/api/v1/driver/wallet/me/cashouts')
      .set('Authorization', h.bearer(h.driverToken))
      .send({
        amountPaise: 30_000,
        destinationUpi: 'driver@okaxis',
        idempotencyKey: 'cashout-attempt-01',
      });
    const cashout1Replay = await request(h.app)
      .post('/api/v1/driver/wallet/me/cashouts')
      .set('Authorization', h.bearer(h.driverToken))
      .send({
        amountPaise: 30_000,
        destinationUpi: 'driver@okaxis',
        idempotencyKey: 'cashout-attempt-01',
      });
    expect(cashout1.status).toBe(201);
    expect(cashout1Replay.body.data.id).toBe(cashout1.body.data.id);

    // Concurrent second cashout blocked while first is PENDING
    expect(
      (
        await request(h.app)
          .post('/api/v1/driver/wallet/me/cashouts')
          .set('Authorization', h.bearer(h.driverToken))
          .send({
            amountPaise: 5_000,
            destinationUpi: 'driver@okaxis',
            idempotencyKey: 'cashout-concurrent-02',
          })
      ).status,
    ).toBe(409);

    // 4. Admin rejects first cashout (+ replay) -> restores buckets once
    const reject1 = await request(h.app)
      .post(`/api/v1/admin/wallets/cashouts/${cashout1.body.data.id}/resolve`)
      .set('Authorization', h.bearer(h.adminToken))
      .send({ outcome: 'REJECTED', detail: 'VPA verification failed' });
    const reject2 = await request(h.app)
      .post(`/api/v1/admin/wallets/cashouts/${cashout1.body.data.id}/resolve`)
      .set('Authorization', h.bearer(h.adminToken))
      .send({ outcome: 'REJECTED', detail: 'VPA verification failed' });
    expect(reject1.status).toBe(200);
    expect(reject2.status).toBe(200);

    const afterReject = await request(h.app)
      .get('/api/v1/driver/wallet/me/activity')
      .set('Authorization', h.bearer(h.driverToken));
    expect(afterReject.body.data.availableCashoutPaise).toBe(55_000);

    // 5. Driver submits corrected cashout -> Admin marks PAID (+ replay) without double debit
    const cashout2 = await request(h.app)
      .post('/api/v1/driver/wallet/me/cashouts')
      .set('Authorization', h.bearer(h.driverToken))
      .send({
        amountPaise: 25_000,
        destinationUpi: 'driver.verified@okicici',
        idempotencyKey: 'cashout-attempt-03',
      });
    expect(cashout2.status).toBe(201);

    const paid1 = await request(h.app)
      .post(`/api/v1/admin/wallets/cashouts/${cashout2.body.data.id}/resolve`)
      .set('Authorization', h.bearer(h.adminToken))
      .send({ outcome: 'PAID', detail: 'UTR-TWOPHONE-998877' });
    const paid2 = await request(h.app)
      .post(`/api/v1/admin/wallets/cashouts/${cashout2.body.data.id}/resolve`)
      .set('Authorization', h.bearer(h.adminToken))
      .send({ outcome: 'PAID', detail: 'UTR-TWOPHONE-998877' });
    expect(paid1.status).toBe(200);
    expect(paid2.status).toBe(200);

    const finalActivity = await request(h.app)
      .get('/api/v1/driver/wallet/me/activity')
      .set('Authorization', h.bearer(h.driverToken));
    expect(finalActivity.body.data).toMatchObject({
      commissionBalancePaise: 30_000,
      earningsBalancePaise: 0,
      availableCashoutPaise: 30_000,
    });
  });
});
