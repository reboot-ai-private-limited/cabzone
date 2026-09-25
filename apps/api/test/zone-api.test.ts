import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  buildZoneContainer,
  MemoryZoneRepository,
  type ZoneEntity,
} from '../src/modules/zone/index.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  requireRole,
} from '../src/modules/identity/interface/middlewares/index.js';
import type { SessionEntity, SessionRepositoryPort } from '../src/modules/identity/domain/index.js';
import type { IdentityContainer } from '../src/modules/identity/identity.container.js';
import { Router } from 'express';

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

function createTestApp() {
  const zoneRepo = new MemoryZoneRepository();
  const sessionRepo = new MemorySessionRepository();
  const tokenAdapter = new JoseTokenAdapter(TEST_SECRET);

  const authenticate = makeAuthenticate({
    tokenVerifier: tokenAdapter,
    sessionRepo,
  });

  const identityContainer: IdentityContainer = {
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
    authenticate,
    requireRole,
    requireZoneAccess: makeRequireZoneAccess({
      adminRepo: {
        findByUserId: async () => null,
      },
    }),
  };

  const zoneContainer = buildZoneContainer({
    zoneRepo,
    globalDefaultBufferM: 20_000,
  });

  const app = createApp({
    identity: identityContainer,
    zone: zoneContainer,
  });

  return {
    app,
    zoneRepo,
    sessionRepo,
    tokenAdapter,
  };
}

