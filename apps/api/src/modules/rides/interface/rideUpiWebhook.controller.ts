import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { getRawBody } from '../../../shared/http/rawBody.js';
import type { RideUpiPaymentUseCase } from '../application/useCases/rideUpiPayment.usecase.js';
import type { RideHttpContext } from './rides.controller.js';

export function makeRideUpiWebhook(
  payment: RideUpiPaymentUseCase,
  actors: RideHttpContext,
  secret?: string,
) {
  return asyncHandler(async (req, res) => {
    const raw = getRawBody(req);
    const signature = req.get('x-razorpay-signature') ?? '';
    if (!secret || !raw || !/^[a-f0-9]{64}$/.test(signature))
      throw AppError.forbidden('Invalid payment notification.');
    const expected = createHmac('sha256', secret).update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw AppError.forbidden('Invalid payment notification.');
    const event = JSON.parse(raw);
    if (event.event !== 'qr_code.credited') {
      res.sendStatus(200);
      return;
    }
    const qr = z
      .object({
        id: z.string().regex(/^qr_[a-zA-Z0-9]+$/),
        notes: z.object({ rideId: z.string().uuid() }),
      })
      .parse(event.payload?.qr_code?.entity);
    const ride = await payment.reconcileQrWebhook(qr.notes.rideId, qr.id);
    if (ride.status === 'PAYMENT_DISPUTED') {
      await actors.notifier?.rideUpdated(ride, 'ride.payment.disputed').catch(() => {});
      res.sendStatus(200);
      return;
    }
    if (ride.status !== 'SETTLED')
      throw AppError.conflict('Payment verification is pending. Retry this notification.');
    await actors.notifier?.rideUpdated(ride, 'ride.payment.confirmed').catch(() => {});
    res.sendStatus(200);
  });
}
