import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryPaymentRepository, MemoryWalletRepository } from '../src/modules/ledger/index.js';
import {
  MemoryRideEventRepository,
  MemoryRideRepository,
  type RideEntity,
} from '../src/modules/rides/index.js';
import { RideQrPaymentUseCase } from '../src/modules/rides/application/useCases/rideQrPayment.usecase.js';
import { RideUpiPaymentUseCase } from '../src/modules/rides/application/useCases/rideUpiPayment.usecase.js';
import {
  MockQrPaymentGateway,
  RazorpayQrGateway,
} from '../src/modules/rides/infrastructure/razorpayQr.gateway.js';
import { RidePaymentQrAdapter } from '../src/modules/rides/infrastructure/ridePaymentQr.adapter.js';
import { makeRidePaymentQrControllers } from '../src/modules/rides/interface/ridePaymentQr.controller.js';
import { makeRideUpiWebhook } from '../src/modules/rides/interface/rideUpiWebhook.controller.js';
import type { QrPaymentGatewayPort } from '../src/modules/rides/domain/qrPaymentGateway.port.js';
import { logger } from '../src/shared/logging/logger.js';
import { unitOfWork } from './helpers/unitOfWork.js';

const RIDE_ID = '018f0a00-0000-7000-8000-000000000042';
const WEBHOOK_SECRET = 'whsec_test_different_from_api_secret_12345';

function signWebhook(raw: string, secret = WEBHOOK_SECRET): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

