import { unitOfWork } from './helpers/unitOfWork.js';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import {
  CreateDriverApplicationUseCase,
  CreateDriverProfileUseCase,
  GetDriverApplicationDetailUseCase,
  GetDriverProfileUseCase,
  ListDriverApplicationsUseCase,
  LogoutUseCase,
  RefreshTokenUseCase,
  RegisterDriverVehicleUseCase,
  RequestOtpUseCase,
  ReviewDriverApplicationUseCase,
  SubmitDriverApplicationUseCase,
  UploadDriverDocumentUseCase,
  VerifyOtpUseCase,
} from '../src/modules/identity/application/useCases/index.js';
import type {
  AdminUserEntity,
  AdminUserRepositoryPort,
  DriverApplicationEntity,
  DriverApplicationRepositoryPort,
  DriverDocumentEntity,
  DriverDocumentRepositoryPort,
  DriverEntity,
  DriverRepositoryPort,
  RiderEntity,
  RiderRepositoryPort,
  SessionEntity,
  SessionRepositoryPort,
  UserEntity,
  UserRepositoryPort,
  VehicleEntity,
  VehicleRepositoryPort,
} from '../src/modules/identity/domain/index.js';
import {
  buildAdminDriverRouter,
  buildAuthRouter,
  buildDriverRouter,
  makeCreateDriverApplicationController,
  makeCreateDriverProfileController,
  makeGetDriverApplicationController,
  makeGetDriverProfileController,
  makeListDriverApplicationsController,
  makeLogoutController,
  makeRefreshTokenController,
  makeRegisterDriverVehicleController,
  makeRequestOtpController,
  makeReviewDriverApplicationController,
  makeSubmitDriverApplicationController,
  makeUploadDriverDocumentController,
  makeUploadDriverLicenseFileController,
  makeUploadVehicleDocumentFileController,
  makeUploadIdentityDocumentFileController,
  makeVerifyOtpController,
} from '../src/modules/identity/index.js';
import {
  ConsoleSmsGatewayAdapter,
  JoseTokenAdapter,
  MemoryOtpStoreAdapter,
} from '../src/modules/identity/infrastructure/index.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  requireRole,
} from '../src/modules/identity/interface/middlewares/index.js';

const TEST_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';
const TEST_PEPPER = 'this-is-a-super-secret-pepper-that-is-at-least-32-chars-long!';

class MemoryDriverRepository implements DriverRepositoryPort {
  private readonly drivers = new Map<string, DriverEntity>();

