import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type { AdminAdjustWalletUseCase } from '../application/useCases/adminAdjustWallet.usecase.js';
import type { GetWalletUseCase } from '../application/useCases/getWallet.usecase.js';
import { adminAdjustWalletSchema } from './ledger.validation.js';

const driverIdParamSchema = z.object({ driverId: z.string().uuid() });

export function makeAdminAdjustWalletController(useCase: AdminAdjustWalletUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated('Authentication required.');
    const body = adminAdjustWalletSchema.parse(req.body);
    const result = await useCase.execute({ ...body, adminId: req.auth.userId });
    sendSuccess(req, res, result, 'Wallet adjusted successfully', 201);
  });
}

export function makeAdminGetWalletController(useCase: GetWalletUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { driverId } = driverIdParamSchema.parse(req.params);
    sendSuccess(req, res, await useCase.execute(driverId), 'Wallet retrieved successfully');
  });
}

export function makeMyWalletController(
  useCase: GetWalletUseCase,
  resolveDriverId: (userId: string) => Promise<string | null>,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated('Authentication required.');
    const driverId = await resolveDriverId(req.auth.userId);
    if (!driverId) {
      throw AppError.forbidden('DRIVER_PROFILE_REQUIRED: No driver profile for this account.');
    }
    sendSuccess(req, res, await useCase.execute(driverId), 'Wallet retrieved successfully');
  });
}
