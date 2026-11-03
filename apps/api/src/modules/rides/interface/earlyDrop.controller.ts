import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { logger } from '../../../shared/logging/logger.js';
import type { EarlyDropUseCase } from '../application/useCases/earlyDrop.usecase.js';
import type { RideHttpContext } from './rides.controller.js';
import { toRideView } from './rides.presenter.js';

const rideIdSchema = z.string().uuid();
export const earlyDropRespondSchema = z.object({ decision: z.enum(['ACCEPT', 'DECLINE']) }).strict();

export function makeEarlyDropControllers(useCase: EarlyDropUseCase, actors: RideHttpContext) {
  const request = asyncHandler(async (req, res) => {
    if (req.auth?.role !== 'RIDER') throw AppError.forbidden('RIDER_REQUIRED');
    const riderId = await actors.resolveRiderId(req.auth.userId);
    if (!riderId) throw AppError.forbidden('RIDER_PROFILE_REQUIRED');
    const rideId = rideIdSchema.parse(req.params.id);
    const ride = await useCase.request({ rideId, riderId });
    try {
      await actors.notifier?.rideUpdated(ride, 'ride.early_drop.requested');
    } catch {
      logger.warn('early drop notification failed');
    }
    sendSuccess(req, res, toRideView(ride), 'Early drop requested; waiting for your driver to confirm');
  });

  const respond = asyncHandler(async (req, res) => {
    if (req.auth?.role !== 'DRIVER') throw AppError.forbidden('DRIVER_REQUIRED');
    const driverId = await actors.resolveDriverId(req.auth.userId);
    if (!driverId) throw AppError.forbidden('DRIVER_PROFILE_REQUIRED');
    const rideId = rideIdSchema.parse(req.params.id);
    const { decision } = earlyDropRespondSchema.parse(req.body);
    const { ride, completed } = await useCase.respond({ rideId, driverId, decision });
    try {
      await actors.notifier?.rideUpdated(
        ride,
        completed ? 'ride.completed' : 'ride.early_drop.declined',
      );
    } catch {
      logger.warn('early drop notification failed');
    }
    sendSuccess(
      req,
      res,
      toRideView(ride),
      completed ? 'Trip ended early; awaiting payment confirmation' : 'Early drop declined',
    );
  });

  return { request, respond };
}
