import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { unitOfWork } from './helpers/unitOfWork.js';
import { createApp } from '../src/app.js';
import { buildIdentityContainer } from '../src/modules/identity/identity.container.js';
import {
  canDriverGoOnline,
  evaluateDriverKycCompliance,
  type AdminUserEntity,
  type AdminUserRepositoryPort,
  type DriverApplicationEntity,
  type DriverApplicationRepositoryPort,
  type DriverDocumentEntity,
  type DriverDocumentRepositoryPort,
  type DriverEntity,
  type DriverLicenseStoragePort,
  type DriverRepositoryPort,
  type KycAuditLogEntry,
  type KycAuditRepositoryPort,
  type RiderEntity,
  type RiderRepositoryPort,
  type SessionEntity,
  type SessionRepositoryPort,
  type UserEntity,
  type UserRepositoryPort,
  type VehicleEntity,
  type VehicleRepositoryPort,
} from '../src/modules/identity/domain/index.js';
import {
  ConsoleSmsGatewayAdapter,
  JoseTokenAdapter,
  MemoryOtpStoreAdapter,
} from '../src/modules/identity/infrastructure/index.js';
import { isDriverEligibleForRide } from '../src/modules/identity/domain/driverRideEligibility.js';
import type { DriverKycExpiryNotification } from '../src/modules/identity/application/useCases/index.js';
import { newUuid } from '../src/shared/ids.js';
import type { ZoneRepositoryPort } from '../src/modules/zone/zone.public.js';

const TEST_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';
const PREVIEW_SECRET = 'preview-signing-secret-that-is-at-least-32-chars-long!!';

// Minimal valid magic-byte payloads
const VALID_PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'utf8');
const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
]);
const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

const toDataUrl = (mime: string, buf: Buffer): string =>
  `data:${mime};base64,${buf.toString('base64')}`;

class MemoryDriverRepository implements DriverRepositoryPort {
  readonly drivers = new Map<string, DriverEntity>();
  async findById(id: string): Promise<DriverEntity | null> {
    const d = this.drivers.get(id);
    return d ? { ...d } : null;
  }
  async findByUserId(userId: string): Promise<DriverEntity | null> {
    for (const d of this.drivers.values()) {
      if (d.userId === userId) return { ...d };
    }
    return null;
  }
  async create(driver: DriverEntity): Promise<DriverEntity> {
    this.drivers.set(driver.id, { ...driver });
    return { ...driver };
  }
  async update(driver: DriverEntity): Promise<DriverEntity> {
    this.drivers.set(driver.id, { ...driver });
    return { ...driver };
  }
}