describe('Zone Admin & Resolution HTTP Endpoints', () => {
  const siliguriPolygon = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [88.4, 26.7],
        [88.5, 26.7],
        [88.5, 26.8],
        [88.4, 26.8],
        [88.4, 26.7],
      ],
    ],
  };

  const cantonmentPolygon = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [88.43, 26.73],
        [88.44, 26.73],
        [88.44, 26.74],
        [88.43, 26.74],
        [88.43, 26.73],
      ],
    ],
  };

  it('rejects unauthenticated requests to admin zone endpoints', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/v1/admin/zones');
    expect(res.status).toBe(401);
  });

  it('rejects unauthorized roles (RIDER / DRIVER) to admin zone endpoints', async () => {
    const { app, sessionRepo, tokenAdapter } = createTestApp();
    const riderUserId = '018f0a00-0000-7000-8000-000000000099';
    const sessionId = '018f0a00-0000-7000-8000-000000000098';

    await sessionRepo.save({
      id: sessionId,
      userId: riderUserId,
      deviceId: 'dev-rider-1',
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });

    const riderToken = await tokenAdapter.signAccessToken({
      sub: riderUserId,
      role: 'RIDER',
      sessionId,
    });

    const res = await request(app)
      .get('/api/v1/admin/zones')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(403);
  });

  it('allows SUPER_ADMIN to create, read, update, and list zones', async () => {
    const { app, sessionRepo, tokenAdapter } = createTestApp();
    const adminUserId = '018f0a00-0000-7000-8000-000000000001';
    const sessionId = '018f0a00-0000-7000-8000-000000000002';

    await sessionRepo.save({
      id: sessionId,
      userId: adminUserId,
      deviceId: 'dev-admin-1',
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });

    const adminToken = await tokenAdapter.signAccessToken({
      sub: adminUserId,
      role: 'SUPER_ADMIN',
      sessionId,
    });

    // 1. Create CITY zone
    const cityRes = await request(app)
      .post('/api/v1/admin/zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Siliguri City',
        zoneType: 'CITY',
        stateCode: 'WB',
        boundary: siliguriPolygon,
        bufferDistanceM: 25_000,
      });

    expect(cityRes.status).toBe(201);
    expect(cityRes.body.success).toBe(true);
    const city = cityRes.body.data;
    expect(city.name).toBe('Siliguri City');
    expect(city.zoneType).toBe('CITY');
    expect(city.status).toBe('ACTIVE');

    // 2. Reject PICKUP zone creation without parentCityZoneId
    const badPickupRes = await request(app)
      .post('/api/v1/admin/zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Junction Area',
        zoneType: 'PICKUP',
        stateCode: 'WB',
        boundary: siliguriPolygon,
      });

    expect(badPickupRes.status).toBe(400);

    // 3. Create valid PICKUP zone linked to City
    const pickupRes = await request(app)
      .post('/api/v1/admin/zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Siliguri Junction Coverage',
        zoneType: 'PICKUP',
        parentCityZoneId: city.id,
        stateCode: 'WB',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [88.42, 26.72],
              [88.45, 26.72],
              [88.45, 26.75],
              [88.42, 26.75],
              [88.42, 26.72],
            ],
          ],
        },
      });

    expect(pickupRes.status).toBe(201);
    const pickupZone = pickupRes.body.data;
    expect(pickupZone.parentCityZoneId).toBe(city.id);

    // 4. Create EXCLUSION zone
    const exclusionRes = await request(app)
      .post('/api/v1/admin/zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sukna Cantonment Restricted Area',
        zoneType: 'EXCLUSION',
        stateCode: 'WB',
        boundary: cantonmentPolygon,
      });

    expect(exclusionRes.status).toBe(201);
    const exclusionZone = exclusionRes.body.data;

    // 5. Get Zone by ID
    const getRes = await request(app)
      .get(`/api/v1/admin/zones/${city.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(city.id);

    // 6. Update Zone (e.g. deactivate or update buffer)
    const patchRes = await request(app)
      .patch(`/api/v1/admin/zones/${city.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bufferDistanceM: 30_000,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.bufferDistanceM).toBe(30_000);

    // 7. List Zones with filters
    const listCitiesRes = await request(app)
      .get('/api/v1/admin/zones?zoneType=CITY')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listCitiesRes.status).toBe(200);
    expect(listCitiesRes.body.data.length).toBe(1);
    expect(listCitiesRes.body.data[0].zoneType).toBe('CITY');

    const listAllRes = await request(app)
      .get('/api/v1/admin/zones')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listAllRes.status).toBe(200);
    expect(listAllRes.body.data.length).toBe(3);
  });

  it('resolves zones via public POST /api/v1/zones/resolve', async () => {
    const { app, zoneRepo } = createTestApp();

    const cityZone: ZoneEntity = {
      id: '018f0a00-0000-7000-8000-000000000001',
      name: 'Siliguri City',
      zoneType: 'CITY',
      parentCityZoneId: null,
      stateCode: 'WB',
      boundary: siliguriPolygon,
      bufferDistanceM: 25_000,
      status: 'ACTIVE',
      currentPricingConfigId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const exclusionZone: ZoneEntity = {
      id: '018f0a00-0000-7000-8000-000000000003',
      name: 'Sukna Cantonment',
      zoneType: 'EXCLUSION',
      parentCityZoneId: cityZone.id,
      stateCode: 'WB',
      boundary: cantonmentPolygon,
      bufferDistanceM: null,
      status: 'ACTIVE',
      currentPricingConfigId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await zoneRepo.save(cityZone);
    await zoneRepo.save(exclusionZone);

    // 1. Normal resolution inside city
    const normalRes = await request(app)
      .post('/api/v1/zones/resolve')
      .send({
        pickup: { lat: 26.75, lng: 88.45 },
        drop: { lat: 26.78, lng: 88.48 },
      });

    expect(normalRes.status).toBe(200);
    expect(normalRes.body.data.city?.name).toBe('Siliguri City');
    expect(normalRes.body.data.pickupExclusion).toBeNull();
    expect(normalRes.body.data.dropExclusion).toBeNull();

    // 2. Pickup in exclusion zone -> throws 400 Bad Request
    const excludedPickupRes = await request(app)
      .post('/api/v1/zones/resolve')
      .send({
        pickup: { lat: 26.735, lng: 88.435 },
        drop: { lat: 26.78, lng: 88.48 },
      });

    expect(excludedPickupRes.status).toBe(400);
    expect(excludedPickupRes.body.message).toContain('PICKUP_IN_EXCLUSION_ZONE');

    // 3. Drop in exclusion zone with throwOnExclusion: false -> returns 200 with dropExclusion
    const nonThrowingRes = await request(app)
      .post('/api/v1/zones/resolve')
      .send({
        pickup: { lat: 26.78, lng: 88.48 },
        drop: { lat: 26.735, lng: 88.435 },
        throwOnExclusion: false,
      });

    expect(nonThrowingRes.status).toBe(200);
    expect(nonThrowingRes.body.data.dropExclusion?.name).toBe('Sukna Cantonment');

    // 4. Invalid coordinates -> 400 validation error
    const badCoordsRes = await request(app)
      .post('/api/v1/zones/resolve')
      .send({
        pickup: { lat: 105, lng: 88.45 },
        drop: { lat: 26.78, lng: 88.48 },
      });

    expect(badCoordsRes.status).toBe(400);
  });
});
