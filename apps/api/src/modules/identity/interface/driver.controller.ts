import type { Request, RequestHandler, Response } from 'express';
import { sendSuccess } from '@/shared/http/response.util.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { AppError } from '@/shared/errors/AppError.js';
import type {
  CreateAdminDocumentPreviewUseCase,
  CreateDriverApplicationUseCase,
  CreateDriverProfileUseCase,
  GetDriverProfileUseCase,
  RegisterDriverVehicleUseCase,
  GetDriverApplicationDetailUseCase,
  ListDriverApplicationsUseCase,
  ReviewDriverApplicationUseCase,
  StreamAdminDocumentContentUseCase,
  SubmitDriverApplicationUseCase,
  UpdateDriverStatusUseCase,
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
  createDriverApplicationRequestSchema,
  createDriverProfileRequestSchema,
  registerVehicleRequestSchema,
  listDriverApplicationsQuerySchema,
  reviewApplicationRequestSchema,
  streamDocumentContentQuerySchema,
  updateDriverStatusRequestSchema,
  uploadDriverLicenseFileRequestSchema,
  uploadVehicleDocumentFileRequestSchema,
  uploadIdentityDocumentFileRequestSchema,
} from './kyc.validation.js';

export function makeCreateDriverProfileController(useCase: CreateDriverProfileUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const result = await useCase.execute({
      ...createDriverProfileRequestSchema.parse(req.body ?? {}),
      userId: req.auth.userId,
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
    const parsed = createDriverApplicationRequestSchema.parse(
      req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
    );
    const result = await useCase.execute(req.auth.userId, {
      allowApprovedRenewal: parsed?.renew === true,
    });
    sendSuccess(req, res, result, 'Driver application initialized', 201);
  });
}

export function makeRenewDriverApplicationController(useCase: CreateDriverApplicationUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const result = await useCase.execute(req.auth.userId, {
      allowApprovedRenewal: true,
    });
    sendSuccess(req, res, result, 'Driver renewal application initialized', 201);
  });
}

export function makeUploadDriverDocumentController(_useCase: UploadDriverDocumentUseCase): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    throw AppError.badRequest('Upload document files through their dedicated file endpoint.');
  });
}

export function makeUploadDriverLicenseFileController(useCase: UploadDriverDocumentUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const parsed = uploadDriverLicenseFileRequestSchema.parse(req.body);
    const result = await useCase.executeLicenseFile({ userId: req.auth.userId, ...parsed });
    sendSuccess(req, res, result, 'Driving licence uploaded', 201);
  });
}

export function makeUploadVehicleDocumentFileController(useCase: UploadDriverDocumentUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const parsed = uploadVehicleDocumentFileRequestSchema.parse(req.body);
    const result = await useCase.executeVehicleFile({ userId: req.auth.userId, ...parsed });
    sendSuccess(req, res, result, 'Vehicle document uploaded', 201);
  });
}

export function makeUploadIdentityDocumentFileController(useCase: UploadDriverDocumentUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const parsed = uploadIdentityDocumentFileRequestSchema.parse(req.body);
    const result = await useCase.executeIdentityFile({ userId: req.auth.userId, ...parsed });
    sendSuccess(req, res, result, 'Government ID uploaded', 201);
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
      reviewerRole: req.auth.role,
      ...parsed,
    });
    sendSuccess(req, res, result, 'Driver application reviewed', 200);
  });
}

export function makeListDriverApplicationsController(useCase: ListDriverApplicationsUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = listDriverApplicationsQuerySchema.parse(req.query);
    sendSuccess(
      req,
      res,
      await useCase.execute({
        ...query,
        allowedCityZoneIds: req.adminCityZoneIds,
      }),
      'Driver applications retrieved',
      200,
    );
  });
}

export function makeUpdateDriverStatusController(useCase: UpdateDriverStatusUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) throw AppError.badRequest('Application or Driver ID is required');
    const parsed = updateDriverStatusRequestSchema.parse(req.body);
    const result = await useCase.execute({
      id,
      status: parsed.status,
      actorUserId: req.auth?.userId,
      actorRole: req.auth?.role,
    });
    sendSuccess(
      req,
      res,
      result,
      parsed.status === 'SUSPENDED' ? 'Driver account suspended' : 'Driver account activated',
      200,
    );
  });
}

