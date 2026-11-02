import { createHash, createHmac } from 'node:crypto';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AdminRole } from '@cabzone/contracts';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/shared/auth/password.util.js';
import { newUuid } from '../src/shared/ids.js';
import { REDACTED_PATHS } from '../src/shared/logging/logger.js';
import {
  buildIdentityContainer,
  type IdentityContainerDeps,
} from '../src/modules/identity/identity.container.js';
import {
  JoseTokenAdapter,
  MemoryOtpStoreAdapter,
} from '../src/modules/identity/infrastructure/index.js';
import type {
  AdminUserEntity,
  AdminUserListFilter,
  AdminUserWithUser,
  DriverApplicationEntity,
  DriverDocumentEntity,
  DriverEntity,
  KycAuditEventEntity,
  RiderEntity,
  RiderListFilter,
  RiderWithUser,
  SessionEntity,
  UserEntity,
  VehicleEntity,
} from '../src/modules/identity/domain/index.js';
import { buildZoneContainer, MemoryZoneRepository } from '../src/modules/zone/index.js';
import { buildPricingContainer } from '../src/modules/pricing/pricing.container.js';
import { MemoryPricingConfigRepository } from '../src/modules/pricing/infrastructure/persistence/index.js';
import {
  MemoryPaymentRepository,
  MemoryWalletRepository,
  type RecordPaymentWebhookEventInput,
} from '../src/modules/ledger/index.js';
import { maskPhoneBasedUpi } from '../src/modules/ledger/application/useCases/walletMoney.usecase.js';
import type {
  WalletOperation,
  WalletOperationRepository,
} from '../src/modules/ledger/domain/walletOperation.port.js';
import { buildLedgerContainer } from '../src/modules/ledger/ledger.container.js';
import { MemoryPresenceRepository } from '../src/modules/dispatch/infrastructure/memoryPresence.repository.js';
import { MemoryPushTokenRepository } from '../src/modules/dispatch/infrastructure/pushToken.repository.js';
import { buildDispatchContainer } from '../src/modules/dispatch/dispatch.container.js';
import { buildRidesContainer } from '../src/modules/rides/rides.container.js';
import {
  MemoryRideEventRepository,
  MemoryRideRepository,
  type RideEntity,
} from '../src/modules/rides/index.js';
import { MockQrPaymentGateway } from '../src/modules/rides/infrastructure/razorpayQr.gateway.js';
import { RideQrPaymentUseCase } from '../src/modules/rides/application/useCases/rideQrPayment.usecase.js';
import { RideUpiPaymentUseCase } from '../src/modules/rides/application/useCases/rideUpiPayment.usecase.js';
import { makeRideUpiWebhook } from '../src/modules/rides/interface/rideUpiWebhook.controller.js';
import { buildHealthContainer } from '../src/modules/health/health.container.js';
import { buildRoutingContainer } from '../src/modules/routing/routing.container.js';
import { HaversineRouteProvider } from '../src/modules/routing/infrastructure/haversine.provider.js';
import { unitOfWork } from './helpers/unitOfWork.js';

const SECRET = 'phase-6-privacy-coverage-jwt-secret-32-chars-min!';
const WEBHOOK_SECRET = 'phase-6-razorpay-webhook-secret-32-chars-min!';

const CANARY = {
  riderPhoneE164: '+919876500111',
  riderDigits: '9876500111',
  riderEmergencyPhoneE164: '+919876500222',
  riderEmergencyDigits: '9876500222',
  driverPhoneE164: '+919876500333',
  driverDigits: '9876500333',
  driverAltPhoneE164: '+919876500444',
  driverAltDigits: '9876500444',
  adminPhoneE164: '+919876500555',
  adminDigits: '9876500555',
} as const;

const ALL_CANARY_DIGITS = [
  CANARY.riderDigits,
  CANARY.riderEmergencyDigits,
  CANARY.driverDigits,
  CANARY.driverAltDigits,
  CANARY.adminDigits,
];

function expectZeroCanaryDigits(payload: unknown, label: string): void {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const digits of ALL_CANARY_DIGITS) {
    expect(serialized, `${label} leaked canary digits ${digits}`).not.toContain(digits);
  }
}

class MemoryWalletOperationRepository implements WalletOperationRepository {
  private readonly items = new Map<string, WalletOperation>();

