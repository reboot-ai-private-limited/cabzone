import { Buffer } from 'node:buffer';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import {
  CreateDriverApplicationUseCase,
  RegisterDriverVehicleUseCase,
  ReviewDriverApplicationUseCase,
  UploadDriverDocumentUseCase,
} from '../src/modules/identity/application/useCases/index.js';
import type {
  AdminUserEntity,
  AdminUserRepositoryPort,
  DriverApplicationEntity,
  DriverApplicationRepositoryPort,
  DriverDocumentEntity,
  DriverDocumentRepositoryPort,
  DriverEntity,
  DriverLicenseStoragePort,
  DriverRepositoryPort,
  SessionEntity,
  SessionRepositoryPort,
  UserEntity,
  UserRepositoryPort,
  VehicleEntity,
  VehicleRepositoryPort,
} from '../src/modules/identity/domain/index.js';
import { buildIdentityContainer } from '../src/modules/identity/identity.container.js';
import { CloudinaryDriverLicenseAdapter } from '../src/modules/identity/infrastructure/cloudinaryDriverLicense.adapter.js';
import {
  ConsoleSmsGatewayAdapter,
  JoseTokenAdapter,
  MemoryOtpStoreAdapter,
} from '../src/modules/identity/infrastructure/index.js';
import { newUuid } from '../src/shared/ids.js';
import { logger } from '../src/shared/logging/logger.js';
import { unitOfWork } from './helpers/unitOfWork.js';

const JWT_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';
const PREVIEW_SECRET = 'preview-signing-secret-that-is-at-least-32-chars-long!!';
const VALID_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'utf8');
const PDF_DATA_URL = `data:application/pdf;base64,${VALID_PDF.toString('base64')}`;

class MemDriverRepo implements DriverRepositoryPort {
  readonly items = new Map<string, DriverEntity>();
  async findById(id: string) {
    const d = this.items.get(id);
    return d ? { ...d } : null;
  }
  async findByUserId(userId: string) {
    for (const d of this.items.values()) if (d.userId === userId) return { ...d };
    return null;
  }
  async create(d: DriverEntity) {
    this.items.set(d.id, { ...d });
    return { ...d };
  }
  async update(d: DriverEntity) {
    this.items.set(d.id, { ...d });
    return { ...d };
  }
}

class MemAppRepo implements DriverApplicationRepositoryPort {
  readonly items = new Map<string, DriverApplicationEntity>();
  async findById(id: string) {
    const a = this.items.get(id);
    return a ? { ...a } : null;
  }
  async findByDriverId(driverId: string) {
    const all = [...this.items.values()]
      .filter((a) => a.driverId === driverId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return all[0] ? { ...all[0] } : null;
  }
  async list() {
    return [...this.items.values()];
  }
  async create(a: DriverApplicationEntity) {
    this.items.set(a.id, { ...a });
    return { ...a };
  }
  async update(a: DriverApplicationEntity) {
    this.items.set(a.id, { ...a });
    return { ...a };
  }
}

class MemDocRepo implements DriverDocumentRepositoryPort {
  readonly items = new Map<string, DriverDocumentEntity>();
  failNextWrite = false;
  async findById(id: string) {
    const d = this.items.get(id);
    return d ? { ...d } : null;
  }
  async findByApplicationId(appId: string) {
    return [...this.items.values()].filter((d) => d.applicationId === appId).map((d) => ({ ...d }));
  }
  async findByDriverId(driverId: string) {
    return [...this.items.values()].filter((d) => d.driverId === driverId).map((d) => ({ ...d }));
  }
  async findExpiringOrExpiredVerified() {
    return [];
  }
  async create(d: DriverDocumentEntity) {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('simulated_db_failure');
    }
    this.items.set(d.id, { ...d });
    return { ...d };
  }
  async update(d: DriverDocumentEntity) {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('simulated_db_failure');
    }
    this.items.set(d.id, { ...d });
    return { ...d };
  }
}

