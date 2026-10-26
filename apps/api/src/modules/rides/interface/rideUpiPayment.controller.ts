import type { RideUpiPaymentUseCase } from '../application/useCases/rideUpiPayment.usecase.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type { RideHttpContext } from './rides.controller.js';
import { rideIdParamSchema, upiPaymentProofSchema } from './rides.validation.js';
import type { RideRepositoryPort } from '../domain/index.js';

export function makeSwitchToCashController(
  useCase: RideUpiPaymentUseCase,
  actors: RideHttpContext,
  rideRepo: RideRepositoryPort,
) {
  return asyncHandler(async (req, res) => {
    const { id } = rideIdParamSchema.parse(req.params);
    if (!req.auth) throw AppError.unauthenticated();
    const role = req.auth.role === 'DRIVER' ? 'DRIVER' : 'RIDER';
    const actorId =
      role === 'DRIVER'
        ? await actors.resolveDriverId(req.auth.userId)
        : await actors.resolveRiderId(req.auth.userId);
    if (!actorId) throw AppError.forbidden('Payment profile required.');
    const state = await useCase.switchToCash(id, { role, id: actorId });
    const ride = await rideRepo.findById(id);
    if (ride)
      await actors.notifier?.rideUpdated(ride, 'ride.payment.method.changed').catch(() => {});
    sendSuccess(req, res, state);
  });
}

export function makeRideUpiController(
  useCase: RideUpiPaymentUseCase,
  actors: RideHttpContext,
  action: 'create' | 'session' | 'verify' | 'status',
) {
  return asyncHandler(async (req, res) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const riderId = req.auth ? await actors.resolveRiderId(req.auth.userId) : null;
    if (!riderId) throw AppError.forbidden('Customer profile required.');
    if (action === 'session') {
      sendSuccess(req, res, await useCase.session(id, riderId));
      return;
    }
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
    else if (ride.status === 'PAYMENT_DISPUTED')
      await actors.notifier?.rideUpdated(ride, 'ride.payment.disputed').catch(() => {});
    sendSuccess(req, res, await useCase.paymentState(id));
  });
}