class MemoryDriverApplicationRepository implements DriverApplicationRepositoryPort {
  readonly apps = new Map<string, DriverApplicationEntity>();
  async findById(id: string): Promise<DriverApplicationEntity | null> {
    const a = this.apps.get(id);
    return a ? { ...a } : null;
  }
  async findByDriverId(driverId: string): Promise<DriverApplicationEntity | null> {
    const matching = [...this.apps.values()]
      .filter((a) => a.driverId === driverId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    return matching[0] ? { ...matching[0] } : null;
  }
  async list(filter: {
    status?: string;
    limit: number;
    offset: number;
  }): Promise<DriverApplicationEntity[]> {
    return [...this.apps.values()]
      .filter((a) => filter.status === undefined || a.status === filter.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(filter.offset, filter.offset + filter.limit)
      .map((a) => ({ ...a }));
  }
  async create(app: DriverApplicationEntity): Promise<DriverApplicationEntity> {
    this.apps.set(app.id, { ...app });
    return { ...app };
  }
  async update(app: DriverApplicationEntity): Promise<DriverApplicationEntity> {
    this.apps.set(app.id, { ...app });
    return { ...app };
  }
}

class MemoryDriverDocumentRepository implements DriverDocumentRepositoryPort {
  readonly docs = new Map<string, DriverDocumentEntity>();
  async findById(id: string): Promise<DriverDocumentEntity | null> {
    const d = this.docs.get(id);
    return d ? { ...d } : null;
  }
  async findByApplicationId(applicationId: string): Promise<DriverDocumentEntity[]> {
    return [...this.docs.values()]
      .filter((d) => d.applicationId === applicationId)
      .map((d) => ({ ...d }));
  }
  async findByDriverId(driverId: string): Promise<DriverDocumentEntity[]> {
    return [...this.docs.values()]
      .filter((d) => d.driverId === driverId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .map((d) => ({ ...d }));
  }
  async findVerifiedExpiringBefore(cutoff: Date): Promise<DriverDocumentEntity[]> {
    return [...this.docs.values()]
      .filter(
        (d) =>
          d.verificationStatus === 'VERIFIED' &&
          d.expiresAt !== null &&
          d.expiresAt.getTime() <= cutoff.getTime(),
      )
      .sort((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0))
      .map((d) => ({ ...d }));
  }
  async create(doc: DriverDocumentEntity): Promise<DriverDocumentEntity> {
    this.docs.set(doc.id, { ...doc });
    return { ...doc };
  }
  async update(doc: DriverDocumentEntity): Promise<DriverDocumentEntity> {
    this.docs.set(doc.id, { ...doc });
    return { ...doc };
  }
}

class MemoryVehicleRepository implements VehicleRepositoryPort {
  readonly vehicles = new Map<string, VehicleEntity>();
  async findById(id: string): Promise<VehicleEntity | null> {
    const v = this.vehicles.get(id);
    return v ? { ...v } : null;
  }
  async findByDriverId(driverId: string): Promise<VehicleEntity[]> {
    return [...this.vehicles.values()]
      .filter((v) => v.driverId === driverId)
      .map((v) => ({ ...v }));
  }
  async findByRegistrationNumber(reg: string): Promise<VehicleEntity | null> {
    for (const v of this.vehicles.values()) {
      if (v.registrationNumber === reg) return { ...v };
    }
    return null;
  }
  async create(vehicle: VehicleEntity): Promise<VehicleEntity> {
    this.vehicles.set(vehicle.id, { ...vehicle });
    return { ...vehicle };
  }
  async update(vehicle: VehicleEntity): Promise<VehicleEntity> {
    this.vehicles.set(vehicle.id, { ...vehicle });
    return { ...vehicle };
  }
}

class MemoryUserRepository implements UserRepositoryPort {
  readonly users = new Map<string, UserEntity>();
  async findById(id: string): Promise<UserEntity | null> {
    return this.users.get(id) ?? null;
  }
  async findByPhone(phone: string): Promise<UserEntity | null> {
    for (const u of this.users.values()) {
      if (u.phoneE164 === phone) return u;
    }
    return null;
  }
  async findByEmail(email: string): Promise<UserEntity | null> {
    for (const u of this.users.values()) {
      if (u.email === email) return u;
    }
    return null;
  }
  async create(user: UserEntity): Promise<UserEntity> {
    this.users.set(user.id, user);
    return user;
  }
  async update(user: UserEntity): Promise<UserEntity> {
    this.users.set(user.id, user);
    return user;
  }
}

class MemoryRiderRepository implements RiderRepositoryPort {
  async findById(): Promise<RiderEntity | null> {
    return null;
  }
  async findByUserId(): Promise<RiderEntity | null> {
    return null;
  }
  async list(): Promise<RiderEntity[]> {
    return [];
  }
  async create(r: RiderEntity): Promise<RiderEntity> {
    return r;
  }
  async update(r: RiderEntity): Promise<RiderEntity> {
    return r;
  }
}

class MemorySessionRepository implements SessionRepositoryPort {
  readonly sessions = new Map<string, SessionEntity>();
  async findById(id: string): Promise<SessionEntity | null> {
    return this.sessions.get(id) ?? null;
  }
  async findByTokenHash(hash: string): Promise<SessionEntity | null> {
    for (const s of this.sessions.values()) {
      if (s.refreshTokenHash === hash) return s;
    }
    return null;
  }
  async create(session: SessionEntity): Promise<SessionEntity> {
    this.sessions.set(session.id, session);
    return session;
  }
  async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    for (const [id, s] of this.sessions.entries()) {
      if (s.familyId === familyId) this.sessions.set(id, { ...s, revokedAt });
    }
  }
  async revokeById(id: string, revokedAt: Date): Promise<void> {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, revokedAt });
  }
  async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    for (const [id, s] of this.sessions.entries()) {
      if (s.userId === userId) this.sessions.set(id, { ...s, revokedAt });
    }
  }
  async rotate(oldId: string, revokedAt: Date, next: SessionEntity): Promise<void> {
    await this.revokeById(oldId, revokedAt);
    await this.create(next);
  }
}

