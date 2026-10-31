import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { newUuid } from '../src/shared/ids.js';
import { verifyPassword } from '../src/shared/auth/password.util.js';
import {
  CreateAdminUserUseCase,
  GetAdminUserDetailUseCase,
  ListAdminUsersUseCase,
  UpdateAdminUserStatusUseCase,
  UpdateAdminUserUseCase,
} from '../src/modules/identity/application/useCases/index.js';
import type {
  AdminUserEntity,
  AdminUserListFilter,
  AdminUserRepositoryPort,
  AdminUserWithUser,
  SessionEntity,
  SessionRepositoryPort,
  UserEntity,
  UserRepositoryPort,
} from '../src/modules/identity/domain/index.js';
import {
  makeCreateAdminUserController,
  makeGetAdminRolePermissionsController,
  makeGetAdminUserDetailController,
  makeListAdminUsersController,
  makeUpdateAdminUserController,
  makeUpdateAdminUserStatusController,
} from '../src/modules/identity/interface/adminUser.controller.js';
import { buildAdminUserRouter } from '../src/modules/identity/interface/adminUser.routes.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import { makeAuthenticate, requireRole } from '../src/modules/identity/interface/middlewares/index.js';
import type { ZoneEntity, ZoneRepositoryPort } from '../src/modules/zone/domain/index.js';
import { errorHandler } from '../src/shared/http/error-handler.js';

const TEST_SECRET = 'super-secret-jwt-key-for-admin-tests-at-least-32-chars!';

class TestMemoryUserRepo implements UserRepositoryPort {
  readonly users = new Map<string, UserEntity>();

  async findById(userId: string): Promise<UserEntity | null> {
    const u = this.users.get(userId);
    return u ? { ...u } : null;
  }

  async findByPhone(phoneE164: string): Promise<UserEntity | null> {
    for (const u of this.users.values()) {
      if (u.phoneE164 === phoneE164) return { ...u };
    }
    return null;
  }

  async create(user: UserEntity): Promise<UserEntity> {
    this.users.set(user.id, { ...user });
    return { ...user };
  }

  async update(user: UserEntity): Promise<UserEntity> {
    this.users.set(user.id, { ...user });
    return { ...user };
  }
}

class TestMemorySessionRepo implements SessionRepositoryPort {
  readonly sessions = new Map<string, SessionEntity>();

  async findById(id: string): Promise<SessionEntity | null> {
    const s = this.sessions.get(id);
    return s ? { ...s } : null;
  }

  async save(session: SessionEntity): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async update(session: SessionEntity): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async revoke(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (s) {
      s.revokedAt = new Date();
      this.sessions.set(id, s);
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

  async touch(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (s) {
      s.lastUsedAt = new Date();
      this.sessions.set(id, s);
    }
  }
}

class TestMemoryAdminUserRepo implements AdminUserRepositoryPort {
  readonly admins = new Map<string, AdminUserEntity>();
  userRepo!: TestMemoryUserRepo;

  async findById(id: string): Promise<AdminUserEntity | null> {
    const a = this.admins.get(id);
    return a ? { ...a } : null;
  }

  async findByUserId(userId: string): Promise<AdminUserEntity | null> {
    for (const a of this.admins.values()) {
      if (a.userId === userId) return { ...a };
    }
    return null;
  }

  async create(admin: AdminUserEntity): Promise<AdminUserEntity> {
    this.admins.set(admin.id, { ...admin });
    return { ...admin };
  }

  async save(admin: AdminUserEntity): Promise<AdminUserEntity> {
    return this.create(admin);
  }

  async update(
    id: string,
    updates: Partial<Pick<AdminUserEntity, 'name' | 'email' | 'role' | 'cityZoneIds' | 'status'>>,
  ): Promise<AdminUserEntity | null> {
    const existing = this.admins.get(id);
    if (!existing) return null;
    const updated: AdminUserEntity = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.admins.set(id, updated);
    return { ...updated };
  }

  async list(filter: AdminUserListFilter): Promise<{ admins: AdminUserWithUser[]; total: number }> {
    const all: AdminUserWithUser[] = [];
    for (const a of this.admins.values()) {
      const user = await this.userRepo.findById(a.userId);
      if (!user) continue;

      if (filter.role && a.role !== filter.role) continue;
      if (filter.status && a.status !== filter.status) continue;
      if (filter.zoneId && !a.cityZoneIds.includes(filter.zoneId)) continue;
      if (filter.search) {
        const q = filter.search.toLowerCase();
        const matchesName = a.name?.toLowerCase().includes(q) ?? false;
        const matchesEmail = a.email?.toLowerCase().includes(q) ?? false;
        const matchesId = a.id.toLowerCase().includes(q) || a.userId.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesId) continue;
      }

      all.push({
        id: a.id,
        userId: a.userId,
        name: a.name,
        email: a.email,
        role: a.role,
        cityZoneIds: a.cityZoneIds,
        status: a.status,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      });
    }

    const total = all.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 20;
    const admins = all.slice(offset, offset + limit);

    return { admins, total };
  }
}

class TestMemoryZoneRepo implements Partial<ZoneRepositoryPort> {
  readonly zones = new Map<string, ZoneEntity>();

