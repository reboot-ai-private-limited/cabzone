import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type { ListDriverOffersUseCase } from '../application/useCases/listDriverOffers.usecase.js';
import type { SetDriverStatusUseCase } from '../application/useCases/setDriverStatus.usecase.js';
import type { UpdateDriverLocationUseCase } from '../application/useCases/updateDriverLocation.usecase.js';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const setStatusSchema = z.object({
  status: z.enum(['ONLINE', 'OFFLINE']),
  lat: lat.optional(),
  lng: lng.optional(),
});

export const updateLocationSchema = z.object({
  lat,
  lng,
  heading: z.number().min(0).max(360).nullable().optional(),
  speedMps: z.number().min(0).max(100).nullable().optional(),
});

function userId(req: Request): string {
  if (!req.auth) throw AppError.unauthenticated('Authentication required.');
  return req.auth.userId;
}

export function makeSetStatusController(useCase: SetDriverStatusUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const body = setStatusSchema.parse(req.body);
    const result = await useCase.execute({ userId: userId(req), ...body });
    sendSuccess(req, res, result, `Driver is now ${result.status}`);
  });
}

export function makeUpdateLocationController(useCase: UpdateDriverLocationUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const body = updateLocationSchema.parse(req.body);
    await useCase.execute({ userId: userId(req), ...body });
    sendSuccess(req, res, { ok: true }, 'Location updated');
  });
}

export function makeListOffersController(useCase: ListDriverOffersUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(req, res, await useCase.execute(userId(req)), 'Offers retrieved successfully');
  });
}
