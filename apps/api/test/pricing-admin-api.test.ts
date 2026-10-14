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
import { MemoryPricingConfigRepository } from '../src/modules/pricing/infrastructure/persistence/index.js';
import { buildPricingContainer } from '../src/modules/pricing/pricing.container.js';
import { unitOfWork } from './helpers/unitOfWork.js';
import { buildZoneContainer, MemoryZoneRepository } from '../src/modules/zone/index.js';

const TEST_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';

class MemorySessionRepository implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();

  async findById(sessionId: string): Promise<SessionEntity | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<SessionEntity | null> {
    for (const s of this.sessions.values()) {
      if (s.refreshTokenHash === tokenHash || s.previousRefreshTokenHash === tokenHash)
        return { ...s };
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
    requireAdminScope: () => requireRole('SUPER_ADMIN'),
    requireZoneAccess: () => (_req, _res, next) => next(),
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
  };

  const zoneRepo = new MemoryZoneRepository();
  const zoneContainer = buildZoneContainer({ zoneRepo });

  const pricingConfigRepo = new MemoryPricingConfigRepository();

  const pricingContainer = buildPricingContainer({
    unitOfWork,
    pricingConfigRepo,
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
    expect(res3.body.data.version).toBe(2);

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
        bufferSurchargePaise: 3500,
        status: 'ACTIVE',
      });

    expect(res4.status).toBe(201);
    expect(res4.body.data.version).toBe(3);
    expect(res4.body.data.status).toBe('ACTIVE');

    const v1Check = await pricingConfigRepo.findById(createdConfig.id);
    expect(v1Check?.status).toBe('RETIRED');
  });

  it('creates, edits (PATCH), and updates status for GLOBAL baseline pricing configs', async () => {
    const token = await getAdminToken();

    // 1. Create a GLOBAL config in DRAFT status
    const createRes = await request(app)
      .post('/api/v1/admin/pricing/configs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        level: 'GLOBAL',
        vehicleType: 'CAB',
        baseFarePaise: 4000,
        ratePerKmPaise: 1300,
        minimumFarePaise: 5000,
        outstationBaseFarePaise: 6000,
        outstationRatePerKmPaise: 1800,
        outstationMinimumFarePaise: 12000,
        status: 'DRAFT',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.level).toBe('GLOBAL');
    expect(createRes.body.data.status).toBe('DRAFT');
    const globalId = createRes.body.data.id;

    // 2. PATCH update the GLOBAL config: fares, outstation rates, negotiation, and status to ACTIVE
    const patchRes = await request(app)
      .patch(`/api/v1/admin/pricing/configs/${globalId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        baseFarePaise: 4500,
        ratePerKmPaise: 1400,
        minimumFarePaise: 5500,
        outstationBaseFarePaise: 6500,
        outstationRatePerKmPaise: 1900,
        outstationMinimumFarePaise: 13000,
        commissionPercent: 10,
        status: 'ACTIVE',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.baseFarePaise).toBe(4500);
    expect(patchRes.body.data.ratePerKmPaise).toBe(1400);
    expect(patchRes.body.data.minimumFarePaise).toBe(5500);
    expect(patchRes.body.data.outstationBaseFarePaise).toBe(6500);
    expect(patchRes.body.data.commissionPercent).toBe(10);
    expect(patchRes.body.data.status).toBe('ACTIVE');

    // 3. Verify in repository
    const saved = await pricingConfigRepo.findById(globalId);
    expect(saved?.baseFarePaise).toBe(4500);
    expect(saved?.status).toBe('ACTIVE');
  });

  it('creates, edits (PATCH), and updates stateCode and fares for STATE pricing configs', async () => {
    const token = await getAdminToken();

    // 1. Create a STATE config for WB (West Bengal)
    const createRes = await request(app)
      .post('/api/v1/admin/pricing/configs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        level: 'STATE',
        stateCode: 'WB',
        vehicleType: 'E_RICKSHAW',
        baseFarePaise: 3000,
        ratePerKmPaise: 1000,
        minimumFarePaise: 4000,
        status: 'ACTIVE',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.level).toBe('STATE');
    expect(createRes.body.data.stateCode).toBe('WB');
    expect(createRes.body.data.stateName).toBe('West Bengal');
    const stateId = createRes.body.data.id;

    // 2. PATCH update the STATE config: change stateCode to SK (Sikkim) and modify rates
    const patchRes = await request(app)
      .patch(`/api/v1/admin/pricing/configs/${stateId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        stateCode: 'SK',
        baseFarePaise: 3500,
        ratePerKmPaise: 1200,
        minimumFarePaise: 4500,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.stateCode).toBe('SK');
    expect(patchRes.body.data.stateName).toBe('Sikkim');
    expect(patchRes.body.data.baseFarePaise).toBe(3500);
    expect(patchRes.body.data.ratePerKmPaise).toBe(1200);
    expect(patchRes.body.data.minimumFarePaise).toBe(4500);

    // 3. Verify in repository
    const saved = await pricingConfigRepo.findById(stateId);
    expect(saved?.stateCode).toBe('SK');
    expect(saved?.stateName).toBe('Sikkim');
    expect(saved?.baseFarePaise).toBe(3500);
  });
});
