import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import express, { Router } from 'express';
import { newUuid } from '../src/shared/ids.js';
import {
  GetRiderDetailUseCase,
  GetRiderProfileUseCase,
  ListRidersUseCase,
  UpdateRiderProfileUseCase,
  UpdateRiderStatusUseCase,
  UpdateSelfRiderProfileUseCase,
} from '../src/modules/identity/application/useCases/index.js';
import type {
  AdminUserEntity,
  AdminUserRepositoryPort,
  RiderEntity,
  RiderListFilter,
  RiderRepositoryPort,
  RiderWithUser,
  SessionEntity,
  SessionRepositoryPort,
  UserEntity,
  UserRepositoryPort,
} from '../src/modules/identity/domain/index.js';
import {
  makeAdminUpdateRiderProfileController,
  makeGetRiderDetailController,
  makeGetRiderProfileController,
  makeListRidersController,
  makeUpdateRiderStatusController,
  makeUpdateSelfRiderProfileController,
} from '../src/modules/identity/interface/rider.controller.js';
import {
  buildAdminRiderRouter,
  buildRiderRouter,
} from '../src/modules/identity/interface/rider.routes.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import { makeAuthenticate, requireRole } from '../src/modules/identity/interface/middlewares/index.js';
import type { RideEntity, RideListFilter, RideRepositoryPort } from '../src/modules/rides/domain/index.js';
import { errorHandler } from '../src/shared/http/error-handler.js';

const TEST_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';

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

class TestMemoryRiderRepo implements RiderRepositoryPort {
  readonly riders = new Map<string, RiderEntity>();
  userRepo!: TestMemoryUserRepo;

  async findById(riderId: string): Promise<RiderEntity | null> {
    const r = this.riders.get(riderId);
    return r ? { ...r } : null;
  }

  async findByUserId(userId: string): Promise<RiderEntity | null> {
    for (const r of this.riders.values()) {
      if (r.userId === userId) return { ...r };
    }
    return null;
  }

  async create(rider: RiderEntity): Promise<RiderEntity> {
    this.riders.set(rider.id, { ...rider });
    return { ...rider };
  }

  async update(rider: RiderEntity): Promise<RiderEntity> {
    this.riders.set(rider.id, { ...rider });
    return { ...rider };
  }

  async list(filter: RiderListFilter): Promise<{ items: RiderWithUser[]; total: number }> {
    const all: RiderWithUser[] = [];
    for (const rider of this.riders.values()) {
      const user = await this.userRepo.findById(rider.userId);
      if (!user) continue;

      if (filter.status && user.status !== filter.status) {
        continue;
      }

      if (filter.search && filter.search.trim()) {
        const q = filter.search.trim().toLowerCase();
        const matchesName = rider.name?.toLowerCase().includes(q) ?? false;
        const matchesEmail = rider.email?.toLowerCase().includes(q) ?? false;
        const matchesPhone = user.phoneE164.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone) {
          continue;
        }
      }

      all.push({
        rider: { ...rider },
        phoneE164: user.phoneE164,
        status: user.status,
        totalRides: 0,
        completedRides: 0,
      });
    }

    all.sort((a, b) => b.rider.createdAt.getTime() - a.rider.createdAt.getTime());
    const total = all.length;
    const items = all.slice(filter.offset, filter.offset + filter.limit);
    return { items, total };
  }
}

class TestMemorySessionRepo implements SessionRepositoryPort {
  readonly sessions = new Map<string, SessionEntity>();

  async findById(sessionId: string): Promise<SessionEntity | null> {
    const s = this.sessions.get(sessionId);
    return s ? { ...s } : null;
  }

  async save(session: SessionEntity): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async update(session: SessionEntity): Promise<void> {
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

  async touch(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.lastUsedAt = new Date();
      this.sessions.set(sessionId, s);
    }
  }
}

