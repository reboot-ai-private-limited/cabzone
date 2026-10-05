import type { Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { AppError } from '../../../shared/errors/AppError.js';
import {
  ADMIN_ROLE_PERMISSIONS,
  type CreateAdminUserUseCase,
  type GetAdminUserDetailUseCase,
  type ListAdminUsersUseCase,
  type UpdateAdminUserStatusUseCase,
  type UpdateAdminUserUseCase,
} from '../application/useCases/index.js';
import {
  adminUserIdParamSchema,
  createAdminUserSchema,
  listAdminUsersQuerySchema,
  updateAdminUserSchema,
  updateAdminUserStatusSchema,
} from './identity.validation.js';

export function makeListAdminUsersController(
  useCase: ListAdminUsersUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = listAdminUsersQuerySchema.parse(req.query);
    const result = await useCase.execute(query);
    sendSuccess(req, res, result, 'Admin users retrieved successfully');
  });
}

export function makeGetAdminUserDetailController(
  useCase: GetAdminUserDetailUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = adminUserIdParamSchema.parse(req.params);
    const admin = await useCase.execute(id);
    sendSuccess(req, res, admin, 'Admin user details retrieved successfully');
  });
}

export function makeCreateAdminUserController(
  useCase: CreateAdminUserUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const body = createAdminUserSchema.parse(req.body);
    const admin = await useCase.execute(body);
    sendSuccess(req, res, admin, 'Admin user created successfully', 201);
  });
}

export function makeUpdateAdminUserController(
  useCase: UpdateAdminUserUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated('Authentication required.');
    const { id } = adminUserIdParamSchema.parse(req.params);
    const body = updateAdminUserSchema.parse(req.body);
    const admin = await useCase.execute(id, req.auth.userId, body);
    sendSuccess(req, res, admin, 'Admin user updated successfully');
  });
}

export function makeUpdateAdminUserStatusController(
  useCase: UpdateAdminUserStatusUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated('Authentication required.');
    const { id } = adminUserIdParamSchema.parse(req.params);
    const body = updateAdminUserStatusSchema.parse(req.body);
    const admin = await useCase.execute(id, req.auth.userId, body);
    sendSuccess(req, res, admin, 'Admin user status updated successfully');
  });
}

export function makeGetAdminRolePermissionsController(): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(req, res, ADMIN_ROLE_PERMISSIONS, 'Admin role permissions retrieved successfully');
  });
}