export function makeGetDriverApplicationController(useCase: GetDriverApplicationDetailUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const applicationId = req.params.id;
    if (!applicationId) throw AppError.badRequest('Application ID is required');
    sendSuccess(req, res, await useCase.execute(applicationId), 'Driver application retrieved', 200);
  });
}

export function makeCreateAdminDocumentPreviewController(
  useCase: CreateAdminDocumentPreviewUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const applicationId = req.params.id;
    const documentId = req.params.documentId;
    if (!applicationId || !documentId) {
      throw AppError.badRequest('Application ID and Document ID are required');
    }
    const result = await useCase.execute({
      applicationOrDriverId: applicationId,
      documentId,
      actorUserId: req.auth.userId,
      actorRole: req.auth.role,
    });
    sendSuccess(req, res, result, 'Short-lived document preview created', 200);
  });
}

export function makeStreamAdminDocumentContentController(
  useCase: StreamAdminDocumentContentUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const documentId = req.params.documentId;
    if (!documentId) throw AppError.badRequest('Document ID is required');
    const query = streamDocumentContentQuerySchema.parse(req.query);
    const content = await useCase.execute({
      documentId,
      expRaw: query.exp,
      sig: query.sig,
    });

    res.setHeader('Content-Type', content.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${content.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    );
    res.status(200).send(content.bytes);
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
  ensureDriverWallet?: ((driverId: string) => Promise<void>) | undefined;
}

export function makeTestApproveDriverController(deps: TestApproveDriverDeps): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const userId = req.auth.userId;
    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

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

    const requiredDocs: {
      type: DriverDocumentEntity['type'];
      storageKey: string;
      hashChar: string;
      masked: string | null;
      needsExpiry: boolean;
      vehicleScoped: boolean;
    }[] = [
      { type: 'GOVERNMENT_ID', storageKey: 'mock/aadhaar.jpg', hashChar: 'a', masked: 'XXXX-XXXX-1234', needsExpiry: false, vehicleScoped: false },
      { type: 'DRIVING_LICENSE', storageKey: 'mock/dl.jpg', hashChar: 'b', masked: 'WB7420220012345', needsExpiry: true, vehicleScoped: false },
      { type: 'REGISTRATION_CERTIFICATE', storageKey: 'mock/rc.jpg', hashChar: 'c', masked: 'WB74AB1234', needsExpiry: true, vehicleScoped: true },
      { type: 'INSURANCE', storageKey: 'mock/ins.jpg', hashChar: 'd', masked: 'POL-998877', needsExpiry: true, vehicleScoped: true },
      { type: 'PERMIT', storageKey: 'mock/permit.jpg', hashChar: 'e', masked: 'PRM-112233', needsExpiry: true, vehicleScoped: true },
    ];

    const existingDocs = await deps.documentRepo.findByApplicationId(application.id);
    for (const spec of requiredDocs) {
      const found = existingDocs.find((d: DriverDocumentEntity) => d.type === spec.type);
      if (!found) {
        await deps.documentRepo.create({
          id: crypto.randomUUID(),
          driverId: driver.id,
          applicationId: application.id,
          vehicleId: spec.vehicleScoped ? vehicle.id : null,
          type: spec.type,
          storageKey: spec.storageKey,
          documentHash: spec.hashChar.repeat(64),
          documentNumberMasked: spec.masked,
          issuedAt: now,
          expiresAt: spec.needsExpiry ? futureExpiry : null,
          verificationStatus: 'VERIFIED',
          verifiedAt: now,
          lastExpiryReminderDays: null,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await deps.documentRepo.update({
          ...found,
          vehicleId: spec.vehicleScoped ? vehicle.id : null,
          expiresAt: spec.needsExpiry && (!found.expiresAt || found.expiresAt <= now) ? futureExpiry : found.expiresAt,
          verificationStatus: 'VERIFIED',
          verifiedAt: now,
          lastExpiryReminderDays: null,
          updatedAt: now,
        });
      }
    }

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

    if (deps.ensureDriverWallet) {
      await deps.ensureDriverWallet(driver.id);
    }

    const allDocs = await deps.documentRepo.findByApplicationId(application.id);

    sendSuccess(
      req,
      res,
      { driver, vehicle, application, documents: allDocs },
      'Driver account approved for testing',
      200,
    );
  });
}
