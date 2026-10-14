import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import type { AuthRole } from '@cabzone/contracts';
import { createApp } from '../src/app.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import type { SessionEntity, SessionRepositoryPort } from '../src/modules/identity/domain/index.js';
import { makeAuthenticate, requireRole } from '../src/modules/identity/interface/middlewares/index.js';
import { HaversineRouteProvider } from '../src/modules/routing/infrastructure/haversine.provider.js';
import { buildRoutingContainer } from '../src/modules/routing/routing.container.js';

class MemorySessionRepository implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();

  async findById(sessionId: string): Promise<SessionEntity | null> {
    return this.sessions.get(sessionId) ?? null;
  }
  async findByTokenHash(): Promise<SessionEntity | null> {
    return null;
  }
  async findByUserIdAndDeviceId(): Promise<SessionEntity | null> {
    return null;
  }
  async save(session: SessionEntity): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }
  async revoke(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
  async revokeAllForUser(): Promise<void> {}
}

describe('Admin Routing HTTP API', () => {
  const secret = 'super-secret-jwt-key-for-test-32-chars-long';
  const sessionRepo = new MemorySessionRepository();
  const tokenAdapter = new JoseTokenAdapter(secret);
  const authenticate = makeAuthenticate({ tokenVerifier: tokenAdapter, sessionRepo });

  const dummyIdentity = {
    authenticate,
    requireRole,
    requireAdminScope: () => requireRole('SUPER_ADMIN'),
    requireZoneAccess: () => (_req: any, _res: any, next: any) => next(),
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
  } as any;

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
    const token = await tokenAdapter.signAccessToken({ sub: userId, role, sessionId });
    return `Bearer ${token}`;
  }

  function createTestApp() {
    const routing = buildRoutingContainer({
      routeProvider: new HaversineRouteProvider(),
    });
    return createApp({
      identity: dummyIdentity,
      routing,
    });
  }

  it('rejects unauthenticated requests with 401', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/v1/admin/routing/health');
    expect(res.status).toBe(401);
  });

  it('rejects non-SUPER_ADMIN requests with 403', async () => {
    const app = createTestApp();
    const token = await login('admin-city-1', 'CITY_ADMIN');
    const res = await request(app)
      .get('/api/v1/admin/routing/health')
      .set('Authorization', token);
    expect(res.status).toBe(403);
  });

  it('returns routing provider health to SUPER_ADMIN', async () => {
    const app = createTestApp();
    const token = await login('admin-super-1', 'SUPER_ADMIN');
    const res = await request(app)
      .get('/api/v1/admin/routing/health')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.provider).toBe('HAVERSINE_ESTIMATE');
    expect(typeof res.body.data.configured).toBe('boolean');
  });

  it('returns routing metrics to SUPER_ADMIN', async () => {
    const app = createTestApp();
    const token = await login('admin-super-1', 'SUPER_ADMIN');
    const res = await request(app)
      .get('/api/v1/admin/routing/metrics')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.provider).toBe('HAVERSINE_ESTIMATE');
    expect(res.body.data.requests).toBeDefined();
    expect(res.body.data.failures).toBeDefined();
    expect(res.body.data.cacheHits).toBeDefined();
  });

  it('reverse geocodes point location via public GET /api/v1/routing/reverse-geocode', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/v1/routing/reverse-geocode?lat=26.7141&lng=88.4334');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.point.lat).toBe(26.7141);
    expect(res.body.data.point.lng).toBe(88.4334);
    expect(res.body.data.countryCode).toBe('IN');
  });

  it('rejects reverse geocode with invalid coordinates', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/v1/routing/reverse-geocode?lat=999&lng=88.4334');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