  async find(id: string): Promise<WalletOperation | null> {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  async findByKey(key: string): Promise<WalletOperation | null> {
    for (const item of this.items.values()) {
      if (item.idempotencyKey === key) return { ...item };
    }
    return null;
  }

  async save(operation: WalletOperation): Promise<WalletOperation> {
    const copy = { ...operation };
    this.items.set(copy.id, copy);
    return copy;
  }

  async list(
    driverId?: string,
    kind?: WalletOperation['kind'],
    status?: WalletOperation['status'],
  ): Promise<WalletOperation[]> {
    return [...this.items.values()].filter((op) => {
      if (driverId && op.driverId !== driverId) return false;
      if (kind && op.kind !== kind) return false;
      if (status && op.status !== status) return false;
      return true;
    });
  }
}

async function setupPrivacyFixture(opts?: { chatEnabled?: boolean; callsEnabled?: boolean }) {
  const now = new Date('2026-10-30T12:00:00.000Z');
  const tokenAdapter = new JoseTokenAdapter(SECRET);
  const otpStore = new MemoryOtpStoreAdapter();
  const sentSms: Array<{ to: string; body: string }> = [];

  const users = new Map<string, UserEntity>();
  const sessions = new Map<string, SessionEntity>();
  const admins = new Map<string, AdminUserEntity>();
  const riders = new Map<string, RiderEntity>();
  const drivers = new Map<string, DriverEntity>();
  const vehicles = new Map<string, VehicleEntity>();
  const applications = new Map<string, DriverApplicationEntity>();
  const documents = new Map<string, DriverDocumentEntity[]>();
  const kycAudits: KycAuditEventEntity[] = [];

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
  const walletOperations = new MemoryWalletOperationRepository();
  const paymentRepo = new MemoryPaymentRepository();
  const presence = new MemoryPresenceRepository();
  const pushTokens = new MemoryPushTokenRepository();
  const realtimeEvents: Array<{ userId: string; eventName: string; data: unknown }> = [];

  const riderId = '018f0a00-0000-7000-8000-000000000101';
  const riderUserId = '018f0a00-0000-7000-8000-000000000100';
  users.set(riderUserId, {
    id: riderUserId,
    phoneE164: CANARY.riderPhoneE164,
    status: 'ACTIVE',
    phoneVerifiedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  riders.set(riderId, {
    id: riderId,
    userId: riderUserId,
    name: 'Asha Rider',
    email: 'asha.rider@cabzone.test',
    preferredLanguage: 'en',
    emergencyContact: {
      name: 'Meera Sister',
      phoneE164: CANARY.riderEmergencyPhoneE164,
    },
    ratingAverage: 4.9,
    ratingCount: 5,
    createdAt: now,
    updatedAt: now,
  });

  const driverId = '018f0a00-0000-7000-8000-000000000201';
  const driverUserId = '018f0a00-0000-7000-8000-000000000200';
  const appId = '018f0a00-0000-7000-8000-000000000401';
  const docId = '018f0a00-0000-7000-8000-000000000501';
  const vehicleId = '018f0a00-0000-7000-8000-000000000301';

  users.set(driverUserId, {
    id: driverUserId,
    phoneE164: CANARY.driverPhoneE164,
    status: 'ACTIVE',
    phoneVerifiedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  drivers.set(driverId, {
    id: driverId,
    userId: driverUserId,
    name: 'Raju Driver',
    gender: 'MALE',
    dateOfBirth: '1990-01-01',
    address: 'Sevoke Road, Siliguri',
    dlNumber: 'WB7420200012345',
    dlExpiry: '2030-01-01',
    alternatePhone: CANARY.driverAltPhoneE164,
    emergencyContact: `Brother ${CANARY.driverAltPhoneE164}`,
    profilePhotoUrl: 'https://res.cloudinary.com/demo/image/upload/driver-profiles/018f0a00-0000-7000-8000-000000000999.jpg',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    operationalStatus: 'ONLINE',
    currentVehicleId: vehicleId,
    ratingAverage: 4.8,
    ratingCount: 18,
    createdAt: now,
    updatedAt: now,
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
    createdAt: now,
    updatedAt: now,
  });
  applications.set(appId, {
    id: appId,
    driverId,
    status: 'APPROVED',
    submittedAt: now,
    reviewedAt: now,
    reviewerAdminId: null,
    rejectionType: null,
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
  });
  documents.set(appId, [
    {
      id: docId,
      driverId,
      applicationId: appId,
      type: 'DRIVING_LICENSE',
      storageKey: 'driver-kyc/018f0a00-0000-7000-8000-000000000501.jpg',
      documentHash: 'a'.repeat(64),
      documentNumberMasked: 'WB74****2345',
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000 * 180),
      verificationStatus: 'VERIFIED',
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const targetAdminId = '018f0a00-0000-7000-8000-000000000601';
  const targetAdminUserId = '018f0a00-0000-7000-8000-000000000600';
  const targetAdminPassword = 'StrongAdminPassword!2026';
  users.set(targetAdminUserId, {
    id: targetAdminUserId,
    phoneE164: CANARY.adminPhoneE164,
    status: 'ACTIVE',
    phoneVerifiedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  admins.set(targetAdminId, {
    id: targetAdminId,
    userId: targetAdminUserId,
    name: 'Ops Coordinator',
    email: 'ops.coordinator@cabzone.test',
    passwordHash: hashPassword(targetAdminPassword),
    role: 'SUPPORT_ADMIN',
    cityZoneIds: [],
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  await walletRepo.save({
    id: '018f0a00-0000-7000-8000-000000000701',
    driverId,
    balancePaise: 50000,
    earningsBalancePaise: 80000,
    status: 'ACTIVE',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  await presence.set({
    driverId,
    userId: driverUserId,
    vehicleCategory: 'CAB',
    lat: 26.721,
    lng: 88.425,
    heading: 90,
    speedMps: 4,
    locationUpdatedAt: new Date(),
  });

  const sessionRepo = {
    findById: async (id: string) => sessions.get(id) ?? null,
    save: async (session: SessionEntity) => {
      sessions.set(session.id, { ...session });
      return { ...session };
    },
    create: async (session: SessionEntity) => {
      sessions.set(session.id, { ...session });
      return { ...session };
    },
    revokeAllForUser: async (userId: string) => {
      for (const [sid, s] of sessions.entries()) {
        if (s.userId === userId) {
          sessions.set(sid, { ...s, revokedAt: new Date() });
        }
      }
    },
  };

  const userRepo = {
    findById: async (id: string) => users.get(id) ?? null,
    findByPhone: async (phoneE164: string) =>
      [...users.values()].find((u) => u.phoneE164 === phoneE164) ?? null,
    create: async (user: UserEntity) => {
      users.set(user.id, { ...user });
      return { ...user };
    },
    update: async (user: UserEntity) => {
      users.set(user.id, { ...user });
      return { ...user };
    },
  };

  const riderRepo = {
    findById: async (id: string) => riders.get(id) ?? null,
    findByUserId: async (uid: string) =>
      [...riders.values()].find((r) => r.userId === uid) ?? null,
    create: async (rider: RiderEntity) => {
      riders.set(rider.id, { ...rider });
      return { ...rider };
    },
    update: async (rider: RiderEntity) => {
      riders.set(rider.id, { ...rider });
      return { ...rider };
    },
    list: async (filter: RiderListFilter): Promise<{ items: RiderWithUser[]; total: number }> => {
      const items: RiderWithUser[] = [];
      for (const r of riders.values()) {
        const u = users.get(r.userId);
        if (!u) continue;
        if (filter.status && u.status !== filter.status) continue;
        if (filter.search?.trim()) {
          const q = filter.search.trim().toLowerCase();
          const matched =
            (r.name?.toLowerCase().includes(q) ?? false) ||
            (r.email?.toLowerCase().includes(q) ?? false) ||
            u.phoneE164.includes(q) ||
            r.id.toLowerCase().includes(q) ||
            r.userId.toLowerCase().includes(q);
          if (!matched) continue;
        }
        items.push({
          rider: { ...r },
          phoneE164: u.phoneE164,
          status: u.status,
          totalRides: 2,
          completedRides: 1,
        });
      }
      return { items, total: items.length };
    },
  };

  const adminRepo = {
    findById: async (id: string) => admins.get(id) ?? null,
    findByUserId: async (uid: string) =>
      [...admins.values()].find((a) => a.userId === uid) ?? null,
    findByEmail: async (email: string) =>
      [...admins.values()].find((a) => a.email?.toLowerCase() === email.toLowerCase()) ?? null,
    create: async (admin: AdminUserEntity) => {
      admins.set(admin.id, { ...admin });
      return { ...admin };
    },
    update: async (id: string, patch: Partial<AdminUserEntity>) => {
      const existing = admins.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...patch, updatedAt: new Date() };
      admins.set(id, updated);
      return updated;
    },
    list: async (filter: AdminUserListFilter): Promise<{ admins: AdminUserWithUser[]; total: number }> => {
      const matchedAdmins: AdminUserWithUser[] = [];
      for (const a of admins.values()) {
        if (filter.role && a.role !== filter.role) continue;
        if (filter.status && a.status !== filter.status) continue;
        const adminUser = users.get(a.userId);
        if (filter.search?.trim()) {
          const q = filter.search.trim().toLowerCase();
          const matched =
            (adminUser?.phoneE164.includes(q) ?? false) ||
            a.name.toLowerCase().includes(q) ||
            (a.email?.toLowerCase().includes(q) ?? false) ||
            a.id.toLowerCase().includes(q) ||
            a.userId.toLowerCase().includes(q);
          if (!matched) continue;
        }
        matchedAdmins.push({ ...a, phoneE164: adminUser?.phoneE164 ?? '' });
      }
      return { admins: matchedAdmins, total: matchedAdmins.length };
    },
  };

  const identity = buildIdentityContainer({
    unitOfWork,
    tokenAdapter,
    otpStore,
    smsGateway: {
      sendOtp: async (to, otp) => {
        sentSms.push({ to, body: otp });
      },
    },
    zoneRepo,
    rideRepo,
    previewSigningSecret: SECRET,
    licenseStorage: {
      upload: async (_dataUrl, ext) => `driver-kyc/${newUuid()}.${ext}`,
      read: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    },
    auditRepo: {
      record: async (event) => {
        kycAudits.push(event);
      },
    } as unknown as IdentityContainerDeps['auditRepo'],
    sessionRepo: sessionRepo as unknown as IdentityContainerDeps['sessionRepo'],
    adminRepo: adminRepo as unknown as IdentityContainerDeps['adminRepo'],
    userRepo: userRepo as unknown as IdentityContainerDeps['userRepo'],
    riderRepo: riderRepo as unknown as IdentityContainerDeps['riderRepo'],
    driverRepo: {
      findById: async (id: string) => drivers.get(id) ?? null,
      findByUserId: async (uid: string) =>
        [...drivers.values()].find((d) => d.userId === uid) ?? null,
      listAll: async () => [...drivers.values()],
      update: async (driver: DriverEntity) => {
        drivers.set(driver.id, { ...driver });
        return { ...driver };
      },
    } as unknown as IdentityContainerDeps['driverRepo'],
    vehicleRepo: {
      findById: async (id: string) => vehicles.get(id) ?? null,
      findByDriverId: async (did: string) =>
        [...vehicles.values()].filter((v) => v.driverId === did),
    } as unknown as IdentityContainerDeps['vehicleRepo'],
    applicationRepo: {
      findById: async (id: string) => applications.get(id) ?? null,
      findByDriverId: async (did: string) =>
        [...applications.values()].find((a) => a.driverId === did) ?? null,
      list: async () => [...applications.values()],
    } as unknown as IdentityContainerDeps['applicationRepo'],
    documentRepo: {
      findById: async (id: string) => {
        for (const docs of documents.values()) {
          const found = docs.find((d) => d.id === id);
          if (found) return found;
        }
        return null;
      },
      findByDriverId: async (did: string) => {
        const result: DriverDocumentEntity[] = [];
        for (const docs of documents.values()) {
          result.push(...docs.filter((d) => d.driverId === did));
        }
        return result;
      },
      findByApplicationId: async (aid: string) => documents.get(aid) ?? [],
    } as unknown as IdentityContainerDeps['documentRepo'],
  });

  const ledger = buildLedgerContainer({
    unitOfWork,
    walletRepo,
    walletOperations,
    resolveDriverId: async (uid) => (uid === driverUserId ? driverId : null),
    lookups: {
      getDrivers: async () =>
        [...drivers.values()].map((d) => ({
          id: d.id,
          name: d.name ?? null,
          phoneE164: users.get(d.userId)?.phoneE164 ?? '',
        })),
      getRiders: async () =>
        [...riders.values()].map((r) => ({
          id: r.id,
          name: r.name ?? null,
          phoneE164: users.get(r.userId)?.phoneE164 ?? '',
        })),
    },
  });

  const dispatch = buildDispatchContainer({
    presence,
    pushTokens,
    publisher: {
      publishToUser: (userId: string, eventName: string, data: unknown) => {
        realtimeEvents.push({ userId, eventName, data });
      },
      isConnected: async () => false,
    } as never,
    rideRepo,
    walletRepo,
    lookups: {
      getDriverProfileByUserId: async (uid) => {
        const d = [...drivers.values()].find((item) => item.userId === uid);
        if (!d) return null;
        const v = d.currentVehicleId ? vehicles.get(d.currentVehicleId) : null;
        return {
          driverId: d.id,
          driverStatus: d.status,
          kycStatus: d.kycStatus,
          vehicleId: v?.id ?? null,
          vehicleCategory: v?.vehicleType ?? null,
        };
      },
      getDriverInfo: async (did) => {
        const d = drivers.get(did);
        if (!d) return null;
        const v = d.currentVehicleId ? vehicles.get(d.currentVehicleId) : null;
        return {
          name: d.name ?? null,
          phoneE164: users.get(d.userId)?.phoneE164 ?? '',
          registrationNumber: v?.registrationNumber ?? null,
          make: v?.make ?? null,
          model: v?.model ?? null,
        };
      },
      getUserIdForRider: async (rid) => riders.get(rid)?.userId ?? null,
      getUserIdForDriver: async (did) => drivers.get(did)?.userId ?? null,
      isPointInCityZones: async (lat, lng, cityZoneIds) => {
        const active = await zoneRepo.findActiveCitiesContainingPoint({ lat, lng });
        return active.some((z) => cityZoneIds.includes(z.id));
      },
    },
  });

  const rides = buildRidesContainer({
    unitOfWork,
    rideRepo,
    rideEventRepo,
    walletRepo,
    paymentRepo,
    pricingConfigRepo,
    tokenSecret: SECRET,
    notifier: dispatch.notifier,
    resolveRiderId: async (uid) => (uid === riderUserId ? riderId : null),
    resolveDriverId: async (uid) => (uid === driverUserId ? driverId : null),
    requireDriverEligibility: async () => vehicleId,
    getUserIdForRider: async (rid) => riders.get(rid)?.userId ?? null,
    getUserIdForDriver: async (did) => drivers.get(did)?.userId ?? null,
    isCommunicationAccountActive: async () => true,
    chatEnabled: opts?.chatEnabled ?? true,
    callsEnabled: opts?.callsEnabled ?? false,
    consumeChatRateLimit: async () => 0,
    consumeCallRateLimit: async () => 0,
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
    users.set(userId, {
      id: userId,
      phoneE164: `+9191${Math.floor(10000000 + Math.random() * 89999999)}`,
      status: 'ACTIVE',
      phoneVerifiedAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    admins.set(adminId, {
      id: adminId,
      userId,
      name: `${role} Actor`,
      email: `${role.toLowerCase()}@cabzone.test`,
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
      previousRefreshTokenHash: null,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const token = await tokenAdapter.signAccessToken({ sub: userId, sessionId, role });
    return { adminId, userId, auth: `Bearer ${token}` };
  }

  async function mintUser(userId: string, role: 'RIDER' | 'DRIVER') {
    const sessionId = newUuid();
    sessions.set(sessionId, {
      id: sessionId,
      userId,
      deviceId: 'mobile-device-01',
      refreshTokenHash: 'hash',
      previousRefreshTokenHash: null,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const token = await tokenAdapter.signAccessToken({ sub: userId, sessionId, role });
    return `Bearer ${token}`;
  }

  const superAdmin = await mintAdmin('SUPER_ADMIN');
  const financeAdmin = await mintAdmin('FINANCE_ADMIN');
  const riderAuth = await mintUser(riderUserId, 'RIDER');
  const driverAuth = await mintUser(driverUserId, 'DRIVER');

  // Seed Siliguri city zone + active ride + offering ride + disputed ride
  const cityRes = await request(app)
    .post('/api/v1/admin/zones')
    .set('Authorization', superAdmin.auth)
    .send({
      name: 'Siliguri',
      zoneType: 'CITY',
      stateCode: 'WB',
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [88.3, 26.6],
            [88.6, 26.6],
            [88.6, 26.9],
            [88.3, 26.9],
            [88.3, 26.6],
          ],
        ],
      },
    });
  const cityZoneId = cityRes.body.data.id as string;

  function buildSeededRide(
    id: string,
    status: RideEntity['status'],
    overrides: Partial<RideEntity> = {},
  ): RideEntity {
    return {
      id,
      bookerRiderId: riderId,
      passenger: {
        riderId,
        name: 'Asha Rider',
        phoneE164: CANARY.riderPhoneE164,
        pickupOtpHash: null,
        pickupOtpExpiresAt: null,
        otpAttempts: 0,
        maxOtpAttempts: 3,
      },
      driverId: status === 'OFFERING' ? null : driverId,
      vehicleId: status === 'OFFERING' ? null : vehicleId,
      vehicleCategory: 'CAB',
      pickup: { lat: 26.72, lng: 88.42, address: 'Siliguri Junction' },
      drop: { lat: 26.75, lng: 88.44, address: 'City Centre' },
      routeSnapshot: {
        provider: 'haversine',
        distanceM: 4200,
        durationSeconds: 600,
        polyline: '',
        calculatedAt: now,
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
        negotiationFloorPaise: 15000,
        negotiationCeilingPaise: 30000,
      },
      suggestedFarePaise: 18000,
      proposedFarePaise: 18000,
      agreedFarePaise: status === 'OFFERING' ? null : 18000,
      status,
      cancellationReason: null,
      offeringExpiresAt: status === 'OFFERING' ? new Date(Date.now() + 300_000) : null,
      acceptedAt: status === 'OFFERING' ? null : now,
      arrivedAt: null,
      startedAt: null,
      completedAt: status === 'PAYMENT_DISPUTED' ? now : null,
      settledAt: null,
      cancelledAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  const activeRideId = '018f0a00-0000-7000-8000-000000000801';
  const offeringRideId = '018f0a00-0000-7000-8000-000000000802';
  const disputedRideId = '018f0a00-0000-7000-8000-000000000803';
  const settledRideId = '018f0a00-0000-7000-8000-000000000804';

  await rideRepo.save(buildSeededRide(activeRideId, 'DRIVER_EN_ROUTE'));
  await rideRepo.save(
    buildSeededRide(offeringRideId, 'OFFERING', {
      bookerRiderId: '018f0a00-0000-7000-8000-000000000199',
    }),
  );
  await rideRepo.save(
    buildSeededRide(disputedRideId, 'PAYMENT_DISPUTED', {
      bookerRiderId: '018f0a00-0000-7000-8000-000000000198',
      driverId: '018f0a00-0000-7000-8000-000000000298',
      paymentDispute: {
        disputedAt: now,
        disputedByRole: 'DRIVER',
        reason: 'Rider claimed UPI deducted',
        resolvedAt: null,
        resolvedByAdminId: null,
        resolution: null,
        resolutionNote: null,
      },
    } as Partial<RideEntity>),
  );
  await rideRepo.save(
    buildSeededRide(settledRideId, 'SETTLED', {
      completedAt: now,
      settledAt: now,
    }),
  );

  return {
    app,
    superAdmin,
    financeAdmin,
    riderAuth,
    driverAuth,
    riderId,
    riderUserId,
    driverId,
    driverUserId,
    appId,
    docId,
    targetAdminId,
    targetAdminPassword,
    activeRideId,
    offeringRideId,
    disputedRideId,
    otpStore,
    sentSms,
    pushTokens,
    realtimeEvents,
    dispatch,
    rideRepo,
    rideEventRepo,
    walletRepo,
    paymentRepo,
  };
}

describe('Phase 6 (P06) — Complete Privacy Coverage', () => {
  it('shows phone numbers and full contact details to admins while rider and driver views stay private', async () => {
    const f = await setupPrivacyFixture();

    // 1. Admin Riders list & detail
    const ridersList = await request(f.app)
      .get('/api/v1/admin/riders')
      .set('Authorization', f.superAdmin.auth);
    expect(ridersList.status).toBe(200);
    expect(ridersList.body.data.riders[0].phoneE164).toBe(CANARY.riderPhoneE164);
    expect(ridersList.body.data.riders[0].emergencyContact).toEqual({
      name: 'Meera Sister',
      phoneE164: CANARY.riderEmergencyPhoneE164,
    });

    const riderDetail = await request(f.app)
      .get(`/api/v1/admin/riders/${f.riderId}`)
      .set('Authorization', f.superAdmin.auth);
    expect(riderDetail.status).toBe(200);
    expect(riderDetail.body.data.phoneE164).toBe(CANARY.riderPhoneE164);
    expect(riderDetail.body.data.emergencyContact).toEqual({
      name: 'Meera Sister',
      phoneE164: CANARY.riderEmergencyPhoneE164,
    });

    // Admin rider PATCH can update the emergency contact
    const emergencyPatch = await request(f.app)
      .patch(`/api/v1/admin/riders/${f.riderId}`)
      .set('Authorization', f.superAdmin.auth)
      .send({
        name: 'Asha Updated',
        emergencyContact: { name: 'Injected', phoneE164: '+919999988888' },
      });
    expect(emergencyPatch.status).toBe(200);

    // Phone, ID and name search all work on admin riders
    const riderPhoneSearch = await request(f.app)
      .get(`/api/v1/admin/riders?search=${CANARY.riderDigits}`)
      .set('Authorization', f.superAdmin.auth);
    expect(riderPhoneSearch.status).toBe(200);
    expect(riderPhoneSearch.body.data.riders).toHaveLength(1);

    const riderIdSearch = await request(f.app)
      .get(`/api/v1/admin/riders?search=${f.riderId}`)
      .set('Authorization', f.superAdmin.auth);
    expect(riderIdSearch.status).toBe(200);
    expect(riderIdSearch.body.data.riders).toHaveLength(1);

    // 2. Admin Driver Applications & KYC document privacy boundaries
    const appsList = await request(f.app)
      .get('/api/v1/admin/driver-applications')
      .set('Authorization', f.superAdmin.auth);
    expect(appsList.status).toBe(200);
    expect(appsList.text).toContain(CANARY.driverPhoneE164);

    const appDetailSuper = await request(f.app)
      .get(`/api/v1/admin/driver-applications/${f.appId}`)
      .set('Authorization', f.superAdmin.auth);
    expect(appDetailSuper.status).toBe(200);
    expect(appDetailSuper.body.data.phoneE164).toBe(CANARY.driverPhoneE164);
    expect(appDetailSuper.body.data.driver.hasEmergencyContact).toBe(true);
    expect(appDetailSuper.body.data.driver.alternatePhone).toBe(CANARY.driverAltPhoneE164);
    expect(appDetailSuper.body.data.driver.emergencyContact).toBeTruthy();
    expect(appDetailSuper.body.data.documents[0].storageKey).toBe(
      'driver-kyc/018f0a00-0000-7000-8000-000000000501.jpg',
    );

    const previewRes = await request(f.app)
      .post(`/api/v1/admin/driver-applications/${f.appId}/documents/${f.docId}/preview`)
      .set('Authorization', f.superAdmin.auth);
    expect(previewRes.status).toBe(200);

    const appDetailFinance = await request(f.app)
      .get(`/api/v1/admin/driver-applications/${f.appId}`)
      .set('Authorization', f.financeAdmin.auth);
    expect(appDetailFinance.status).toBe(200);
    expect(appDetailFinance.body.data.documents[0].storageKey).not.toBe('REDACTED');

    const financePreview = await request(f.app)
      .post(`/api/v1/admin/driver-applications/${f.appId}/documents/${f.docId}/preview`)
      .set('Authorization', f.financeAdmin.auth);
    expect(financePreview.status).toBe(200);

    // 3. Admin Users list, detail & phone search block
    const adminsList = await request(f.app)
      .get('/api/v1/admin/users')
      .set('Authorization', f.superAdmin.auth);
    expect(adminsList.status).toBe(200);
    expect(adminsList.text).toContain(CANARY.adminPhoneE164);

    const adminDetail = await request(f.app)
      .get(`/api/v1/admin/users/${f.targetAdminId}`)
      .set('Authorization', f.superAdmin.auth);
    expect(adminDetail.status).toBe(200);
    expect(adminDetail.body.data.phoneE164).toBe(CANARY.adminPhoneE164);

    const adminPhoneSearch = await request(f.app)
      .get(`/api/v1/admin/users?search=${CANARY.adminDigits}`)
      .set('Authorization', f.superAdmin.auth);
    expect(adminPhoneSearch.status).toBe(200);
    expect(adminPhoneSearch.body.data.admins.length).toBeGreaterThan(0);

    // 4. Admin Dispatch Fleet
    const fleetRes = await request(f.app)
      .get('/api/v1/admin/dispatch/fleet')
      .set('Authorization', f.superAdmin.auth);
    expect(fleetRes.status).toBe(200);
    expect(fleetRes.body.data[0]).toMatchObject({
      driverId: f.driverId,
      driverName: 'Raju Driver',
      vehicleRegistration: 'WB74AB1234',
    });
    expect(fleetRes.body.data[0].phoneE164).toBe(CANARY.driverPhoneE164);

    // 5. Admin Wallets list, detail & phone search block
    const walletsRes = await request(f.app)
      .get('/api/v1/admin/wallets')
      .set('Authorization', f.financeAdmin.auth);
    expect(walletsRes.status).toBe(200);
    expect(walletsRes.body.data.items[0].name).toBe('Raju Driver');
    expect(walletsRes.body.data.items[0].phoneE164).toBe(CANARY.driverPhoneE164);

    const walletPhoneSearch = await request(f.app)
      .get(`/api/v1/admin/wallets?search=${CANARY.driverDigits}`)
      .set('Authorization', f.financeAdmin.auth);
    expect(walletPhoneSearch.status).toBe(200);
    expect(walletPhoneSearch.body.data.items.length).toBeGreaterThan(0);

    // 6. Rides, History, Disputes & Driver Offers across all roles
    for (const [roleName, auth] of [
      ['rider', f.riderAuth],
      ['driver', f.driverAuth],
      ['admin', f.superAdmin.auth],
    ] as const) {
      const ridesList = await request(f.app)
        .get('/api/v1/rides')
        .set('Authorization', auth);
      expect(ridesList.status).toBe(200);
      if (roleName === 'admin') expect(ridesList.text).toContain(CANARY.riderDigits);
      else expectZeroCanaryDigits(ridesList.text, `GET /v1/rides (${roleName})`);

      const rideDetail = await request(f.app)
        .get(`/api/v1/rides/${f.activeRideId}`)
        .set('Authorization', auth);
      expect(rideDetail.status).toBe(200);
      if (roleName === 'admin') expect(rideDetail.text).toContain(CANARY.riderDigits);
      else expectZeroCanaryDigits(rideDetail.text, `GET /v1/rides/:id (${roleName})`);
    }

    const driverOffers = await request(f.app)
      .get('/api/v1/driver/offers')
      .set('Authorization', f.driverAuth);
    expect(driverOffers.status).toBe(200);
    expectZeroCanaryDigits(driverOffers.text, 'GET /v1/driver/offers');

    const driverHistory = await request(f.app)
      .get('/api/v1/rides/driver/history')
      .set('Authorization', f.driverAuth);
    expect(driverHistory.status).toBe(200);
    expectZeroCanaryDigits(driverHistory.text, 'GET /v1/rides/driver/history');

    const disputesList = await request(f.app)
      .get('/api/v1/rides/payment/disputes')
      .set('Authorization', f.superAdmin.auth);
    expect(disputesList.status).toBe(200);

    // 7. Realtime & Push Notifications omit phone numbers
    const offeringRide = (await f.rideRepo.findById(f.offeringRideId))!;
    const activeRide = (await f.rideRepo.findById(f.activeRideId))!;
    await f.dispatch.notifier.rideRequested(offeringRide);
    await f.dispatch.notifier.rideUpdated(activeRide, 'ride.driver.en_route');
    expect(f.realtimeEvents.length).toBeGreaterThan(0);
    expectZeroCanaryDigits(f.realtimeEvents, 'Realtime dispatch events');
  });

  it('shows full UPI handles to admins on cashout endpoints and to the driver', async () => {
    expect(maskPhoneBasedUpi('9876500333@ybl')).toBe('******0333@ybl');
    expect(maskPhoneBasedUpi('+919876500333@oksbi')).toBe('+********0333@oksbi');
    expect(maskPhoneBasedUpi('subrata.driver@okaxis')).toBe('subrata.driver@okaxis');
    expect(maskPhoneBasedUpi(null)).toBeNull();

    const f = await setupPrivacyFixture();

    const createPhoneCashout = await request(f.app)
      .post('/api/v1/driver/wallet/me/cashouts')
      .set('Authorization', f.driverAuth)
      .send({
        amountPaise: 20000,
        destinationUpi: `${CANARY.driverDigits}@ybl`,
        idempotencyKey: 'cashout-phone-upi-1',
      });
    expect(createPhoneCashout.status).toBe(201);
    const phoneOpId = createPhoneCashout.body.data.id as string;
    // Driver's own creation response retains full UPI handle
    expect(createPhoneCashout.body.data.destinationUpi).toBe(`${CANARY.driverDigits}@ybl`);

    // Admin cashout queue & resolve endpoints show the full UPI handle
    const adminCashoutsPending = await request(f.app)
      .get('/api/v1/admin/wallets/cashouts')
      .set('Authorization', f.financeAdmin.auth);
    expect(adminCashoutsPending.status).toBe(200);
    expect(adminCashoutsPending.body.data[0].destinationUpi).toBe(`${CANARY.driverDigits}@ybl`);

    const resolvedRes = await request(f.app)
      .post(`/api/v1/admin/wallets/cashouts/${phoneOpId}/resolve`)
      .set('Authorization', f.financeAdmin.auth)
      .send({ outcome: 'PAID', detail: 'UTR123456' });
    expect(resolvedRes.status).toBe(200);
    expect(resolvedRes.body.data.destinationUpi).toBe(`${CANARY.driverDigits}@ybl`);

    // Non-phone UPI handle remains unmasked for admin while driver activity retains full phone UPI
    const createNamedCashout = await request(f.app)
      .post('/api/v1/driver/wallet/me/cashouts')
      .set('Authorization', f.driverAuth)
      .send({
        amountPaise: 15000,
        destinationUpi: 'raju.driver@okaxis',
        idempotencyKey: 'cashout-named-upi-2',
      });
    expect(createNamedCashout.status).toBe(201);
    const namedOpId = createNamedCashout.body.data.id as string;

    const adminCashoutsAll = await request(f.app)
      .get('/api/v1/admin/wallets/cashouts')
      .set('Authorization', f.financeAdmin.auth);
    expect(adminCashoutsAll.status).toBe(200);
    expect(
      adminCashoutsAll.body.data.find((op: { id: string }) => op.id === namedOpId)
        ?.destinationUpi,
    ).toBe('raju.driver@okaxis');

    const driverActivity = await request(f.app)
      .get('/api/v1/driver/wallet/me/activity')
      .set('Authorization', f.driverAuth);
    expect(driverActivity.status).toBe(200);
    expect(
      driverActivity.body.data.operations.find((op: { id: string }) => op.id === phoneOpId)
        ?.destinationUpi,
    ).toBe(`${CANARY.driverDigits}@ybl`);
  });

  it('scrubs payer phone, VPA, email, and customer_details before persisting Razorpay webhook events while hashing rawBody', async () => {
    const rideRepo = new MemoryRideRepository();
    const rideEventRepo = new MemoryRideEventRepository();
    const walletRepo = new MemoryWalletRepository();
    const paymentRepo = new MemoryPaymentRepository();
    const recordedEvents: RecordPaymentWebhookEventInput[] = [];
    const origRecord = paymentRepo.recordWebhookEvent.bind(paymentRepo);
    vi.spyOn(paymentRepo, 'recordWebhookEvent').mockImplementation(async (evt) => {
      recordedEvents.push(evt);
      return origRecord(evt);
    });

    const now = new Date('2026-10-30T12:00:00.000Z');
    const rideId = '018f0a00-0000-7000-8000-000000000901';
    const driverId = '018f0a00-0000-7000-8000-000000000201';
    await rideRepo.save({
      id: rideId,
      bookerRiderId: 'rider-1',
      driverId,
      vehicleId: 'veh-1',
      vehicleCategory: 'CAB',
      passenger: {
        riderId: 'rider-1',
        name: 'Asha Rider',
        phoneE164: CANARY.riderPhoneE164,
        pickupOtpHash: null,
      },
      pickup: { lat: 26.71, lng: 88.43, address: 'Sevoke Road' },
      drop: { lat: 26.73, lng: 88.42, address: 'Hill Cart Road' },
      routeSnapshot: {
        provider: 'TEST',
        distanceM: 3200,
        durationSeconds: 540,
        polyline: '',
        calculatedAt: now,
      },
      zoneSnapshot: { classification: 'IN_CITY', cityZoneId: 'siliguri' },
      pricingSnapshot: {
        pricingConfigId: 'cfg-1',
        pricingConfigVersion: 1,
        vehicleCategory: 'CAB',
        baseFarePaise: 5000,
        ratePerKmPaise: 1200,
        minimumFarePaise: 5000,
        bufferSurchargePaise: 0,
        negotiationFloorPercent: 80,
        negotiationCeilingPercent: 150,
        commissionPercent: 10,
        zoneType: 'IN_CITY',
      },
      suggestedFarePaise: 12000,
      proposedFarePaise: 12000,
      agreedFarePaise: 12000,
      arrearsPaise: 0,
      status: 'PAYMENT_PENDING',
      cancellationReason: null,
      offeringExpiresAt: null,
      acceptedAt: now,
      arrivedAt: now,
      startedAt: now,
      completedAt: now,
      settledAt: null,
      cancelledAt: null,
      version: 2,
      createdAt: now,
      updatedAt: now,
    } as unknown as RideEntity);
    await walletRepo.save({
      id: 'wallet-1',
      driverId,
      balancePaise: 30000,
      earningsBalancePaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const gateway = new MockQrPaymentGateway();
    const qrUseCase = new RideQrPaymentUseCase({
      rideRepo,
      rideEventRepo,
      paymentRepo,
      walletRepo,
      gateway,
      unitOfWork,
    });
    const created = await qrUseCase.createOrGet(rideId, driverId);
    expect(created.qr.state).toBe('PENDING');
    const qrRow = (await paymentRepo.listQrByRideId(rideId))[0]!;

    const upiFallback = {
      handleWebhook: vi.fn(async () => null),
    } as unknown as RideUpiPaymentUseCase;
    const actors = {
      resolveRiderId: async (uid: string) => uid,
      resolveDriverId: async (uid: string) => uid,
      notifier: {
        rideUpdated: async () => {},
        offerCreated: async () => {},
        offerCancelled: async () => {},
        counterCreated: async () => {},
      },
    };
    const webhookHandler = makeRideUpiWebhook(
      upiFallback,
      actors as never,
      WEBHOOK_SECRET,
      qrUseCase,
    );

    const rawBody = JSON.stringify({
      event: 'qr_code.credited',
      payload: {
        qr_code: {
          entity: {
            id: qrRow.gatewayRef,
            customer_details: {
              contact: CANARY.riderPhoneE164,
              phone: CANARY.riderPhoneE164,
            },
          },
        },
        payment: {
          entity: {
            id: 'pay_canary_test_1',
            amount: 12000,
            status: 'captured',
            contact: CANARY.riderPhoneE164,
            vpa: `${CANARY.riderDigits}@okicici`,
            email: 'asha.secret@example.com',
          },
        },
      },
    });
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

    const express = (await import('express')).default;
    const webhookApp = express();
    webhookApp.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as unknown as { rawBody: string }).rawBody = buf.toString('utf8');
        },
      }),
    );
    webhookApp.post('/webhook', webhookHandler);

    const res = await request(webhookApp)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .set('x-razorpay-event-id', 'evt_privacy_1')
      .send(rawBody);
    expect(res.status).toBe(200);
    expect(recordedEvents).toHaveLength(1);

    const stored = recordedEvents[0]!;
    expect(stored.payloadHash).toBe(createHash('sha256').update(rawBody).digest('hex'));
    expectZeroCanaryDigits(stored.payload, 'Persisted payment_events.payload');
    expect(JSON.stringify(stored.payload)).not.toContain('asha.secret@example.com');
  });

  it('redacts phone numbers, emergency contacts, and UPI handles in structured logs via REDACTED_PATHS', () => {
    const chunks: string[] = [];
    const testLogger = pino(
      {
        level: 'info',
        redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      },
      {
        write(msg: string) {
          chunks.push(msg);
        },
      },
    );

    testLogger.info(
      {
        phoneE164: CANARY.riderPhoneE164,
        phone_e164: CANARY.driverPhoneE164,
        alternatePhone: CANARY.driverAltPhoneE164,
        emergencyContact: CANARY.riderEmergencyPhoneE164,
        destinationUpi: `${CANARY.driverDigits}@ybl`,
        nested: {
          phoneE164: CANARY.adminPhoneE164,
          vpa: `${CANARY.riderDigits}@okaxis`,
          deeper: {
            contact: CANARY.riderPhoneE164,
            emergencyContact: { phoneE164: CANARY.riderEmergencyPhoneE164 },
          },
        },
      },
      'privacy log check',
    );

    const combined = chunks.join('\n');
    expect(combined).toContain('[redacted]');
    expectZeroCanaryDigits(combined, 'Pino structured log output');
  });

  it('keeps own-account authentication, emergency contact management, and driver personal profile functional', async () => {
    const f = await setupPrivacyFixture();

    // 1. Rider OTP request + verify
    const otpReq = await request(f.app)
      .post('/api/v1/auth/otp/request')
      .send({ phoneE164: CANARY.riderPhoneE164 });
    expect(otpReq.status).toBe(200);
    expect(f.sentSms).toHaveLength(1);
    const otpCode = f.sentSms[0]!.body.match(/\b(\d{4,6})\b/)?.[1] ?? f.sentSms[0]!.body;

    const otpVerify = await request(f.app)
      .post('/api/v1/auth/otp/verify')
      .send({
        phoneE164: CANARY.riderPhoneE164,
        otp: otpCode,
        role: 'RIDER',
        deviceId: 'test-device-rider',
      });
    expect(otpVerify.status).toBe(200);
    expect(otpVerify.body.data.user.phoneE164).toBe(CANARY.riderPhoneE164);
    const freshRiderAuth = `Bearer ${otpVerify.body.data.accessToken as string}`;

    // 2. Admin password login with own phoneE164
    const adminLogin = await request(f.app)
      .post('/api/v1/auth/admin/login')
      .send({
        phoneE164: CANARY.adminPhoneE164,
        password: f.targetAdminPassword,
      });
    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.data.user.phoneE164).toBe(CANARY.adminPhoneE164);

    // 3. Rider own profile & emergency contact (full phoneE164 retained for self emergency dialing)
    const riderMe = await request(f.app)
      .get('/api/v1/riders/me')
      .set('Authorization', freshRiderAuth);
    expect(riderMe.status).toBe(200);
    expect(riderMe.body.data.emergencyContact).toEqual({
      name: 'Meera Sister',
      phoneE164: CANARY.riderEmergencyPhoneE164,
    });

    const riderPatchMe = await request(f.app)
      .patch('/api/v1/riders/me')
      .set('Authorization', freshRiderAuth)
      .send({
        emergencyContact: {
          name: 'Meera Updated',
          phoneE164: '+919876599999',
        },
      });
    expect(riderPatchMe.status).toBe(200);
    expect(riderPatchMe.body.data.emergencyContact).toEqual({
      name: 'Meera Updated',
      phoneE164: '+919876599999',
    });

    // 4. Driver own profile retains own alternatePhone & emergencyContact
    const driverMe = await request(f.app)
      .get('/api/v1/driver/profile/me')
      .set('Authorization', f.driverAuth);
    expect(driverMe.status).toBe(200);
    const ownDriver = driverMe.body.data.driver ?? driverMe.body.data;
    expect(ownDriver.alternatePhone).toBe(CANARY.driverAltPhoneE164);
    expect(ownDriver.emergencyContact).toContain(CANARY.driverAltPhoneE164);
  });

  it('disables chat and call endpoints cleanly on rollback switches without ever restoring counterpart phone numbers', async () => {
    const f = await setupPrivacyFixture({ chatEnabled: false, callsEnabled: false });

    const chatList = await request(f.app)
      .get(`/api/v1/rides/${f.activeRideId}/messages`)
      .set('Authorization', f.riderAuth);
    expect(chatList.status).toBe(503);

    const chatSend = await request(f.app)
      .post(`/api/v1/rides/${f.activeRideId}/messages`)
      .set('Authorization', f.driverAuth)
      .send({ clientMessageId: 'rollback-msg-00000001', text: 'Near pickup gate' });
    expect(chatSend.status).toBe(503);

    const callCurrent = await request(f.app)
      .get(`/api/v1/rides/${f.activeRideId}/calls/current`)
      .set('Authorization', f.riderAuth);
    expect(callCurrent.status).toBe(503);

    const callStart = await request(f.app)
      .post(`/api/v1/rides/${f.activeRideId}/calls`)
      .set('Authorization', f.riderAuth)
      .send({ installationId: 'mobile-device-01', clientRequestId: 'rollback-call-000001' });
    expect(callStart.status).toBe(503);

    const [riderView, driverView, offersView, adminRideView] = await Promise.all([
      request(f.app).get(`/api/v1/rides/${f.activeRideId}`).set('Authorization', f.riderAuth),
      request(f.app).get(`/api/v1/rides/${f.activeRideId}`).set('Authorization', f.driverAuth),
      request(f.app)
        .get('/api/v1/driver/offers')
        .set('Authorization', f.driverAuth),
      request(f.app)
        .get(`/api/v1/rides/${f.activeRideId}`)
        .set('Authorization', f.superAdmin.auth),
    ]);
    expect(riderView.status).toBe(200);
    expect(driverView.status).toBe(200);
    expect(offersView.status).toBe(200);
    expect(adminRideView.status).toBe(200);
    expectZeroCanaryDigits(riderView.body, 'rollback rider active ride');
    expectZeroCanaryDigits(driverView.body, 'rollback driver active ride');
    expectZeroCanaryDigits(offersView.body, 'rollback driver offers');
    expect(JSON.stringify(adminRideView.body)).toContain(CANARY.riderDigits);
  });
});
