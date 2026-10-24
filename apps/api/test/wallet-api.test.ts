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
import { MemoryWalletOperationRepository } from '../src/modules/ledger/infrastructure/persistence/walletOperation.repository.js';

const JWT_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';
const DRIVER_USER = '018f0a00-0000-7000-8000-0000000000b1';
const DRIVER_ID = '018f0a00-0000-7000-8000-000000000101';

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

async function setup() {
  const sessionRepo = new MemorySessionRepository();
  const tokenAdapter = new JoseTokenAdapter(JWT_SECRET);
  const identity: IdentityContainer = {
    requireAdminScope: () => requireRole('SUPER_ADMIN'),
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
    authenticate: makeAuthenticate({ tokenVerifier: tokenAdapter, sessionRepo }),
    requireRole,
    requireZoneAccess: makeRequireZoneAccess({ adminRepo: { findByUserId: async () => null } }),
  };
  const ledger = buildLedgerContainer({
    walletOperations: new MemoryWalletOperationRepository(),
    walletPaymentGateway: {
      keyId: 'rzp_test_fixture',
      live: false,
      createOrder: async () => 'order_fixture',
      findCapturedPayment: async () => null,
    },
    unitOfWork,
    walletRepo: new MemoryWalletRepository(),
    resolveDriverId: async (u) => (u === DRIVER_USER ? DRIVER_ID : null),
  });
  const app = createApp({ identity, ledger });

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
    return `Bearer ${await tokenAdapter.signAccessToken({ sub: userId, role, sessionId })}`;
  }

  return {
    app,
    finance: await login('018f0a00-0000-7000-8000-0000000000c1', 'FINANCE_ADMIN'),
    support: await login('018f0a00-0000-7000-8000-0000000000c2', 'SUPPORT_ADMIN'),
    driver: await login(DRIVER_USER, 'DRIVER'),
    otherDriver: await login('other-driver', 'DRIVER'),
    rider: await login('018f0a00-0000-7000-8000-0000000000a1', 'RIDER'),
  };
}

const adjust = (
  s: Awaited<ReturnType<typeof setup>>,
  auth: string,
  body: Record<string, unknown>,
) => request(s.app).post('/api/v1/admin/wallets/adjustments').set('Authorization', auth).send(body);

