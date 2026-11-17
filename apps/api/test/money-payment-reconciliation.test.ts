import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@cabzone/contracts';
import { newUuid } from '../src/shared/ids.js';
import { errorHandler } from '../src/shared/http/error-handler.js';
import { requireRole } from '../src/modules/identity/interface/middlewares/index.js';
import {
  MemoryWalletRepository,
  type WalletTransactionEntity,
} from '../src/modules/ledger/index.js';
import { MemoryWalletOperationRepository } from '../src/modules/ledger/infrastructure/persistence/walletOperation.repository.js';
import { WalletMoneyUseCase } from '../src/modules/ledger/application/useCases/walletMoney.usecase.js';
import { ReconcileWalletLedgerUseCase } from '../src/modules/ledger/application/useCases/reconcileWalletLedger.usecase.js';
import { makeAdminReconcileWalletLedgerController } from '../src/modules/ledger/interface/ledger.controller.js';
import { buildAdminWalletRouter } from '../src/modules/ledger/interface/ledger.routes.js';
import { walletMoneyControllers } from '../src/modules/ledger/interface/walletMoney.controller.js';
import { WalletRechargeTickets } from '../src/modules/ledger/infrastructure/walletRechargeTickets.js';
import { toProviderPayout } from '../src/modules/ledger/infrastructure/razorpayPayout.adapter.js';
import {
  MemoryRideEventRepository,
  MemoryRideRepository,
  type RideEntity,
} from '../src/modules/rides/index.js';
import { CompleteRideUseCase } from '../src/modules/rides/application/useCases/completeRide.usecase.js';
import { RideUpiPaymentUseCase } from '../src/modules/rides/application/useCases/rideUpiPayment.usecase.js';
import { DriverEarningsUseCase } from '../src/modules/rides/application/useCases/driverEarnings.usecase.js';
import {
  makeDisputePaymentController,
  makeListPaymentDisputesController,
  makeReconcileDriverEarningsController,
  makeResolvePaymentDisputeController,
  type RideHttpContext,
} from '../src/modules/rides/interface/rides.controller.js';
import { buildRidesRouter } from '../src/modules/rides/interface/rides.routes.js';
import { unitOfWork } from './helpers/unitOfWork.js';

const noopHandler: RequestHandler = (_req, res) => {
  res.status(501).end();
};

