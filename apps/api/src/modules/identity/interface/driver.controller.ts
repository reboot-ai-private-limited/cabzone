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
import {
  registerVehicleRequestSchema,
  listDriverApplicationsQuerySchema,
  reviewApplicationRequestSchema,
  uploadDriverDocumentRequestSchema,
} from './kyc.validation.js';

export function makeCreateDriverProfileController(useCase: CreateDriverProfileUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();
    const result = await useCase.execute(req.auth.userId);
    sendSuccess(req, res, result, 'Driver profile initialized', 201);
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