describe('Wallet API', () => {
  it('scopes recharge tickets to one request and cashout decisions to Finance', async () => {
    const s = await setup();
    const create = await request(s.app)
      .post('/api/v1/driver/wallet/me/recharges')
      .set('Authorization', s.driver)
      .send({ amountPaise: 10000, idempotencyKey: 'recharge-http' });
    expect(create.status).toBe(201);
    const { operation, checkoutUrl } = create.body.data;
    expect(operation).not.toHaveProperty('idempotencyKey');
    expect(operation).not.toHaveProperty('orderId');
    const ticket = new URL(checkoutUrl).hash.slice(1);
    const session = await request(s.app)
      .post('/api/v1/driver/wallet/recharge-checkout/session')
      .send({ ticket });
    expect(session.status).toBe(200);
    expect(session.body.data.checkout.orderId).toBe('order_fixture');
    expect(
      (
        await request(s.app)
          .post('/api/v1/driver/wallet/recharge-checkout/status')
          .send({ ticket: `${ticket}tampered` })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(s.app)
          .post(`/api/v1/driver/wallet/me/recharges/${operation.id}/status`)
          .set('Authorization', s.otherDriver)
      ).status,
    ).toBe(403);
    await adjust(s, s.finance, {
      driverId: DRIVER_ID,
      amountPaise: 20000,
      type: 'CREDIT',
      reason: 'Test wallet funding',
    });
    const cashout = await request(s.app)
      .post('/api/v1/driver/wallet/me/cashouts')
      .set('Authorization', s.driver)
      .send({ amountPaise: 15000, destinationUpi: 'driver@upi', idempotencyKey: 'cashout-http' });
    expect(cashout.status).toBe(201);
    const path = `/api/v1/admin/wallets/cashouts/${cashout.body.data.id}/resolve`;
    expect(
      (
        await request(s.app)
          .post(path)
          .set('Authorization', s.driver)
          .send({ outcome: 'PAID', detail: 'test-reference' })
      ).status,
    ).toBe(403);
    expect(
      (await request(s.app).get('/api/v1/admin/wallets/cashouts').set('Authorization', s.support))
        .status,
    ).toBe(403);
    const decision = await request(s.app)
      .post(path)
      .set('Authorization', s.finance)
      .send({ outcome: 'REJECTED', detail: 'Correct the destination' });
    expect(decision.status).toBe(200);
    const activity = await request(s.app)
      .get('/api/v1/driver/wallet/me/activity')
      .set('Authorization', s.driver);
    expect(activity.body.data.availableCashoutPaise).toBe(20000);
  });
  it('requires authentication and the right role', async () => {
    const s = await setup();
    expect((await request(s.app).get(`/api/v1/admin/wallets/${DRIVER_ID}`)).status).toBe(401);
    expect(
      (
        await request(s.app)
          .get(`/api/v1/admin/wallets/${DRIVER_ID}`)
          .set('Authorization', s.support)
      ).status,
    ).toBe(403);
    expect(
      (await request(s.app).get('/api/v1/driver/wallet/me').set('Authorization', s.rider)).status,
    ).toBe(403);
  });

  it('a driver with no wallet reads as empty', async () => {
    const s = await setup();
    const res = await request(s.app).get('/api/v1/driver/wallet/me').set('Authorization', s.driver);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ wallet: null, transactions: [] });
  });

  it('finance credit creates the wallet, records the reason, and the driver sees it', async () => {
    const s = await setup();
    const res = await adjust(s, s.finance, {
      driverId: DRIVER_ID,
      amountPaise: 50_000,
      type: 'CREDIT',
      reason: 'Cash top-up received at office',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.wallet.balancePaise).toBe(50_000);
    expect(res.body.data.transaction).toMatchObject({
      type: 'CREDIT',
      referenceType: 'ADMIN_ADJUSTMENT',
      balanceBeforePaise: 0,
      balanceAfterPaise: 50_000,
      note: 'Cash top-up received at office',
    });

    const mine = await request(s.app)
      .get('/api/v1/driver/wallet/me')
      .set('Authorization', s.driver);
    expect(mine.body.data.wallet.balancePaise).toBe(50_000);
    expect(mine.body.data.transactions).toHaveLength(1);
  });

  it('replays a manual adjustment once and rejects a changed request under the same key', async () => {
    const s = await setup();
    const body = {
      driverId: DRIVER_ID,
      amountPaise: 5000,
      type: 'CREDIT',
      reason: 'Manual cash receipt',
      idempotencyKey: crypto.randomUUID(),
    };
    const first = await adjust(s, s.finance, body);
    const replay = await adjust(s, s.finance, body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data.transaction.id).toBe(first.body.data.transaction.id);
    expect(replay.body.data.wallet.balancePaise).toBe(5000);
    expect((await adjust(s, s.finance, { ...body, amountPaise: 6000 })).status).toBe(409);
    const mine = await request(s.app)
      .get('/api/v1/driver/wallet/me')
      .set('Authorization', s.driver);
    expect(mine.body.data.transactions).toHaveLength(1);
  });

  it('debits reduce the balance but can never take it below zero', async () => {
    const s = await setup();
    await adjust(s, s.finance, {
      driverId: DRIVER_ID,
      amountPaise: 10_000,
      type: 'CREDIT',
      reason: 'Initial top-up',
    });

    const ok = await adjust(s, s.finance, {
      driverId: DRIVER_ID,
      amountPaise: 4_000,
      type: 'DEBIT',
      reason: 'Correction for duplicate credit',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.wallet.balancePaise).toBe(6_000);

    const over = await adjust(s, s.finance, {
      driverId: DRIVER_ID,
      amountPaise: 6_001,
      type: 'DEBIT',
      reason: 'Too much',
    });
    expect(over.status).toBe(400);
  });

  it('validates the payload and forbids non-finance roles from adjusting', async () => {
    const s = await setup();
    expect((await adjust(s, s.finance, { driverId: 'nope' })).status).toBe(400);
    expect(
      (
        await adjust(s, s.support, {
          driverId: DRIVER_ID,
          amountPaise: 100,
          type: 'CREDIT',
          reason: 'Not allowed',
        })
      ).status,
    ).toBe(403);
  });

  it('lists driver wallets, transactions, and computes finance KPI stats', async () => {
    const s = await setup();
    // 1. Credit driver wallet
    await adjust(s, s.finance, {
      driverId: DRIVER_ID,
      amountPaise: 25_000,
      type: 'CREDIT',
      reason: 'Driver initial deposit',
    });

    // 2. Debit driver wallet
    const debitAdj = await adjust(s, s.finance, {
      driverId: DRIVER_ID,
      amountPaise: 5_000,
      type: 'DEBIT',
      reason: 'Driver equipment fee adjustment',
    });
    expect(debitAdj.status).toBe(201);
    expect(debitAdj.body.data.wallet.balancePaise).toBe(20_000);

    // 3. Stats endpoint
    const statsRes = await request(s.app)
      .get('/api/v1/admin/wallets/stats')
      .set('Authorization', s.finance);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.driver.totalBalancePaise).toBe(20_000);
    expect(statsRes.body.data.driver.payableToDriversPaise).toBe(20_000);
    expect(statsRes.body.data.driver.payableDriversCount).toBe(1);
    expect(statsRes.body.data.driver.owedToCompanyPaise).toBe(0);
    expect(statsRes.body.data.driver.owedDriversCount).toBe(0);
    expect(statsRes.body.data.driver.suspendedCount).toBe(0);
    expect(statsRes.body.data.driver.driversWithActivityCount).toBe(1);
    expect(statsRes.body.data.transactions.totalTransactionsCount).toBe(2);

    // 4. List driver wallets
    const driverWalletsRes = await request(s.app)
      .get('/api/v1/admin/wallets?type=DRIVER&balanceFilter=PAYABLE&sortBy=HIGHEST_BALANCE')
      .set('Authorization', s.finance);
    expect(driverWalletsRes.status).toBe(200);
    expect(driverWalletsRes.body.data.items.length).toBeGreaterThanOrEqual(1);
    const item = driverWalletsRes.body.data.items[0];
    expect(item.balancePaise).toBe(20_000);
    expect(item.payableToDriverPaise).toBe(20_000);
    expect(item.owedToCompanyPaise).toBe(0);
    expect(item.lifetimeEarningsPaise).toBe(25_000); // 25,000 credit
    expect(item.entriesCount).toBe(2);
    expect(item.lastEntryDate).toBeTruthy();

    // 5. Test balanceFilter=OWING yields empty because balance is positive
    const owingRes = await request(s.app)
      .get('/api/v1/admin/wallets?type=DRIVER&balanceFilter=OWING')
      .set('Authorization', s.finance);
    expect(owingRes.status).toBe(200);
    expect(owingRes.body.data.items).toHaveLength(0);

    // 6. List transactions
    const txRes = await request(s.app)
      .get('/api/v1/admin/wallets/transactions')
      .set('Authorization', s.finance);
    expect(txRes.status).toBe(200);
    expect(txRes.body.data.items).toHaveLength(2);
  });
});

import { unitOfWork } from './helpers/unitOfWork.js';