class TestMemoryRideRepo implements RideRepositoryPort {
  async update(ride: RideEntity, expectedVersion: number): Promise<RideEntity | null> {
    if (this.rides.get(ride.id)?.version !== expectedVersion) return null;
    return this.save(ride);
  }
  readonly rides = new Map<string, RideEntity>();

  async create(ride: RideEntity): Promise<RideEntity> {
    this.rides.set(ride.id, { ...ride });
    return { ...ride };
  }

  async save(ride: RideEntity): Promise<RideEntity> {
    this.rides.set(ride.id, { ...ride });
    return { ...ride };
  }

  async findById(id: string): Promise<RideEntity | null> {
    const r = this.rides.get(id);
    return r ? { ...r } : null;
  }

  async findActiveByBookerRiderId(): Promise<RideEntity | null> {
    return null;
  }

  async findByBookerIdempotencyKey(): Promise<RideEntity | null> {
    return null;
  }

  async list(filter: RideListFilter): Promise<RideEntity[]> {
    return [...this.rides.values()]
      .filter((r) => filter.riderId === undefined || r.bookerRiderId === filter.riderId)
      .slice(filter.offset, filter.offset + filter.limit);
  }

  async findExpiredOfferings(): Promise<RideEntity[]> {
    return [];
  }

  async atomicClaimRide(): Promise<RideEntity | null> {
    return null;
  }

  async countDailyRiderUnassignedCancellations(): Promise<number> {
    return 0;
  }

  async getRiderStats(riderId: string): Promise<{
    totalRides: number;
    completedRides: number;
    cancelledRides: number;
    totalSpentPaise: number;
  }> {
    let totalRides = 0;
    let completedRides = 0;
    let cancelledRides = 0;
    let totalSpentPaise = 0;

    for (const r of this.rides.values()) {
      if (r.bookerRiderId === riderId || r.passenger.riderId === riderId) {
        totalRides++;
        if (r.status === 'TRIP_COMPLETED' || r.status === 'SETTLED' || r.status === 'PAYMENT_CONFIRMED') {
          completedRides++;
          totalSpentPaise += r.agreedFarePaise ?? r.suggestedFarePaise;
        } else if (r.status === 'CANCELLED') {
          cancelledRides++;
        }
      }
    }

    return { totalRides, completedRides, cancelledRides, totalSpentPaise };
  }

  async getRiderTripCountsBatch(
    riderIds: string[],
  ): Promise<Map<string, { totalRides: number; completedRides: number; cancelledRides: number }>> {
    const map = new Map<string, { totalRides: number; completedRides: number; cancelledRides: number }>();
    const idSet = new Set(riderIds);

    for (const r of this.rides.values()) {
      const id = idSet.has(r.bookerRiderId) ? r.bookerRiderId : null;
      if (!id) continue;
      const cur = map.get(id) ?? { totalRides: 0, completedRides: 0, cancelledRides: 0 };
      cur.totalRides++;
      if (r.status === 'CANCELLED') cur.cancelledRides++;
      if (r.status === 'TRIP_COMPLETED' || r.status === 'SETTLED' || r.status === 'PAYMENT_CONFIRMED') {
        cur.completedRides++;
      }
      map.set(id, cur);
    }

    return map;
  }
}

