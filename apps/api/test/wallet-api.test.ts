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
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
    authenticate: makeAuthenticate({ tokenVerifier: tokenAdapter, sessionRepo }),
    requireRole,
    requireZoneAccess: makeRequireZoneAccess({ adminRepo: { findByUserId: async () => null } }),
  };
  const ledger = buildLedgerContainer({
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
    rider: await login('018f0a00-0000-7000-8000-0000000000a1', 'RIDER'),
  };
}

const adjust = (
  s: Awaited<ReturnType<typeof setup>>,
  auth: string,
  body: Record<string, unknown>,
) => request(s.app).post('/api/v1/admin/wallets/adjustments').set('Authorization', auth).send(body);

describe('Wallet API', () => {
  it('requires authentication and the right role', async () => {
    const s = await setup();
    expect((await request(s.app).get(`/api/v1/admin/wallets/${DRIVER_ID}`)).status).toBe(401);
    expect(
      (await request(s.app).get(`/api/v1/admin/wallets/${DRIVER_ID}`).set('Authorization', s.support)).status,
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

    const mine = await request(s.app).get('/api/v1/driver/wallet/me').set('Authorization', s.driver);
    expect(mine.body.data.wallet.balancePaise).toBe(50_000);
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
});
