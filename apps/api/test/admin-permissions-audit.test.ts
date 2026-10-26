import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AdminRole } from '@cabzone/contracts';
import { createApp } from '../src/app.js';
import { newUuid } from '../src/shared/ids.js';
import {
  buildIdentityContainer,
  type IdentityContainerDeps,
} from '../src/modules/identity/identity.container.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/index.js';
import { UpdateAdminUserUseCase } from '../src/modules/identity/application/useCases/adminUsers.usecase.js';
import type {
  AdminUserEntity,
  DriverApplicationEntity,
  DriverDocumentEntity,
  DriverEntity,
  RiderEntity,
  SessionEntity,
  UserEntity,
  VehicleEntity,
} from '../src/modules/identity/domain/index.js';
import { buildZoneContainer, MemoryZoneRepository } from '../src/modules/zone/index.js';
import { buildPricingContainer } from '../src/modules/pricing/pricing.container.js';
import { MemoryPricingConfigRepository } from '../src/modules/pricing/infrastructure/persistence/index.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import { buildLedgerContainer } from '../src/modules/ledger/ledger.container.js';
import { MemoryPresenceRepository } from '../src/modules/dispatch/infrastructure/memoryPresence.repository.js';
import { buildDispatchContainer } from '../src/modules/dispatch/dispatch.container.js';
import { buildRidesContainer } from '../src/modules/rides/rides.container.js';
import {
  MemoryRideEventRepository,
  MemoryRideRepository,
  type RideEntity,
} from '../src/modules/rides/index.js';
import { buildHealthContainer } from '../src/modules/health/health.container.js';
import { buildRoutingContainer } from '../src/modules/routing/routing.container.js';
import { HaversineRouteProvider } from '../src/modules/routing/infrastructure/haversine.provider.js';
import { unitOfWork } from './helpers/unitOfWork.js';

const SECRET = 'step-15-admin-permissions-audit-secret-32-chars!!';