  async findById(id: string): Promise<ZoneEntity | null> {
    const z = this.zones.get(id);
    return z ? { ...z } : null;
  }
}

describe('Admin Users & Roles API', () => {
  let app: express.Express;
  let userRepo: TestMemoryUserRepo;
  let adminRepo: TestMemoryAdminUserRepo;
  let sessionRepo: TestMemorySessionRepo;
  let zoneRepo: TestMemoryZoneRepo;
  let tokenAdapter: JoseTokenAdapter;

  let superAdminToken: string;
  let superAdminUser: UserEntity;
  let superAdminRecord: AdminUserEntity;

  let cityAdminToken: string;
  let cityAdminUser: UserEntity;
  let cityAdminRecord: AdminUserEntity;

  let riderToken: string;

  beforeEach(async () => {
    userRepo = new TestMemoryUserRepo();
    adminRepo = new TestMemoryAdminUserRepo();
    adminRepo.userRepo = userRepo;
    sessionRepo = new TestMemorySessionRepo();
    zoneRepo = new TestMemoryZoneRepo();
    tokenAdapter = new JoseTokenAdapter(TEST_SECRET);

    // Setup dummy zones
    const zone1Id = newUuid();
    zoneRepo.zones.set(zone1Id, {
      id: zone1Id,
      name: 'Patna Central',
      code: 'PAT',
      type: 'METRO',
      status: 'ACTIVE',
      boundary: { type: 'Polygon', coordinates: [] },
      operationalHours: { enabled: false },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ZoneEntity);

    // Seed Super Admin
    const superAdminSessionId = newUuid();
    superAdminUser = await userRepo.create({
      id: newUuid(),
      phoneE164: '+919999900001',
      phoneVerifiedAt: new Date(),
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    superAdminRecord = await adminRepo.create({
      id: newUuid(),
      userId: superAdminUser.id,
      name: 'Vikram Super Admin',
      email: 'vikram@cabzone.in',
      role: 'SUPER_ADMIN',
      cityZoneIds: [],
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await sessionRepo.save({
      id: superAdminSessionId,
      userId: superAdminUser.id,
      deviceId: 'super-admin-mac',
      refreshTokenHash: 'hash',
      previousRefreshTokenHash: null,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    superAdminToken = await tokenAdapter.signAccessToken(
      { sub: superAdminUser.id, sessionId: superAdminSessionId, role: 'SUPER_ADMIN' },
      '1h',
    );

    // Seed City Admin
    const cityAdminSessionId = newUuid();
    cityAdminUser = await userRepo.create({
      id: newUuid(),
      phoneE164: '+919999900002',
      phoneVerifiedAt: new Date(),
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cityAdminRecord = await adminRepo.create({
      id: newUuid(),
      userId: cityAdminUser.id,
      name: 'Ananya City Admin',
      email: 'ananya.patna@cabzone.in',
      role: 'CITY_ADMIN',
      cityZoneIds: [zone1Id],
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await sessionRepo.save({
      id: cityAdminSessionId,
      userId: cityAdminUser.id,
      deviceId: 'city-admin-thinkpad',
      refreshTokenHash: 'hash',
      previousRefreshTokenHash: null,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    cityAdminToken = await tokenAdapter.signAccessToken(
      { sub: cityAdminUser.id, sessionId: cityAdminSessionId, role: 'CITY_ADMIN' },
      '1h',
    );

    // Seed regular Rider
    const riderSessionId = newUuid();
    const riderUser = await userRepo.create({
      id: newUuid(),
      phoneE164: '+919999900099',
      phoneVerifiedAt: new Date(),
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await sessionRepo.save({
      id: riderSessionId,
      userId: riderUser.id,
      deviceId: 'rider-iphone',
      refreshTokenHash: 'hash',
      previousRefreshTokenHash: null,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    riderToken = await tokenAdapter.signAccessToken(
      { sub: riderUser.id, sessionId: riderSessionId, role: 'RIDER' },
      '1h',
    );

    // Wire application use cases and router
    const adminUserDeps = {
      adminUserRepo: adminRepo,
      userRepo,
      sessionRepo,
      zoneRepo: zoneRepo as unknown as ZoneRepositoryPort,
    };

    const authenticate = makeAuthenticate({
      tokenVerifier: tokenAdapter,
      sessionRepo,
    });

    const router = buildAdminUserRouter({
      authenticate,
      requireAdminRole: requireRole('SUPER_ADMIN', 'CITY_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'),
      requireSuperAdminRole: requireRole('SUPER_ADMIN'),
      listAdminUsers: makeListAdminUsersController(new ListAdminUsersUseCase(adminUserDeps)),
      getAdminUser: makeGetAdminUserDetailController(new GetAdminUserDetailUseCase(adminUserDeps)),
      createAdminUser: makeCreateAdminUserController(new CreateAdminUserUseCase(adminUserDeps)),
      updateAdminUser: makeUpdateAdminUserController(new UpdateAdminUserUseCase(adminUserDeps)),
      updateAdminUserStatus: makeUpdateAdminUserStatusController(new UpdateAdminUserStatusUseCase(adminUserDeps)),
      getRolePermissions: makeGetAdminRolePermissionsController(),
    });

    app = express();
    app.use(express.json());
    app.use('/v1/admin/users', router);
    app.use(errorHandler);
  });

  describe('GET /v1/admin/users/roles/permissions', () => {
    it('returns role permissions matrix to any authenticated admin', async () => {
      const res = await request(app)
        .get('/v1/admin/users/roles/permissions')
        .set('Authorization', `Bearer ${cityAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(4);

      const roles = res.body.data.map((r: { role: string }) => r.role);
      expect(roles).toContain('SUPER_ADMIN');
      expect(roles).toContain('CITY_ADMIN');
      expect(roles).toContain('SUPPORT_ADMIN');
      expect(roles).toContain('FINANCE_ADMIN');
    });

    it('rejects regular riders with 403', async () => {
      const res = await request(app)
        .get('/v1/admin/users/roles/permissions')
        .set('Authorization', `Bearer ${riderToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/v1/admin/users/roles/permissions');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /v1/admin/users', () => {
    it('lists all admin staff members with pagination', async () => {
      const res = await request(app)
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.admins.length).toBe(2);
    });

    it('filters admins by role', async () => {
      const res = await request(app)
        .get('/v1/admin/users?role=CITY_ADMIN')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.admins[0].name).toBe('Ananya City Admin');
    });

    it('searches admins by name/email/ID without exposing phone numbers', async () => {
      const res = await request(app)
        .get('/v1/admin/users?search=vikram')
        .set('Authorization', `Bearer ${cityAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.admins[0].name).toBe('Vikram Super Admin');
    });
  });

  describe('GET /v1/admin/users/:id', () => {
    it('returns admin user detail with resolved city zones', async () => {
      const res = await request(app)
        .get(`/v1/admin/users/${cityAdminRecord.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Ananya City Admin');
      expect(res.body.data).not.toHaveProperty('phoneE164');
      expect(res.body.data.cityZones).toBeDefined();
      expect(res.body.data.cityZones.length).toBe(1);
      expect(res.body.data.cityZones[0].name).toBe('Patna Central');
    });

    it('returns 404 for unknown admin user ID', async () => {
      const res = await request(app)
        .get(`/v1/admin/users/${newUuid()}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/admin/users', () => {
    it('allows SUPER_ADMIN to provision a new admin user', async () => {
      const payload = {
        phoneE164: '+919876543299',
        name: 'Dev Support Specialist',
        email: 'dev.support@cabzone.in',
        password: 'TemporaryPass123',
        role: 'SUPPORT_ADMIN',
        cityZoneIds: [],
      };

      const res = await request(app)
        .post('/v1/admin/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Dev Support Specialist');
      expect(res.body.data.role).toBe('SUPPORT_ADMIN');
      expect(res.body.data.status).toBe('ACTIVE');

      // Verify user was created in user repo
      const createdUser = await userRepo.findByPhone('+919876543299');
      expect(createdUser).not.toBeNull();

      const createdAdmin = await adminRepo.findByUserId(createdUser!.id);
      expect(createdAdmin).not.toBeNull();
      expect(createdAdmin!.passwordHash).toBeDefined();
      expect(verifyPassword('TemporaryPass123', createdAdmin!.passwordHash!)).toBe(true);
    });

    it('rejects creation from non-SUPER_ADMIN (e.g. CITY_ADMIN) with 403', async () => {
      const payload = {
        phoneE164: '+919876543298',
        name: 'Rogue Admin',
        role: 'SUPPORT_ADMIN',
      };

      const res = await request(app)
        .post('/v1/admin/users')
        .set('Authorization', `Bearer ${cityAdminToken}`)
        .send(payload);

      expect(res.status).toBe(403);
    });

    it('rejects duplicate admin creation for existing admin phone', async () => {
      const payload = {
        phoneE164: '+919999900001', // Super admin's existing phone
        name: 'Duplicate Admin',
        role: 'CITY_ADMIN',
      };

      const res = await request(app)
        .post('/v1/admin/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload);

      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /v1/admin/users/:id', () => {
    it('allows SUPER_ADMIN to update staff name, email, role, and zones', async () => {
      const updatePayload = {
        name: 'Ananya Senior City Admin',
        email: 'ananya.senior@cabzone.in',
        role: 'CITY_ADMIN',
        cityZoneIds: [],
      };

      const res = await request(app)
        .patch(`/v1/admin/users/${cityAdminRecord.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Ananya Senior City Admin');
      expect(res.body.data.email).toBe('ananya.senior@cabzone.in');
    });

    it('blocks self-demotion of a SUPER_ADMIN account', async () => {
      const res = await request(app)
        .patch(`/v1/admin/users/${superAdminRecord.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ role: 'CITY_ADMIN' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('demote');
    });
  });

  describe('PATCH /v1/admin/users/:id/status', () => {
    it('suspends an admin and revokes active sessions', async () => {
      const activeSessionsBefore = Array.from(sessionRepo.sessions.values()).filter(
        (s) => s.userId === cityAdminUser.id && !s.revokedAt,
      );
      expect(activeSessionsBefore.length).toBeGreaterThan(0);

      const res = await request(app)
        .patch(`/v1/admin/users/${cityAdminRecord.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'SUSPENDED', reason: 'Security protocol audit' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUSPENDED');

      // Verify sessions were revoked
      const activeSessionsAfter = Array.from(sessionRepo.sessions.values()).filter(
        (s) => s.userId === cityAdminUser.id && !s.revokedAt,
      );
      expect(activeSessionsAfter.length).toBe(0);
    });

    it('blocks self-suspension of calling SUPER_ADMIN account', async () => {
      const res = await request(app)
        .patch(`/v1/admin/users/${superAdminRecord.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'SUSPENDED' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('suspend');
    });
  });
});