class MemVehicleRepo implements VehicleRepositoryPort {
  readonly items = new Map<string, VehicleEntity>();
  async findById(id: string) {
    const v = this.items.get(id);
    return v ? { ...v } : null;
  }
  async findByDriverId(driverId: string) {
    return [...this.items.values()].filter((v) => v.driverId === driverId).map((v) => ({ ...v }));
  }
  async findByRegistrationNumber(reg: string) {
    for (const v of this.items.values()) if (v.registrationNumber === reg) return { ...v };
    return null;
  }
  async create(v: VehicleEntity) {
    this.items.set(v.id, { ...v });
    return { ...v };
  }
  async update(v: VehicleEntity) {
    this.items.set(v.id, { ...v });
    return { ...v };
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('C04: KYC private storage deletion, vehicle-change safeguards, and preview headers', () => {
  it('signs authenticated Cloudinary destroy calls and skips mock storage keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: 'ok' }) });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new CloudinaryDriverLicenseAdapter({
      cloudName: 'cabzone-private',
      apiKey: 'api-key-1',
      apiSecret: 'api-secret-1',
    });

    await adapter.delete('mock/dl.jpg');
    expect(fetchMock).not.toHaveBeenCalled();

    const privateKey = `driver-kyc/${newUuid()}.pdf`;
    await adapter.delete(privateKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudinary.com/v1_1/cabzone-private/raw/destroy');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('public_id')).toBe(privateKey);
    expect(body.get('type')).toBe('authenticated');
    expect(body.get('invalidate')).toBe('true');
    expect(body.get('signature')).toMatch(/^[0-9a-f]{40}$/);
  });

  it('cleans up orphan uploads on DB failure and deletes replaced assets only when unreferenced by prior renewal apps', async () => {
    const driverRepo = new MemDriverRepo();
    const appRepo = new MemAppRepo();
    const docRepo = new MemDocRepo();
    const vehicleRepo = new MemVehicleRepo();

    const deletedKeys: string[] = [];
    const storage: DriverLicenseStoragePort = {
      async upload(_dataUrl, ext) {
        return `driver-kyc/${newUuid()}.${ext}`;
      },
      async read() {
        return VALID_PDF;
      },
      async delete(key) {
        deletedKeys.push(key);
      },
    };

    const userId = newUuid();
    const driverId = newUuid();
    const now = new Date();
    const future = new Date(now.getTime() + 180 * 86_400_000);
    await driverRepo.create({
      id: driverId,
      userId,
      name: 'Test Driver',
      gender: 'MALE',
      dateOfBirth: '1994-01-01',
      address: 'Siliguri',
      dlNumber: 'WB7420220099999',
      dlExpiry: '2030-01-01',
      profilePhotoUrl: null,
      kycStatus: 'PENDING',
      status: 'PENDING_KYC',
      operationalStatus: 'OFFLINE',
      currentVehicleId: null,
      ratingAverage: null,
      ratingCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const app1 = await appRepo.create({
      id: newUuid(),
      driverId,
      status: 'DRAFT',
      rejectionType: null,
      rejectionReason: null,
      submittedAt: null,
      reviewedAt: null,
      reviewerAdminId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const uploader = new UploadDriverDocumentUseCase({
      driverRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
      licenseStorage: storage,
    });

    // 1. DB failure after upload immediately deletes the newly uploaded private storageKey
    docRepo.failNextWrite = true;
    await expect(
      uploader.executeIdentityFile({ userId, fileDataUrl: PDF_DATA_URL }),
    ).rejects.toThrow('simulated_db_failure');
    expect(deletedKeys).toHaveLength(1);

    // 2. Replacing a draft document deletes the unreferenced previous storageKey
    const firstIdDoc = await uploader.executeIdentityFile({ userId, fileDataUrl: PDF_DATA_URL });
    const replacedIdDoc = await uploader.executeIdentityFile({ userId, fileDataUrl: PDF_DATA_URL });
    expect(deletedKeys).toContain(firstIdDoc.storageKey);
    expect(replacedIdDoc.storageKey).not.toBe(firstIdDoc.storageKey);

    // 3. Approve app1, start renewal app2 (which carries forward replacedIdDoc.storageKey), then replace in app2 -> shared storageKey MUST NOT be deleted!
    await docRepo.update({ ...replacedIdDoc, verificationStatus: 'VERIFIED', verifiedAt: now });
    await appRepo.update({ ...app1, status: 'APPROVED', reviewedAt: now });
    await driverRepo.update({
      ...(await driverRepo.findById(driverId))!,
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
    });

    const createApp = new CreateDriverApplicationUseCase({
      driverRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
      vehicleRepo,
      auditRepo: { async record() {}, async listByDriverId() { return []; } },
    });
    const renewalApp = await createApp.execute(userId, { allowApprovedRenewal: true });
    expect(renewalApp.id).not.toBe(app1.id);

    deletedKeys.length = 0;
    const renewedIdDoc = await uploader.executeIdentityFile({
      userId,
      fileDataUrl: PDF_DATA_URL,
    });
    expect(renewedIdDoc.storageKey).not.toBe(replacedIdDoc.storageKey);
    expect(deletedKeys).not.toContain(replacedIdDoc.storageKey);

    // Unused variable guard for future date check
    expect(future.getTime()).toBeGreaterThan(now.getTime());
  });

  it('blocks vehicle swap during SUBMITTED review and prevents approving vehicle B using vehicle A documents', async () => {
    const driverRepo = new MemDriverRepo();
    const appRepo = new MemAppRepo();
    const docRepo = new MemDocRepo();
    const vehicleRepo = new MemVehicleRepo();

    const userId = newUuid();
    const driverId = newUuid();
    const vehicleAId = newUuid();
    const vehicleBId = newUuid();
    const now = new Date();
    const future = new Date(now.getTime() + 180 * 86_400_000);

    await driverRepo.create({
      id: driverId,
      userId,
      name: 'Driver One',
      gender: 'MALE',
      dateOfBirth: '1992-05-05',
      address: 'Siliguri',
      dlNumber: 'WB7420220011111',
      dlExpiry: '2030-01-01',
      profilePhotoUrl: null,
      kycStatus: 'PENDING',
      status: 'PENDING_KYC',
      operationalStatus: 'ONLINE',
      currentVehicleId: vehicleAId,
      ratingAverage: null,
      ratingCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    await vehicleRepo.create({
      id: vehicleAId,
      driverId,
      vehicleType: 'CAB',
      make: 'Maruti',
      model: 'Dzire',
      registrationNumber: 'WB74AA1111',
      color: 'White',
      manufactureYear: 2022,
      verificationStatus: 'PENDING',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await vehicleRepo.create({
      id: vehicleBId,
      driverId,
      vehicleType: 'CAB',
      make: 'Hyundai',
      model: 'Aura',
      registrationNumber: 'WB74BB2222',
      color: 'Silver',
      manufactureYear: 2023,
      verificationStatus: 'PENDING',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const app = await appRepo.create({
      id: newUuid(),
      driverId,
      status: 'SUBMITTED',
      rejectionType: null,
      rejectionReason: null,
      submittedAt: now,
      reviewedAt: null,
      reviewerAdminId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    for (const type of [
      'GOVERNMENT_ID',
      'DRIVING_LICENSE',
      'REGISTRATION_CERTIFICATE',
      'INSURANCE',
      'PERMIT',
    ] as const) {
      await docRepo.create({
        id: newUuid(),
        driverId,
        applicationId: app.id,
        vehicleId:
          type === 'GOVERNMENT_ID' || type === 'DRIVING_LICENSE' ? null : vehicleAId,
        type,
        storageKey: `driver-kyc/${newUuid()}.pdf`,
        documentHash: 'a'.repeat(64),
        documentNumberMasked: '****1111',
        issuedAt: now,
        expiresAt: type === 'GOVERNMENT_ID' ? null : future,
        verificationStatus: 'PENDING',
        verifiedAt: null,
        lastExpiryReminderDays: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const registerVehicle = new RegisterDriverVehicleUseCase({
      driverRepo,
      vehicleRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
    });

    await expect(
      registerVehicle.execute({
        userId,
        vehicleType: 'CAB',
        make: 'Tata',
        model: 'Tigor',
        registrationNumber: 'WB74CC3333',
      }),
    ).rejects.toThrow(/VEHICLE_LOCKED_UNDER_REVIEW/);

    // Even if currentVehicleId was switched to vehicleB before submission, ReviewDriverApplicationUseCase rejects approval
    await driverRepo.update({
      ...(await driverRepo.findById(driverId))!,
      currentVehicleId: vehicleBId,
    });

    const reviewer = new ReviewDriverApplicationUseCase({
      unitOfWork,
      driverRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
      vehicleRepo,
      auditRepo: { async record() {}, async listByDriverId() { return []; } },
    });

    await expect(
      reviewer.execute({
        applicationId: app.id,
        reviewerAdminId: newUuid(),
        reviewerRole: 'SUPER_ADMIN',
        status: 'APPROVED',
      }),
    ).rejects.toThrow(/DOCUMENTS_REQUIRED/);
  });

  it('sets strict anti-cache/referrer/CORP headers on preview content and strips query secrets from error logs', async () => {
    const driverRepo = new MemDriverRepo();
    const appRepo = new MemAppRepo();
    const docRepo = new MemDocRepo();
    const vehicleRepo = new MemVehicleRepo();
    const adminId = newUuid();
    const sessionId = newUuid();
    const docId = newUuid();
    const driverId = newUuid();
    const appId = newUuid();
    const now = new Date();

    await driverRepo.create({
      id: driverId,
      userId: newUuid(),
      name: 'Preview Driver',
      gender: 'FEMALE',
      dateOfBirth: '1993-03-03',
      address: 'Siliguri',
      dlNumber: 'WB7420220033333',
      dlExpiry: '2030-01-01',
      profilePhotoUrl: null,
      kycStatus: 'PENDING',
      status: 'PENDING_KYC',
      operationalStatus: 'OFFLINE',
      currentVehicleId: null,
      ratingAverage: null,
      ratingCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await appRepo.create({
      id: appId,
      driverId,
      status: 'SUBMITTED',
      rejectionType: null,
      rejectionReason: null,
      submittedAt: now,
      reviewedAt: null,
      reviewerAdminId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await docRepo.create({
      id: docId,
      driverId,
      applicationId: appId,
      vehicleId: null,
      type: 'DRIVING_LICENSE',
      storageKey: `driver-kyc/${newUuid()}.pdf`,
      documentHash: 'b'.repeat(64),
      documentNumberMasked: '****3333',
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 90 * 86_400_000),
      verificationStatus: 'PENDING',
      verifiedAt: null,
      lastExpiryReminderDays: null,
      createdAt: now,
      updatedAt: now,
    });

    const userRepo: UserRepositoryPort = {
      async findById(id) {
        return id === adminId
          ? {
              id: adminId,
              phoneE164: '+919000000001',
              phoneVerifiedAt: now,
              status: 'ACTIVE',
              version: 1,
              createdAt: now,
              updatedAt: now,
            }
          : null;
      },
      async findByPhone() {
        return null;
      },
      async create(u: UserEntity) {
        return u;
      },
      async update(u: UserEntity) {
        return u;
      },
    };
    const adminRepo: AdminUserRepositoryPort = {
      async findById() {
        return null;
      },
      async findByUserId(uid) {
        return uid === adminId
          ? ({
              id: newUuid(),
              userId: adminId,
              name: 'Super Admin',
              email: 'admin@cabzone.example',
              role: 'SUPER_ADMIN',
              cityZoneIds: [],
              status: 'ACTIVE',
              version: 1,
              createdAt: now,
              updatedAt: now,
            } satisfies AdminUserEntity)
          : null;
      },
      async findByEmail() {
        return null;
      },
      async list() {
        return { items: [], total: 0 };
      },
      async create(a) {
        return a;
      },
      async update(a) {
        return a;
      },
    };
    const sessionRepo: SessionRepositoryPort = {
      async findById(id) {
        return id === sessionId
          ? ({
              id: sessionId,
              userId: adminId,
              deviceId: 'web',
              refreshTokenHash: 'h',
              previousRefreshTokenHash: null,
              expiresAt: new Date(now.getTime() + 3_600_000),
              revokedAt: null,
              lastUsedAt: now,
              createdAt: now,
            } satisfies SessionEntity)
          : null;
      },
      async findByTokenHash() {
        return null;
      },
      async findByUserIdAndDeviceId() {
        return null;
      },
      async save() {},
      async revoke() {},
      async revokeAllForUser() {},
    };

    const tokenAdapter = new JoseTokenAdapter(JWT_SECRET);
    const identity = buildIdentityContainer({
      unitOfWork,
      userRepo,
      adminRepo,
      sessionRepo,
      driverRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
      vehicleRepo,
      auditRepo: { async record() {}, async listByDriverId() { return []; } },
      tokenAdapter,
      otpStore: new MemoryOtpStoreAdapter(),
      smsGateway: new ConsoleSmsGatewayAdapter(),
      previewSigningSecret: PREVIEW_SECRET,
      licenseStorage: {
        async upload() {
          return `driver-kyc/${newUuid()}.pdf`;
        },
        async read() {
          return VALID_PDF;
        },
      },
    });

    const app = createApp({ identity });
    const adminToken = await tokenAdapter.signAccessToken(
      { sub: adminId, sessionId, role: 'SUPER_ADMIN' },
      '15m',
    );

    const previewRes = await request(app)
      .post(`/api/v1/admin/driver-applications/${appId}/documents/${docId}/preview`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(previewRes.status).toBe(200);
    const previewUrl = String(previewRes.body.data.url);

    const streamRes = await request(app).get(previewUrl);
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers['cache-control']).toBe(
      'private, no-store, no-cache, max-age=0, must-revalidate',
    );
    expect(streamRes.headers['pragma']).toBe('no-cache');
    expect(streamRes.headers['referrer-policy']).toBe('no-referrer');
    expect(streamRes.headers['cross-origin-resource-policy']).toBe('same-origin');

    const logInfoSpy = vi.spyOn(logger, 'info');
    const badSigSecret = 'leaked-preview-sig-secret-value-999999';
    const failedRes = await request(app).get(
      `/api/v1/admin/driver-documents/${docId}/content?exp=9999999999999&sig=${badSigSecret}`,
    );
    expect(failedRes.status).toBe(403);
    expect(JSON.stringify(logInfoSpy.mock.calls)).not.toContain(badSigSecret);
  });
});
