import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import {
  makeAuthenticate,
  requireRole,
} from '../src/modules/identity/interface/middlewares/index.js';
import type { SessionEntity, SessionRepositoryPort } from '../src/modules/identity/domain/index.js';
import type { IdentityContainer } from '../src/modules/identity/identity.container.js';
import { Router } from 'express';
import {
  MemoryPricingConfigRepository,
  MemoryStatePricingRepository,
} from '../src/modules/pricing/infrastructure/persistence/index.js';
import { buildPricingContainer } from '../src/modules/pricing/pricing.container.js';
import { buildZoneContainer, MemoryZoneRepository } from '../src/modules/zone/index.js';

const TEST_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';

class MemorySessionRepository implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();

  async findById(sessionId: string): Promise<SessionEntity | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<SessionEntity | null> {
    for (const s of this.sessions.values()) {
      if (s.refreshTokenHash === tokenHash || s.previousRefreshTokenHash === tokenHash) return { ...s };
    }
    return null;
  }

  async findByUserIdAndDeviceId(userId: string, deviceId: string): Promise<SessionEntity | null> {
    for (const s of this.sessions.values()) {
      if (s.userId === userId && s.deviceId === deviceId) return { ...s };
    }
    return null;
  }

  async save(session: SessionEntity): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async revoke(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.revokedAt = new Date();
      this.sessions.set(sessionId, s);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [id, s] of this.sessions.entries()) {
      if (s.userId === userId) {
        s.revokedAt = new Date();
        this.sessions.set(id, s);
      }
    }
  }
}

describe('Admin Pricing API Endpoints', () => {
  const tokenAdapter = new JoseTokenAdapter(TEST_SECRET);
  const sessionRepo = new MemorySessionRepository();
  const authenticate = makeAuthenticate({ tokenVerifier: tokenAdapter, sessionRepo });

  const dummyIdentity: IdentityContainer = {
    otpPort: {} as any,
    userRepo: {} as any,
    driverProfileRepo: {} as any,
    sessionRepo,
    tokenPort: tokenAdapter,
    cryptoPort: {} as any,
    otpAuditRepo: {} as any,
    authenticate,
    requireRole,
    makeRequireZoneAccess: () => (_req, _res, next) => next(),
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
  };

  const zoneRepo = new MemoryZoneRepository();
  const zoneContainer = buildZoneContainer({ zoneRepo });

  const pricingConfigRepo = new MemoryPricingConfigRepository();
  const statePricingRepo = new MemoryStatePricingRepository();

  const pricingContainer = buildPricingContainer({
    pricingConfigRepo,
    statePricingRepo,
    serviceClassificationUseCase: zoneContainer.serviceClassificationUseCase,
    tokenSecret: TEST_SECRET,
  });

  const app = createApp({
    identity: dummyIdentity,
    zone: zoneContainer,
    pricing: pricingContainer,
  });

  async function getAdminToken() {
    const session: SessionEntity = {
      id: 'session-admin',
      userId: 'admin-1',
      role: 'SUPER_ADMIN',
      cityZoneId: null,
      deviceId: 'device-1',
      refreshTokenHash: 'hash',
      previousRefreshTokenHash: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      lastUsedAt: new Date(),
      revokedAt: null,
    };
    await sessionRepo.save(session);
    return tokenAdapter.signAccessToken({
      sub: 'admin-1',
      role: 'SUPER_ADMIN',
      sessionId: 'session-admin',
    });
  }

  it('creates, activates, and lists city zone pricing configs', async () => {
    const token = await getAdminToken();

    // 1. Create a DRAFT config
    const res1 = await request(app)
      .post('/api/v1/admin/pricing/configs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cityZoneId: 'city-slg-1',
        vehicleType: 'CAB',
        baseFarePaise: 5000,
        ratePerKmPaise: 1500,
        minimumFarePaise: 6000,
        includedDistanceM: 2000,
        bufferSurchargePaise: 3000,
        negotiationFloorPercent: 80,
        negotiationCeilingPercent: 150,
        negotiationWindowSeconds: 90,
        commissionPercent: 8,
        status: 'DRAFT',
      });

    expect(res1.status).toBe(201);
    expect(res1.body.success).toBe(true);
    const createdConfig = res1.body.data;
    expect(createdConfig.version).toBe(1);
    expect(createdConfig.status).toBe('DRAFT');

    // 2. List configs
    const res2 = await request(app)
      .get('/api/v1/admin/pricing/configs?cityZoneId=city-slg-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res2.status).toBe(200);
    expect(res2.body.data.length).toBe(1);

    // 3. Activate the config
    const res3 = await request(app)
      .post(`/api/v1/admin/pricing/configs/${createdConfig.id}/activate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res3.status).toBe(200);
    expect(res3.body.data.status).toBe('ACTIVE');

    // 4. Create v2 config as ACTIVE and check that v1 is retired
    const res4 = await request(app)
      .post('/api/v1/admin/pricing/configs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cityZoneId: 'city-slg-1',
        vehicleType: 'CAB',
        baseFarePaise: 6000,
        ratePerKmPaise: 1600,
        minimumFarePaise: 7000,
        includedDistanceM: 2000,
        bufferSurchargePaise: 3500,
        status: 'ACTIVE',
      });

    expect(res4.status).toBe(201);
    expect(res4.body.data.version).toBe(2);
    expect(res4.body.data.status).toBe('ACTIVE');

    const v1Check = await pricingConfigRepo.findById(createdConfig.id);
    expect(v1Check?.status).toBe('RETIRED');
  });

  it('creates and lists interstate state pricing', async () => {
    const token = await getAdminToken();

    const res1 = await request(app)
      .post('/api/v1/admin/pricing/states')
      .set('Authorization', `Bearer ${token}`)
      .send({
        stateCode: 'WB',
        ratePerKmPaise: 1800,
        baseFarePaise: 8000,
        minimumFarePaise: 10000,
      });

    expect(res1.status).toBe(201);
    expect(res1.body.data.stateCode).toBe('WB');

    const res2 = await request(app)
      .get('/api/v1/admin/pricing/states')
      .set('Authorization', `Bearer ${token}`);

    expect(res2.status).toBe(200);
    expect(res2.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