  async findById(driverId: string): Promise<DriverEntity | null> {
    return this.drivers.get(driverId) ?? null;
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
  private readonly apps = new Map<string, DriverApplicationEntity>();

  async findById(id: string): Promise<DriverApplicationEntity | null> {
    return this.apps.get(id) ?? null;
  }

  async findByDriverId(driverId: string): Promise<DriverApplicationEntity | null> {
    for (const a of this.apps.values()) {
      if (a.driverId === driverId) return { ...a };
    }
    return null;
  }

  async list(filter: {
    status?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<DriverApplicationEntity[]> {
    return [...this.apps.values()]
      .filter((a) => filter.status === undefined || a.status === filter.status)
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
  private readonly docs = new Map<string, DriverDocumentEntity>();

  async findById(id: string): Promise<DriverDocumentEntity | null> {
    return this.docs.get(id) ?? null;
  }

  async findByApplicationId(applicationId: string): Promise<DriverDocumentEntity[]> {
    return Array.from(this.docs.values()).filter((d) => d.applicationId === applicationId);
  }

  async findByDriverId(driverId: string): Promise<DriverDocumentEntity[]> {
    return Array.from(this.docs.values()).filter((d) => d.driverId === driverId);
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
  private readonly vehicles = new Map<string, VehicleEntity>();

  async findById(id: string): Promise<VehicleEntity | null> {
    return this.vehicles.get(id) ?? null;
  }

  async findByDriverId(driverId: string): Promise<VehicleEntity | null> {
    for (const v of this.vehicles.values()) {
      if (v.driverId === driverId) return { ...v };
    }
    return null;
  }

  async findByRegistrationNumber(registrationNumber: string): Promise<VehicleEntity | null> {
    for (const v of this.vehicles.values()) {
      if (v.registrationNumber === registrationNumber) return { ...v };
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

class MemorySessionRepository implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();

  async findById(sessionId: string): Promise<SessionEntity | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<SessionEntity | null> {
    for (const s of this.sessions.values()) {
      if (s.refreshTokenHash === tokenHash || s.previousRefreshTokenHash === tokenHash)
        return { ...s };
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

describe('Driver Onboarding Use Cases', () => {
  it('walks through entire driver onboarding lifecycle from profile to review', async () => {
    const driverRepo = new MemoryDriverRepository();
    const appRepo = new MemoryDriverApplicationRepository();
    const docRepo = new MemoryDriverDocumentRepository();
    const vehicleRepo = new MemoryVehicleRepository();

    const createProfile = new CreateDriverProfileUseCase({ driverRepo });
    const getProfile = new GetDriverProfileUseCase({
      driverRepo,
      vehicleRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
    });
    const createApplication = new CreateDriverApplicationUseCase({
      driverRepo,
      applicationRepo: appRepo,
    });
    const uploadDocument = new UploadDriverDocumentUseCase({
      driverRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
    });
    const registerVehicle = new RegisterDriverVehicleUseCase({ driverRepo, vehicleRepo });
    const submitApplication = new SubmitDriverApplicationUseCase({
      driverRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
      vehicleRepo,
    });
    const reviewApplication = new ReviewDriverApplicationUseCase({
      unitOfWork,
      driverRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
      vehicleRepo,
    });

    const driverUserId = '018f0a00-0000-7000-8000-000000000001';
    const adminUserId = '018f0a00-0000-7000-8000-000000000099';

    // 1. Create driver profile
    const driver = await createProfile.execute(driverUserId);
    expect(driver.status).toBe('PENDING');
    expect(driver.kycStatus).toBe('PENDING');

    // 2. Initialize application
    const app = await createApplication.execute(driverUserId);
    expect(app.status).toBe('DRAFT');

    // 3. Fail submit before docs and vehicle are attached
    await expect(submitApplication.execute(driverUserId)).rejects.toThrow(
      'Both Government ID and Driving License',
    );

    // 4. Upload Gov ID and Driving License
    await uploadDocument.execute({
      userId: driverUserId,
      type: 'GOVERNMENT_ID',
      storageKey: 'mock/aadhaar_rc.jpg',
      documentHash: 'a'.repeat(64),
    });
    await expect(submitApplication.execute(driverUserId)).rejects.toThrow(
      'Both Government ID and Driving License',
    );
    await uploadDocument.execute({
      userId: driverUserId,
      type: 'GOVERNMENT_ID',
      storageKey: 'kyc/driver-1/govt-id.jpg',
      documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });

    await uploadDocument.execute({
      userId: driverUserId,
      type: 'DRIVING_LICENSE',
      storageKey: 'kyc/driver-1/dl.jpg',
      documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      expiresAt: new Date(Date.now() + 86400_000 * 365),
    });

    // 5. Fail submit before vehicle registration
    await expect(submitApplication.execute(driverUserId)).rejects.toThrow(
      'A vehicle must be registered',
    );

    // 6. Register vehicle
    const vehicle = await registerVehicle.execute({
      userId: driverUserId,
      vehicleType: 'CAB',
      make: 'Maruti',
      model: 'WagonR',
      registrationNumber: 'WB74AB1234',
      manufactureYear: 2021,
    });
    expect(vehicle.verificationStatus).toBe('PENDING');

    // 7. Submit application
    await expect(submitApplication.execute(driverUserId)).rejects.toThrow('DOCUMENTS_REQUIRED');
    for (const type of ['REGISTRATION_CERTIFICATE', 'INSURANCE', 'PERMIT'] as const) {
      await uploadDocument.execute({
        userId: driverUserId,
        type,
        storageKey: `kyc/driver-1/${type}.jpg`,
        documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        expiresAt: type === 'PERMIT' ? null : new Date(Date.now() + 86400_000 * 365),
      });
    }
    await expect(submitApplication.execute(driverUserId)).rejects.toThrow('DOCUMENTS_REQUIRED');
    await uploadDocument.execute({
      userId: driverUserId,
      type: 'PERMIT',
      storageKey: 'kyc/driver-1/permit-renewed.jpg',
      documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      expiresAt: new Date(Date.now() + 86400_000 * 365),
    });
    const submitted = await submitApplication.execute(driverUserId);
    expect(submitted.status).toBe('SUBMITTED');

    // 8. Admin review: approve application
    const approved = await reviewApplication.execute({
      applicationId: submitted.id,
      reviewerAdminId: adminUserId,
      status: 'APPROVED',
    });

    expect(approved.status).toBe('APPROVED');
    const updatedDriver = await driverRepo.findById(driver.id);
    expect(updatedDriver?.kycStatus).toBe('VERIFIED');
    expect(updatedDriver?.status).toBe('ACTIVE');

    const updatedVehicle = await vehicleRepo.findById(vehicle.id);
    expect(updatedVehicle?.verificationStatus).toBe('APPROVED');

    // 9. Get full driver profile
    const profile = await getProfile.execute(driverUserId);
    expect(profile.driver.kycStatus).toBe('VERIFIED');
    expect(profile.vehicle?.verificationStatus).toBe('APPROVED');
    expect(profile.application?.status).toBe('APPROVED');
    expect(profile.documents.length).toBe(5);
  });
});

describe('Driver Onboarding Endpoints (Supertest)', () => {
  function createTestApp() {
    const driverRepo = new MemoryDriverRepository();
    const appRepo = new MemoryDriverApplicationRepository();
    const docRepo = new MemoryDriverDocumentRepository();
    const vehicleRepo = new MemoryVehicleRepository();
    const sessionRepo = new MemorySessionRepository();
    const tokenAdapter = new JoseTokenAdapter(TEST_SECRET);

    const photoUrl = 'https://res.cloudinary.com/test/image/upload/driver-profiles/photo.png';
    const createProfile = new CreateDriverProfileUseCase({
      driverRepo,
      photoStorage: { upload: async () => photoUrl },
    });
    const getProfile = new GetDriverProfileUseCase({
      driverRepo,
      vehicleRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
    });
    const createApplication = new CreateDriverApplicationUseCase({
      driverRepo,
      applicationRepo: appRepo,
    });
    const uploadDocument = new UploadDriverDocumentUseCase({
      driverRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
      licenseStorage: {
        upload: vi.fn(async (_fileDataUrl, extension) => `driver-kyc/test-license.${extension}`),
      },
    });
    const registerVehicle = new RegisterDriverVehicleUseCase({ driverRepo, vehicleRepo });
    const submitApplication = new SubmitDriverApplicationUseCase({
      driverRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
      vehicleRepo,
    });
    const reviewApplication = new ReviewDriverApplicationUseCase({
      unitOfWork,
      driverRepo,
      applicationRepo: appRepo,
      documentRepo: docRepo,
      vehicleRepo,
    });

    const authenticate = makeAuthenticate({
      tokenVerifier: tokenAdapter,
      sessionRepo,
    });

    const adminDeps = {
      applicationRepo: appRepo,
      driverRepo,
      documentRepo: docRepo,
      vehicleRepo,
      userRepo: {
        findById: async (id: string) => ({ id, phoneE164: '+919800000001' }),
      } as never,
    };

    const driverRouter = buildDriverRouter({
      authenticate,
      createProfile: makeCreateDriverProfileController(createProfile),
      getProfile: makeGetDriverProfileController(getProfile),
      createApplication: makeCreateDriverApplicationController(createApplication),
      uploadDocument: makeUploadDriverDocumentController(uploadDocument),
      uploadLicenseFile: makeUploadDriverLicenseFileController(uploadDocument),
      uploadVehicleDocumentFile: makeUploadVehicleDocumentFileController(uploadDocument),
      uploadIdentityDocumentFile: makeUploadIdentityDocumentFileController(uploadDocument),
      registerVehicle: makeRegisterDriverVehicleController(registerVehicle),
      submitApplication: makeSubmitDriverApplicationController(submitApplication),
    });

    const adminDriverRouter = buildAdminDriverRouter({
      authenticate,
      requireAdminRole: requireRole('SUPER_ADMIN', 'CITY_ADMIN'),
      reviewApplication: makeReviewDriverApplicationController(reviewApplication),
      listApplications: makeListDriverApplicationsController(
        new ListDriverApplicationsUseCase(adminDeps),
      ),
      getApplication: makeGetDriverApplicationController(
        new GetDriverApplicationDetailUseCase(adminDeps),
      ),
    });

    const identityContainer = {
      buildAuthRouter: () => {
        const { Router } = require('express');
        return Router();
      },
      buildDriverRouter: () => driverRouter,
      buildAdminDriverRouter: () => adminDriverRouter,
      authenticate,
      requireRole,
      requireAdminScope: () => requireRole('SUPER_ADMIN'),
      requireZoneAccess: makeRequireZoneAccess({
        adminRepo: {
          findByUserId: async () => null,
        },
      }),
    };

    return {
      app: createApp({ identity: identityContainer }),
      sessionRepo,
      tokenAdapter,
    };
  }

  it('stores a real licence file for the authenticated driver and rejects invalid formats', async () => {
    const { app, sessionRepo, tokenAdapter } = createTestApp();
    const userId = '018f0a00-0000-7000-8000-000000000031';
    const sessionId = 'session-license-1';
    await sessionRepo.save({
      id: sessionId,
      userId,
      deviceId: 'dev-license',
      refreshTokenHash: 'license-hash',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });
    const token = await tokenAdapter.signAccessToken({ sub: userId, sessionId, role: 'DRIVER' });
    await request(app).post('/api/v1/driver/profile').set('Authorization', `Bearer ${token}`).send({ name: 'Test Driver' }).expect(201);
    await request(app).post('/api/v1/driver/application').set('Authorization', `Bearer ${token}`).expect(201);

    const fileDataUrl = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`;
    const licenseExpiry = new Date(Date.now() + 86_400_000 * 300).toISOString();
    const upload = await request(app)
      .post('/api/v1/driver/documents/license')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileDataUrl, dlNumber: 'WB7420220012345', expiresAt: licenseExpiry })
      .expect(201);
    expect(upload.body.data).toMatchObject({
      type: 'DRIVING_LICENSE',
      storageKey: 'driver-kyc/test-license.pdf',
      documentNumberMasked: '****2345',
      expiresAt: licenseExpiry,
    });
    expect(upload.body.data.documentHash).toMatch(/^[a-f0-9]{64}$/);
    const profile = await request(app).get('/api/v1/driver/profile/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(profile.body.data.documents).toHaveLength(1);

    const correctedExpiry = new Date(Date.now() + 86_400_000 * 365).toISOString();
    const corrected = await request(app)
      .post('/api/v1/driver/documents/license')
      .set('Authorization', `Bearer ${token}`)
      .send({ dlNumber: 'WB7420220012345', expiresAt: correctedExpiry })
      .expect(201);
    expect(corrected.body.data).toMatchObject({
      id: upload.body.data.id,
      storageKey: upload.body.data.storageKey,
      documentHash: upload.body.data.documentHash,
      expiresAt: correctedExpiry,
    });
    await request(app)
      .post('/api/v1/driver/documents/license')
      .set('Authorization', `Bearer ${token}`)
      .send({ dlNumber: 'WB7420220099999', expiresAt: correctedExpiry })
      .expect(400);

    const expiry = new Date(Date.now() + 86_400_000).toISOString();
    const vehicleUpload = await request(app)
      .post('/api/v1/driver/documents/vehicle')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'INSURANCE', fileDataUrl, expiresAt: expiry })
      .expect(201);
    expect(vehicleUpload.body.data).toMatchObject({
      type: 'INSURANCE',
      storageKey: 'driver-kyc/test-license.pdf',
      expiresAt: expiry,
    });
    await request(app)
      .post('/api/v1/driver/documents/vehicle')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'INSURANCE', fileDataUrl, expiresAt: new Date(Date.now() - 86_400_000).toISOString() })
      .expect(400);
    await request(app)
      .post('/api/v1/driver/documents/vehicle')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'DRIVING_LICENSE', fileDataUrl, expiresAt: expiry })
      .expect(400);

    await request(app)
      .post('/api/v1/driver/documents/license')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileDataUrl: 'data:image/png;base64,aGVsbG8=', dlNumber: 'WB7420220012345', expiresAt: correctedExpiry })
      .expect(400);
    await request(app)
      .post('/api/v1/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'DRIVING_LICENSE', storageKey: 'mock/dl.jpg', documentHash: 'a'.repeat(64) })
      .expect(400);
    await request(app)
      .post('/api/v1/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'INSURANCE', storageKey: 'mock/insurance.jpg', documentHash: 'a'.repeat(64) })
      .expect(400);
    await request(app)
      .post('/api/v1/driver/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'GOVERNMENT_ID', storageKey: 'mock/id.jpg', documentHash: 'a'.repeat(64) })
      .expect(400);
    await request(app)
      .post('/api/v1/driver/documents/identity')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileDataUrl: 'data:image/png;base64,aGVsbG8=' })
      .expect(400);
    await request(app)
      .post('/api/v1/driver/documents/license')
      .send({ fileDataUrl, dlNumber: 'WB7420220012345' })
      .expect(401);
  });

  it('executes driver profile and document onboarding over HTTP', async () => {
    const { app, sessionRepo, tokenAdapter } = createTestApp();

    const driverUserId = '018f0a00-0000-7000-8000-000000000001';
    const sessionId = 'session-driver-1';
    await sessionRepo.save({
      id: sessionId,
      userId: driverUserId,
      deviceId: 'dev-1',
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });

    const driverToken = await tokenAdapter.signAccessToken({
      sub: driverUserId,
      sessionId,
      role: 'DRIVER',
    });

    // 1. POST /api/v1/driver/profile
    await request(app)
      .post('/api/v1/driver/profile')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ userId: 'someone-else' })
      .expect(400);
    const profRes = await request(app)
      .post('/api/v1/driver/profile')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        name: 'Priya Sharma',
        dateOfBirth: '1995-05-15',
        gender: 'FEMALE',
        profilePhotoDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=',
      })
      .expect(201);

    expect(profRes.body.success).toBe(true);
    expect(profRes.body.data.status).toBe('PENDING');
    expect(profRes.body.data.userId).toBe(driverUserId);
    expect(profRes.body.data).toMatchObject({
      name: 'Priya Sharma',
      dateOfBirth: '1995-05-15',
      gender: 'FEMALE',
      profilePhotoUrl: 'https://res.cloudinary.com/test/image/upload/driver-profiles/photo.png',
    });
    const personalProfile = await request(app)
      .get('/api/v1/driver/profile/me')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(personalProfile.body.data.driver).toMatchObject({
      name: 'Priya Sharma',
      dateOfBirth: '1995-05-15',
      gender: 'FEMALE',
      profilePhotoUrl: 'https://res.cloudinary.com/test/image/upload/driver-profiles/photo.png',
    });

    // 2. POST /api/v1/driver/application
    const appRes = await request(app)
      .post('/api/v1/driver/application')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);

    expect(appRes.body.success).toBe(true);
    expect(appRes.body.data.status).toBe('DRAFT');
    const applicationId = appRes.body.data.id;

    // 3. POST /api/v1/driver/documents/identity (real Gov ID file)
    const docRes = await request(app)
      .post('/api/v1/driver/documents/identity')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        fileDataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`,
      })
      .expect(201);

    expect(docRes.body.success).toBe(true);
    expect(docRes.body.data).toMatchObject({ type: 'GOVERNMENT_ID' });

    // 4. POST /api/v1/driver/documents/license (real file)
    await request(app)
      .post('/api/v1/driver/documents/license')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        fileDataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`,
        dlNumber: 'WB7420220012345',
        expiresAt: new Date(Date.now() + 86400_000 * 365).toISOString(),
      })
      .expect(201);

    // 5. POST /api/v1/driver/vehicles
    const vehRes = await request(app)
      .post('/api/v1/driver/vehicles')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        vehicleType: 'CAB',
        make: 'Maruti',
        model: 'Dzire',
        registrationNumber: 'WB74AB1234',
        manufactureYear: 2022,
      })
      .expect(201);

    expect(vehRes.body.success).toBe(true);

    // 6. POST /api/v1/driver/application/submit
    await request(app)
      .post('/api/v1/driver/application/submit')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(400);
    for (const type of ['REGISTRATION_CERTIFICATE', 'INSURANCE', 'PERMIT'] as const) {
      await request(app)
        .post('/api/v1/driver/documents/vehicle')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          type,
          fileDataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`,
          expiresAt: new Date(Date.now() + 86400_000 * 365).toISOString(),
        })
        .expect(201);
    }
    const subRes = await request(app)
      .post('/api/v1/driver/application/submit')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(subRes.body.success).toBe(true);
    expect(subRes.body.data.status).toBe('SUBMITTED');

    // 7. Admin Review: POST /api/v1/admin/driver-applications/:id/review
    const adminUserId = '018f0a00-0000-7000-8000-000000000099';
    const adminSessionId = 'session-admin-1';
    await sessionRepo.save({
      id: adminSessionId,
      userId: adminUserId,
      deviceId: 'dev-admin',
      refreshTokenHash: 'hash-admin',
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    });

    const adminToken = await tokenAdapter.signAccessToken({
      sub: adminUserId,
      sessionId: adminSessionId,
      role: 'SUPER_ADMIN',
    });

    const reviewRes = await request(app)
      .post(`/api/v1/admin/driver-applications/${applicationId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'APPROVED',
      })
      .expect(200);

    expect(reviewRes.body.success).toBe(true);
    expect(reviewRes.body.data.status).toBe('APPROVED');

    // 7b. Admin read APIs: list (filterable) and detail with documents
    const listRes = await request(app)
      .get('/api/v1/admin/driver-applications?status=APPROVED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0]).toMatchObject({
      application: { id: applicationId, status: 'APPROVED' },
      vehicle: { registrationNumber: 'WB74AB1234' },
    });
    expect(listRes.body.data[0]).not.toHaveProperty('phoneE164');
    expect(listRes.body.data[0].driver).not.toHaveProperty('alternatePhone');
    expect(listRes.body.data[0].driver).not.toHaveProperty('emergencyContact');

    const emptyRes = await request(app)
      .get('/api/v1/admin/driver-applications?status=REJECTED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(emptyRes.body.data).toEqual([]);

    const detailRes = await request(app)
      .get(`/api/v1/admin/driver-applications/${applicationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detailRes.body.data.documents).toHaveLength(5);
    await request(app)
      .get('/api/v1/admin/driver-applications/does-not-exist')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app)
      .get('/api/v1/admin/driver-applications')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(403);

    // 8. GET /api/v1/driver/profile/me
    const meRes = await request(app)
      .get('/api/v1/driver/profile/me')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.driver.kycStatus).toBe('VERIFIED');
    expect(meRes.body.data.vehicle.verificationStatus).toBe('APPROVED');
  });
});
