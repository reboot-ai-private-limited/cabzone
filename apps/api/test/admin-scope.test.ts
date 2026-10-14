import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  buildIdentityContainer,
  type IdentityContainerDeps,
} from '../src/modules/identity/identity.container.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import type { AdminUserEntity, SessionEntity } from '../src/modules/identity/domain/index.js';
import { buildZoneContainer, MemoryZoneRepository } from '../src/modules/zone/index.js';
import { buildPricingContainer } from '../src/modules/pricing/pricing.container.js';
import { unitOfWork } from './helpers/unitOfWork.js';
import { MemoryPricingConfigRepository } from '../src/modules/pricing/infrastructure/persistence/index.js';

const SECRET = 'admin-scope-test-secret-at-least-thirty-two-characters';
const fare = {
  vehicleType: 'CAB',
  baseFarePaise: 5000,
  ratePerKmPaise: 1000,
  minimumFarePaise: 5000,
  status: 'DRAFT',
};

async function fixture() {
  const sessions = new Map<string, SessionEntity>();
  const admins = new Map<string, AdminUserEntity>();
  const tokenAdapter = new JoseTokenAdapter(SECRET);
  const zoneRepo = new MemoryZoneRepository();
  const zone = buildZoneContainer({ zoneRepo });
  const pricingConfigRepo = new MemoryPricingConfigRepository();
  const pricing = buildPricingContainer({
    unitOfWork,
    pricingConfigRepo,
    serviceClassificationUseCase: zone.serviceClassificationUseCase,
    tokenSecret: SECRET,
  });
  const identity = buildIdentityContainer({
    tokenAdapter,
    zoneRepo,
    sessionRepo: {
      findById: async (id: string) => sessions.get(id) ?? null,
    } as unknown as IdentityContainerDeps['sessionRepo'],
    adminRepo: {
      findByUserId: async (id: string) => admins.get(id) ?? null,
    } as unknown as IdentityContainerDeps['adminRepo'],
  });
  const app = createApp({ identity, zone, pricing });

  async function login(role: 'SUPER_ADMIN' | 'CITY_ADMIN', cityZoneIds: string[] = []) {
    const id = role;
    const now = new Date();
    admins.set(id, {
      id,
      userId: id,
      role,
      cityZoneIds,
      name: role,
      email: null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    sessions.set(id, {
      id,
      userId: id,
      deviceId: id,
      refreshTokenHash: 'hash',
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    });
    return `Bearer ${await tokenAdapter.signAccessToken({ sub: id, role, sessionId: id })}`;
  }
  const superAuth = await login('SUPER_ADMIN');
  async function createCity(name: string, longitude: number) {
    const res = await request(app)
      .post('/api/v1/admin/zones')
      .set('Authorization', superAuth)
      .send({
        name,
        zoneType: 'CITY',
        stateCode: 'WB',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [longitude, 26],
              [longitude + 0.1, 26],
              [longitude + 0.1, 26.1],
              [longitude, 26.1],
              [longitude, 26],
            ],
          ],
        },
      });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }
  const ownCity = await createCity('Assigned city', 88);
  const foreignCity = await createCity('Foreign city', 89);
  const cityAuth = await login('CITY_ADMIN', [ownCity]);
  async function createPricing(body: object) {
    const res = await request(app)
      .post('/api/v1/admin/pricing/configs')
      .set('Authorization', superAuth)
      .send({ ...fare, ...body });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }
  const ownPricing = await createPricing({ cityZoneId: ownCity });
  const foreignPricing = await createPricing({ cityZoneId: foreignCity });
  return {
    app,
    cityAuth,
    superAuth,
    ownCity,
    foreignCity,
    ownPricing,
    foreignPricing,
    createPricing,
    zoneRepo,
    pricingConfigRepo,
  };
}