describe('Riders and Customer Admin API', () => {
  let userRepo: TestMemoryUserRepo;
  let riderRepo: TestMemoryRiderRepo;
  let sessionRepo: TestMemorySessionRepo;
  let rideRepo: TestMemoryRideRepo;
  let tokenSigner: JoseTokenAdapter;
  let app: express.Application;

  let adminToken: string;
  let riderToken: string;
  let riderUserId: string;
  let riderProfileId: string;
  let riderSessionId: string;

  beforeEach(async () => {
    userRepo = new TestMemoryUserRepo();
    riderRepo = new TestMemoryRiderRepo();
    riderRepo.userRepo = userRepo;
    sessionRepo = new TestMemorySessionRepo();
    rideRepo = new TestMemoryRideRepo();
    tokenSigner = new JoseTokenAdapter(TEST_SECRET);

    const authenticate = makeAuthenticate({ tokenVerifier: tokenSigner, sessionRepo });

    const adminRiderDeps = {
      riderRepo,
      userRepo,
      sessionRepo,
      rideRepo,
    };
    const listRidersUseCase = new ListRidersUseCase(adminRiderDeps);
    const getRiderDetailUseCase = new GetRiderDetailUseCase(adminRiderDeps);
    const updateRiderStatusUseCase = new UpdateRiderStatusUseCase(adminRiderDeps);
    const updateRiderProfileUseCase = new UpdateRiderProfileUseCase(adminRiderDeps);

    const riderProfileDeps = { riderRepo, userRepo };
    const getRiderProfileUseCase = new GetRiderProfileUseCase(riderProfileDeps);
    const updateSelfRiderProfileUseCase = new UpdateSelfRiderProfileUseCase(riderProfileDeps);

    const adminRiderRouter = buildAdminRiderRouter({
      authenticate,
      requireAdminRole: requireRole('SUPER_ADMIN', 'CITY_ADMIN', 'SUPPORT_ADMIN'),
      listRiders: makeListRidersController(listRidersUseCase),
      getRider: makeGetRiderDetailController(getRiderDetailUseCase),
      updateStatus: makeUpdateRiderStatusController(updateRiderStatusUseCase),
      updateProfile: makeAdminUpdateRiderProfileController(updateRiderProfileUseCase),
    });

    const riderRouter = buildRiderRouter({
      authenticate,
      requireRider: requireRole('RIDER'),
      getProfile: makeGetRiderProfileController(getRiderProfileUseCase),
      updateProfile: makeUpdateSelfRiderProfileController(updateSelfRiderProfileUseCase),
    });

    app = express();
    app.use(express.json());
    app.use('/api/v1/admin/riders', adminRiderRouter);
    app.use('/api/v1/riders', riderRouter);
    app.use(errorHandler);

    // Seed admin
    const adminUserId = newUuid();
    const adminSessionId = newUuid();
    await userRepo.create({
      id: adminUserId,
      phoneE164: '+919000000001',
      phoneVerifiedAt: new Date(),
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await sessionRepo.save({
      id: adminSessionId,
      userId: adminUserId,
      deviceId: 'admin-dev',
      refreshTokenHash: 'hash',
      previousRefreshTokenHash: null,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    adminToken = await tokenSigner.signAccessToken(
      { sub: adminUserId, sessionId: adminSessionId, role: 'SUPER_ADMIN' },
      '1h',
    );

    // Seed regular rider
    riderUserId = newUuid();
    riderProfileId = newUuid();
    riderSessionId = newUuid();
    await userRepo.create({
      id: riderUserId,
      phoneE164: '+919876543210',
      phoneVerifiedAt: new Date(),
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date('2026-01-10T10:00:00Z'),
      updatedAt: new Date('2026-01-10T10:00:00Z'),
    });
    await riderRepo.create({
      id: riderProfileId,
      userId: riderUserId,
      name: 'Aditi Sharma',
      email: 'aditi@example.com',
      preferredLanguage: 'en',
      emergencyContact: {
        name: 'Rahul Sharma',
        phoneE164: '+919876543219',
      },
      ratingAverage: 4.8,
      ratingCount: 15,
      version: 1,
      createdAt: new Date('2026-01-10T10:00:00Z'),
      updatedAt: new Date('2026-01-10T10:00:00Z'),
    });
    await sessionRepo.save({
      id: riderSessionId,
      userId: riderUserId,
      deviceId: 'rider-phone-1',
      refreshTokenHash: 'hash2',
      previousRefreshTokenHash: null,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    riderToken = await tokenSigner.signAccessToken(
      { sub: riderUserId, sessionId: riderSessionId, role: 'RIDER' },
      '1h',
    );
  });

  describe('Rider Self-Service Profile API (/api/v1/riders/me)', () => {
    it('returns 401 when request is unauthenticated', async () => {
      const res = await request(app).get('/api/v1/riders/me');
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated as non-rider', async () => {
      const res = await request(app)
        .get('/api/v1/riders/me')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });

    it('returns profile when authenticated as rider', async () => {
      const res = await request(app)
        .get('/api/v1/riders/me')
        .set('Authorization', `Bearer ${riderToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Aditi Sharma');
      expect(res.body.data.email).toBe('aditi@example.com');
      expect(res.body.data.emergencyContact?.name).toBe('Rahul Sharma');
    });

    it('allows rider to update own profile fields', async () => {
      const res = await request(app)
        .patch('/api/v1/riders/me')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          name: 'Aditi S. Mukherjee',
          preferredLanguage: 'bn',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Aditi S. Mukherjee');
      expect(res.body.data.preferredLanguage).toBe('bn');
    });
  });

  describe('Admin Customers API (/api/v1/admin/riders)', () => {
    it('blocks unauthenticated and non-admin requests', async () => {
      const noAuth = await request(app).get('/api/v1/admin/riders');
      expect(noAuth.status).toBe(401);

      const riderAuth = await request(app)
        .get('/api/v1/admin/riders')
        .set('Authorization', `Bearer ${riderToken}`);
      expect(riderAuth.status).toBe(403);
    });

    it('lists customers with pagination and search', async () => {
      // Seed a second rider
      const secondUserId = newUuid();
      const secondRiderId = newUuid();
      await userRepo.create({
        id: secondUserId,
        phoneE164: '+919999988888',
        phoneVerifiedAt: new Date(),
        status: 'SUSPENDED',
        version: 1,
        createdAt: new Date('2026-02-01T10:00:00Z'),
        updatedAt: new Date('2026-02-01T10:00:00Z'),
      });
      await riderRepo.create({
        id: secondRiderId,
        userId: secondUserId,
        name: 'Sourav Roy',
        email: 'sourav@test.com',
        preferredLanguage: 'en',
        emergencyContact: null,
        ratingAverage: 3.5,
        ratingCount: 2,
        version: 1,
        createdAt: new Date('2026-02-01T10:00:00Z'),
        updatedAt: new Date('2026-02-01T10:00:00Z'),
      });

      // Query all
      const resAll = await request(app)
        .get('/api/v1/admin/riders')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAll.status).toBe(200);
      expect(resAll.body.data.total).toBe(2);
      expect(resAll.body.data.riders).toHaveLength(2);

      // Filter by status ACTIVE
      const resActive = await request(app)
        .get('/api/v1/admin/riders?status=ACTIVE')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resActive.status).toBe(200);
      expect(resActive.body.data.total).toBe(1);
      expect(resActive.body.data.riders[0].name).toBe('Aditi Sharma');

      // Search by phone
      const resSearch = await request(app)
        .get('/api/v1/admin/riders?search=9999988888')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resSearch.status).toBe(200);
      expect(resSearch.body.data.total).toBe(1);
      expect(resSearch.body.data.riders[0].name).toBe('Sourav Roy');
    });

    it('returns customer details dossier with trip statistics', async () => {
      // Seed a completed ride and a cancelled ride
      await rideRepo.save({
        id: newUuid(),
        bookerRiderId: riderProfileId,
        passenger: {
          riderId: riderProfileId,
          name: 'Aditi Sharma',
          phoneE164: '+919876543210',
          pickupOtpHash: null,
          pickupOtpExpiresAt: null,
          otpAttempts: 0,
          maxOtpAttempts: 3,
        },
        driverId: newUuid(),
        vehicleId: newUuid(),
        vehicleCategory: 'CAB',
        pickup: { lat: 26.72, lng: 88.42, address: 'Mallaguri, Siliguri' },
        drop: { lat: 26.75, lng: 88.45, address: 'Sevoke Road, Siliguri' },
        routeSnapshot: { distanceM: 5200, durationSeconds: 650 },
        zoneSnapshot: { classification: 'IN_CITY', pickupZoneId: newUuid() },
        pricingSnapshot: { baseFarePaise: 4000, ratePerKmPaise: 1400 },
        suggestedFarePaise: 11200,
        proposedFarePaise: null,
        agreedFarePaise: 12000,
        status: 'TRIP_COMPLETED',
        cancellationReason: null,
        offeringExpiresAt: null,
        acceptedAt: new Date(),
        arrivedAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        settledAt: new Date(),
        cancelledAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await rideRepo.save({
        id: newUuid(),
        bookerRiderId: riderProfileId,
        passenger: {
          riderId: riderProfileId,
          name: 'Aditi Sharma',
          phoneE164: '+919876543210',
          pickupOtpHash: null,
          pickupOtpExpiresAt: null,
          otpAttempts: 0,
          maxOtpAttempts: 3,
        },
        driverId: null,
        vehicleId: null,
        vehicleCategory: 'CAB',
        pickup: { lat: 26.72, lng: 88.42, address: 'Mallaguri, Siliguri' },
        drop: { lat: 26.75, lng: 88.45, address: 'Sevoke Road, Siliguri' },
        routeSnapshot: { distanceM: 5200, durationSeconds: 650 },
        zoneSnapshot: { classification: 'IN_CITY', pickupZoneId: newUuid() },
        pricingSnapshot: { baseFarePaise: 4000, ratePerKmPaise: 1400 },
        suggestedFarePaise: 11200,
        proposedFarePaise: null,
        agreedFarePaise: null,
        status: 'CANCELLED',
        cancellationReason: 'RIDER_CANCELLED',
        offeringExpiresAt: null,
        acceptedAt: null,
        arrivedAt: null,
        startedAt: null,
        completedAt: null,
        settledAt: null,
        cancelledAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(app)
        .get(`/api/v1/admin/riders/${riderProfileId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(riderProfileId);
      expect(res.body.data.phoneE164).toBe('+919876543210');
      expect(res.body.data.totalRides).toBe(2);
      expect(res.body.data.completedRides).toBe(1);
      expect(res.body.data.cancelledRides).toBe(1);
      expect(res.body.data.totalSpentPaise).toBe(12000);
    });

    it('suspends customer and revokes active sessions', async () => {
      // Ensure rider session is active initially
      const sessionBefore = await sessionRepo.findById(riderSessionId);
      expect(sessionBefore?.revokedAt).toBeNull();

      // Suspend
      const res = await request(app)
        .patch(`/api/v1/admin/riders/${riderProfileId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SUSPENDED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUSPENDED');

      // Verify session was revoked in session repo
      const sessionAfter = await sessionRepo.findById(riderSessionId);
      expect(sessionAfter?.revokedAt).not.toBeNull();

      // Rider's access token is rejected on subsequent request
      const riderReq = await request(app)
        .get('/api/v1/riders/me')
        .set('Authorization', `Bearer ${riderToken}`);
      expect(riderReq.status).toBe(401);

      // Reactivate
      const resReactivate = await request(app)
        .patch(`/api/v1/admin/riders/${riderProfileId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' });

      expect(resReactivate.status).toBe(200);
      expect(resReactivate.body.data.status).toBe('ACTIVE');
    });

    it('allows admin to edit customer profile', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/riders/${riderProfileId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Aditi Sharma Banerjee',
          email: 'aditi.banerjee@example.com',
          preferredLanguage: 'hi',
          emergencyContact: {
            name: 'Vikram Banerjee',
            phoneE164: '+919888877777',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Aditi Sharma Banerjee');
      expect(res.body.data.email).toBe('aditi.banerjee@example.com');
      expect(res.body.data.preferredLanguage).toBe('hi');
      expect(res.body.data.emergencyContact?.name).toBe('Vikram Banerjee');
      expect(res.body.data.emergencyContact?.phoneE164).toBe('+919888877777');
    });
  });
});