class MemoryAdminUserRepository implements AdminUserRepositoryPort {
  readonly admins = new Map<string, AdminUserEntity>();
  async findById(id: string): Promise<AdminUserEntity | null> {
    return this.admins.get(id) ?? null;
  }
  async findByUserId(userId: string): Promise<AdminUserEntity | null> {
    for (const a of this.admins.values()) {
      if (a.userId === userId) return a;
    }
    return null;
  }
  async list(): Promise<AdminUserEntity[]> {
    return [...this.admins.values()];
  }
  async create(a: AdminUserEntity): Promise<AdminUserEntity> {
    this.admins.set(a.id, a);
    return a;
  }
  async update(a: AdminUserEntity): Promise<AdminUserEntity> {
    this.admins.set(a.id, a);
    return a;
  }
}

class MemoryKycAuditRepository implements KycAuditRepositoryPort {
  readonly entries: KycAuditLogEntry[] = [];
  async record(entry: KycAuditLogEntry): Promise<void> {
    this.entries.push({ ...entry });
  }
}

class MemoryPrivateVaultStorage implements DriverLicenseStoragePort {
  readonly blobs = new Map<string, Buffer>();
  async upload(dataUrl: string, extension: 'pdf' | 'jpg' | 'png'): Promise<string> {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const key = `driver-kyc/${newUuid()}.${extension}`;
    this.blobs.set(key, Buffer.from(base64, 'base64'));
    return key;
  }
  async read(storageKey: string): Promise<Buffer> {
    const bytes = this.blobs.get(storageKey);
    if (!bytes) throw new Error(`Missing vault key: ${storageKey}`);
    return Buffer.from(bytes);
  }
}

