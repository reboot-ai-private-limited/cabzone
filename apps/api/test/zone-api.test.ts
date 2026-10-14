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
    requireAdminScope: () => requireRole('SUPER_ADMIN'),
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

    // 2. Reject unsupported zone type creation (e.g. PICKUP is not a persisted zone type)
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

    // 3. Get Zone by ID
    const getRes = await request(app)
      .get(`/api/v1/admin/zones/${city.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(city.id);

    // 4. Update Zone (e.g. update buffer distance)
    const patchRes = await request(app)
      .patch(`/api/v1/admin/zones/${city.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bufferDistanceM: 30_000,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.bufferDistanceM).toBe(30_000);

    // 5. List Zones with filters
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
    expect(listAllRes.body.data.length).toBe(1);
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

    await zoneRepo.save(cityZone);

    // 1. Normal resolution inside city
    const normalRes = await request(app)
      .post('/api/v1/zones/resolve')
      .send({
        pickup: { lat: 26.75, lng: 88.45 },
        drop: { lat: 26.78, lng: 88.48 },
      });

    expect(normalRes.status).toBe(200);
    expect(normalRes.body.data.city?.name).toBe('Siliguri City');

    // 2. Invalid coordinates -> 400 validation error
    const badCoordsRes = await request(app)
      .post('/api/v1/zones/resolve')
      .send({
        pickup: { lat: 105, lng: 88.45 },
        drop: { lat: 26.78, lng: 88.48 },
      });

    expect(badCoordsRes.status).toBe(400);
  });

  it('handles validation, in-place geometry updates, activation, and history', async () => {
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

    // 1. Create initial zone v1
    const createRes = await request(app)
      .post('/api/v1/admin/zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Darjeeling City',
        code: 'DARJ_CITY',
        zoneType: 'CITY',
        stateCode: 'WB',
        boundary: siliguriPolygon,
        bufferDistanceM: 15_000,
      });

    expect(createRes.status).toBe(201);
    const zoneV1 = createRes.body.data;
    expect(zoneV1.code).toBe('DARJ_CITY');
    expect(zoneV1.version).toBe(1);
    expect(zoneV1.status).toBe('ACTIVE');

    // 2. Dry-run validation endpoint (POST /api/v1/admin/zones/validate)
    // 2a. Valid geometry dry run (a CITY that does not overlap the existing DARJ_CITY)
    const nonOverlappingPolygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [88.6, 26.5],
          [88.75, 26.5],
          [88.75, 26.6],
          [88.6, 26.6],
          [88.6, 26.5],
        ],
      ],
    };
    const validValidateRes = await request(app)
      .post('/api/v1/admin/zones/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'CITY',
        geometry: nonOverlappingPolygon,
      });
    expect(validValidateRes.status).toBe(200);
    expect(validValidateRes.body.data.valid).toBe(true);
    expect(validValidateRes.body.data.violations).toHaveLength(0);

    // 2b. Conflicting CITY geometry dry run (overlaps active DARJ_CITY)
    const conflictValidateRes = await request(app)
      .post('/api/v1/admin/zones/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'CITY',
        geometry: siliguriPolygon,
      });
    expect(conflictValidateRes.status).toBe(200);
    expect(conflictValidateRes.body.data.valid).toBe(false);
    expect(conflictValidateRes.body.data.violations[0].code).toBe('Z-008');

    // 3. Geometry Versioning (PATCH /api/v1/admin/zones/:id/geometry)
    const expandedPolygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [88.35, 26.65],
          [88.55, 26.65],
          [88.55, 26.85],
          [88.35, 26.85],
          [88.35, 26.65],
        ],
      ],
    };

    const updateGeomRes = await request(app)
      .patch(`/api/v1/admin/zones/${zoneV1.id}/geometry`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        expectedVersion: 1,
        geometry: expandedPolygon,
      });

    expect(updateGeomRes.status).toBe(200);
    const zoneV2 = updateGeomRes.body.data;
    // Edits overwrite in place: same id, same version, still ACTIVE.
    expect(zoneV2.id).toBe(zoneV1.id);
    expect(zoneV2.version).toBe(zoneV1.version);
    expect(zoneV2.status).toBe('ACTIVE');

    // 5. Deactivation & Activation
    // Deactivate v2
    const deactivateRes = await request(app)
      .post(`/api/v1/admin/zones/${zoneV2.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Seasonal closure' });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.status).toBe('INACTIVE');

    // Double deactivate should fail
    const doubleDeactivateRes = await request(app)
      .post(`/api/v1/admin/zones/${zoneV2.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(doubleDeactivateRes.status).toBe(400);
    expect(doubleDeactivateRes.body.message).toContain('ZONE_ALREADY_INACTIVE');

    // Activate v2
    const activateRes = await request(app)
      .post(`/api/v1/admin/zones/${zoneV2.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.status).toBe('ACTIVE');

    // Double activate should fail
    const doubleActivateRes = await request(app)
      .post(`/api/v1/admin/zones/${zoneV2.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(doubleActivateRes.status).toBe(400);
    expect(doubleActivateRes.body.message).toContain('ZONE_ALREADY_ACTIVE');

    // 6. History and Audit Logs (GET /api/v1/admin/zones/:id/history)
    const historyRes = await request(app)
      .get(`/api/v1/admin/zones/${zoneV2.id}/history`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data.versions.length).toBeGreaterThanOrEqual(1);
    expect(historyRes.body.data.auditLogs.length).toBeGreaterThanOrEqual(3);

    // 7. Paginated list with search (GET /api/v1/admin/zones?search=darj&page=1&limit=10)
    const paginatedRes = await request(app)
      .get('/api/v1/admin/zones?search=darj&page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(paginatedRes.status).toBe(200);
    expect(paginatedRes.body.data.pagination).toBeDefined();
    expect(paginatedRes.body.data.pagination.page).toBe(1);
    expect(paginatedRes.body.data.pagination.limit).toBe(10);
    expect(paginatedRes.body.data.items.length).toBeGreaterThanOrEqual(1);

    // 6b. Delete removes the zone permanently
    const deleteRes = await request(app)
      .delete(`/api/v1/admin/zones/${zoneV2.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
    const afterDeleteRes = await request(app)
      .get(`/api/v1/admin/zones/${zoneV2.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(afterDeleteRes.status).toBe(404);
  });
});
