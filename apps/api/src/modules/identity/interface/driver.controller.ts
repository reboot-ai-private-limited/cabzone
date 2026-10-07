import type { Request, RequestHandler, Response } from 'express';
import { sendSuccess } from '@/shared/http/response.util.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { AppError } from '@/shared/errors/AppError.js';
import type {
  CreateDriverApplicationUseCase,
  CreateDriverProfileUseCase,
  GetDriverProfileUseCase,
  RegisterDriverVehicleUseCase,
  GetDriverApplicationDetailUseCase,
  ListDriverApplicationsUseCase,
  ReviewDriverApplicationUseCase,
  SubmitDriverApplicationUseCase,
  UploadDriverDocumentUseCase,
} from '../application/useCases/index.js';
import type {
  DriverApplicationRepositoryPort,
  DriverDocumentEntity,
  DriverDocumentRepositoryPort,
  DriverRepositoryPort,
  VehicleRepositoryPort,
} from '../domain/index.js';
import {
  registerVehicleRequestSchema,
  listDriverApplicationsQuerySchema,
  reviewApplicationRequestSchema,
  uploadDriverDocumentRequestSchema,
} from './kyc.validation.js';

export function makeCreateDriverProfileController(useCase: CreateDriverProfileUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const result = await useCase.execute({
      userId: req.auth.userId,
      ...(req.body || {}),
    });
    sendSuccess(req, res, result, 'Driver profile saved', 201);
  });
}

export function makeGetDriverProfileController(useCase: GetDriverProfileUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const result = await useCase.execute(req.auth.userId);
    sendSuccess(req, res, result, 'Driver profile retrieved', 200);
  });
}

export function makeCreateDriverApplicationController(useCase: CreateDriverApplicationUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const result = await useCase.execute(req.auth.userId);
    sendSuccess(req, res, result, 'Driver application initialized', 201);
  });
}

export function makeUploadDriverDocumentController(useCase: UploadDriverDocumentUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const parsed = uploadDriverDocumentRequestSchema.parse(req.body);
    const result = await useCase.execute({
      userId: req.auth.userId,
      ...parsed,
    });
    sendSuccess(req, res, result, 'Driver document uploaded', 201);
  });
}

export function makeRegisterDriverVehicleController(useCase: RegisterDriverVehicleUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const parsed = registerVehicleRequestSchema.parse(req.body);
    const result = await useCase.execute({
      userId: req.auth.userId,
      ...parsed,
    });
    sendSuccess(req, res, result, 'Vehicle registered', 201);
  });
}

export function makeSubmitDriverApplicationController(useCase: SubmitDriverApplicationUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const result = await useCase.execute(req.auth.userId);
    sendSuccess(req, res, result, 'Driver application submitted', 200);
  });
}

export function makeReviewDriverApplicationController(useCase: ReviewDriverApplicationUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const parsed = reviewApplicationRequestSchema.parse(req.body);
    const applicationId = req.params.id;
    if (!applicationId) throw AppError.badRequest('Application ID is required');

    const result = await useCase.execute({
      applicationId,
      reviewerAdminId: req.auth.userId,
      ...parsed,
    });
    sendSuccess(req, res, result, 'Driver application reviewed', 200);
  });
}

export function makeListDriverApplicationsController(useCase: ListDriverApplicationsUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = listDriverApplicationsQuerySchema.parse(req.query);
    sendSuccess(req, res, await useCase.execute(query), 'Driver applications retrieved', 200);
  });
}

export function makeGetDriverApplicationController(useCase: GetDriverApplicationDetailUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const applicationId = req.params.id;
    if (!applicationId) throw AppError.badRequest('Application ID is required');
    sendSuccess(req, res, await useCase.execute(applicationId), 'Driver application retrieved', 200);
  });
}

export interface TestApproveDriverDeps {
  driverRepo: DriverRepositoryPort;
  vehicleRepo: VehicleRepositoryPort;
  applicationRepo: DriverApplicationRepositoryPort;
  documentRepo: DriverDocumentRepositoryPort;
  createDriverProfileUseCase: CreateDriverProfileUseCase;
  createDriverApplicationUseCase: CreateDriverApplicationUseCase;
  registerDriverVehicleUseCase: RegisterDriverVehicleUseCase;
  uploadDriverDocumentUseCase: UploadDriverDocumentUseCase;
}

export function makeTestApproveDriverController(deps: TestApproveDriverDeps): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const userId = req.auth.userId;

    let driver = await deps.driverRepo.findByUserId(userId);
    if (!driver) {
      driver = await deps.createDriverProfileUseCase.execute({
        userId,
        name: 'Dev Driver',
        gender: 'MALE',
        dateOfBirth: '1995-05-15',
        address: 'Siliguri, West Bengal',
        dlNumber: 'WB7420220012345',
      });
    }

    let application = await deps.applicationRepo.findByDriverId(driver.id);
    if (!application) {
      application = await deps.createDriverApplicationUseCase.execute(userId);
    }

    let vehicle = driver.currentVehicleId ? await deps.vehicleRepo.findById(driver.currentVehicleId) : null;
    if (!vehicle) {
      vehicle = await deps.registerDriverVehicleUseCase.execute({
        userId,
        vehicleType: 'CAB',
        make: 'Maruti Suzuki',
        model: 'Dzire Tour',
        registrationNumber: 'WB74AB1234',
        color: 'White',
        manufactureYear: 2022,
      });
    }

    const docs = await deps.documentRepo.findByApplicationId(application.id);
    if (!docs.some((d: DriverDocumentEntity) => d.type === 'GOVERNMENT_ID')) {
      await deps.uploadDriverDocumentUseCase.execute({
        userId,
        type: 'GOVERNMENT_ID',
        storageKey: 'mock/aadhaar.jpg',
        documentHash: 'a'.repeat(64),
        documentNumberMasked: 'XXXX-XXXX-1234',
      });
    }
    if (!docs.some((d: DriverDocumentEntity) => d.type === 'DRIVING_LICENSE')) {
      await deps.uploadDriverDocumentUseCase.execute({
        userId,
        type: 'DRIVING_LICENSE',
        storageKey: 'mock/dl.jpg',
        documentHash: 'b'.repeat(64),
        documentNumberMasked: 'WB7420220012345',
      });
    }

    const now = new Date();
    await deps.applicationRepo.update({
      ...application,
      status: 'APPROVED',
      rejectionType: null,
      rejectionReason: null,
      reviewedAt: now,
      reviewerAdminId: '01900000-0000-7000-8000-000000000001',
    });

    driver = await deps.driverRepo.update({
      ...driver,
      name: driver.name || 'Verified Driver',
      kycStatus: 'VERIFIED',
      status: 'ACTIVE',
      currentVehicleId: vehicle.id,
      updatedAt: now,
    });

    await deps.vehicleRepo.update({
      ...vehicle,
      verificationStatus: 'APPROVED',
      updatedAt: now,
    });

    const allDocs = await deps.documentRepo.findByApplicationId(application.id);
    for (const d of allDocs) {
      await deps.documentRepo.update({
        ...d,
        verificationStatus: 'VERIFIED',
        verifiedAt: now,
      });
    }

    sendSuccess(
      req,
      res,
      { driver, vehicle, application, documents: allDocs },
      'Driver account approved for testing',
      200,
    );
  });
}
