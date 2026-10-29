import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { logger } from '../../../shared/logging/logger.js';
import type { RideExtensionsUseCase } from '../application/useCases/rideExtensions.usecase.js';
import type { RideHttpContext } from './rides.controller.js';
import { toRideView } from './rides.presenter.js';
import { locationPointSchema } from './rides.validation.js';

export const extensionRequestSchema = z
  .object({
    requestId: z
      .string()
      .min(16)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
    newDrop: locationPointSchema,
  })
  .strict();
export const extensionResponseSchema = z
  .object({ decision: z.enum(['ACCEPT', 'REJECT']) })
  .strict();
export const extensionParamsSchema = z.object({
  id: z.string().uuid(),
  extensionId: z.string().uuid(),
});

export function makeExtensionControllers(
  useCase: RideExtensionsUseCase | null,
  actors: RideHttpContext,
) {
  const propose = asyncHandler(async (req, res) => {
    if (req.auth?.role !== 'RIDER') throw AppError.forbidden('RIDER_REQUIRED');
    const riderId = await actors.resolveRiderId(req.auth.userId);
    if (!riderId) throw AppError.forbidden('RIDER_PROFILE_REQUIRED');
    const rideId = z.string().uuid().parse(req.params.id);
    const body = extensionRequestSchema.parse(req.body);
    if (!useCase) throw AppError.conflict('EXTENSIONS_UNAVAILABLE');
    const ride = await useCase.propose({
      ...body,
      newDrop: { ...body.newDrop, address: body.newDrop.address ?? null },
      rideId,
      riderId,
    });
    try {
      await actors.notifier?.rideUpdated(ride, 'ride.extension.requested');
    } catch {
      logger.warn('extension notification failed');
    }
    sendSuccess(req, res, toRideView(ride), 'Extension proposal recorded');
  });
  const respond = asyncHandler(async (req, res) => {
    if (req.auth?.role !== 'DRIVER') throw AppError.forbidden('DRIVER_REQUIRED');
    const driverId = await actors.resolveDriverId(req.auth.userId);
    if (!driverId) throw AppError.forbidden('DRIVER_PROFILE_REQUIRED');
    const { id: rideId, extensionId } = extensionParamsSchema.parse(req.params);
    const { decision } = extensionResponseSchema.parse(req.body);
    if (!useCase) throw AppError.conflict('EXTENSIONS_UNAVAILABLE');
    const ride = await useCase.respond({ rideId, extensionId, driverId, decision });
    try {
      await actors.notifier?.rideUpdated(
        ride,
        decision === 'ACCEPT' ? 'ride.extended' : 'ride.extension.rejected',
      );
    } catch {
      logger.warn('extension notification failed');
    }
    sendSuccess(req, res, toRideView(ride), 'Extension response recorded');
  });
  return { propose, respond };
}
