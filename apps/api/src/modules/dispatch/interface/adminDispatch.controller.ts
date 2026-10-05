import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { VEHICLE_CATEGORIES } from '@cabzone/contracts';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type { ListFleetDriversUseCase } from '../application/useCases/listFleetDrivers.usecase.js';
import type { SimulateFleetUseCase } from '../application/useCases/simulateFleet.usecase.js';

export const listFleetQuerySchema = z.object({
  vehicleCategory: z.enum(VEHICLE_CATEGORIES).optional(),
  maxAgeMs: z.coerce.number().positive().optional(),
});

export const simulateFleetBodySchema = z.object({
  enabled: z.boolean().optional(),
  action: z.enum(['seed', 'clear']).optional(),
});

export function makeListFleetController(useCase: ListFleetDriversUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = listFleetQuerySchema.parse(req.query);
    const result = await useCase.execute(query);
    sendSuccess(req, res, result, 'Fleet retrieved successfully');
  });
}

export function makeSimulateFleetController(useCase: SimulateFleetUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const body = simulateFleetBodySchema.parse(req.body ?? {});
    const result = await useCase.execute(body);
    sendSuccess(
      req,
      res,
      result,
      result.simulated ? `Simulated ${result.count} drivers in Siliguri` : 'Cleared simulated drivers',
    );
  });
}