function makeRide(overrides: Partial<RideEntity> & { id: string }): RideEntity {
  const ts = overrides.settledAt ?? overrides.completedAt ?? overrides.createdAt ?? new Date();
  return {
    bookerRiderId: 'rider-1',
    driverId: 'driver-1',
    vehicleId: null,
    vehicleCategory: 'CAB',
    passenger: {
      riderId: 'rider-1',
      name: 'Ananya Sen',
      phoneE164: '+919876500011',
      pickupOtpHash: null,
    },
    pickup: { lat: 26.7271, lng: 88.4334, address: 'Sevoke Road' },
    drop: { lat: 26.71, lng: 88.42, address: 'Hill Cart Road' },
    routeSnapshot: {
      provider: 'TEST',
      distanceM: 4200,
      durationSeconds: 780,
      polyline: '',
      calculatedAt: ts,
    },
    zoneSnapshot: { classification: 'IN_CITY', cityZoneId: null },
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
    suggestedFarePaise: 20000,
    proposedFarePaise: 20000,
    agreedFarePaise: 20000,
    status: 'PAYMENT_PENDING',
    cancellationReason: null,
    offeringExpiresAt: null,
    acceptedAt: ts,
    arrivedAt: ts,
    startedAt: ts,
    completedAt: ts,
    settledAt: null,
    cancelledAt: null,
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function buildTestHarness() {
  const walletRepo = new MemoryWalletRepository();
  const operations = new MemoryWalletOperationRepository();
  const rideRepo = new MemoryRideRepository();
  const rideEventRepo = new MemoryRideEventRepository();

  const capturedOrders = new Map<string, { paymentId: string; amountPaise: number }>();
  let orderSeq = 0;

  const gateway = {
    fetchRefund: vi.fn(async (id: string) => {
      const refunds: Record<string, { paymentId: string; amountPaise: number }> = {
        rfnd_arrears: { paymentId: 'pay_arrears_refund', amountPaise: 23000 },
        rfnd_manual_9001: { paymentId: 'pay_online_555', amountPaise: 20000 },
        rfnd_dup_77: { paymentId: 'pay_dup_late_77', amountPaise: 10000 },
      };
      const evidence = refunds[id];
      if (!evidence) throw new Error('Refund not found');
      return { id, ...evidence, currency: 'INR', status: 'processed' };
    }),
    live: false,
    keyId: 'rzp_test_step6_harness',
    createOrder: vi.fn(async (amountPaise: number, ref: string) => {
      orderSeq += 1;
      return `order_${ref.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}${orderSeq}`;
    }),
    createQr: vi.fn(),
    findQrPayment: vi.fn(async () => null),
    closeQrForCash: vi.fn(async () => undefined),
    verifySignature: vi.fn(),
    findCapturedPayment: vi.fn(async (orderId: string, amountPaise: number) => {
      const hit = capturedOrders.get(orderId);
      if (!hit || hit.amountPaise !== amountPaise) return null;
      return hit.paymentId;
    }),
  };

  const walletMoney = new WalletMoneyUseCase({
    walletRepo,
    operations,
    gateway,
    unitOfWork,
    enabled: true,
  });

  const reconcileLedger = new ReconcileWalletLedgerUseCase({
    walletRepo,
    operations,
    gateway,
    walletMoneyUseCase: walletMoney,
  });

  const upiPayment = new RideUpiPaymentUseCase({
    walletRepo,
    rideRepo,
    rideEventRepo,
    unitOfWork,
    gateway,
  });

  const completeRide = new CompleteRideUseCase({
    refundVerifier: gateway,
    prepareCashConfirmation: (rideId, driverId) =>
      upiPayment.prepareCashConfirmation(rideId, driverId),
    rideRepo,
    walletRepo,
    rideEventRepo,
    unitOfWork,
  });

  const driverEarnings = new DriverEarningsUseCase({
    rideRepo,
    rideEventRepo,
    walletRepo,
    unitOfWork,
    gateway,
    reconcileOnlineRide: (rideId, riderId) => upiPayment.reconcile(rideId, riderId),
  });

  const actors: RideHttpContext = {
    resolveRiderId: async (uid) => (uid === 'user-rider-1' ? 'rider-1' : null),
    resolveDriverId: async (uid) => (uid === 'user-driver-1' ? 'driver-1' : null),
  };

  const authenticate: RequestHandler = (req, _res, next) => {
    const raw = req.header('x-test-auth');
    if (raw) {
      const [userId, role] = raw.split(':');
      req.auth = {
        userId: userId ?? 'anon',
        role: (role as Role) ?? 'RIDER',
        sessionId: 'sess-step6',
      };
    }
    next();
  };

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/rides',
    buildRidesRouter({
      authenticate,
      requireRider: requireRole('RIDER'),
      requireDriver: requireRole('DRIVER'),
      requireParticipant: requireRole('RIDER', 'DRIVER'),
      requireCanRead: requireRole(
        'RIDER',
        'DRIVER',
        'SUPER_ADMIN',
        'CITY_ADMIN',
        'SUPPORT_ADMIN',
        'FINANCE_ADMIN',
      ),
      requireDisputeAdmin: requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN'),
      requireDisputeReadAdmin: requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'),
      requireFinanceAdmin: requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'),
      requireCanCancel: requireRole('RIDER', 'DRIVER', 'SUPER_ADMIN', 'SUPPORT_ADMIN'),
      requireWaiverAdmin: requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'),
      createRide: noopHandler,
      listRides: noopHandler,
      driverEarnings: noopHandler,
      driverHistory: noopHandler,
      reconcileDriverEarnings: makeReconcileDriverEarningsController(driverEarnings),
      getRide: noopHandler,
      getCommunication: noopHandler,
      listMessages: noopHandler,
      sendMessage: noopHandler,
      getRideEvents: noopHandler,
      getRideRating: noopHandler,
      submitRideRating: noopHandler,
      waiveCancellationFee: noopHandler,
      acceptRide: noopHandler,
      driverCounter: noopHandler,
      respondCounter: noopHandler,
      raiseFare: noopHandler,
      driverEnRoute: noopHandler,
      driverArrived: noopHandler,
      startRide: noopHandler,
      completeRide: noopHandler,
      confirmPayment: noopHandler,
      createUpiPayment: noopHandler,
      upiSession: noopHandler,
      switchToCash: noopHandler,
      upiWebhook: noopHandler,
      verifyUpiPayment: noopHandler,
      upiPaymentStatus: noopHandler,
      driverPaymentQr: noopHandler,
      driverPaymentStatus: noopHandler,
      checkoutPage: noopHandler,
      checkoutSession: noopHandler,
      checkoutVerify: noopHandler,
      checkoutStatus: noopHandler,
      disputePayment: makeDisputePaymentController(completeRide, actors),
      resolvePaymentDispute: makeResolvePaymentDisputeController(completeRide, actors),
      listPaymentDisputes: makeListPaymentDisputesController(
        rideRepo,
        rideEventRepo,
        actors,
        walletRepo,
      ),
      cancelRide: noopHandler,
    }),
  );

  const moneyControllers = walletMoneyControllers(
    walletMoney,
    new WalletRechargeTickets('step6-test-secret-32-chars-minimum!!'),
    actors.resolveDriverId,
    toProviderPayout,
  );
  app.use(
    '/api/v1/admin/wallets',
    buildAdminWalletRouter({
      money: moneyControllers,
      authenticate,
      requireFinanceRole: requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'),
      adjustWallet: noopHandler,
      getWallet: noopHandler,
      listWallets: noopHandler,
      getStats: noopHandler,
      listTransactions: noopHandler,
      reconcileLedger: makeAdminReconcileWalletLedgerController(reconcileLedger),
    }),
  );
  app.use(errorHandler);

  return {
    app,
    walletRepo,
    operations,
    rideRepo,
    rideEventRepo,
    capturedOrders,
    gateway,
    walletMoney,
    reconcileLedger,
    upiPayment,
    completeRide,
    driverEarnings,
  };
}

describe('Step 6 — Historical money & payment operations reconciliation', () => {
  it('rejects disconnected ledger cycles and permits separate commission and arrears refunds', async () => {
    const h = buildTestHarness();
    const now = new Date();
    await h.walletRepo.save({
      id: 'audit-wallet',
      driverId: 'driver-1',
      balancePaise: 100,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    for (const [id, before, after] of [
      ['a', 0, 100],
      ['b', 500, 600],
      ['c', 600, 500],
    ] as const) {
      await h.walletRepo.recordTransaction({
        id,
        walletId: 'audit-wallet',
        driverId: 'driver-1',
        type: after > before ? 'CREDIT' : 'DEBIT',
        amountPaise: Math.abs(after - before),
        referenceType: 'ADMIN_ADJUSTMENT',
        referenceId: id,
        idempotencyKey: id,
        balanceBeforePaise: before,
        balanceAfterPaise: after,
        createdBy: null,
        createdAt: now,
      });
    }
    expect(
      (await h.reconcileLedger.execute()).issues.some((i) => i.code === 'BROKEN_TX_CHAIN'),
    ).toBe(true);
    const valid = buildTestHarness();
    await valid.walletRepo.save({
      id: 'valid-wallet',
      driverId: 'driver-1',
      balancePaise: 400,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    for (const [key, before, after] of [
      ['dispute_refund_ride1', 0, 100],
      ['dispute_arrears_refund_ride1', 100, 400],
    ] as const) {
      await valid.walletRepo.recordTransaction({
        id: key,
        walletId: 'valid-wallet',
        driverId: 'driver-1',
        type: 'CREDIT',
        amountPaise: after - before,
        referenceType: 'DISPUTE_REFUND',
        referenceId: 'ride1',
        idempotencyKey: key,
        balanceBeforePaise: before,
        balanceAfterPaise: after,
        createdBy: null,
        createdAt: now,
      });
    }
    expect((await valid.reconcileLedger.execute()).issues).toEqual([]);
  });

  it('recovers a captured fare plus arrears and audits the full provider amount', async () => {
    const h = buildTestHarness();
    const now = new Date();
    await h.walletRepo.save({
      id: 'driver-wallet',
      driverId: 'driver-1',
      balancePaise: 5000,
      earningsBalancePaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const rideId = newUuid();
    await h.rideRepo.save(
      makeRide({
        id: rideId,
        agreedFarePaise: 20000,
        arrearsPaise: 3000,
        status: 'PAYMENT_PENDING',
      }),
    );
    const checkout = await h.upiPayment.create(rideId, 'rider-1');
    h.capturedOrders.set(checkout.orderId, {
      paymentId: 'pay_recovery_arrears',
      amountPaise: 23000,
    });
    const recovery = await h.driverEarnings.reconcile({
      mode: 'RECONCILE_PENDING_ONLINE',
      rideIds: [rideId],
    });
    expect(recovery.reconciledPendingRideIds).toContain(rideId);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(5000 + 18400);
    const audit = await h.driverEarnings.reconcile({ mode: 'AUDIT', rideIds: [rideId] });
    expect(audit.issues).toEqual([]);
  });

  it('finds a dispute beyond the first 500 records', async () => {
    const h = buildTestHarness();
    const ids = Array.from({ length: 505 }, () => newUuid());
    for (const [index, id] of ids.entries()) {
      await h.rideRepo.save(
        makeRide({
          id,
          status: 'PAYMENT_DISPUTED',
          passenger: {
            name: index === 0 ? 'OlderUniquePassenger' : 'Passenger',
            phoneE164: '+919876543210',
            riderId: 'rider-1',
          },
          updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        }),
      );
    }
    const result = await request(h.app)
      .get('/api/v1/rides/payment/disputes?status=OPEN&search=OlderUniquePassenger')
      .set('x-test-auth', 'sup-1:SUPPORT_ADMIN')
      .expect(200);
    expect(JSON.stringify(result.body)).toContain(ids[0]);
  });

  it('verifies provider capture before backfilling historical online rides and recovers captured pending online rides once', async () => {
    const h = buildTestHarness();
    const now = new Date('2026-10-26T10:00:00.000Z');
    await h.walletRepo.save({
      id: 'wallet-driver-1',
      driverId: 'driver-1',
      balancePaise: 10000,
      earningsBalancePaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    // 1. Historical settled online ride whose order is NOT yet verified in provider -> blocks backfill!
    const unverifiedHistId = newUuid();
    await h.rideRepo.save(
      makeRide({
        id: unverifiedHistId,
        agreedFarePaise: 25000, // 8% = 2000 -> 23000 payable
        status: 'SETTLED',
        settledAt: now,
      }),
    );
    await h.rideEventRepo.save({
      id: newUuid(),
      rideId: unverifiedHistId,
      eventType: 'UPI_ORDER_CREATED',
      actorType: 'RIDER',
      actorId: 'rider-1',
      previousStatus: 'PAYMENT_PENDING',
      newStatus: 'PAYMENT_PENDING',
      metadata: { orderId: 'order_hist901', amountPaise: 25000 },
      createdAt: now,
    });
    await h.rideEventRepo.save({
      id: newUuid(),
      rideId: unverifiedHistId,
      eventType: 'PAYMENT_CONFIRMED',
      actorType: 'SYSTEM',
      actorId: null,
      previousStatus: 'PAYMENT_PENDING',
      newStatus: 'SETTLED',
      metadata: {
        method: 'UPI',
        orderId: 'order_hist901',
        paymentId: 'pay_hist901',
        farePaise: 25000,
        commissionPaise: 2000,
        driverPayablePaise: 23000,
      },
      createdAt: now,
    });

    // 2. Pending online ride whose payment WAS captured at provider -> detected & recovered!
    const pendingCapturedId = newUuid();
    await h.rideRepo.save(
      makeRide({
        id: pendingCapturedId,
        agreedFarePaise: 15000, // 8% = 1200 -> 13800 payable
        status: 'PAYMENT_PENDING',
        completedAt: now,
      }),
    );
    const pendingSession = await h.upiPayment.create(pendingCapturedId, 'rider-1');
    h.capturedOrders.set(pendingSession.orderId, {
      paymentId: 'pay_pending_captured_1',
      amountPaise: 15000,
    });

    // Audit surfaces PROVIDER_SETTLEMENT_MISMATCH on unverifiedHistId + PROVIDER_CAPTURED_RIDE_UNSETTLED on pendingCapturedId
    const audit1 = await request(h.app)
      .post('/api/v1/rides/admin/reconcile-earnings')
      .set('x-test-auth', 'fin-1:FINANCE_ADMIN')
      .send({ mode: 'AUDIT' })
      .expect(200);

    expect(audit1.body.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROVIDER_SETTLEMENT_MISMATCH',
          rideId: unverifiedHistId,
        }),
        expect.objectContaining({
          code: 'PROVIDER_CAPTURED_RIDE_UNSETTLED',
          rideId: pendingCapturedId,
        }),
      ]),
    );

    // Attempting backfill while provider disagrees skips unverifiedHistId without crediting!
    const blockedBackfill = await request(h.app)
      .post('/api/v1/rides/admin/reconcile-earnings')
      .set('x-test-auth', 'fin-1:FINANCE_ADMIN')
      .send({ mode: 'BACKFILL_ONLINE_EARNINGS', rideIds: [unverifiedHistId] })
      .expect(200);
    expect(blockedBackfill.body.data.backfilledRideIds).toEqual([]);
    expect(blockedBackfill.body.data.skippedRideIds).toEqual([unverifiedHistId]);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(10000);

    // Recover captured pending online ride once (idempotent on retry)
    const recoverRes = await request(h.app)
      .post('/api/v1/rides/admin/reconcile-earnings')
      .set('x-test-auth', 'fin-1:FINANCE_ADMIN')
      .send({ mode: 'RECONCILE_PENDING_ONLINE' })
      .expect(200);
    expect(recoverRes.body.data.reconciledPendingRideIds).toEqual([pendingCapturedId]);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(10000 + 13800);

    const recoverRetry = await request(h.app)
      .post('/api/v1/rides/admin/reconcile-earnings')
      .set('x-test-auth', 'fin-1:FINANCE_ADMIN')
      .send({ mode: 'RECONCILE_PENDING_ONLINE' })
      .expect(200);
    expect(recoverRetry.body.data.reconciledPendingRideIds).toEqual([]);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(10000 + 13800);

    // Now provider confirms order_hist901 -> AUDIT reports HISTORICAL_ONLINE_MISSING_EARNINGS and backfill succeeds once!
    h.capturedOrders.set('order_hist901', { paymentId: 'pay_hist901', amountPaise: 25000 });
    const audit2 = await h.driverEarnings.reconcile({ mode: 'AUDIT' });
    expect(audit2.issues).toEqual([
      expect.objectContaining({
        code: 'HISTORICAL_ONLINE_MISSING_EARNINGS',
        rideId: unverifiedHistId,
        expectedPaise: 23000,
      }),
    ]);

    const backfillOk = await request(h.app)
      .post('/api/v1/rides/admin/reconcile-earnings')
      .set('x-test-auth', 'fin-1:FINANCE_ADMIN')
      .send({ mode: 'BACKFILL_ONLINE_EARNINGS', rideIds: [unverifiedHistId] })
      .expect(200);
    expect(backfillOk.body.data.backfilledRideIds).toEqual([unverifiedHistId]);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(
      10000 + 13800 + 23000,
    );

    // Ledger audit confirms zero drift and intact chains across all backfilled & recovered postings
    const ledgerAudit = await h.reconcileLedger.execute({ mode: 'AUDIT' });
    expect(ledgerAudit.issues).toEqual([]);
    expect(ledgerAudit.cleanWallets).toBe(1);
  });

  it('reinstates refunded online arrears once without charging them to driver earnings', async () => {
    const h = buildTestHarness();
    const now = new Date();
    await h.walletRepo.save({
      id: 'driver-wallet',
      driverId: 'driver-1',
      balancePaise: 5000,
      earningsBalancePaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await h.walletRepo.save({
      id: 'rider-wallet',
      ownerType: 'RIDER',
      driverId: '',
      riderId: 'rider-1',
      balancePaise: -3000,
      owedPaise: 3000,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const rideId = newUuid();
    await h.rideRepo.save(
      makeRide({
        id: rideId,
        agreedFarePaise: 20000,
        arrearsPaise: 3000,
        status: 'PAYMENT_PENDING',
      }),
    );
    const checkout = await h.upiPayment.create(rideId, 'rider-1');
    h.capturedOrders.set(checkout.orderId, { paymentId: 'pay_arrears_refund', amountPaise: 23000 });
    await h.upiPayment.reconcile(rideId, 'rider-1');
    expect((await h.walletRepo.findByRiderId('rider-1'))?.balancePaise).toBe(0);
    await h.completeRide.disputePayment({
      rideId,
      riderId: 'rider-1',
      reason: 'Full refund requested',
    });
    const resolution = {
      rideId,
      adminId: 'support-1',
      outcome: 'RIDER_WINS' as const,
      reason: 'Full payment refunded including arrears',
      refundReference: 'rfnd_arrears',
    };
    await h.completeRide.resolveDispute(resolution);
    await h.completeRide.resolveDispute(resolution);
    const riderWallet = await h.walletRepo.findByRiderId('rider-1');
    expect(riderWallet?.balancePaise).toBe(-3000);
    expect(riderWallet?.owedPaise).toBe(3000);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.earningsBalancePaise).toBe(0);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(5000);
    const reinstated = await h.walletRepo.findTransactionByIdempotencyKey(
      `dispute_arrears_reinstate_${rideId}`,
    );
    expect(reinstated?.amountPaise).toBe(3000);
  });

  it('enforces manual refundReference on online UPI disputes, reverses online earnings once (including post-cashout clawback), and supports searchable closed disputes', async () => {
    const h = buildTestHarness();
    const now = new Date('2026-10-26T10:30:00.000Z');
    await h.walletRepo.save({
      id: 'wallet-driver-1',
      driverId: 'driver-1',
      balancePaise: 5000, // ₹50 prepaid commission balance
      earningsBalancePaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    // Record initial opening credit so COMMISSION chain is anchored at 0 -> 5000
    await h.walletRepo.recordTransaction({
      id: newUuid(),
      walletId: 'wallet-driver-1',
      driverId: 'driver-1',
      bucket: 'COMMISSION',
      type: 'CREDIT',
      amountPaise: 5000,
      referenceType: 'ADMIN_ADJUSTMENT',
      referenceId: 'seed-open',
      idempotencyKey: 'seed-open-1',
      balanceBeforePaise: 0,
      balanceAfterPaise: 5000,
      createdBy: 'admin-1',
      createdAt: now,
    });

    // 1. Online UPI ride settled for ₹200 (20000 paise -> 18400 ONLINE_RIDE_EARNINGS)
    const onlineRideId = newUuid();
    await h.rideRepo.save(
      makeRide({ id: onlineRideId, agreedFarePaise: 20000, status: 'PAYMENT_PENDING' }),
    );
    const checkout = await h.upiPayment.create(onlineRideId, 'rider-1');
    h.capturedOrders.set(checkout.orderId, { paymentId: 'pay_online_555', amountPaise: 20000 });
    await h.upiPayment.reconcile(onlineRideId, 'rider-1');
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(5000 + 18400);

    // Driver cashes out ₹100 (10000 paise) of online earnings before rider files dispute!
    const cashoutOp = await h.walletMoney.requestCashout(
      'driver-1',
      20000,
      'driver1@okaxis',
      'cashout-before-dispute',
    );
    await h.walletMoney.resolveCashout(cashoutOp.id, 'PAID', 'UTR99887766', 'fin-1');
    expect((await h.walletRepo.findByDriverId('driver-1'))?.earningsBalancePaise).toBe(0);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(3400);

    // Rider files dispute on the online UPI ride
    await request(h.app)
      .post(`/api/v1/rides/${onlineRideId}/payment/dispute`)
      .set('x-test-auth', 'user-rider-1:RIDER')
      .send({ reason: 'Charged full fare despite trip ending halfway due to breakdown' })
      .expect(200);

    // Support admin CANNOT resolve online UPI RIDER_WINS without manual Razorpay refundReference!
    const missingRefRes = await request(h.app)
      .post(`/api/v1/rides/${onlineRideId}/payment/dispute/resolve`)
      .set('x-test-auth', 'sup-1:SUPPORT_ADMIN')
      .send({
        outcome: 'RIDER_WINS',
        reason: 'Approved full online refund after breakdown verification',
      })
      .expect(409);
    expect(missingRefRes.body.message).toContain('refundReference');

    // Resolving WITH refundReference reverses 0 from EARNINGS (already cashed out) + 18400 shortfall from COMMISSION (3400 -> -15000)!
    await request(h.app)
      .post(`/api/v1/rides/${onlineRideId}/payment/dispute/resolve`)
      .set('x-test-auth', 'sup-1:SUPPORT_ADMIN')
      .send({
        outcome: 'RIDER_WINS',
        reason: 'Approved full online refund after breakdown verification',
        refundReference: 'rfnd_manual_9001',
      })
      .expect(200);

    // Replay with identical payload is idempotent (zero extra debit)
    await request(h.app)
      .post(`/api/v1/rides/${onlineRideId}/payment/dispute/resolve`)
      .set('x-test-auth', 'sup-1:SUPPORT_ADMIN')
      .send({
        outcome: 'RIDER_WINS',
        reason: 'Approved full online refund after breakdown verification',
        refundReference: 'rfnd_manual_9001',
      })
      .expect(200);

    // Replay with different refundReference conflicts
    await request(h.app)
      .post(`/api/v1/rides/${onlineRideId}/payment/dispute/resolve`)
      .set('x-test-auth', 'sup-1:SUPPORT_ADMIN')
      .send({
        outcome: 'RIDER_WINS',
        reason: 'Approved full online refund after breakdown verification',
        refundReference: 'rfnd_different_9999',
      })
      .expect(409);

    const walletAfterRefund = await h.walletRepo.findByDriverId('driver-1');
    expect(walletAfterRefund?.earningsBalancePaise).toBe(0);
    expect(walletAfterRefund?.balancePaise).toBe(-15000);

    // Server-owned DriverEarningsUseCase reflects ₹0 kept earnings & ₹184 reversed, with 0 unreconciled rides!
    const earningsSummary = await h.driverEarnings.getSummary('driver-1', 'ALL');
    expect(earningsSummary.completedTripsCount).toBe(1);
    expect(earningsSummary.grossFarePaise).toBe(0);
    expect(earningsSummary.netEarningsPaise).toBe(0);
    expect(earningsSummary.onlineEarningsReversedPaise).toBe(18400);
    expect(earningsSummary.unreconciledRidesCount).toBe(0);

    // 2. Duplicate UPI after confirmed cash: cash settlement stays intact when duplicate UPI is refunded!
    const dupRideId = newUuid();
    await h.rideRepo.save(
      makeRide({ id: dupRideId, agreedFarePaise: 10000, status: 'PAYMENT_PENDING' }),
    );
    const dupSession = await h.upiPayment.create(dupRideId, 'rider-1');
    await h.upiPayment.switchToCash(dupRideId, { role: 'RIDER', id: 'rider-1' });
    await h.completeRide.confirmPayment({ rideId: dupRideId, driverId: 'driver-1' });
    const balanceAfterCashComm = (await h.walletRepo.findByDriverId('driver-1'))!.balancePaise;
    expect(balanceAfterCashComm).toBe(-15800); // -15000 - 800 cash commission

    // Late UPI capture arrives -> flags PAYMENT_DISPUTED
    h.capturedOrders.set(dupSession.orderId, { paymentId: 'pay_dup_late_77', amountPaise: 10000 });
    expect((await h.upiPayment.reconcile(dupRideId, 'rider-1')).status).toBe('PAYMENT_DISPUTED');

    // Resolving RIDER_WINS requires refundReference for the duplicate UPI capture, and keeps cash RIDE_COMMISSION intact!
    await request(h.app)
      .post(`/api/v1/rides/${dupRideId}/payment/dispute/resolve`)
      .set('x-test-auth', 'sup-1:SUPPORT_ADMIN')
      .send({
        outcome: 'RIDER_WINS',
        reason: 'Refunded duplicate Razorpay UPI capture; cash payment stood',
        refundReference: 'rfnd_dup_77',
      })
      .expect(200);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(-15800);

    // 3. Switched-to-cash dispute with NO UPI capture does NOT require refundReference and refunds cash commission!
    const pureCashSwitchId = newUuid();
    await h.rideRepo.save(
      makeRide({ id: pureCashSwitchId, agreedFarePaise: 10000, status: 'PAYMENT_PENDING' }),
    );
    await h.upiPayment.create(pureCashSwitchId, 'rider-1');
    await h.upiPayment.switchToCash(pureCashSwitchId, { role: 'DRIVER', id: 'driver-1' });
    await h.completeRide.confirmPayment({ rideId: pureCashSwitchId, driverId: 'driver-1' });
    await h.completeRide.disputePayment({
      rideId: pureCashSwitchId,
      riderId: 'rider-1',
      reason: 'Driver collected wrong cash amount at dropoff',
    });
    await request(h.app)
      .post(`/api/v1/rides/${pureCashSwitchId}/payment/dispute/resolve`)
      .set('x-test-auth', 'sup-1:SUPPORT_ADMIN')
      .send({
        outcome: 'RIDER_WINS',
        reason: 'Cash overcharge verified; refunding 8% commission',
      })
      .expect(200);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(-15800); // -15800 - 800 + 800

    // 4. Searchable closed disputes & receipt evidence filtering
    const searchOnlineRefund = await request(h.app)
      .get(
        '/api/v1/rides/payment/disputes?status=RESOLVED&collection=ONLINE&search=rfnd_manual_9001',
      )
      .set('x-test-auth', 'fin-1:FINANCE_ADMIN')
      .expect(200);
    expect(searchOnlineRefund.body.data).toHaveLength(1);
    expect(searchOnlineRefund.body.data[0].ride.id).toBe(onlineRideId);
    expect(searchOnlineRefund.body.data[0].evidence).toMatchObject({
      providerPaymentId: 'pay_online_555',
      providerRefundReference: 'rfnd_manual_9001',
      onlineEarningsCreditedPaise: 18400,
      onlineEarningsReversedPaise: 18400,
    });

    const searchDupPayment = await request(h.app)
      .get(
        '/api/v1/rides/payment/disputes?status=RESOLVED&collection=ONLINE&search=pay_dup_late_77',
      )
      .set('x-test-auth', 'sup-1:SUPPORT_ADMIN')
      .expect(200);
    expect(searchDupPayment.body.data).toHaveLength(1);
    expect(searchDupPayment.body.data[0].ride.id).toBe(dupRideId);
    expect(searchDupPayment.body.data[0].evidence.isDuplicateUpiAfterCash).toBe(true);

    const cashClosed = await request(h.app)
      .get('/api/v1/rides/payment/disputes?status=RESOLVED&collection=CASH')
      .set('x-test-auth', 'fin-1:FINANCE_ADMIN')
      .expect(200);
    expect(cashClosed.body.data.map((d: { ride: { id: string } }) => d.ride.id)).toEqual([
      pureCashSwitchId,
    ]);

    // Both wallet ledger & ride earnings audits report 0 discrepancies!
    expect((await h.reconcileLedger.execute({ mode: 'AUDIT' })).issues).toEqual([]);
    expect((await h.driverEarnings.reconcile({ mode: 'AUDIT' })).issues).toEqual([]);
  });

  it('audits wallet ledger chains, recovers captured pending recharges once, and enforces finance RBAC', async () => {
    const h = buildTestHarness();
    const now = new Date('2026-10-26T11:00:00.000Z');
    await h.walletRepo.save({
      id: 'wallet-driver-1',
      driverId: 'driver-1',
      balancePaise: 10000,
      earningsBalancePaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await h.walletRepo.recordTransaction({
      id: newUuid(),
      walletId: 'wallet-driver-1',
      driverId: 'driver-1',
      bucket: 'COMMISSION',
      type: 'CREDIT',
      amountPaise: 10000,
      referenceType: 'ADMIN_ADJUSTMENT',
      referenceId: 'init-1',
      idempotencyKey: 'init-key-1',
      balanceBeforePaise: 0,
      balanceAfterPaise: 10000,
      createdBy: 'admin-1',
      createdAt: now,
    });

    // RBAC: SUPPORT_ADMIN and DRIVER cannot invoke /api/v1/admin/wallets/reconcile
    await request(h.app)
      .post('/api/v1/admin/wallets/reconcile')
      .set('x-test-auth', 'sup-1:SUPPORT_ADMIN')
      .send({ mode: 'AUDIT' })
      .expect(403);
    await request(h.app)
      .post('/api/v1/admin/wallets/reconcile')
      .set('x-test-auth', 'user-driver-1:DRIVER')
      .send({ mode: 'AUDIT' })
      .expect(403);

    // Create a pending driver recharge and simulate provider capture before callback
    const rechargeOp = await h.walletMoney.createRecharge('driver-1', 50000, 'rk-step6-1');
    const [storedOp] = await h.operations.list('driver-1');
    h.capturedOrders.set(storedOp!.orderId!, { paymentId: 'pay_rech_150', amountPaise: 50000 });

    const auditPending = await request(h.app)
      .post('/api/v1/admin/wallets/reconcile')
      .set('x-test-auth', 'fin-1:FINANCE_ADMIN')
      .send({ mode: 'AUDIT' })
      .expect(200);
    expect(auditPending.body.data.issues).toEqual([
      expect.objectContaining({
        code: 'UNRECONCILED_CAPTURED_RECHARGE',
        operationId: rechargeOp.id,
        expectedPaise: 50000,
      }),
    ]);

    // Recover captured recharge once (and verify retry never credits twice)
    const recovered = await request(h.app)
      .post('/api/v1/admin/wallets/reconcile')
      .set('x-test-auth', 'fin-1:FINANCE_ADMIN')
      .send({ mode: 'RECONCILE_PENDING_RECHARGES' })
      .expect(200);
    expect(recovered.body.data.reconciledRechargeIds).toEqual([rechargeOp.id]);
    expect(recovered.body.data.issues).toEqual([]);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(60000);

    const retryRecovered = await request(h.app)
      .post('/api/v1/admin/wallets/reconcile')
      .set('x-test-auth', 'fin-1:FINANCE_ADMIN')
      .send({ mode: 'RECONCILE_PENDING_RECHARGES' })
      .expect(200);
    expect(retryRecovered.body.data.reconciledRechargeIds).toEqual([]);
    expect((await h.walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(60000);

    // Inject synthetic corruption on a second wallet to prove anomaly detection
    await h.walletRepo.save({
      id: 'wallet-corrupt',
      driverId: 'driver-corrupt',
      balancePaise: 99999, // Drifted from ledger closing balance!
      earningsBalancePaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const dupRideRef = newUuid();
    const corruptTx1: WalletTransactionEntity = {
      id: newUuid(),
      walletId: 'wallet-corrupt',
      driverId: 'driver-corrupt',
      bucket: 'COMMISSION',
      type: 'DEBIT',
      amountPaise: 800,
      referenceType: 'RIDE_COMMISSION',
      referenceId: dupRideRef,
      idempotencyKey: 'dup-1',
      balanceBeforePaise: 5000,
      balanceAfterPaise: 4200,
      createdBy: 'driver-corrupt',
      createdAt: now,
    };
    const corruptTx2: WalletTransactionEntity = {
      ...corruptTx1,
      id: newUuid(),
      idempotencyKey: 'dup-2',
      // Same balanceBeforePaise (5000 -> 4200) + duplicate RIDE_COMMISSION for same ride!
    };
    await h.walletRepo.recordTransaction(corruptTx1);
    await h.walletRepo.recordTransaction(corruptTx2);

    const corruptAudit = await h.reconcileLedger.execute({
      mode: 'AUDIT',
      driverId: 'driver-corrupt',
    });
    const codes = corruptAudit.issues.map((i) => i.code);
    expect(codes).toContain('BROKEN_TX_CHAIN');
    expect(codes).toContain('DUPLICATE_EVENT_POSTING');
  });
});