function makeRide(id: string, cityZoneId: string, overrides: Partial<RideEntity> = {}): RideEntity {
  const now = new Date();
  return {
    id,
    bookerRiderId: '018f0a00-0000-7000-8000-000000000101',
    passenger: {
      riderId: '018f0a00-0000-7000-8000-000000000101',
      name: 'Asha Rider',
      phoneE164: '+919800000101',
      pickupOtpHash: null,
      pickupOtpExpiresAt: null,
      otpAttempts: 0,
      maxOtpAttempts: 3,
    },
    driverId: '018f0a00-0000-7000-8000-000000000201',
    vehicleId: '018f0a00-0000-7000-8000-000000000301',
    vehicleCategory: 'CAB',
    pickup: { lat: 26.72, lng: 88.42, address: 'Siliguri Junction' },
    drop: { lat: 26.75, lng: 88.44, address: 'City Centre' },
    routeSnapshot: {
      provider: 'haversine',
      distanceM: 4200,
      durationSeconds: 600,
      polyline: '',
      calculatedAt: now.toISOString(),
    },
    zoneSnapshot: {
      classification: 'INTRA_CITY',
      cityZoneId,
    },
    pricingSnapshot: {
      configId: 'cfg-1',
      configVersion: 1,
      level: 'CITY',
      baseFarePaise: 5000,
      ratePerKmPaise: 1200,
      minimumFarePaise: 5000,
      bufferSurchargePaise: 0,
      pickupChargePaise: 0,
      commissionPercent: 10,
      negotiationFloorPaise: 16000,
      negotiationCeilingPaise: 30000,
    },
    suggestedFarePaise: 20000,
    proposedFarePaise: 20000,
    agreedFarePaise: 20000,
    status: 'DRIVER_EN_ROUTE',
    cancellationReason: null,
    offeringExpiresAt: null,
    acceptedAt: now,
    arrivedAt: null,
    startedAt: null,
    completedAt: null,
    settledAt: null,
    cancelledAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function setupAuditFixture() {
  const tokenAdapter = new JoseTokenAdapter(SECRET);
  const users = new Map<string, UserEntity>();
  const sessions = new Map<string, SessionEntity>();
  const admins = new Map<string, AdminUserEntity>();
  const riders = new Map<string, RiderEntity>();
  const drivers = new Map<string, DriverEntity>();
  const vehicles = new Map<string, VehicleEntity>();
  const applications = new Map<string, DriverApplicationEntity>();
  const documents = new Map<string, DriverDocumentEntity[]>();

  const zoneRepo = new MemoryZoneRepository();
  const zone = buildZoneContainer({ zoneRepo });
  const pricingConfigRepo = new MemoryPricingConfigRepository();
  const pricing = buildPricingContainer({
    unitOfWork,
    pricingConfigRepo,
    serviceClassificationUseCase: zone.serviceClassificationUseCase,
    tokenSecret: SECRET,
  });
  const rideRepo = new MemoryRideRepository();
  const rideEventRepo = new MemoryRideEventRepository();
  const walletRepo = new MemoryWalletRepository();
  const presence = new MemoryPresenceRepository();

  const sessionRepo = {
    findById: async (id: string) => sessions.get(id) ?? null,
    revokeAllForUser: async (userId: string) => {
      for (const [sid, s] of sessions.entries()) {
        if (s.userId === userId) {
          sessions.set(sid, { ...s, revokedAt: new Date() });
        }
      }
    },
  };

  const adminRepo = {
    findById: async (id: string) => admins.get(id) ?? null,
    findByUserId: async (uid: string) => {
      for (const a of admins.values()) {
        if (a.userId === uid) return a;
      }
      return null;
    },
    update: async (id: string, patch: Partial<AdminUserEntity>) => {
      const existing = admins.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...patch, updatedAt: new Date() };
      admins.set(id, updated);
      return updated;
    },
    list: async () => ({ admins: [], total: 0 }),
  };

  const userRepo = {
    findById: async (id: string) => users.get(id) ?? null,
    findByPhone: async () => null,
  };

  const riderId = '018f0a00-0000-7000-8000-000000000101';
  const riderUserId = '018f0a00-0000-7000-8000-000000000100';
  users.set(riderUserId, {
    id: riderUserId,
    phoneE164: '+919800000101',
    status: 'ACTIVE',
    phoneVerifiedAt: new Date(),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  riders.set(riderId, {
    id: riderId,
    userId: riderUserId,
    name: 'Asha Rider',
    email: null,
    preferredLanguage: 'en',
    ratingAverage: 5,
    ratingCount: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const driverId = '018f0a00-0000-7000-8000-000000000201';
  const driverUserId = '018f0a00-0000-7000-8000-000000000200';
  const appId = '018f0a00-0000-7000-8000-000000000401';
  const vehicleId = '018f0a00-0000-7000-8000-000000000301';
  users.set(driverUserId, {
    id: driverUserId,
    phoneE164: '+919800000201',
    status: 'ACTIVE',
    phoneVerifiedAt: new Date(),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  drivers.set(driverId, {
    id: driverId,
    userId: driverUserId,
    name: 'Raju Driver',
    gender: 'MALE',
    dateOfBirth: '1990-01-01',
    address: 'Siliguri',
    dlNumber: 'WB7420200012345',
    dlExpiry: '2030-01-01',
    alternatePhone: null,
    emergencyContact: null,
    profilePhotoUrl: null,
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    operationalStatus: 'ONLINE',
    currentVehicleId: vehicleId,
    ratingAverage: 4.9,
    ratingCount: 12,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  vehicles.set(vehicleId, {
    id: vehicleId,
    driverId,
    vehicleType: 'CAB',
    make: 'Maruti',
    model: 'Dzire',
    registrationNumber: 'WB74AB1234',
    color: 'White',
    manufactureYear: 2022,
    verificationStatus: 'APPROVED',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  applications.set(appId, {
    id: appId,
    driverId,
    status: 'APPROVED',
    submittedAt: new Date(),
    reviewedAt: new Date(),
    reviewerAdminId: null,
    rejectionType: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  documents.set(appId, [
    {
      id: '018f0a00-0000-7000-8000-000000000501',
      driverId,
      applicationId: appId,
      type: 'DRIVING_LICENSE',
      storageKey: 'https://private-cdn.example/kyc/dl-secret.jpg',
      documentHash: 'a'.repeat(64),
      documentNumberMasked: 'WB74****2345',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000 * 180),
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const identity = buildIdentityContainer({
    unitOfWork,
    tokenAdapter,
    zoneRepo,
    rideRepo,
    sessionRepo: sessionRepo as unknown as IdentityContainerDeps['sessionRepo'],
    adminRepo: adminRepo as unknown as IdentityContainerDeps['adminRepo'],
    userRepo: userRepo as unknown as IdentityContainerDeps['userRepo'],
    riderRepo: {
      findById: async (id: string) => riders.get(id) ?? null,
      findByUserId: async (uid: string) =>
        [...riders.values()].find((r) => r.userId === uid) ?? null,
      list: async () => ({
        items: [{ rider: riders.get(riderId)!, phoneE164: '+919800000101', userStatus: 'ACTIVE' }],
        total: 1,
      }),
    } as unknown as IdentityContainerDeps['riderRepo'],
    driverRepo: {
      findById: async (id: string) => drivers.get(id) ?? null,
      findByUserId: async (uid: string) =>
        [...drivers.values()].find((d) => d.userId === uid) ?? null,
    } as unknown as IdentityContainerDeps['driverRepo'],
    vehicleRepo: {
      findById: async (id: string) => vehicles.get(id) ?? null,
    } as unknown as IdentityContainerDeps['vehicleRepo'],
    applicationRepo: {
      findById: async (id: string) => applications.get(id) ?? null,
      findByDriverId: async (did: string) =>
        [...applications.values()].find((a) => a.driverId === did) ?? null,
      list: async () => [...applications.values()],
    } as unknown as IdentityContainerDeps['applicationRepo'],
    documentRepo: {
      findByApplicationId: async (aid: string) => documents.get(aid) ?? [],
    } as unknown as IdentityContainerDeps['documentRepo'],
  });

  const ledger = buildLedgerContainer({
    unitOfWork,
    walletRepo,
    resolveDriverId: async (uid) => (uid === driverUserId ? driverId : null),
  });

  const dispatch = buildDispatchContainer({
    presence,
    publisher: { publishToUser: () => {}, isConnected: async () => false } as any,
    rideRepo,
    walletRepo,
    lookups: {
      getDriverProfileByUserId: async () => null,
      getUserIdForRider: async () => riderUserId,
      getUserIdForDriver: async () => driverUserId,
      isPointInCityZones: async (lat, lng, cityZoneIds) => {
        const zones = await zoneRepo.findActiveCitiesContainingPoint({ lat, lng });
        return zones.some((z) => cityZoneIds.includes(z.id));
      },
    },
  });

  const rides = buildRidesContainer({
    unitOfWork,
    rideRepo,
    rideEventRepo,
    walletRepo,
    pricingConfigRepo,
    tokenSecret: SECRET,
    resolveRiderId: async (uid) => (uid === riderUserId ? riderId : null),
    resolveDriverId: async (uid) => (uid === driverUserId ? driverId : null),
    requireDriverEligibility: async () => vehicleId,
  });

  const app = createApp({
    health: buildHealthContainer(),
    routing: buildRoutingContainer({ routeProvider: new HaversineRouteProvider() }),
    identity,
    zone,
    pricing,
    ledger,
    dispatch,
    rides,
  });

  async function mintAdmin(role: AdminRole, cityZoneIds: string[] = []) {
    const adminId = newUuid();
    const userId = newUuid();
    const sessionId = newUuid();
    const now = new Date();
    users.set(userId, {
      id: userId,
      phoneE164: `+9199${Math.floor(10000000 + Math.random() * 89999999)}`,
      status: 'ACTIVE',
      phoneVerifiedAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    admins.set(adminId, {
      id: adminId,
      userId,
      name: `${role} Staff`,
      email: null,
      passwordHash: null,
      role,
      cityZoneIds,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    sessions.set(sessionId, {
      id: sessionId,
      userId,
      deviceId: 'web',
      refreshTokenHash: 'hash',
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const token = await tokenAdapter.signAccessToken({ sub: userId, sessionId, role });
    return { adminId, userId, sessionId, auth: `Bearer ${token}` };
  }

  async function mintUser(userId: string, role: 'RIDER' | 'DRIVER') {
    const sessionId = newUuid();
    const now = new Date();
    sessions.set(sessionId, {
      id: sessionId,
      userId,
      deviceId: 'mobile',
      refreshTokenHash: 'hash',
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const token = await tokenAdapter.signAccessToken({ sub: userId, sessionId, role });
    return `Bearer ${token}`;
  }

  const superAdmin = await mintAdmin('SUPER_ADMIN');

  async function createCity(name: string, lngStart: number): Promise<string> {
    const res = await request(app)
      .post('/api/v1/admin/zones')
      .set('Authorization', superAdmin.auth)
      .send({
        name,
        zoneType: 'CITY',
        stateCode: 'WB',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [lngStart, 26.6],
              [lngStart + 0.3, 26.6],
              [lngStart + 0.3, 26.9],
              [lngStart, 26.9],
              [lngStart, 26.6],
            ],
          ],
        },
      });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  const ownCity = await createCity('Siliguri Assigned', 88.3);
  const foreignCity = await createCity('Malda Foreign', 89.0);

  return {
    app,
    admins,
    sessions,
    userRepo,
    adminRepo,
    sessionRepo,
    rideRepo,
    rideEventRepo,
    walletRepo,
    presence,
    superAdmin,
    ownCity,
    foreignCity,
    appId,
    driverId,
    riderUserId,
    driverUserId,
    mintAdmin,
    mintUser,
  };
}

describe('Step 15 Admin Permissions, City Scope & Operations Audit', () => {
  it('revokes sessions on admin role/zone update and rejects suspended or stale-role tokens', async () => {
    const f = await setupAuditFixture();
    const cityAdmin = await f.mintAdmin('CITY_ADMIN', [f.ownCity]);

    const okBefore = await request(f.app)
      .get('/api/v1/admin/users/roles/permissions')
      .set('Authorization', cityAdmin.auth);
    expect(okBefore.status).toBe(200);

    // Role change revokes active sessions immediately
    const updateUseCase = new UpdateAdminUserUseCase({
      adminUserRepo: f.adminRepo as any,
      userRepo: f.userRepo as any,
      sessionRepo: f.sessionRepo as any,
    });
    await updateUseCase.execute(cityAdmin.adminId, f.superAdmin.userId, {
      role: 'SUPPORT_ADMIN',
      cityZoneIds: [],
    });

    const afterRoleChange = await request(f.app)
      .get('/api/v1/admin/users/roles/permissions')
      .set('Authorization', cityAdmin.auth);
    expect(afterRoleChange.status).toBe(401);

    // Even if a session remained active, live AdminUser status/role mismatch fails closed with 403
    const supportAdmin = await f.mintAdmin('SUPPORT_ADMIN');
    await f.adminRepo.update(supportAdmin.adminId, { status: 'SUSPENDED' });
    const suspendedRes = await request(f.app)
      .get('/api/v1/admin/users/roles/permissions')
      .set('Authorization', supportAdmin.auth);
    expect(suspendedRes.status).toBe(403);
  });

  it('scopes CITY_ADMIN to assigned cities across rides, fleet radar, and top-level city zone mutations', async () => {
    const f = await setupAuditFixture();
    const cityAdmin = await f.mintAdmin('CITY_ADMIN', [f.ownCity]);

    const ownRideId = '018f0a00-0000-7000-8000-000000000701';
    const foreignRideId = '018f0a00-0000-7000-8000-000000000702';
    await f.rideRepo.save(makeRide(ownRideId, f.ownCity));
    await f.rideRepo.save(
      makeRide(foreignRideId, f.foreignCity, {
        driverId: '018f0a00-0000-7000-8000-000000000202',
      }),
    );

    // 1. Rides list only shows ownCity rides
    const listRes = await request(f.app)
      .get('/api/v1/rides')
      .set('Authorization', cityAdmin.auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.map((r: { id: string }) => r.id)).toEqual([ownRideId]);

    // 2. Direct foreign ride GET, events, and force-cancel all return 403
    expect(
      (await request(f.app).get(`/api/v1/rides/${foreignRideId}`).set('Authorization', cityAdmin.auth))
        .status,
    ).toBe(403);
    expect(
      (
        await request(f.app)
          .get(`/api/v1/rides/${foreignRideId}/events`)
          .set('Authorization', cityAdmin.auth)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(f.app)
          .post(`/api/v1/rides/${foreignRideId}/cancel`)
          .set('Authorization', cityAdmin.auth)
          .send({ reason: 'ADMIN_OVERRIDE' })
      ).status,
    ).toBe(403);

    // Own-city ride GET and force-cancel succeed
    expect(
      (await request(f.app).get(`/api/v1/rides/${ownRideId}`).set('Authorization', cityAdmin.auth))
        .status,
    ).toBe(200);
    const cancelOwn = await request(f.app)
      .post(`/api/v1/rides/${ownRideId}/cancel`)
      .set('Authorization', cityAdmin.auth)
      .send({ reason: 'ADMIN_OVERRIDE' });
    expect(cancelOwn.status).toBe(200);
    expect(cancelOwn.body.data.ride.status).toBe('CANCELLED');

    // 3. Dispatch fleet radar filters drivers to assigned city coordinates
    const now = new Date();
    await f.presence.set({
      driverId: 'drv-own',
      userId: 'usr-own',
      vehicleCategory: 'CAB',
      lat: 26.72,
      lng: 88.42, // inside ownCity [88.3..88.6, 26.6..26.9]
      heading: null,
      speedMps: null,
      locationUpdatedAt: now,
    });
    await f.presence.set({
      driverId: 'drv-foreign',
      userId: 'usr-foreign',
      vehicleCategory: 'CAB',
      lat: 26.72,
      lng: 89.15, // inside foreignCity [89.0..89.3, 26.6..26.9]
      heading: null,
      speedMps: null,
      locationUpdatedAt: now,
    });
    const fleetRes = await request(f.app)
      .get('/api/v1/admin/dispatch/fleet')
      .set('Authorization', cityAdmin.auth);
    expect(fleetRes.status).toBe(200);
    expect(fleetRes.body.data.map((d: { driverId: string }) => d.driverId)).toEqual(['drv-own']);

    // 4. Top-level CITY zone delete/deactivate/geometry blocked for CITY_ADMIN
    expect(
      (
        await request(f.app)
          .delete(`/api/v1/admin/zones/${f.ownCity}`)
          .set('Authorization', cityAdmin.auth)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(f.app)
          .post(`/api/v1/admin/zones/${f.ownCity}/deactivate`)
          .set('Authorization', cityAdmin.auth)
          .send({ reason: 'Attempted city shutdown' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(f.app)
          .patch(`/api/v1/admin/zones/${f.ownCity}/geometry`)
          .set('Authorization', cityAdmin.auth)
          .send({
            expectedVersion: 2,
            boundary: {
              type: 'Polygon',
              coordinates: [
                [
                  [88.3, 26.6],
                  [88.5, 26.6],
                  [88.5, 26.8],
                  [88.3, 26.8],
                  [88.3, 26.6],
                ],
              ],
            },
          })
      ).status,
    ).toBe(403);

    // 5. Global customer directory denied to CITY_ADMIN
    expect(
      (await request(f.app).get('/api/v1/admin/riders').set('Authorization', cityAdmin.auth)).status,
    ).toBe(403);
  });

  it('enforces driver KYC read/mutate split and redacts private document URLs for FINANCE_ADMIN', async () => {
    const f = await setupAuditFixture();
    const supportAdmin = await f.mintAdmin('SUPPORT_ADMIN');
    const financeAdmin = await f.mintAdmin('FINANCE_ADMIN');
    const cityAdmin = await f.mintAdmin('CITY_ADMIN', [f.ownCity]);

    // CITY_ADMIN cannot access global driver applications without city assignment
    expect(
      (
        await request(f.app)
          .get('/api/v1/admin/driver-applications')
          .set('Authorization', cityAdmin.auth)
      ).status,
    ).toBe(403);

    // SUPPORT_ADMIN can read full dossier including KYC preview URL, but cannot review or suspend
    const supportDetail = await request(f.app)
      .get(`/api/v1/admin/driver-applications/${f.appId}`)
      .set('Authorization', supportAdmin.auth);
    expect(supportDetail.status).toBe(200);
    expect(supportDetail.body.data.documents[0].fileUrl).toContain('private-cdn.example');

    expect(
      (
        await request(f.app)
          .patch(`/api/v1/admin/driver-applications/${f.appId}/status`)
          .set('Authorization', supportAdmin.auth)
          .send({ status: 'SUSPENDED' })
      ).status,
    ).toBe(403);

    // FINANCE_ADMIN can read driver dossier for wallet context, with private KYC URLs redacted
    const financeDetail = await request(f.app)
      .get(`/api/v1/admin/driver-applications/${f.appId}`)
      .set('Authorization', financeAdmin.auth);
    expect(financeDetail.status).toBe(200);
    expect(financeDetail.body.data.driver.id).toBe(f.driverId);
    expect(financeDetail.body.data.documents[0].fileUrl).toBeNull();
    expect(financeDetail.body.data.documents[0].storageKey).toBe('REDACTED');
    expect(financeDetail.body.data.documents[0].documentNumberMasked).toBe('WB74****2345');
  });

  it('exposes dispute & refund evidence to SUPPORT_ADMIN and FINANCE_ADMIN while keeping resolution restricted', async () => {
    const f = await setupAuditFixture();
    const supportAdmin = await f.mintAdmin('SUPPORT_ADMIN');
    const financeAdmin = await f.mintAdmin('FINANCE_ADMIN');
    const riderAuth = await f.mintUser(f.riderUserId, 'RIDER');

    // Seed driver wallet + settled cash ride with commission debit
    const walletId = newUuid();
    await f.walletRepo.save({
      id: walletId,
      ownerType: 'DRIVER',
      driverId: f.driverId,
      riderId: null,
      balancePaise: 48000,
      owedPaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const rideId = '018f0a00-0000-7000-8000-000000000888';
    await f.walletRepo.recordTransaction({
      id: newUuid(),
      walletId,
      ownerType: 'DRIVER',
      driverId: f.driverId,
      riderId: null,
      type: 'DEBIT',
      amountPaise: 2000,
      referenceType: 'RIDE_COMMISSION',
      referenceId: rideId,
      idempotencyKey: `commission_debit_${rideId}`,
      balanceBeforePaise: 50000,
      balanceAfterPaise: 48000,
      createdBy: 'SYSTEM',
      note: '10% commission',
      createdAt: new Date(),
    });
    await f.rideRepo.save(
      makeRide(rideId, f.ownCity, {
        status: 'SETTLED',
        completedAt: new Date(),
        settledAt: new Date(),
      }),
    );
    await f.rideEventRepo.save({
      id: newUuid(),
      rideId,
      eventType: 'PAYMENT_METHOD_CHANGED',
      actorType: 'RIDER',
      actorId: '018f0a00-0000-7000-8000-000000000101',
      previousStatus: 'PAYMENT_PENDING',
      newStatus: 'PAYMENT_PENDING',
      metadata: { method: 'CASH' },
      createdAt: new Date(),
    });
    await f.rideEventRepo.save({
      id: newUuid(),
      rideId,
      eventType: 'PAYMENT_CONFIRMED',
      actorType: 'DRIVER',
      actorId: f.driverId,
      previousStatus: 'PAYMENT_PENDING',
      newStatus: 'SETTLED',
      metadata: { method: 'CASH', commissionPaise: 2000 },
      createdAt: new Date(),
    });

    // Admins cannot switch ride payment method to cash (strictly participant-only)
    expect(
      (
        await request(f.app)
          .post(`/api/v1/rides/${rideId}/payment/cash`)
          .set('Authorization', supportAdmin.auth)
      ).status,
    ).toBe(403);

    // Rider files dispute
    const disputed = await request(f.app)
      .post(`/api/v1/rides/${rideId}/payment/dispute`)
      .set('Authorization', riderAuth)
      .send({ reason: 'Driver collected extra cash above agreed fare' });
    expect(disputed.status).toBe(200);

    // FINANCE_ADMIN can inspect open dispute evidence, but cannot resolve it
    const financeOpen = await request(f.app)
      .get('/api/v1/rides/payment/disputes?status=OPEN')
      .set('Authorization', financeAdmin.auth);
    expect(financeOpen.status).toBe(200);
    expect(financeOpen.body.data).toHaveLength(1);
    expect(financeOpen.body.data[0].evidence).toMatchObject({
      paymentCollection: 'CASH',
      paymentMethod: 'CASH',
      commissionChargedPaise: 2000,
      commissionRefundedPaise: 0,
    });

    expect(
      (
        await request(f.app)
          .post(`/api/v1/rides/${rideId}/payment/dispute/resolve`)
          .set('Authorization', financeAdmin.auth)
          .send({ outcome: 'RIDER_WINS', reason: 'Finance attempted resolution' })
      ).status,
    ).toBe(403);

    // SUPPORT_ADMIN resolves dispute -> commission refunded -> visible in status=RESOLVED with refund tx evidence
    const resolveRes = await request(f.app)
      .post(`/api/v1/rides/${rideId}/payment/dispute/resolve`)
      .set('Authorization', supportAdmin.auth)
      .send({ outcome: 'RIDER_WINS', reason: 'Confirmed overcharge with rider receipt' });
    expect(resolveRes.status).toBe(200);

    const financeResolved = await request(f.app)
      .get('/api/v1/rides/payment/disputes?status=RESOLVED')
      .set('Authorization', financeAdmin.auth);
    expect(financeResolved.status).toBe(200);
    expect(financeResolved.body.data).toHaveLength(1);
    expect(financeResolved.body.data[0].resolution.metadata.outcome).toBe('RIDER_WINS');
    expect(financeResolved.body.data[0].evidence.commissionRefundedPaise).toBe(2000);
    expect(financeResolved.body.data[0].evidence.refundTransactionId).toEqual(expect.any(String));
  });
});
