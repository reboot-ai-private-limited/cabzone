import type { RideUpiPaymentUseCase } from '../application/useCases/rideUpiPayment.usecase.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type { RideHttpContext } from './rides.controller.js';
import { rideIdParamSchema, upiPaymentProofSchema } from './rides.validation.js';

export function makeRideUpiController(
  useCase: RideUpiPaymentUseCase,
  actors: RideHttpContext,
  action: 'create' | 'verify' | 'status',
) {
  return asyncHandler(async (req, res) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const riderId = req.auth ? await actors.resolveRiderId(req.auth.userId) : null;
    if (!riderId) throw AppError.forbidden('Customer profile required.');
    if (action === 'create') {
      const checkout = await useCase.create(id, riderId);
      sendSuccess(req, res, checkout);
      return;
    }
    const ride = await useCase.reconcile(
      id,
      riderId,
      action === 'verify' ? upiPaymentProofSchema.parse(req.body) : undefined,
    );
    if (ride.status === 'SETTLED')
      await actors.notifier?.rideUpdated(ride, 'ride.payment.confirmed').catch(() => {});
    sendSuccess(req, res, { paid: ride.status === 'SETTLED' });
  });
}
