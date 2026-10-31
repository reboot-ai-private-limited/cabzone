import type { Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { AppError } from '../../../shared/errors/AppError.js';
import type {
  GetRiderDetailUseCase,
  GetRiderProfileUseCase,
  ListRidersUseCase,
  UpdateRiderProfileUseCase,
  UpdateRiderStatusUseCase,
  UpdateSelfRiderProfileUseCase,
} from '../application/useCases/index.js';
import {
  adminUpdateRiderProfileSchema,
  listRidersQuerySchema,
  riderIdParamSchema,
  updateRiderProfileSchema,
  updateRiderStatusSchema,
} from './identity.validation.js';

export function makeGetRiderProfileController(
  useCase: GetRiderProfileUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated('Authentication required.');
    const profile = await useCase.execute(req.auth.userId);
    sendSuccess(req, res, profile, 'Rider profile retrieved successfully');
  });
}

export function makeUpdateSelfRiderProfileController(
  useCase: UpdateSelfRiderProfileUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated('Authentication required.');
    const body = updateRiderProfileSchema.parse(req.body);
    const profile = await useCase.execute(req.auth.userId, body);
    sendSuccess(req, res, profile, 'Rider profile updated successfully');
  });
}

export function makeListRidersController(
  useCase: ListRidersUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = listRidersQuerySchema.parse(req.query);
    const result = await useCase.execute(query);
    sendSuccess(req, res, result, 'Riders retrieved successfully');
  });
}

export function makeGetRiderDetailController(
  useCase: GetRiderDetailUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = riderIdParamSchema.parse(req.params);
    const rider = await useCase.execute(id);
    sendSuccess(req, res, rider, 'Rider retrieved successfully');
  });
}

export function makeUpdateRiderStatusController(
  useCase: UpdateRiderStatusUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = riderIdParamSchema.parse(req.params);
    const { status } = updateRiderStatusSchema.parse(req.body);
    const updated = await useCase.execute(id, status);
    sendSuccess(req, res, updated, `Rider status updated to ${status}`);
  });
}

export function makeAdminUpdateRiderProfileController(
  useCase: UpdateRiderProfileUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = riderIdParamSchema.parse(req.params);
    const body = adminUpdateRiderProfileSchema.parse(req.body);
    const updated = await useCase.execute(id, body);
    sendSuccess(req, res, updated, 'Rider profile updated successfully');
  });
}