function buildTestHarness() {
  const userRepo = new MemoryUserRepository();
  const riderRepo = new MemoryRiderRepository();
  const sessionRepo = new MemorySessionRepository();
  const adminRepo = new MemoryAdminUserRepository();
  const driverRepo = new MemoryDriverRepository();
  const applicationRepo = new MemoryDriverApplicationRepository();
  const documentRepo = new MemoryDriverDocumentRepository();
  const vehicleRepo = new MemoryVehicleRepository();
  const auditRepo = new MemoryKycAuditRepository();
  const licenseStorage = new MemoryPrivateVaultStorage();
  const tokenAdapter = new JoseTokenAdapter(TEST_SECRET);

  const activeRides = new Set<string>();
  const evictedDriverIds: string[] = [];
  const notifications: DriverKycExpiryNotification[] = [];

  const zoneRepo = {
    list: async () => [
      { id: 'zone-siliguri', name: 'Siliguri', zoneType: 'CITY', isActive: true },
      { id: 'zone-darjeeling', name: 'Darjeeling', zoneType: 'CITY', isActive: true },
    ],
  } as unknown as ZoneRepositoryPort;

  const identity = buildIdentityContainer({
    unitOfWork,
    userRepo,
    riderRepo,
    sessionRepo,
    adminRepo,
    driverRepo,
    applicationRepo,
    documentRepo,
    vehicleRepo,
    auditRepo,
    licenseStorage,
    previewSigningSecret: PREVIEW_SECRET,
    zoneRepo,
    tokenAdapter,
    otpStore: new MemoryOtpStoreAdapter(),
    smsGateway: new ConsoleSmsGatewayAdapter(),
    hasActiveRide: async (driverId) => activeRides.has(driverId),
    removeDriverPresence: async (driverId) => {
      evictedDriverIds.push(driverId);
    },
    notifyDriver: async (n) => {
      notifications.push(n);
    },
  });

  const app = createApp({ identity });

  async function mintSessionToken(params: {
    userId: string;
    phoneE164: string;
    role: 'DRIVER' | 'SUPER_ADMIN' | 'CITY_ADMIN';
    cityZoneIds?: string[];
  }): Promise<string> {
    const now = new Date();
    await userRepo.create({
      id: params.userId,
      phoneE164: params.phoneE164,
      role: params.role,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    if (params.role === 'SUPER_ADMIN' || params.role === 'CITY_ADMIN') {
      await adminRepo.create({
        id: newUuid(),
        userId: params.userId,
        name: params.role,
        role: params.role,
        cityZoneIds: params.cityZoneIds ?? [],
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });
    }
    const sessionId = newUuid();
    await sessionRepo.create({
      id: sessionId,
      userId: params.userId,
      familyId: newUuid(),
      refreshTokenHash: `hash-${sessionId}`,
      deviceId: 'test-device',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: now,
    });
    return tokenAdapter.signAccessToken({
      sub: params.userId,
      role: params.role,
      sessionId,
    });
  }

  return {
    app,
    identity,
    driverRepo,
    applicationRepo,
    documentRepo,
    vehicleRepo,
    auditRepo,
    licenseStorage,
    activeRides,
    evictedDriverIds,
    notifications,
    mintSessionToken,
  };
}

describe('Step 10 — KYC Expiry, Renewal & Document Privacy', () => {
  it('enforces vehicle-document binding and allows early PENDING renewals while prior VERIFIED docs remain valid', () => {
    const now = new Date('2026-10-26T10:00:00.000Z');
    const future = new Date('2027-06-01T23:59:59.999Z');

    const baseDriver: DriverEntity = {
      id: 'drv-1',
      userId: 'usr-1',
      name: 'Arjun',
      dlNumber: 'WB7420220012345',
      dlExpiry: '2027-06-01',
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
      operationalStatus: 'ONLINE',
      currentVehicleId: 'veh-1',
      ratingAverage: 4.9,
      ratingCount: 15,
      trustScore: 98,
      createdAt: now,
      updatedAt: now,
    };

    const approvedVehicle: VehicleEntity = {
      id: 'veh-1',
      driverId: 'drv-1',
      vehicleType: 'CAB',
      make: 'Maruti',
      model: 'Dzire',
      registrationNumber: 'WB74AB1234',
      verificationStatus: 'APPROVED',
      createdAt: now,
      updatedAt: now,
    };

    const makeVerifiedDocs = (vehicleId: string): DriverDocumentEntity[] => [
      {
        id: 'd-gov',
        driverId: 'drv-1',
        applicationId: 'app-1',
        type: 'GOVERNMENT_ID',
        storageKey: 'driver-kyc/d1.pdf',
        documentNumberMasked: null,
        expiresAt: null,
        verificationStatus: 'VERIFIED',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'd-dl',
        driverId: 'drv-1',
        applicationId: 'app-1',
        type: 'DRIVING_LICENSE',
        storageKey: 'driver-kyc/d2.jpg',
        documentNumberMasked: '********2345',
        expiresAt: future,
        verificationStatus: 'VERIFIED',
        createdAt: now,
        updatedAt: now,
      },
      ...(['REGISTRATION_CERTIFICATE', 'INSURANCE', 'PERMIT'] as const).map((type, idx) => ({
        id: `d-veh-${idx}`,
        driverId: 'drv-1',
        applicationId: 'app-1',
        vehicleId,
        type,
        storageKey: `driver-kyc/v${idx}.png`,
        documentNumberMasked: null,
        expiresAt: future,
        verificationStatus: 'VERIFIED' as const,
        createdAt: now,
        updatedAt: now,
      })),
    ];

    const activeUser: UserEntity = {
      id: 'usr-1',
      phoneE164: '+919800000011',
      role: 'DRIVER',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    const docsForVeh1 = makeVerifiedDocs('veh-1');
    expect(
      canDriverGoOnline(baseDriver, { vehicle: approvedVehicle, documents: docsForVeh1, now })
        .eligible,
    ).toBe(true);
    expect(
      isDriverEligibleForRide(baseDriver, activeUser, approvedVehicle, docsForVeh1, 'CAB', now),
    ).toBe(true);

    // Early renewal opened: driver.kycStatus flips to PENDING while prior VERIFIED docs remain unexpired
    const earlyRenewingDriver: DriverEntity = { ...baseDriver, kycStatus: 'PENDING' };
    expect(
      canDriverGoOnline(earlyRenewingDriver, {
        vehicle: approvedVehicle,
        documents: docsForVeh1,
        now,
      }).eligible,
    ).toBe(true);

    // Switching to a new vehicle (veh-2) invalidates vehicle-scoped docs bound to veh-1
    const newVehicle: VehicleEntity = { ...approvedVehicle, id: 'veh-2' };
    const switchedDriver: DriverEntity = { ...baseDriver, currentVehicleId: 'veh-2' };
    expect(
      canDriverGoOnline(switchedDriver, { vehicle: newVehicle, documents: docsForVeh1, now })
        .eligible,
    ).toBe(false);
    const mismatchCompliance = evaluateDriverKycCompliance({
      driver: switchedDriver,
      vehicle: newVehicle,
      application: null,
      documents: docsForVeh1,
      now,
    });
    expect(mismatchCompliance.overallStatus).toBe('INCOMPLETE');
    expect(mismatchCompliance.items.filter((i) => i.status === 'MISSING')).toHaveLength(3);
  });

  it('runs deduplicated 30d/7d/1d/expired sweeps, evicts idle online drivers, and preserves active BUSY trips', async () => {
    const h = buildTestHarness();
    const baseTime = new Date('2026-10-26T00:00:00.000Z');
    const permitExpiry = new Date('2026-11-20T00:00:00.000Z'); // 25 days away at t0

    await h.driverRepo.create({
      id: 'drv-sweep',
      userId: 'usr-sweep',
      name: 'Raju',
      dlNumber: 'WB7420220099999',
      dlExpiry: '2028-01-01',
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
      operationalStatus: 'ONLINE',
      currentVehicleId: 'veh-sweep',
      ratingAverage: 5,
      ratingCount: 5,
      trustScore: 100,
      createdAt: baseTime,
      updatedAt: baseTime,
    });
    await h.vehicleRepo.create({
      id: 'veh-sweep',
      driverId: 'drv-sweep',
      vehicleType: 'CAB',
      make: 'Tata',
      model: 'Tiago',
      registrationNumber: 'WB74CD5678',
      verificationStatus: 'APPROVED',
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    for (const type of [
      'GOVERNMENT_ID',
      'DRIVING_LICENSE',
      'REGISTRATION_CERTIFICATE',
      'INSURANCE',
    ] as const) {
      await h.documentRepo.create({
        id: `doc-${type}`,
        driverId: 'drv-sweep',
        applicationId: 'app-sweep',
        vehicleId: type === 'GOVERNMENT_ID' || type === 'DRIVING_LICENSE' ? null : 'veh-sweep',
        type,
        storageKey: `driver-kyc/01900000-0000-7000-8000-000000000001.pdf`,
        documentNumberMasked: null,
        expiresAt: type === 'GOVERNMENT_ID' ? null : new Date('2028-01-01T00:00:00.000Z'),
        verificationStatus: 'VERIFIED',
        createdAt: baseTime,
        updatedAt: baseTime,
      });
    }
    await h.documentRepo.create({
      id: 'doc-permit',
      driverId: 'drv-sweep',
      applicationId: 'app-sweep',
      vehicleId: 'veh-sweep',
      type: 'PERMIT',
      storageKey: 'driver-kyc/01900000-0000-7000-8000-000000000002.pdf',
      documentNumberMasked: null,
      expiresAt: permitExpiry,
      verificationStatus: 'VERIFIED',
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    // 1. At 25 days left -> sends 30d bucket once; second sweep at 24 days sends nothing!
    const sweep30 = await h.identity.sweepKycExpiry!.execute(baseTime);
    expect(sweep30.remindersSent).toBe(1);
    expect(h.notifications.at(-1)?.payload.bucket).toBe(30);

    const sweep24 = await h.identity.sweepKycExpiry!.execute(new Date('2026-10-27T00:00:00.000Z'));
    expect(sweep24.remindersSent).toBe(0);

    // 2. At 6 days left -> sends 7d urgent bucket
    const sweep7 = await h.identity.sweepKycExpiry!.execute(new Date('2026-11-14T00:00:00.000Z'));
    expect(sweep7.remindersSent).toBe(1);
    expect(h.notifications.at(-1)?.payload.bucket).toBe(7);

    // 3. At 1 day left -> sends 1d bucket
    const sweep1 = await h.identity.sweepKycExpiry!.execute(new Date('2026-11-19T06:00:00.000Z'));
    expect(sweep1.remindersSent).toBe(1);
    expect(h.notifications.at(-1)?.payload.bucket).toBe(1);

    // 4. Driver is mid-trip (BUSY) when permit expires -> removes dispatch presence + marks EXPIRED, but preserves BUSY!
    h.activeRides.add('drv-sweep');
    await h.driverRepo.update({
      ...(await h.driverRepo.findById('drv-sweep'))!,
      operationalStatus: 'BUSY',
    });

    const sweepExpiredBusy = await h.identity.sweepKycExpiry!.execute(
      new Date('2026-11-20T00:05:00.000Z'),
    );
    expect(sweepExpiredBusy.expiredDocuments).toBe(1);
    expect(sweepExpiredBusy.expiredDrivers).toBe(1);
    expect(h.evictedDriverIds).toContain('drv-sweep');
    expect(h.notifications.at(-1)?.event).toBe('driver.kyc.expired');

    const afterBusyExpiry = (await h.driverRepo.findById('drv-sweep'))!;
    expect(afterBusyExpiry.kycStatus).toBe('EXPIRED');
    expect(afterBusyExpiry.operationalStatus).toBe('BUSY');
    expect(h.auditRepo.entries.some((e) => e.action === 'DOCUMENT_EXPIRED')).toBe(true);
  });

  it('completes end-to-end HTTP renewal with carried-forward docs, PNG magic-byte checks, DL lock, and fixable early-renewal protection', async () => {
    const h = buildTestHarness();
    const driverToken = await h.mintSessionToken({
      userId: 'usr-renew',
      phoneE164: '+919800000001',
      role: 'DRIVER',
    });
    const superAdminToken = await h.mintSessionToken({
      userId: 'usr-super',
      phoneE164: '+919800000099',
      role: 'SUPER_ADMIN',
    });

    // 1. Initial onboarding
    await request(h.app)
      .post('/api/v1/driver/profile')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        name: 'Vikram Rai',
        address: 'Siliguri, West Bengal',
        dlNumber: 'WB7420200011111',
        dlExpiry: '2026-11-10',
      })
      .expect(201);

    const createAppRes = await request(h.app)
      .post('/api/v1/driver/application')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({})
      .expect(201);
    const initialAppId = createAppRes.body.data.id as string;

    await request(h.app)
      .post('/api/v1/driver/vehicles')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        vehicleType: 'CAB',
        make: 'Hyundai',
        model: 'Aura',
        registrationNumber: 'WB74EF1234',
      })
      .expect(201);

    // Reject disguised PNG (text bytes pretending to be image/png)
    const fakePng = toDataUrl('image/png', Buffer.from('not-a-real-png-binary'));
    await request(h.app)
      .post('/api/v1/driver/documents/identity')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ fileDataUrl: fakePng })
      .expect(400);

    // Upload valid PNG, JPEG, and PDF across all 5 mandatory types
    await request(h.app)
      .post('/api/v1/driver/documents/identity')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ fileDataUrl: toDataUrl('image/png', VALID_PNG_BYTES) })
      .expect(201);

    const soonExpiry = new Date(Date.now() + 15 * 86_400_000).toISOString(); // 15 days away (<= 30d window)
    const farExpiry = new Date(Date.now() + 300 * 86_400_000).toISOString();

    await request(h.app)
      .post('/api/v1/driver/documents/license')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        fileDataUrl: toDataUrl('image/jpeg', VALID_JPEG_BYTES),
        dlNumber: 'WB7420200011111',
        expiresAt: soonExpiry,
      })
      .expect(201);

    for (const type of ['REGISTRATION_CERTIFICATE', 'INSURANCE', 'PERMIT'] as const) {
      await request(h.app)
        .post('/api/v1/driver/documents/vehicle')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          type,
          fileDataUrl: toDataUrl('application/pdf', VALID_PDF_BYTES),
          expiresAt: farExpiry,
        })
        .expect(201);
    }

    await request(h.app)
      .post('/api/v1/driver/application/submit')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({})
      .expect(200);

    await request(h.app)
      .post(`/api/v1/admin/driver-applications/${initialAppId}/review`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);

    // 2. Direct DL mutation via /profile is locked after verification!
    const lockedRes = await request(h.app)
      .post('/api/v1/driver/profile')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        name: 'Vikram Rai',
        dlNumber: 'WB7499999999999',
        dlExpiry: '2035-01-01',
      })
      .expect(403);
    expect(lockedRes.body.message).toContain('DL_LOCKED_AFTER_VERIFICATION');

    // 3. Profile compliance reports EXPIRING_SOON + canRenew = true
    const profileBeforeRenew = await request(h.app)
      .get('/api/v1/driver/profile/me')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(profileBeforeRenew.body.data.compliance.overallStatus).toBe('EXPIRING_SOON');
    expect(profileBeforeRenew.body.data.compliance.canRenew).toBe(true);

    // 4. Open renewal draft -> carries forward 4 still-valid VERIFIED docs; blocks empty submit!
    const renewDraftRes = await request(h.app)
      .post('/api/v1/driver/application/renew')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({})
      .expect(201);
    const renewalAppId = renewDraftRes.body.data.id as string;

    const emptySubmitRes = await request(h.app)
      .post('/api/v1/driver/application/submit')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({})
      .expect(400);
    expect(emptySubmitRes.body.message).toContain('RENEWAL_DOCUMENT_REQUIRED');

    // 5. Upload ONLY renewed DRIVING_LICENSE (PNG) and submit -> REAPPLIED
    const renewedDlExpiry = '2032-12-31T23:59:59.999Z';
    await request(h.app)
      .post('/api/v1/driver/documents/license')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        fileDataUrl: toDataUrl('image/png', VALID_PNG_BYTES),
        dlNumber: 'WB7420200011111',
        expiresAt: renewedDlExpiry,
      })
      .expect(201);

    const submitRenewalRes = await request(h.app)
      .post('/api/v1/driver/application/submit')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({})
      .expect(200);
    expect(submitRenewalRes.body.data.status).toBe('SUBMITTED');

    // 6. Test FIXABLE rejection of early renewal: driver keeps kycStatus = 'VERIFIED' because prior DL still has 15d left!
    await request(h.app)
      .post(`/api/v1/admin/driver-applications/${renewalAppId}/review`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        status: 'REJECTED',
        rejectionType: 'FIXABLE',
        rejectionReason: 'Licence corner cropped, please re-upload full card',
      })
      .expect(200);

    const afterFixableReject = await request(h.app)
      .get('/api/v1/driver/profile/me')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(afterFixableReject.body.data.driver.kycStatus).toBe('VERIFIED');
    expect(afterFixableReject.body.data.driver.status).toBe('ACTIVE');

    // 7. Re-open renewal, upload clear DL, submit, and approve -> dlExpiry synced & COMPLIANT!
    const secondRenewRes = await request(h.app)
      .post('/api/v1/driver/application/renew')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({})
      .expect(201);
    const secondRenewAppId = secondRenewRes.body.data.id as string;

    await request(h.app)
      .post('/api/v1/driver/documents/license')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        fileDataUrl: toDataUrl('image/jpeg', VALID_JPEG_BYTES),
        dlNumber: 'WB7420200011111',
        expiresAt: renewedDlExpiry,
      })
      .expect(201);

    await request(h.app)
      .post('/api/v1/driver/application/submit')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({})
      .expect(200);

    await request(h.app)
      .post(`/api/v1/admin/driver-applications/${secondRenewAppId}/review`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);

    const finalProfile = await request(h.app)
      .get('/api/v1/driver/profile/me')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(finalProfile.body.data.driver.kycStatus).toBe('VERIFIED');
    expect(finalProfile.body.data.driver.dlExpiry).toBe('2032-12-31');
    expect(finalProfile.body.data.compliance.overallStatus).toBe('COMPLIANT');
    expect(finalProfile.body.data.compliance.expiringSoonTypes).toEqual([]);
    expect(finalProfile.body.data.compliance.expiredTypes).toEqual([]);

    // Standard /application is rejected with 409 once fully COMPLIANT
    await request(h.app)
      .post('/api/v1/driver/application')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({})
      .expect(409);
  });

  it('strips eager fileUrl leaks, restricts private previews, audits access, and streams hardened inline bytes', async () => {
    const h = buildTestHarness();

    const siliguriDriverToken = await h.mintSessionToken({
      userId: 'usr-drv-slg',
      phoneE164: '+919700000001',
      role: 'DRIVER',
    });
    const darjeelingDriverToken = await h.mintSessionToken({
      userId: 'usr-drv-drj',
      phoneE164: '+919700000002',
      role: 'DRIVER',
    });
    const siliguriCityAdminToken = await h.mintSessionToken({
      userId: 'usr-city-admin-slg',
      phoneE164: '+919700000010',
      role: 'CITY_ADMIN',
      cityZoneIds: ['zone-siliguri'],
    });
    const superAdminToken = await h.mintSessionToken({
      userId: 'usr-super-2',
      phoneE164: '+919700000099',
      role: 'SUPER_ADMIN',
    });

    // Create Siliguri driver application + PNG identity doc
    await request(h.app)
      .post('/api/v1/driver/profile')
      .set('Authorization', `Bearer ${siliguriDriverToken}`)
      .send({ name: 'Siliguri Driver', address: 'Siliguri, WB' })
      .expect(201);
    const slgAppRes = await request(h.app)
      .post('/api/v1/driver/application')
      .set('Authorization', `Bearer ${siliguriDriverToken}`)
      .send({})
      .expect(201);
    const slgAppId = slgAppRes.body.data.id as string;
    const slgDocRes = await request(h.app)
      .post('/api/v1/driver/documents/identity')
      .set('Authorization', `Bearer ${siliguriDriverToken}`)
      .send({ fileDataUrl: toDataUrl('image/png', VALID_PNG_BYTES) })
      .expect(201);
    const slgDocId = slgDocRes.body.data.id as string;

    // Also inject a legacy/suspicious http storageKey doc on Siliguri application to verify zero pass-through
    await h.documentRepo.create({
      id: 'legacy-http-doc',
      driverId: slgAppRes.body.data.driverId,
      applicationId: slgAppId,
      type: 'PERMIT',
      storageKey: 'https://untrusted.example/leaked.pdf',
      documentNumberMasked: null,
      expiresAt: new Date('2028-01-01T00:00:00.000Z'),
      verificationStatus: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create Darjeeling driver application + PDF doc
    await request(h.app)
      .post('/api/v1/driver/profile')
      .set('Authorization', `Bearer ${darjeelingDriverToken}`)
      .send({ name: 'Darjeeling Driver', address: 'Darjeeling, WB' })
      .expect(201);
    const drjAppRes = await request(h.app)
      .post('/api/v1/driver/application')
      .set('Authorization', `Bearer ${darjeelingDriverToken}`)
      .send({})
      .expect(201);
    const drjAppId = drjAppRes.body.data.id as string;
    const drjDocRes = await request(h.app)
      .post('/api/v1/driver/documents/identity')
      .set('Authorization', `Bearer ${darjeelingDriverToken}`)
      .send({ fileDataUrl: toDataUrl('application/pdf', VALID_PDF_BYTES) })
      .expect(201);
    const drjDocId = drjDocRes.body.data.id as string;

    // A typed address is not an authoritative city assignment for KYC access.
    await request(h.app)
      .get(`/api/v1/admin/driver-applications/${slgAppId}`)
      .set('Authorization', `Bearer ${siliguriCityAdminToken}`)
      .expect(403);

    // SUPER_ADMIN gets detail: fileUrl is ALWAYS null; vault file hasFile=true; http url hasFile=false.
    const detailRes = await request(h.app)
      .get(`/api/v1/admin/driver-applications/${slgAppId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);
    const docs = detailRes.body.data.documents as Array<{
      id: string;
      fileUrl: string | null;
      hasFile: boolean;
    }>;
    const vaultDoc = docs.find((d) => d.id === slgDocId)!;
    const legacyDoc = docs.find((d) => d.id === 'legacy-http-doc')!;
    expect(vaultDoc.fileUrl).toBeNull();
    expect(vaultDoc.hasFile).toBe(true);
    expect(legacyDoc.fileUrl).toBeNull();
    expect(legacyDoc.hasFile).toBe(false);

    // Attempting to preview legacy http storageKey fails with 404 (never redirects/passes through!)
    await request(h.app)
      .post(`/api/v1/admin/driver-applications/${slgAppId}/documents/legacy-http-doc/preview`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(404);

    // CITY_ADMIN cannot inspect another application or preview its document.
    await request(h.app)
      .get(`/api/v1/admin/driver-applications/${drjAppId}`)
      .set('Authorization', `Bearer ${siliguriCityAdminToken}`)
      .expect(403);
    await request(h.app)
      .post(`/api/v1/admin/driver-applications/${drjAppId}/documents/${drjDocId}/preview`)
      .set('Authorization', `Bearer ${siliguriCityAdminToken}`)
      .expect(403);

    // Cross-application document probing (Siliguri app + Darjeeling docId) -> 404!
    await request(h.app)
      .post(`/api/v1/admin/driver-applications/${slgAppId}/documents/${drjDocId}/preview`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(404);

    // SUPER_ADMIN mints an audited 5-minute preview URL and streams hardened bytes.
    const previewRes = await request(h.app)
      .post(`/api/v1/admin/driver-applications/${slgAppId}/documents/${slgDocId}/preview`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);
    const previewUrl = previewRes.body.data.url as string;
    expect(previewRes.body.data.mimeType).toBe('image/png');
    expect(previewUrl).toMatch(/^\/api\/v1\/admin\/driver-documents\/.+\/content\?exp=\d+&sig=/);

    // Verify audit log recorded DOCUMENT_PREVIEWED
    const previewAudit = h.auditRepo.entries.find(
      (e) => e.action === 'DOCUMENT_PREVIEWED' && e.documentId === slgDocId,
    );
    expect(previewAudit).toBeDefined();
    expect(previewAudit?.actorRole).toBe('SUPER_ADMIN');

    // Stream content -> exact PNG bytes + strict privacy & anti-sniffing headers
    const streamRes = await request(h.app)
      .get(previewUrl)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(streamRes.headers['content-type']).toContain('image/png');
    expect(streamRes.headers['cache-control']).toContain('no-store');
    expect(streamRes.headers['x-content-type-options']).toBe('nosniff');
    expect(streamRes.headers['content-disposition']).toContain('inline');
    expect(Buffer.compare(streamRes.body as Buffer, VALID_PNG_BYTES)).toBe(0);

    // Tampered signature -> 403!
    const tamperedUrl = previewUrl.replace(/sig=[^&]+/, 'sig=tamperedSignatureValue123');
    await request(h.app).get(tamperedUrl).expect(403);
  });
});
