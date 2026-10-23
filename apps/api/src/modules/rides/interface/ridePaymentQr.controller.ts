import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { AppError } from '../../../shared/errors/AppError.js';
import type { RideRepositoryPort } from '../domain/index.js';
import type { RidePaymentQrPort } from '../domain/ridePaymentQr.port.js';
import type { RideUpiPaymentUseCase } from '../application/useCases/rideUpiPayment.usecase.js';
import type { RideHttpContext } from './rides.controller.js';
import { rideIdParamSchema, upiPaymentProofSchema } from './rides.validation.js';
import { rideCheckoutHtml } from './rideCheckout.html.js';

export function makeRidePaymentQrControllers(deps: {
  rideRepo: RideRepositoryPort;
  payment: RideUpiPaymentUseCase;
  qr: RidePaymentQrPort;
  actors: RideHttpContext;
}) {
  const { rideRepo, payment, qr, actors } = deps;
  const notifyPaid = async (ride: Awaited<ReturnType<RideUpiPaymentUseCase['reconcile']>>) => {
    if (ride.status === 'SETTLED')
      await actors.notifier?.rideUpdated(ride, 'ride.payment.confirmed').catch(() => {});
  };
  const driverAction = (action: 'qr' | 'status') =>
    asyncHandler(async (req, res) => {
      const { id } = rideIdParamSchema.parse(req.params);
      const driverId = req.auth ? await actors.resolveDriverId(req.auth.userId) : null;
      const ride = await rideRepo.findById(id);
      if (!driverId || !ride || ride.driverId !== driverId)
        throw AppError.notFound('Ride not found.');
      const current = await payment.reconcile(id, ride.bookerRiderId);
      await notifyPaid(current);
      if (current.status === 'SETTLED' || action === 'status') {
        sendSuccess(req, res, { paid: current.status === 'SETTLED' });
        return;
      }
      const checkout = await payment.create(id, ride.bookerRiderId);
      const image = await qr.issue(id, checkout.orderId, `${req.protocol}://${req.get('host')}`);
      sendSuccess(req, res, {
        paid: false,
        ...image,
        amountPaise: checkout.amountPaise,
        testMode: true,
      });
    });
  const publicAction = (action: 'session' | 'verify' | 'status') =>
    asyncHandler(async (req, res) => {
      const { ticket } = z.object({ ticket: z.string().min(1).max(2048) }).parse(req.body);
      const scope = await qr.read(ticket);
      const ride = await rideRepo.findById(scope.rideId);
      if (!ride) throw AppError.notFound('Ride not found.');
      const proof =
        action === 'verify'
          ? upiPaymentProofSchema.parse({
              orderId: req.body.orderId,
              paymentId: req.body.paymentId,
              signature: req.body.signature,
            })
          : undefined;
      if (proof && proof.orderId !== scope.orderId)
        throw AppError.badRequest('Payment does not match this QR.');
      const current = await payment.reconcile(ride.id, ride.bookerRiderId, proof);
      await notifyPaid(current);
      if (action === 'session' && current.status === 'PAYMENT_PENDING') {
        const checkout = await payment.create(ride.id, ride.bookerRiderId);
        if (checkout.orderId !== scope.orderId)
          throw AppError.badRequest('Payment QR is no longer valid.');
        sendSuccess(req, res, { paid: false, checkout });
        return;
      }
      sendSuccess(req, res, { paid: current.status === 'SETTLED' });
    });
  return {
    driverQr: driverAction('qr'),
    driverStatus: driverAction('status'),
    session: publicAction('session'),
    verify: publicAction('verify'),
    status: publicAction('status'),
    page: asyncHandler(async (_req, res) => {
      const nonce = randomBytes(18).toString('base64');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'nonce-${nonce}' https://*.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.razorpay.com; frame-src https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
      );
      res.type('html').send(rideCheckoutHtml(nonce));
    }),
  };
}
