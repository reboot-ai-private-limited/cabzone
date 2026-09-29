import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import type { SessionEntity, SessionRepositoryPort } from '../src/modules/identity/domain/index.js';
import type { IdentityContainer } from '../src/modules/identity/identity.container.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  requireRole,
} from '../src/modules/identity/interface/middlewares/index.js';
import {
  buildStateBoundaryContainer,
  MemoryStateBoundaryRepository,
} from '../src/modules/stateBoundary/index.js';
import { buildZoneContainer, MemoryZoneRepository } from '../src/modules/zone/index.js';

const TEST_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';

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

function square(lng: number, lat: number) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng, lat],
        [lng + 1, lat],
        [lng + 1, lat + 1],
        [lng, lat + 1],
        [lng, lat],
      ],
    ],
  };
}

const geojson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { ST_NM: 'West Bengal' }, geometry: square(87, 25) },
    { type: 'Feature', properties: { NAME_1: 'Sikkim' }, geometry: square(88, 27) },
    { type: 'Feature', properties: { ST_NM: 'Kerala' }, geometry: square(76, 10) },
  ],
};

async function setup(role: 'SUPER_ADMIN' | 'CITY_ADMIN') {
  const sessionRepo = new MemorySessionRepository();
  const tokenAdapter = new JoseTokenAdapter(TEST_SECRET);
  const identity: IdentityContainer = {
    buildAuthRouter: () => Router(),
    buildDriverRouter: () => Router(),
    buildAdminDriverRouter: () => Router(),
    authenticate: makeAuthenticate({ tokenVerifier: tokenAdapter, sessionRepo }),
    requireRole,
    requireZoneAccess: makeRequireZoneAccess({ adminRepo: { findByUserId: async () => null } }),
  };
  const app = createApp({
    identity,
    zone: buildZoneContainer({ zoneRepo: new MemoryZoneRepository() }),
    stateBoundary: buildStateBoundaryContainer({
      stateBoundaryRepo: new MemoryStateBoundaryRepository(),
    }),
  });

  const userId = '018f0a00-0000-7000-8000-000000000001';
  const sessionId = '018f0a00-0000-7000-8000-000000000002';
  await sessionRepo.save({
    id: sessionId,
    userId,
    deviceId: 'dev',
    refreshTokenHash: 'h',
    expiresAt: new Date(Date.now() + 86400_000),
    revokedAt: null,
    lastUsedAt: new Date(),
    createdAt: new Date(),
  });
  const token = await tokenAdapter.signAccessToken({ sub: userId, role, sessionId });
  return { app, auth: `Bearer ${token}` };
}

describe('Admin state boundary API', () => {
  it('requires authentication', async () => {
    const { app } = await setup('SUPER_ADMIN');
    expect((await request(app).get('/api/v1/admin/reference/states')).status).toBe(401);
  });

  it('imports launch states from GeoJSON and lists them; other states stay unserviceable', async () => {
    const { app, auth } = await setup('SUPER_ADMIN');

    const res = await request(app)
      .post('/api/v1/admin/reference/states/import')
      .set('Authorization', auth)
      .send({ geojson, sourceVersion: '2026-01' });
    expect(res.status).toBe(200);
    expect(res.body.data.imported.sort()).toEqual(['SK', 'WB']);
    expect(res.body.data.skippedNotServiceable).toEqual([]);
    expect(res.body.data.missing.sort()).toEqual(['AS', 'BR']);

    const list = await request(app).get('/api/v1/admin/reference/states').set('Authorization', auth);
    expect(list.status).toBe(200);
    expect(list.body.data.states.map((s: { stateCode: string }) => s.stateCode).sort()).toEqual([
      'SK',
      'WB',
    ]);
    expect(list.body.data.states[0].geometry.type).toBe('Polygon');
  });

  it('only SUPER_ADMIN can import; CITY_ADMIN can read', async () => {
    const { app, auth } = await setup('CITY_ADMIN');
    const imp = await request(app)
      .post('/api/v1/admin/reference/states/import')
      .set('Authorization', auth)
      .send({ geojson });
    expect(imp.status).toBe(403);
    const list = await request(app).get('/api/v1/admin/reference/states').set('Authorization', auth);
    expect(list.status).toBe(200);
  });

  it('rejects bodies that are not GeoJSON', async () => {
    const { app, auth } = await setup('SUPER_ADMIN');
    const res = await request(app)
      .post('/api/v1/admin/reference/states/import')
      .set('Authorization', auth)
      .send({ geojson: { type: 'Nope' } });
    expect(res.status).toBe(400);
  });
});
