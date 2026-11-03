import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Role } from '@cabzone/contracts';
import { newUuid } from '../src/shared/ids.js';
import { errorHandler } from '../src/shared/http/error-handler.js';
import { requireRole } from '../src/modules/identity/interface/middlewares/index.js';
import {
  MemoryWalletRepository,
  type WalletTransactionEntity,
} from '../src/modules/ledger/index.js';
import { GetWalletUseCase } from '../src/modules/ledger/application/useCases/getWallet.usecase.js';
import { ListTransactionsUseCase } from '../src/modules/ledger/application/useCases/listTransactions.usecase.js';
import {
  makeMyWalletController,
  makeMyWalletTransactionsController,
} from '../src/modules/ledger/interface/ledger.controller.js';
import { buildDriverWalletRouter } from '../src/modules/ledger/interface/ledger.routes.js';
import {
  MemoryRideEventRepository,
  MemoryRideRepository,
  type RideEntity,
} from '../src/modules/rides/index.js';
import {
  DriverEarningsUseCase,
  computeIstPeriodWindow,
} from '../src/modules/rides/application/useCases/driverEarnings.usecase.js';
import {
  makeDriverEarningsSummaryController,
  makeDriverHistoryController,
  makeGetRideController,
  makeListRidesController,
  makeReconcileDriverEarningsController,
} from '../src/modules/rides/interface/rides.controller.js';
import { buildRidesRouter } from '../src/modules/rides/interface/rides.routes.js';
import { unitOfWork } from './helpers/unitOfWork.js';

const noopHandler: RequestHandler = (_req, res) => {
  res.status(501).end();
};