async function createFixture(opts?: {
  agreedFarePaise?: number;
  arrearsPaise?: number;
  gateway?: QrPaymentGatewayPort;
  initialTimeMs?: number;
}) {
  let nowMs = opts?.initialTimeMs ?? Date.parse('2026-10-30T10:00:00.000Z');
  const clock = () => new Date(nowMs);
  const advanceMs = (deltaMs: number) => {
    nowMs += deltaMs;
  };

  const rideRepo = new MemoryRideRepository();
  const rideEventRepo = new MemoryRideEventRepository();
  const paymentRepo = new MemoryPaymentRepository();
  const walletRepo = new MemoryWalletRepository();
  const mockGateway = new MockQrPaymentGateway();
  const gateway = opts?.gateway ?? mockGateway;

  const ride: RideEntity = {
    id: RIDE_ID,
    bookerRiderId: 'rider-1',
    driverId: 'driver-1',
    vehicleId: 'veh-1',
    vehicleCategory: 'CAB',
    passenger: {
      riderId: 'rider-1',
      name: 'Aarav Sen',
      phoneE164: '+919800000001',
      pickupOtpHash: null,
    },
    pickup: { lat: 26.71, lng: 88.43, address: 'Sevoke Road' },
    drop: { lat: 26.73, lng: 88.42, address: 'Hill Cart Road' },
    routeSnapshot: {
      provider: 'TEST',
      distanceM: 3200,
      durationSeconds: 540,
      polyline: '',
      calculatedAt: clock(),
    },
    zoneSnapshot: { classification: 'IN_CITY', cityZoneId: 'siliguri' },
    pricingSnapshot: {
      pricingConfigId: 'cfg-1',
      pricingConfigVersion: 1,
      vehicleCategory: 'CAB',
      baseFarePaise: 5000,
      ratePerKmPaise: 1200,
      minimumFarePaise: 5000,
      bufferSurchargePaise: 0,
      negotiationFloorPercent: 80,
      negotiationCeilingPercent: 150,
      commissionPercent: 8,
      zoneType: 'IN_CITY',
    },
    suggestedFarePaise: 10000,
    proposedFarePaise: 12000,
    agreedFarePaise: opts?.agreedFarePaise ?? 12000,
    arrearsPaise: opts?.arrearsPaise ?? 0,
    status: 'PAYMENT_PENDING',
    cancellationReason: null,
    offeringExpiresAt: null,
    acceptedAt: clock(),
    arrivedAt: clock(),
    startedAt: clock(),
    completedAt: clock(),
    settledAt: null,
    cancelledAt: null,
    version: 4,
    createdAt: clock(),
    updatedAt: clock(),
  };

  await rideRepo.save(ride);
  await walletRepo.save({
    id: 'wallet-driver-1',
    driverId: 'driver-1',
    balancePaise: 25000,
    earningsBalancePaise: 0,
    status: 'ACTIVE',
    version: 1,
    createdAt: clock(),
    updatedAt: clock(),
  });

  const rideUpdated = vi.fn(async () => {});
  const qrPayment = new RideQrPaymentUseCase({
    rideRepo,
    rideEventRepo,
    paymentRepo,
    walletRepo,
    unitOfWork,
    gateway,
    clock,
    onRideSettled: rideUpdated,
  });

  const legacyGateway = {
    live: false,
    keyId: 'rzp_test_fixture',
    closeQrForCash: vi.fn(async () => {}),
    createQr: vi.fn(async () => {
      throw new Error('unused');
    }),
    findQrPayment: vi.fn(async () => null),
    createOrder: vi.fn(async () => 'order_test'),
    verifySignature: vi.fn(),
    findCapturedPayment: vi.fn(async () => null),
  };

  const upiPayment = new RideUpiPaymentUseCase({
    rideRepo,
    rideEventRepo,
    unitOfWork,
    gateway: legacyGateway,
    walletRepo,
    closeQrCollectionForCash: (id) => qrPayment.closeForCash(id),
  });

  const actors = {
    resolveRiderId: async (uid: string) => uid,
    resolveDriverId: async (uid: string) => uid,
    notifier: {
      rideUpdated,
      offerCreated: async () => {},
      offerCancelled: async () => {},
      counterCreated: async () => {},
    },
  };

  const qrControllers = makeRidePaymentQrControllers({
    rideRepo,
    payment: upiPayment,
    qr: new RidePaymentQrAdapter('fixture-token-secret-at-least-32-chars'),
    actors,
    qrPayment,
  });

  const server = express();
  server.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf.toString('utf8');
      },
    }),
  );
  server.post('/webhook', makeRideUpiWebhook(upiPayment, actors, WEBHOOK_SECRET, qrPayment));
  server.use((req, _res, next) => {
    req.auth = {
      userId: req.get('x-driver-id') ?? 'driver-1',
      role: 'DRIVER',
      sessionId: 'sess-1',
    };
    next();
  });
  server.post('/rides/:id/payment-qr', qrControllers.driverCreatePaymentQr);
  server.get('/rides/:id/payment-qr', qrControllers.driverPollPaymentQr);
  server.use(
    (
      err: { statusCode?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(err.statusCode ?? 500).json({ success: false, message: err.message ?? 'Error' });
    },
  );

  return {
    clock,
    advanceMs,
    rideRepo,
    rideEventRepo,
    paymentRepo,
    walletRepo,
    mockGateway,
    gateway,
    qrPayment,
    upiPayment,
    rideUpdated,
    server,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Collect payment by UPI QR via Razorpay', () => {
  it('retries a webhook event ID after a transient processing failure', async () => {
    const f = await createFixture();
    await f.qrPayment.createOrGet(RIDE_ID, 'driver-1');
    const [row] = await f.paymentRepo.listQrByRideId(RIDE_ID);
    vi.spyOn(f.qrPayment, 'handleWebhookCredited').mockRejectedValueOnce(
      new Error('Transient database failure'),
    );
    const body = JSON.stringify({
      event: 'qr_code.credited',
      payload: {
        qr_code: { entity: { id: row!.gatewayRef } },
        payment: { entity: { id: 'pay_retry_event', amount: 12000 } },
      },
    });
    const deliver = () =>
      request(f.server)
        .post('/webhook')
        .type('json')
        .set('x-razorpay-signature', signWebhook(body))
        .set('x-razorpay-event-id', 'evt_retry_failure')
        .send(body);
    expect((await deliver()).status).toBe(500);
    expect((await deliver()).status).toBe(200);
    expect((await f.rideRepo.findById(RIDE_ID))?.status).toBe('SETTLED');
  });

  it('recovers a missed credit by polling an expired payment without a webhook', async () => {
    const f = await createFixture();
    await f.qrPayment.createOrGet(RIDE_ID, 'driver-1');
    const [row] = await f.paymentRepo.listQrByRideId(RIDE_ID);
    f.advanceMs(901_000);
    expect((await f.qrPayment.poll(RIDE_ID, 'driver-1')).qr.state).toBe('EXPIRED');
    f.mockGateway.simulateCredit(row!.gatewayRef!, 12000);
    f.advanceMs(3000);
    expect((await f.qrPayment.poll(RIDE_ID, 'driver-1')).qr.state).toBe('PAID');
    expect(f.rideUpdated).toHaveBeenCalledTimes(1);
  });

  it('returns the newest QR after the fare changes to a lower-attempt amount', async () => {
    const f = await createFixture();
    await f.qrPayment.createOrGet(RIDE_ID, 'driver-1');
    f.advanceMs(901_000);
    await f.qrPayment.createOrGet(RIDE_ID, 'driver-1');
    const ride = (await f.rideRepo.findById(RIDE_ID))!;
    await f.rideRepo.save({ ...ride, agreedFarePaise: 15000 });
    f.advanceMs(1);
    const created = await f.qrPayment.createOrGet(RIDE_ID, 'driver-1');
    const polled = await f.qrPayment.poll(RIDE_ID, 'driver-1');
    expect(polled.qr.amountPaise).toBe(15000);
    expect(polled.qr.upiUri).toBe(created.qr.upiUri);
  });

  it('1. double-tap on create yields one QR and one Razorpay call', async () => {
    let createCalls = 0;
    const slowGateway: QrPaymentGatewayPort = {
      provider: 'RAZORPAY',
      createQrCode: vi.fn(async (input) => {
        createCalls += 1;
        await new Promise((r) => setTimeout(r, 25));
        return {
          gatewayRef: 'qr_single_1',
          upiUri: 'upi://pay?pa=cabzone@icici&pn=Cabzone&am=120.00&cu=INR&tr=qr_single_1',
          imageUrl: 'https://rzp.io/i/poster1',
          expiresAt: new Date(input.closeByUnixSeconds * 1000),
        };
      }),
      closeQrCode: vi.fn(async () => {}),
      fetchQrCredit: vi.fn(async () => null),
    };

    const f = await createFixture({ gateway: slowGateway });
    const [first, second] = await Promise.all([
      request(f.server).post(`/rides/${RIDE_ID}/payment-qr`).send({ amountPaise: 100 }),
      request(f.server).post(`/rides/${RIDE_ID}/payment-qr`).send({ amountPaise: 999999 }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(createCalls).toBe(1);
    // Server computes amount strictly from ride (12000), ignoring client body
    expect(first.body.data.qr).toEqual(second.body.data.qr);
    expect(first.body.data.qr).toMatchObject({
      state: 'PENDING',
      amountPaise: 12000,
      upiUri: 'upi://pay?pa=cabzone@icici&pn=Cabzone&am=120.00&cu=INR&tr=qr_single_1',
      imageUrl: 'https://rzp.io/i/poster1',
      lines: [{ label: 'Trip fare', amountPaise: 12000 }],
    });

    const rows = await f.paymentRepo.listQrByRideId(RIDE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: 'QR',
      status: 'PENDING',
      gatewayRef: 'qr_single_1',
      idempotencyKey: `qr-${RIDE_ID}-12000-1`,
    });
  });

  it('2. gateway failure leaves the row FAILED and the next tap works with incremented attempt', async () => {
    let callCount = 0;
    const flakyGateway: QrPaymentGatewayPort = {
      provider: 'RAZORPAY',
      createQrCode: vi.fn(async (input) => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('Could not generate a UPI QR code right now. Please try again.');
        }
        return {
          gatewayRef: 'qr_recovered_2',
          upiUri: 'upi://pay?pa=cabzone@icici&am=120.00&cu=INR&tr=qr_recovered_2',
          imageUrl: null,
          expiresAt: new Date(input.closeByUnixSeconds * 1000),
        };
      }),
      closeQrCode: vi.fn(async () => {}),
      fetchQrCredit: vi.fn(async () => null),
    };

    const f = await createFixture({ gateway: flakyGateway });

    const failedRes = await request(f.server).post(`/rides/${RIDE_ID}/payment-qr`);
    expect(failedRes.status).toBe(500);

    const afterFail = await f.paymentRepo.listQrByRideId(RIDE_ID);
    expect(afterFail).toHaveLength(1);
    expect(afterFail[0]).toMatchObject({
      status: 'FAILED',
      attempt: 1,
      idempotencyKey: `qr-${RIDE_ID}-12000-1`,
    });

    const retryRes = await request(f.server).post(`/rides/${RIDE_ID}/payment-qr`);
    expect(retryRes.status).toBe(200);
    expect(retryRes.body.data.qr.state).toBe('PENDING');

    const afterRetry = await f.paymentRepo.listQrByRideId(RIDE_ID);
    expect(afterRetry).toHaveLength(2);
    expect(afterRetry[0]).toMatchObject({
      status: 'PENDING',
      attempt: 2,
      gatewayRef: 'qr_recovered_2',
      idempotencyKey: `qr-${RIDE_ID}-12000-2`,
    });
  });

  it('3. webhook and poll racing on the same payment capture exactly once, so side effects run once', async () => {
    const f = await createFixture({ agreedFarePaise: 12000, arrearsPaise: 5000 });
    const created = await request(f.server).post(`/rides/${RIDE_ID}/payment-qr`);
    expect(created.status).toBe(200);
    expect(created.body.data.qr.amountPaise).toBe(17000);
    expect(created.body.data.qr.lines).toEqual([
      { label: 'Trip fare', amountPaise: 12000 },
      { label: 'Prior cancellation fee', amountPaise: 5000 },
    ]);

    const [stored] = await f.paymentRepo.listQrByRideId(RIDE_ID);
    const qrId = stored!.gatewayRef!;
    f.mockGateway.simulateCredit(qrId, 17000, 'pay_race_winner');
    f.advanceMs(3500);

    const webhookBody = JSON.stringify({
      event: 'qr_code.credited',
      payload: {
        qr_code: { entity: { id: qrId, notes: { reference: RIDE_ID, rideId: RIDE_ID } } },
        payment: { entity: { id: 'pay_race_winner', amount: 17000 } },
      },
    });

    const [webhookRes, pollRes] = await Promise.all([
      request(f.server)
        .post('/webhook')
        .type('json')
        .set('x-razorpay-signature', signWebhook(webhookBody))
        .set('x-razorpay-event-id', 'evt_race_1')
        .send(webhookBody),
      request(f.server).get(`/rides/${RIDE_ID}/payment-qr`),
    ]);

    expect(webhookRes.status).toBe(200);
    expect(pollRes.status).toBe(200);
    expect(pollRes.body.data.qr.state).toBe('PAID');
    expect(pollRes.body.data.ride.status).toBe('SETTLED');

    // Side effects must have run strictly once!
    expect(f.rideUpdated).toHaveBeenCalledTimes(1);
    const driverWallet = await f.walletRepo.findByDriverId('driver-1');
    // 12000 fare - 8% (960) commission = 11040 net earnings
    expect(driverWallet?.earningsBalancePaise).toBe(11040);
    const txs = await f.walletRepo.findTransactionsByWalletId('wallet-driver-1');
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      referenceType: 'ONLINE_RIDE_EARNINGS',
      amountPaise: 11040,
    });
    const events = await f.rideEventRepo.findByRideId(RIDE_ID);
    expect(events.filter((e) => e.eventType === 'PAYMENT_CONFIRMED')).toHaveLength(1);
  });

  it('4. a credit for the wrong amount is NOT treated as paid on either webhook or poll', async () => {
    const errSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const f = await createFixture({ agreedFarePaise: 12000 });
    await request(f.server).post(`/rides/${RIDE_ID}/payment-qr`);
    const [stored] = await f.paymentRepo.listQrByRideId(RIDE_ID);
    const qrId = stored!.gatewayRef!;

    // Wrong amount via webhook (11900 instead of 12000)
    const wrongWebhook = JSON.stringify({
      event: 'qr_code.credited',
      payload: {
        qr_code: { entity: { id: qrId } },
        payment: { entity: { id: 'pay_wrong_amt', amount: 11900 } },
      },
    });
    const whRes = await request(f.server)
      .post('/webhook')
      .type('json')
      .set('x-razorpay-signature', signWebhook(wrongWebhook))
      .send(wrongWebhook);
    expect(whRes.status).toBe(200);

    // Wrong amount via gateway poll
    f.mockGateway.simulateCredit(qrId, 11900, 'pay_wrong_amt');
    f.advanceMs(4000);
    const pollRes = await request(f.server).get(`/rides/${RIDE_ID}/payment-qr`);
    expect(pollRes.status).toBe(200);
    expect(pollRes.body.data.qr.state).toBe('PENDING');

    expect((await f.rideRepo.findById(RIDE_ID))?.status).toBe('PAYMENT_PENDING');
    expect((await f.paymentRepo.findById(stored!.id))?.status).toBe('PENDING');
    expect(await f.walletRepo.findTransactionsByWalletId('wallet-driver-1')).toHaveLength(0);
    expect(errSpy).toHaveBeenCalled();
  });

  it("5. qr_code.closed with close_reason 'paid' is ignored while other close reasons mark FAILED", async () => {
    const f = await createFixture();
    await request(f.server).post(`/rides/${RIDE_ID}/payment-qr`);
    const [stored] = await f.paymentRepo.listQrByRideId(RIDE_ID);
    const qrId = stored!.gatewayRef!;

    const closedPaid = JSON.stringify({
      event: 'qr_code.closed',
      payload: { qr_code: { entity: { id: qrId, close_reason: 'paid' } } },
    });
    const resPaid = await request(f.server)
      .post('/webhook')
      .type('json')
      .set('x-razorpay-signature', signWebhook(closedPaid))
      .send(closedPaid);
    expect(resPaid.status).toBe(200);
    expect((await f.paymentRepo.findById(stored!.id))?.status).toBe('PENDING');

    const closedOnDemand = JSON.stringify({
      event: 'qr_code.closed',
      payload: { qr_code: { entity: { id: qrId, close_reason: 'on_demand' } } },
    });
    const resDemand = await request(f.server)
      .post('/webhook')
      .type('json')
      .set('x-razorpay-signature', signWebhook(closedOnDemand))
      .send(closedOnDemand);
    expect(resDemand.status).toBe(200);
    expect((await f.paymentRepo.findById(stored!.id))?.status).toBe('FAILED');
    const pollAfterClose = await request(f.server).get(`/rides/${RIDE_ID}/payment-qr`);
    expect(pollAfterClose.body.data.qr.state).toBe('EXPIRED');
  });

  it('6. an expired QR is closed at the gateway and reported as EXPIRED, and late on-time credit still captures', async () => {
    const closeSpy = vi.fn(async () => {});
    const mock = new MockQrPaymentGateway();
    const origClose = mock.closeQrCode.bind(mock);
    vi.spyOn(mock, 'closeQrCode').mockImplementation(async (ref) => {
      closeSpy(ref);
      await origClose(ref);
    });

    const f = await createFixture({ gateway: mock });
    await request(f.server).post(`/rides/${RIDE_ID}/payment-qr`);
    const [stored] = await f.paymentRepo.listQrByRideId(RIDE_ID);
    const qrId = stored!.gatewayRef!;

    // Advance past 15-minute expiry
    f.advanceMs(15 * 60 * 1000 + 1000);

    const pollExpired = await request(f.server).get(`/rides/${RIDE_ID}/payment-qr`);
    expect(pollExpired.status).toBe(200);
    expect(pollExpired.body.data.qr).toMatchObject({
      state: 'EXPIRED',
      upiUri: null,
      imageUrl: null,
    });
    expect(closeSpy).toHaveBeenCalledWith(qrId);
    expect((await f.paymentRepo.findById(stored!.id))?.status).toBe('FAILED');

    // Late webhook arriving for the FAILED (expired) QR still moves FAILED -> CAPTURED so money is never orphaned!
    const lateWebhook = JSON.stringify({
      event: 'qr_code.credited',
      payload: {
        qr_code: { entity: { id: qrId } },
        payment: { entity: { id: 'pay_arrived_in_time', amount: 12000 } },
      },
    });
    const whRes = await request(f.server)
      .post('/webhook')
      .type('json')
      .set('x-razorpay-signature', signWebhook(lateWebhook))
      .send(lateWebhook);
    expect(whRes.status).toBe(200);
    expect((await f.paymentRepo.findById(stored!.id))?.status).toBe('CAPTURED');
    expect((await f.rideRepo.findById(RIDE_ID))?.status).toBe('SETTLED');
  });

  it('7. rejects bad webhook signatures with 403, returns 200 for authentic unknown events, and dedupes event IDs', async () => {
    const f = await createFixture();
    await request(f.server).post(`/rides/${RIDE_ID}/payment-qr`);
    const [stored] = await f.paymentRepo.listQrByRideId(RIDE_ID);

    const body = JSON.stringify({
      event: 'qr_code.credited',
      payload: {
        qr_code: { entity: { id: stored!.gatewayRef } },
        payment: { entity: { id: 'pay_ok', amount: 12000 } },
      },
    });

    for (const badSig of ['', 'not-hex', 'b'.repeat(64)]) {
      const res = await request(f.server)
        .post('/webhook')
        .type('json')
        .set('x-razorpay-signature', badSig)
        .send(body);
      expect(res.status).toBe(403);
    }
    expect((await f.rideRepo.findById(RIDE_ID))?.status).toBe('PAYMENT_PENDING');

    const unknownEvent = JSON.stringify({ event: 'payment.authorized', payload: {} });
    const unknownRes = await request(f.server)
      .post('/webhook')
      .type('json')
      .set('x-razorpay-signature', signWebhook(unknownEvent))
      .set('x-razorpay-event-id', 'evt_unknown_1')
      .send(unknownEvent);
    expect(unknownRes.status).toBe(200);

    // Valid event with x-razorpay-event-id delivered twice: processed once, both return 200
    const first = await request(f.server)
      .post('/webhook')
      .type('json')
      .set('x-razorpay-signature', signWebhook(body))
      .set('x-razorpay-event-id', 'evt_dedupe_1')
      .send(body);
    const duplicate = await request(f.server)
      .post('/webhook')
      .type('json')
      .set('x-razorpay-signature', signWebhook(body))
      .set('x-razorpay-event-id', 'evt_dedupe_1')
      .send(body);
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(f.rideUpdated).toHaveBeenCalledTimes(1);
  });

  it('8. RazorpayQrGateway enforces >=100 paise, sanitizes provider errors, filters non-upi image_content, and ignores 400 on close', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const gw = new RazorpayQrGateway('rzp_test_key', 'secret_key');

    // Reject < 100 paise before calling Razorpay
    await expect(
      gw.createQrCode({
        amountPaise: 99,
        rideId: RIDE_ID,
        name: 'Cabzone Ride',
        description: 'Ride',
        closeByUnixSeconds: 1800000000,
      }),
    ).rejects.toThrow('₹1');
    expect(fetchMock).not.toHaveBeenCalled();

    // Non-upi image_content is discarded while image_url poster is kept
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'qr_poster_only',
          image_url: 'https://rzp.io/i/tall-poster',
          image_content: 'https://not-a-upi-scheme.example.com',
          close_by: 1800000900,
        }),
        { status: 200 },
      ),
    );
    const created = await gw.createQrCode({
      amountPaise: 12500,
      rideId: RIDE_ID,
      name: 'Cabzone Ride',
      description: 'Trip fare',
      closeByUnixSeconds: 1800000900,
    });
    expect(created.upiUri).toBeNull();
    expect(created.imageUrl).toBe('https://rzp.io/i/tall-poster');
    const sentBody = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(sentBody).toMatchObject({
      type: 'upi_qr',
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: 12500,
      close_by: 1800000900,
      notes: { reference: RIDE_ID },
    });

    // 400 on /close (already closed) does not throw
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { description: 'QR Code is already closed' } }), {
        status: 400,
      }),
    );
    await expect(gw.closeQrCode('qr_poster_only')).resolves.toBeUndefined();

    // Provider 500 error description is NEVER sent to end user
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { description: 'INTERNAL_MERCHANT_SECRET_DETAIL_XYZ' } }),
        { status: 500 },
      ),
    );
    await expect(
      gw.createQrCode({
        amountPaise: 12500,
        rideId: RIDE_ID,
        name: 'Cabzone Ride',
        description: 'Trip fare',
        closeByUnixSeconds: 1800000900,
      }),
    ).rejects.not.toThrow('INTERNAL_MERCHANT_SECRET_DETAIL_XYZ');
  });

  it('9. closes PENDING driver QR and reports PAID when rider settles via app UPI (split-brain closure)', async () => {
    const closeSpy = vi.fn(async () => {});
    const mock = new MockQrPaymentGateway();
    const origClose = mock.closeQrCode.bind(mock);
    vi.spyOn(mock, 'closeQrCode').mockImplementation(async (ref) => {
      closeSpy(ref);
      await origClose(ref);
    });

    const f = await createFixture({ gateway: mock, agreedFarePaise: 12000 });
    const created = await request(f.server).post(`/rides/${RIDE_ID}/payment-qr`);
    expect(created.status).toBe(200);
    const [qrRow] = await f.paymentRepo.listQrByRideId(RIDE_ID);
    expect(qrRow?.status).toBe('PENDING');

    // Rider pays via app UPI order -> ride becomes SETTLED
    await f.upiPayment.session(RIDE_ID, 'rider-1');
    (f.upiPayment as unknown as { props: { gateway: { findCapturedPayment: () => Promise<string> } } });
    const ride = (await f.rideRepo.findById(RIDE_ID))!;
    await f.rideRepo.save({ ...ride, status: 'SETTLED', settledAt: f.clock() });

    const polled = await request(f.server).get(`/rides/${RIDE_ID}/payment-qr`);
    expect(polled.status).toBe(200);
    expect(polled.body.data.ride.status).toBe('SETTLED');
    expect(polled.body.data.qr.state).toBe('PAID');
    expect(closeSpy).toHaveBeenCalledWith(qrRow!.gatewayRef);
    expect((await f.paymentRepo.findById(qrRow!.id))?.status).toBe('FAILED');
  });
});