describe('Assigned-city administrative access', () => {
  it('lists only assigned zones and city pricing, including paginated zone lists', async () => {
    const f = await fixture();
    await f.createPricing({ level: 'GLOBAL' });
    await f.createPricing({ level: 'STATE', stateCode: 'WB' });
    const zones = await request(f.app).get('/api/v1/admin/zones').set('Authorization', f.cityAuth);
    expect(zones.status).toBe(200);
    expect(zones.body.data.map((zone: { id: string }) => zone.id)).toEqual([f.ownCity]);
    const paginated = await request(f.app)
      .get('/api/v1/admin/zones?page=1&limit=10')
      .set('Authorization', f.cityAuth);
    expect(paginated.status).toBe(200);
    expect(paginated.body.data.items.map((zone: { id: string }) => zone.id)).toEqual([f.ownCity]);
    expect(paginated.body.data.pagination.total).toBe(1);
    const pricing = await request(f.app)
      .get('/api/v1/admin/pricing/configs')
      .set('Authorization', f.cityAuth);
    expect(pricing.status).toBe(200);
    expect(pricing.body.data.map((config: { id: string }) => config.id)).toEqual([f.ownPricing]);
  });

  it.each(['', '/history', '/dependents'])(
    'denies foreign zone reads at suffix %s',
    async (suffix) => {
      const f = await fixture();
      const res = await request(f.app)
        .get(`/api/v1/admin/zones/${f.foreignCity}${suffix}`)
        .set('Authorization', f.cityAuth);
      expect(res.status).toBe(403);
    },
  );

  it('denies foreign zone mutation and preserves the record', async () => {
    const f = await fixture();
    const res = await request(f.app)
      .patch(`/api/v1/admin/zones/${f.foreignCity}`)
      .set('Authorization', f.cityAuth)
      .send({ name: 'Stolen city' });
    expect(res.status).toBe(403);
    expect((await f.zoneRepo.findById(f.foreignCity))?.name).toBe('Foreign city');
  });

  it('denies foreign city pricing creation and updates', async () => {
    const f = await fixture();
    const create = await request(f.app)
      .post('/api/v1/admin/pricing/configs')
      .set('Authorization', f.cityAuth)
      .send({ ...fare, cityZoneId: f.foreignCity });
    expect(create.status).toBe(403);
    const update = await request(f.app)
      .patch(`/api/v1/admin/pricing/configs/${f.foreignPricing}`)
      .set('Authorization', f.cityAuth)
      .send({ baseFarePaise: 1 });
    expect(update.status).toBe(403);
    const reassign = await request(f.app)
      .patch(`/api/v1/admin/pricing/configs/${f.ownPricing}`)
      .set('Authorization', f.cityAuth)
      .send({ cityZoneId: f.foreignCity });
    expect(reassign.status).toBe(403);
    expect((await f.pricingConfigRepo.findById(f.ownPricing))?.cityZoneId).toBe(f.ownCity);
    expect((await f.pricingConfigRepo.findById(f.foreignPricing))?.baseFarePaise).toBe(5000);
  });

  it('denies an inferred state config disguised with an assigned city', async () => {
    const f = await fixture();
    const response = await request(f.app)
      .post('/api/v1/admin/pricing/configs')
      .set('Authorization', f.cityAuth)
      .send({ ...fare, cityZoneId: f.ownCity, stateCode: 'WB' });
    expect(response.status).toBe(403);
  });

  it.each(['GLOBAL', 'STATE'])(
    'denies %s pricing creation, update, activation and deletion',
    async (level) => {
      const f = await fixture();
      const scope = level === 'STATE' ? { level, stateCode: 'WB' } : { level };
      const id = await f.createPricing(scope);
      const create = await request(f.app)
        .post('/api/v1/admin/pricing/configs')
        .set('Authorization', f.cityAuth)
        .send({ ...fare, ...scope });
      expect(create.status).toBe(403);
      const update = await request(f.app)
        .patch(`/api/v1/admin/pricing/configs/${id}`)
        .set('Authorization', f.cityAuth)
        .send({ baseFarePaise: 1 });
      expect(update.status).toBe(403);
      const activate = await request(f.app)
        .post(`/api/v1/admin/pricing/configs/${id}/activate`)
        .set('Authorization', f.cityAuth);
      expect(activate.status).toBe(403);
      const remove = await request(f.app)
        .delete(`/api/v1/admin/pricing/configs/${id}`)
        .set('Authorization', f.cityAuth);
      expect(remove.status).toBe(403);
      expect(await f.pricingConfigRepo.findById(id)).not.toBeNull();
    },
  );

  it('allows assigned city changes and preserves SUPER_ADMIN access to all scopes', async () => {
    const f = await fixture();
    const own = await request(f.app)
      .patch(`/api/v1/admin/zones/${f.ownCity}`)
      .set('Authorization', f.cityAuth)
      .send({ name: 'Updated assigned city' });
    expect(own.status).toBe(200);
    const ownPricing = await request(f.app)
      .patch(`/api/v1/admin/pricing/configs/${f.ownPricing}`)
      .set('Authorization', f.cityAuth)
      .send({ ratePerKmPaise: 1100 });
    expect(ownPricing.status).toBe(200);
    const foreign = await request(f.app)
      .patch(`/api/v1/admin/zones/${f.foreignCity}`)
      .set('Authorization', f.superAuth)
      .send({ name: 'Super admin update' });
    expect(foreign.status).toBe(200);
    const globalId = await f.createPricing({ level: 'GLOBAL' });
    const global = await request(f.app)
      .patch(`/api/v1/admin/pricing/configs/${globalId}`)
      .set('Authorization', f.superAuth)
      .send({ ratePerKmPaise: 1100 });
    expect(global.status).toBe(200);
  });
});