function makeRide(overrides: Partial<RideEntity> & { id: string }): RideEntity {
  const ts = overrides.settledAt ?? overrides.completedAt ?? overrides.createdAt ?? new Date();
  return {
    bookerRiderId: newUuid(),
    driverId: 'driver-1',
    vehicleId: null,
    vehicleCategory: 'CAB',
    passenger: {
      riderId: null,
      name: 'Passenger',
      phoneE164: '+919876543210',
      pickupOtpHash: null,
    },
    pickup: { lat: 26.7271, lng: 88.4334, address: 'Sevoke Road' },
    drop: { lat: 26.71, lng: 88.42, address: 'Hill Cart Road' },
    routeSnapshot: {
      provider: 'TEST',
      distanceM: 3200,
      durationSeconds: 700,
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
    suggestedFarePaise: 10000,
    proposedFarePaise: 10000,
    agreedFarePaise: 10000,
    status: 'SETTLED',
    cancellationReason: null,
    offeringExpiresAt: null,
    acceptedAt: ts,
    arrivedAt: ts,
    startedAt: ts,
    completedAt: ts,
    settledAt: ts,
    cancelledAt: null,
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makeTx(
  overrides: Partial<WalletTransactionEntity> & {
    walletId: string;
    type: WalletTransactionEntity['type'];
    amountPaise: number;
    referenceType: WalletTransactionEntity['referenceType'];
  },
): WalletTransactionEntity {
  return {
    id: newUuid(),
    bucket: 'COMMISSION',
    balanceAfterPaise: 10000,
    referenceId: null,
    note: null,
    idempotencyKey: newUuid(),
    createdBy: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildTestApp(deps: {
  rideRepo: MemoryRideRepository;
  rideEventRepo: MemoryRideEventRepository;
  walletRepo: MemoryWalletRepository;
  driverEarnings: DriverEarningsUseCase;
  driverIdByUser: Record<string, string>;
}) {
  const app = express();
  app.use(express.json());

  const authenticate: RequestHandler = (req, _res, next) => {
    const raw = req.header('x-test-auth');
    if (raw) {
      const [userId, role] = raw.split(':');
      if (userId && role) {
        req.auth = { userId, role: role as Role, sessionId: 'sess-test' };
      }
    }
    next();
  };

  const actors = {
    resolveRiderId: async () => null,
    resolveDriverId: async (userId: string) => deps.driverIdByUser[userId] ?? null,
  };

  const ridesRouter = buildRidesRouter({
    authenticate,
    requireRider: requireRole('RIDER'),
    requireDriver: requireRole('DRIVER'),
    requireCanCancel: requireRole('RIDER', 'DRIVER', 'SUPER_ADMIN'),
    requireCanRead: requireRole('RIDER', 'DRIVER', 'SUPER_ADMIN', 'FINANCE_ADMIN'),
    requireDisputeAdmin: requireRole('SUPPORT_ADMIN', 'SUPER_ADMIN'),
    requireWaiverAdmin: requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'),
    requireFinanceAdmin: requireRole('FINANCE_ADMIN', 'SUPER_ADMIN'),
    createRide: noopHandler,
    listRides: makeListRidesController(deps.rideRepo, actors),
    driverEarnings: makeDriverEarningsSummaryController(deps.driverEarnings, actors),
    driverHistory: makeDriverHistoryController(deps.rideRepo, deps.driverEarnings, actors),
    reconcileDriverEarnings: makeReconcileDriverEarningsController(deps.driverEarnings),
    getRide: makeGetRideController(deps.rideRepo, actors, deps.rideEventRepo, deps.driverEarnings),
    getCommunication: noopHandler,
    listMessages: noopHandler,
    sendMessage: noopHandler,
    getRideEvents: noopHandler,
    getRideRating: noopHandler,
    submitRideRating: noopHandler,
    acceptRide: noopHandler,
    driverCounter: noopHandler,
    raiseFare: noopHandler,
    respondCounter: noopHandler,
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
    disputePayment: noopHandler,
    resolvePaymentDispute: noopHandler,
    listPaymentDisputes: noopHandler,
    cancelRide: noopHandler,
    waiveCancellationFee: noopHandler,
  });

  const getWalletUseCase = new GetWalletUseCase(deps.walletRepo);
  const listTxUseCase = new ListTransactionsUseCase(deps.walletRepo);
  const driverWalletRouter = buildDriverWalletRouter({
    authenticate,
    requireDriver: requireRole('DRIVER'),
    getMyWallet: makeMyWalletController(getWalletUseCase, actors.resolveDriverId),
    listMyTransactions: makeMyWalletTransactionsController(
      deps.walletRepo,
      listTxUseCase,
      actors.resolveDriverId,
    ),
    money: {
      page: noopHandler,
      session: noopHandler,
      status: noopHandler,
      activity: noopHandler,
      recharge: noopHandler,
      rechargeStatus: noopHandler,
      cashout: noopHandler,
      cashouts: noopHandler,
      resolve: noopHandler,
      syncCashout: noopHandler,
      webhook: noopHandler,
    },
  });

  app.use('/api/v1/rides', ridesRouter);
  app.use('/api/v1/driver/wallet', driverWalletRouter);
  app.use(errorHandler);
  return app;
}

describe('Server-owned driver earnings, pagination & historical reconciliation', () => {
  it('computes exact IST period totals beyond 100 rides and paginates full history without gaps or duplicates', async () => {
    const rideRepo = new MemoryRideRepository();
    const rideEventRepo = new MemoryRideEventRepository();
    const walletRepo = new MemoryWalletRepository();
    const driverEarnings = new DriverEarningsUseCase({
      rideRepo,
      rideEventRepo,
      walletRepo,
      unitOfWork,
    });

    const driverId = newUuid();
    const walletId = newUuid();
    // Anchor at 2026-10-26 15:30 IST (2026-10-26T10:00:00.000Z)
    // Start of IST day is 2026-10-25T18:30:00.000Z
    const now = new Date('2026-10-26T10:00:00.000Z');
    await walletRepo.save({
      id: walletId,
      driverId,
      balancePaise: 50000,
      earningsBalancePaise: 0,
      pendingCashoutPaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const istWindow = computeIstPeriodWindow('TODAY', now);
    expect(istWindow.since?.toISOString()).toBe('2026-10-25T18:30:00.000Z');

    // Seed 125 settled cash rides:
    // - 1 ride at 00:05 IST today (2026-10-25T18:35:00Z — yesterday in UTC, TODAY in IST!)
    // - 39 more rides today -> 40 TODAY rides
    // - 1 ride at 23:55 IST yesterday (2026-10-25T18:25:00Z — WEEK, NOT TODAY!)
    // - 39 more rides 5 days ago -> +40 WEEK-only rides (80 in WEEK)
    // - 25 rides 20 days ago -> +25 MONTH-only rides (105 in MONTH)
    // - 20 rides 45 days ago -> +20 ALL-only rides (125 in ALL)
    const timestamps: Date[] = [
      new Date('2026-10-25T18:35:00.000Z'),
      ...Array.from({ length: 39 }, (_, i) => new Date(now.getTime() - (i + 1) * 60_000)),
      new Date('2026-10-25T18:25:00.000Z'),
      ...Array.from(
        { length: 39 },
        (_, i) => new Date(now.getTime() - 5 * 86_400_000 - i * 60_000),
      ),
      ...Array.from(
        { length: 25 },
        (_, i) => new Date(now.getTime() - 20 * 86_400_000 - i * 60_000),
      ),
      ...Array.from(
        { length: 20 },
        (_, i) => new Date(now.getTime() - 45 * 86_400_000 - i * 60_000),
      ),
    ];
    expect(timestamps.length).toBe(125);

    for (let idx = 0; idx < timestamps.length; idx++) {
      const ts = timestamps[idx]!;
      const rideId = newUuid();
      // Gross = 10000 paise (Rs 100), commission = 800 paise (Rs 8), net = 9200 paise (Rs 92)
      await rideRepo.save(
        makeRide({
          id: rideId,
          driverId,
          agreedFarePaise: 10000,
          status: 'SETTLED',
          acceptedAt: ts,
          completedAt: ts,
          settledAt: ts,
          createdAt: ts,
          updatedAt: ts,
        }),
      );
      await walletRepo.recordTransaction(
        makeTx({
          walletId,
          type: 'DEBIT',
          amountPaise: 800,
          referenceType: 'RIDE_COMMISSION',
          referenceId: rideId,
          idempotencyKey: `commission_debit_${rideId}`,
          createdAt: ts,
        }),
      );
    }

    const today = await driverEarnings.getSummary(driverId, 'TODAY', now);
    const week = await driverEarnings.getSummary(driverId, 'WEEK', now);
    const month = await driverEarnings.getSummary(driverId, 'MONTH', now);
    const all = await driverEarnings.getSummary(driverId, 'ALL', now);

    expect(today.completedTripsCount).toBe(40);
    expect(today.grossFarePaise).toBe(40 * 10000);
    expect(today.netCommissionPaise).toBe(40 * 800);
    expect(today.netEarningsPaise).toBe(40 * 9200);

    expect(week.completedTripsCount).toBe(80);
    expect(week.netEarningsPaise).toBe(80 * 9200);

    expect(month.completedTripsCount).toBe(105);
    expect(month.netEarningsPaise).toBe(105 * 9200);

    expect(all.completedTripsCount).toBe(125);
    expect(all.totalAssignedRidesCount).toBe(125);
    expect(all.grossFarePaise).toBe(125 * 10000);
    expect(all.netEarningsPaise).toBe(125 * 9200);
    expect(all.unreconciledRidesCount).toBe(0);

    // Exercise HTTP history pagination across all 125 rides
    const app = buildTestApp({
      rideRepo,
      rideEventRepo,
      walletRepo,
      driverEarnings,
      driverIdByUser: { 'user-driver-1': driverId },
    });

    const p1 = await request(app)
      .get('/api/v1/rides/driver/history?limit=50&offset=0')
      .set('x-test-auth', 'user-driver-1:DRIVER')
      .expect(200);
    const p2 = await request(app)
      .get('/api/v1/rides/driver/history?limit=50&offset=50')
      .set('x-test-auth', 'user-driver-1:DRIVER')
      .expect(200);
    const p3 = await request(app)
      .get('/api/v1/rides/driver/history?limit=50&offset=100')
      .set('x-test-auth', 'user-driver-1:DRIVER')
      .expect(200);

    expect(p1.body.data.total).toBe(125);
    expect(p1.body.data.items).toHaveLength(50);
    expect(p1.body.data.hasMore).toBe(true);
    expect(p1.body.data.items[0].driverSettlement).toEqual({
      grossPaise: 10000,
      commissionChargedPaise: 800,
      commissionRefundedPaise: 0,
      netCommissionPaise: 800,
      netEarningsPaise: 9200,
      settledVia: 'CASH',
    });

    expect(p2.body.data.items).toHaveLength(50);
    expect(p2.body.data.hasMore).toBe(true);

    expect(p3.body.data.items).toHaveLength(25);
    expect(p3.body.data.hasMore).toBe(false);

    const seenIds = new Set([
      ...p1.body.data.items.map((r: { id: string }) => r.id),
      ...p2.body.data.items.map((r: { id: string }) => r.id),
      ...p3.body.data.items.map((r: { id: string }) => r.id),
    ]);
    expect(seenIds.size).toBe(125);

    // Backward-compatible /api/v1/rides still returns an array
    const legacyList = await request(app)
      .get('/api/v1/rides?limit=10')
      .set('x-test-auth', 'user-driver-1:DRIVER')
      .expect(200);
    expect(Array.isArray(legacyList.body.data)).toBe(true);
    expect(legacyList.body.data).toHaveLength(10);
  });

  it('strictly separates cash rides, online UPI payouts, unpaid rides, open disputes, dispute refunds, cancellations, and wallet recharges/cashouts', async () => {
    const rideRepo = new MemoryRideRepository();
    const rideEventRepo = new MemoryRideEventRepository();
    const walletRepo = new MemoryWalletRepository();
    const driverEarnings = new DriverEarningsUseCase({
      rideRepo,
      rideEventRepo,
      walletRepo,
      unitOfWork,
    });

    const now = new Date('2026-10-26T09:00:00.000Z');
    const driverId = newUuid();
    const walletId = newUuid();
    await walletRepo.save({
      id: walletId,
      driverId,
      balancePaise: 40000,
      earningsBalancePaise: 18400,
      pendingCashoutPaise: 10000,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    // 1. Settled cash ride: gross 15000, commission 1200 -> net 13800
    const cashRideId = newUuid();
    await rideRepo.save(
      makeRide({
        id: cashRideId,
        driverId,
        agreedFarePaise: 15000,
        status: 'SETTLED',
        settledAt: now,
      }),
    );
    await walletRepo.recordTransaction(
      makeTx({
        walletId,
        type: 'DEBIT',
        amountPaise: 1200,
        referenceType: 'RIDE_COMMISSION',
        referenceId: cashRideId,
        createdAt: now,
      }),
    );

    // 2. Settled online Razorpay UPI ride: gross 20000, ONLINE_RIDE_EARNINGS credit 18400 -> implied commission 1600, net 18400
    const onlineRideId = newUuid();
    await rideRepo.save(
      makeRide({
        id: onlineRideId,
        driverId,
        agreedFarePaise: 20000,
        status: 'PAYMENT_CONFIRMED',
        settledAt: now,
      }),
    );
    await walletRepo.recordTransaction(
      makeTx({
        walletId,
        bucket: 'EARNINGS',
        type: 'CREDIT',
        amountPaise: 18400,
        referenceType: 'ONLINE_RIDE_EARNINGS',
        referenceId: onlineRideId,
        idempotencyKey: `ride-earnings:${onlineRideId}`,
        createdAt: now,
      }),
    );

    // 3. Unpaid completed ride (PAYMENT_PENDING): gross 18000 -> must NOT enter settled gross/net!
    const unpaidRideId = newUuid();
    await rideRepo.save(
      makeRide({
        id: unpaidRideId,
        driverId,
        agreedFarePaise: 18000,
        status: 'PAYMENT_PENDING',
        completedAt: now,
        settledAt: null,
      }),
    );

    // 4. Open PAYMENT_DISPUTED ride with prior commission debit: gross 25000 -> held out while open!
    const openDisputeRideId = newUuid();
    await rideRepo.save(
      makeRide({
        id: openDisputeRideId,
        driverId,
        agreedFarePaise: 25000,
        status: 'PAYMENT_DISPUTED',
        settledAt: now,
        updatedAt: now,
      }),
    );
    await walletRepo.recordTransaction(
      makeTx({
        walletId,
        type: 'DEBIT',
        amountPaise: 2000,
        referenceType: 'RIDE_COMMISSION',
        referenceId: openDisputeRideId,
        createdAt: now,
      }),
    );

    // 5. Settled ride where dispute refunded commission: gross 10000, commission 800, refund 800 -> netCommission 0, net 10000
    const refundedRideId = newUuid();
    await rideRepo.save(
      makeRide({
        id: refundedRideId,
        driverId,
        agreedFarePaise: 10000,
        status: 'SETTLED',
        settledAt: now,
      }),
    );
    await walletRepo.recordTransaction(
      makeTx({
        walletId,
        type: 'DEBIT',
        amountPaise: 800,
        referenceType: 'RIDE_COMMISSION',
        referenceId: refundedRideId,
        createdAt: now,
      }),
    );
    await walletRepo.recordTransaction(
      makeTx({
        walletId,
        type: 'CREDIT',
        amountPaise: 800,
        referenceType: 'DISPUTE_REFUND',
        referenceId: refundedRideId,
        createdAt: now,
      }),
    );

    // 6. Cancelled ride with 2500 paise CANCELLATION_COMPENSATION -> reported separately, never inflates completedTripsCount or grossFarePaise
    const cancelledRideId = newUuid();
    await rideRepo.save(
      makeRide({
        id: cancelledRideId,
        driverId,
        agreedFarePaise: 12000,
        status: 'CANCELLED',
        settledAt: null,
        completedAt: null,
        cancelledAt: now,
      }),
    );
    await walletRepo.recordTransaction(
      makeTx({
        walletId,
        type: 'CREDIT',
        amountPaise: 2500,
        referenceType: 'CANCELLATION_COMPENSATION',
        referenceId: cancelledRideId,
        createdAt: now,
      }),
    );

    // 7. Non-ride wallet activity + synthetic orphan RIDE_COMMISSION -> must NEVER pollute driver ride earnings!
    await walletRepo.recordTransaction(
      makeTx({
        walletId,
        type: 'CREDIT',
        amountPaise: 50000,
        referenceType: 'WALLET_RECHARGE',
        referenceId: 'op-recharge-1',
        createdAt: now,
      }),
    );
    await walletRepo.recordTransaction(
      makeTx({
        walletId,
        bucket: 'EARNINGS',
        type: 'DEBIT',
        amountPaise: 10000,
        referenceType: 'WALLET_CASHOUT',
        referenceId: 'op-cashout-1',
        createdAt: now,
      }),
    );
    await walletRepo.recordTransaction(
      makeTx({
        walletId,
        type: 'CREDIT',
        amountPaise: 9999,
        referenceType: 'RIDE_COMMISSION',
        referenceId: 'REF_ORPHAN_SEED_01',
        createdAt: now,
      }),
    );

    const summary = await driverEarnings.getSummary(driverId, 'TODAY', now);
    expect(summary.totalAssignedRidesCount).toBe(6);
    expect(summary.completedTripsCount).toBe(3); // cashRide + onlineRide + refundedRide
    expect(summary.cancelledTripsCount).toBe(1);
    expect(summary.pendingPaymentTripsCount).toBe(1);
    expect(summary.pendingPaymentGrossPaise).toBe(18000);
    expect(summary.disputedTripsCount).toBe(1);
    expect(summary.disputedGrossPaise).toBe(25000);

    expect(summary.cashGrossPaise).toBe(15000 + 10000); // 25000
    expect(summary.onlineGrossPaise).toBe(20000);
    expect(summary.grossFarePaise).toBe(45000);
    expect(summary.commissionChargedPaise).toBe(1200 + 1600 + 800); // 3600
    expect(summary.commissionRefundedPaise).toBe(800);
    expect(summary.netCommissionPaise).toBe(2800);
    expect(summary.netEarningsPaise).toBe(45000 - 2800); // 42200 (13800 + 18400 + 10000)
    expect(summary.cancellationCompensationPaise).toBe(2500);
    expect(summary.unreconciledRidesCount).toBe(0);
  });

  it('reconciles historical rides in AUDIT mode before guarded idempotent BACKFILL_ONLINE_EARNINGS', async () => {
    const rideRepo = new MemoryRideRepository();
    const rideEventRepo = new MemoryRideEventRepository();
    const walletRepo = new MemoryWalletRepository();
    const driverEarnings = new DriverEarningsUseCase({
      rideRepo,
      rideEventRepo,
      walletRepo,
      unitOfWork,
    });

    const now = new Date('2026-10-26T09:00:00.000Z');
    const driverId = newUuid();
    const walletId = newUuid();
    await walletRepo.save({
      id: walletId,
      driverId,
      balancePaise: 5000,
      earningsBalancePaise: 0,
      pendingCashoutPaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    // Historical online UPI ride confirmed before ONLINE_RIDE_EARNINGS ledger existed
    const histOnlineRideId = newUuid();
    await rideRepo.save(
      makeRide({
        id: histOnlineRideId,
        driverId,
        agreedFarePaise: 25000, // 8% = 2000 commission -> 23000 payable
        status: 'PAYMENT_CONFIRMED',
        settledAt: now,
      }),
    );
    await rideEventRepo.save({
      id: newUuid(),
      rideId: histOnlineRideId,
      eventType: 'PAYMENT_CONFIRMED',
      actorType: 'SYSTEM',
      actorId: null,
      previousStatus: 'PAYMENT_PENDING',
      newStatus: 'PAYMENT_CONFIRMED',
      metadata: {
        method: 'UPI',
        paymentId: 'pay_hist_123',
        farePaise: 25000,
        commissionPaise: 2000,
      },
      createdAt: now,
    });

    // Settled cash ride missing commission debit
    const brokenCashRideId = newUuid();
    await rideRepo.save(
      makeRide({
        id: brokenCashRideId,
        driverId,
        agreedFarePaise: 10000,
        status: 'SETTLED',
        settledAt: now,
      }),
    );

    // Orphan ledger ride entry
    await walletRepo.recordTransaction(
      makeTx({
        walletId,
        type: 'DEBIT',
        amountPaise: 800,
        referenceType: 'RIDE_COMMISSION',
        referenceId: 'REF_NON_EXISTENT',
        createdAt: now,
      }),
    );

    const app = buildTestApp({
      rideRepo,
      rideEventRepo,
      walletRepo,
      driverEarnings,
      driverIdByUser: { 'user-driver-1': driverId },
    });

    // Driver role cannot invoke admin reconciliation
    await request(app)
      .post('/api/v1/rides/admin/reconcile-earnings')
      .set('x-test-auth', 'user-driver-1:DRIVER')
      .send({ mode: 'AUDIT' })
      .expect(403);

    // Read-only AUDIT surfaces all 3 issues and mutates nothing
    const auditRes = await request(app)
      .post('/api/v1/rides/admin/reconcile-earnings')
      .set('x-test-auth', 'admin-1:FINANCE_ADMIN')
      .send({ mode: 'AUDIT' })
      .expect(200);

    const codes = auditRes.body.data.issues.map((i: { code: string }) => i.code);
    expect(codes).toContain('HISTORICAL_ONLINE_MISSING_EARNINGS');
    expect(codes).toContain('CASH_MISSING_COMMISSION');
    expect(codes).toContain('ORPHAN_LEDGER_RIDE_ENTRY');
    expect((await walletRepo.findByDriverId(driverId))?.balancePaise).toBe(5000);

    // Guarded backfill rejects missing explicit rideIds
    await request(app)
      .post('/api/v1/rides/admin/reconcile-earnings')
      .set('x-test-auth', 'admin-1:FINANCE_ADMIN')
      .send({ mode: 'BACKFILL_ONLINE_EARNINGS' })
      .expect(400);

    // Guarded backfill credits historical online ride once and skips cash ride safely
    const backfillRes = await request(app)
      .post('/api/v1/rides/admin/reconcile-earnings')
      .set('x-test-auth', 'admin-1:FINANCE_ADMIN')
      .send({
        mode: 'BACKFILL_ONLINE_EARNINGS',
        rideIds: [histOnlineRideId, brokenCashRideId],
      })
      .expect(200);

    expect(backfillRes.body.data.backfilledRideIds).toEqual([histOnlineRideId]);
    expect(backfillRes.body.data.skippedRideIds).toEqual([brokenCashRideId]);

    const afterBackfillWallet = await walletRepo.findByDriverId(driverId);
    expect(afterBackfillWallet?.balancePaise).toBe(5000);
    expect(afterBackfillWallet?.earningsBalancePaise).toBe(23000);

    // Re-running backfill is 100% idempotent — zero duplicate credit!
    const retryRes = await request(app)
      .post('/api/v1/rides/admin/reconcile-earnings')
      .set('x-test-auth', 'admin-1:FINANCE_ADMIN')
      .send({
        mode: 'BACKFILL_ONLINE_EARNINGS',
        rideIds: [histOnlineRideId],
      })
      .expect(200);

    expect(retryRes.body.data.backfilledRideIds).toEqual([]);
    expect(retryRes.body.data.skippedRideIds).toEqual([histOnlineRideId]);
    expect((await walletRepo.findByDriverId(driverId))?.earningsBalancePaise).toBe(23000);
  });

  it('paginates driver wallet transactions by direction and respects txLimit on /me', async () => {
    const rideRepo = new MemoryRideRepository();
    const rideEventRepo = new MemoryRideEventRepository();
    const walletRepo = new MemoryWalletRepository();
    const driverEarnings = new DriverEarningsUseCase({
      rideRepo,
      rideEventRepo,
      walletRepo,
      unitOfWork,
    });

    const driverId = newUuid();
    const walletId = newUuid();
    const baseTime = new Date('2026-10-26T08:00:00.000Z');
    await walletRepo.save({
      id: walletId,
      driverId,
      balancePaise: 25000,
      earningsBalancePaise: 0,
      pendingCashoutPaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    // 15 DEBIT entries + 10 CREDIT entries = 25 total
    for (let i = 0; i < 25; i++) {
      const isCredit = i % 5 < 2; // 2 credits per 5 -> 10 credits, 15 debits
      await walletRepo.recordTransaction(
        makeTx({
          walletId,
          type: isCredit ? 'CREDIT' : 'DEBIT',
          amountPaise: 1000 + i,
          referenceType: isCredit ? 'WALLET_RECHARGE' : 'RIDE_COMMISSION',
          createdAt: new Date(baseTime.getTime() + i * 1000),
        }),
      );
    }

    const app = buildTestApp({
      rideRepo,
      rideEventRepo,
      walletRepo,
      driverEarnings,
      driverIdByUser: { 'user-driver-1': driverId },
    });

    const meRes = await request(app)
      .get('/api/v1/driver/wallet/me?txLimit=5')
      .set('x-test-auth', 'user-driver-1:DRIVER')
      .expect(200);
    expect(meRes.body.data.transactions).toHaveLength(5);

    const creditPage = await request(app)
      .get('/api/v1/driver/wallet/me/transactions?direction=CREDIT&limit=6&offset=0')
      .set('x-test-auth', 'user-driver-1:DRIVER')
      .expect(200);
    expect(creditPage.body.data.total).toBe(10);
    expect(creditPage.body.data.items).toHaveLength(6);
    expect(creditPage.body.data.hasMore).toBe(true);

    const debitPage = await request(app)
      .get('/api/v1/driver/wallet/me/transactions?direction=DEBIT&limit=20&offset=0')
      .set('x-test-auth', 'user-driver-1:DRIVER')
      .expect(200);
    expect(debitPage.body.data.total).toBe(15);
    expect(debitPage.body.data.items).toHaveLength(15);
    expect(debitPage.body.data.hasMore).toBe(false);
  });
});
