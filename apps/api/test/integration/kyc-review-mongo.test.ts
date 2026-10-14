import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DOCUMENT_TYPES } from '@cabzone/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewDriverApplicationUseCase } from '../../src/modules/identity/application/useCases/reviewDriverApplication.usecase.js';
import { CreateDriverProfileUseCase } from '../../src/modules/identity/application/useCases/createDriverProfile.usecase.js';
import {
  MongoDriverRepository,
  MongoVehicleRepository,
  MongoDriverApplicationRepository,
  MongoDriverDocumentRepository,
  DriverModel,
  VehicleModel,
  DriverApplicationModel,
  DriverDocumentModel,
} from '../../src/modules/identity/infrastructure/index.js';
import { MongoUnitOfWork } from '../../src/shared/db/unitOfWork.js';

describe('Atomic Mongo KYC application review', () => {
  let replSet: MongoMemoryReplSet;
  const driverRepo = new MongoDriverRepository();
  const vehicleRepo = new MongoVehicleRepository();
  const applicationRepo = new MongoDriverApplicationRepository();
  const documentRepo = new MongoDriverDocumentRepository();
  const review = new ReviewDriverApplicationUseCase({
    driverRepo,
    vehicleRepo,
    applicationRepo,
    documentRepo,
    unitOfWork: new MongoUnitOfWork(),
  });
  const approve = {
    applicationId: 'application',
    reviewerAdminId: 'admin-approve',
    status: 'APPROVED' as const,
  };
  const reject = {
    applicationId: 'application',
    reviewerAdminId: 'admin-reject',
    status: 'REJECTED' as const,
    rejectionType: 'HARD_FRAUD' as const,
    rejectionReason: 'Fraudulent documents',
  };

  it('persists personal profile details and uploaded photo through Mongo create and update', async () => {
    const photoUrl = 'https://res.cloudinary.com/test/image/upload/driver-profiles/photo.jpg';
    const createProfile = new CreateDriverProfileUseCase({
      driverRepo,
      photoStorage: { upload: async () => photoUrl },
    });
    const saved = await createProfile.execute({
      userId: 'new-user',
      name: 'Priya Sharma',
      dateOfBirth: '1995-05-15',
      gender: 'FEMALE',
      profilePhotoDataUrl: 'photo',
    });
    expect(await driverRepo.findById(saved.id)).toMatchObject({
      name: 'Priya Sharma',
      dateOfBirth: '1995-05-15',
      gender: 'FEMALE',
      profilePhotoUrl: photoUrl,
    });
    await createProfile.execute({ userId: 'new-user', name: 'Priya Singh' });
    expect(await driverRepo.findByUserId('new-user')).toMatchObject({
      name: 'Priya Singh',
      dateOfBirth: '1995-05-15',
      gender: 'FEMALE',
      profilePhotoUrl: photoUrl,
    });
  });

  beforeAll(async () => {
    const candidates = [
      process.env.MONGOMS_SYSTEM_BINARY,
      resolve(
        process.cwd(),
        '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe',
      ),
      resolve(
        process.cwd(),
        'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe',
      ),
      'C:/Users/zxprg/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe',
    ].filter(Boolean) as string[];
    const systemBinary = candidates.find((path) => existsSync(path));
    replSet = await MongoMemoryReplSet.create({
      ...(systemBinary ? { binary: { systemBinary } } : {}),
      replSet: { count: 1, name: 'rs0' },
    });
    await mongoose.connect(replSet.getUri());
    await Promise.all([
      DriverModel.init(),
      VehicleModel.init(),
      DriverApplicationModel.init(),
      DriverDocumentModel.init(),
    ]);
  }, 60000);

  beforeEach(async () => {
    await Promise.all([
      DriverModel.deleteMany({}),
      VehicleModel.deleteMany({}),
      DriverApplicationModel.deleteMany({}),
      DriverDocumentModel.deleteMany({}),
    ]);
    const now = new Date();
    await driverRepo.create({
      id: 'driver',
      userId: 'user',
      status: 'PENDING',
      kycStatus: 'PENDING',
      operationalStatus: 'OFFLINE',
      ratingAverage: null,
      ratingCount: 0,
      trustScore: null,
      currentVehicleId: 'vehicle',
      walletId: 'wallet',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await vehicleRepo.create({
      id: 'vehicle',
      driverId: 'driver',
      vehicleType: 'CAB',
      make: 'Maruti',
      model: 'Dzire',
      registrationNumber: 'WB7401234',
      color: null,
      manufactureYear: null,
      verificationStatus: 'PENDING',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await applicationRepo.create({
      id: 'application',
      driverId: 'driver',
      status: 'SUBMITTED',
      rejectionType: null,
      rejectionReason: null,
      verificationProvider: null,
      verificationReference: null,
      verificationResult: null,
      reapplyCount: 0,
      submittedAt: now,
      reviewedAt: null,
      reviewerAdminId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    for (const type of DOCUMENT_TYPES) {
      await documentRepo.create({
        id: type,
        driverId: 'driver',
        applicationId: 'application',
        type,
        storageKey: `drivers/driver/${type}`,
        documentHash: `hash-${type}`,
        documentNumberMasked: null,
        issuedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
        verificationStatus: 'PENDING',
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  }, 60000);

  it('allows one competing approval or rejection with matching persisted entity states', async () => {
    const originalFind = applicationRepo.findById.bind(applicationRepo);
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolveRead) => {
      release = resolveRead;
    });
    vi.spyOn(applicationRepo, 'findById').mockImplementation(async (id) => {
      const app = await originalFind(id);
      reads += 1;
      if (reads <= 2) {
        if (reads === 2) release();
        await bothRead;
      }
      return app;
    });
    const results = await Promise.allSettled([review.execute(approve), review.execute(reject)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const app = await originalFind('application');
    const driver = await driverRepo.findById('driver');
    const vehicle = await vehicleRepo.findById('vehicle');
    const docs = await documentRepo.findByApplicationId('application');
    if (app?.status === 'APPROVED') {
      expect(app.reviewerAdminId).toBe('admin-approve');
      expect(driver?.status).toBe('ACTIVE');
      expect(driver?.kycStatus).toBe('VERIFIED');
      expect(vehicle?.verificationStatus).toBe('APPROVED');
      expect(docs.every((doc) => doc.verificationStatus === 'VERIFIED')).toBe(true);
    } else {
      expect(app?.status).toBe('REJECTED');
      expect(app?.reviewerAdminId).toBe('admin-reject');
      expect(driver?.status).toBe('REJECTED');
      expect(driver?.kycStatus).toBe('FAILED');
      expect(vehicle?.verificationStatus).toBe('PENDING');
      expect(docs.every((doc) => doc.verificationStatus === 'PENDING')).toBe(true);
    }
  });

  it('rolls back all changes after a persisted vehicle update fails and allows retry', async () => {
    const originalUpdate = vehicleRepo.update.bind(vehicleRepo);
    vi.spyOn(vehicleRepo, 'update').mockImplementationOnce(async (vehicle) => {
      await originalUpdate(vehicle);
      throw new Error('Injected failure after vehicle write');
    });
    await expect(review.execute(approve)).rejects.toThrow('Injected failure after vehicle write');
    expect((await applicationRepo.findById('application'))?.status).toBe('SUBMITTED');
    expect((await applicationRepo.findById('application'))?.reviewerAdminId).toBeNull();
    expect((await driverRepo.findById('driver'))?.kycStatus).toBe('PENDING');
    expect((await driverRepo.findById('driver'))?.status).toBe('PENDING');
    expect((await vehicleRepo.findById('vehicle'))?.verificationStatus).toBe('PENDING');
    expect(
      (await documentRepo.findByApplicationId('application')).every(
        (doc) => doc.verificationStatus === 'PENDING',
      ),
    ).toBe(true);
    expect((await review.execute(approve)).status).toBe('APPROVED');
    expect((await driverRepo.findById('driver'))?.kycStatus).toBe('VERIFIED');
    expect((await vehicleRepo.findById('vehicle'))?.verificationStatus).toBe('APPROVED');
    expect(
      (await documentRepo.findByApplicationId('application')).every(
        (doc) => doc.verificationStatus === 'VERIFIED',
      ),
    ).toBe(true);
  });

  it('cannot approve an application that has not been submitted', async () => {
    const app = await applicationRepo.findById('application');
    await applicationRepo.update({ ...app!, status: 'DRAFT', submittedAt: null });
    await expect(review.execute(approve)).rejects.toThrow();
    expect((await applicationRepo.findById('application'))?.status).toBe('DRAFT');
    expect((await driverRepo.findById('driver'))?.status).toBe('PENDING');
  });
});
