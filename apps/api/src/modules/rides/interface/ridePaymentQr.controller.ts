import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { AppError } from '../../../shared/errors/AppError.js';
import type { RideEntity, RideRepositoryPort } from '../domain/index.js';
import type { RidePaymentQrPort } from '../domain/ridePaymentQr.port.js';
import type { RideQrPaymentUseCase } from '../application/useCases/rideQrPayment.usecase.js';
import type { RideUpiPaymentUseCase } from '../application/useCases/rideUpiPayment.usecase.js';
import type { RideHttpContext } from './rides.controller.js';
import { toRideView } from './rides.presenter.js';
import { rideIdParamSchema, upiPaymentProofSchema } from './rides.validation.js';
import { rideCheckoutHtml } from './rideCheckout.html.js';

async function formatRide(ride: RideEntity, actors: RideHttpContext) {
  if (!ride.driverId || !actors.resolveAssignedDriver) {
    return toRideView(ride, null);
  }
  try {
    const assigned = await actors.resolveAssignedDriver(ride.driverId, ride.vehicleId);
    return toRideView(ride, assigned);
  } catch {
    return toRideView(ride, null);
  }
}

export function makeRidePaymentQrControllers(deps: {
  rideRepo: RideRepositoryPort;
  payment: RideUpiPaymentUseCase;
  qr: RidePaymentQrPort;
  actors: RideHttpContext;
  qrPayment?: RideQrPaymentUseCase | undefined;
}) {
  const { rideRepo, payment, qr, actors, qrPayment } = deps;
  const notifyPaid = async (ride: Awaited<ReturnType<RideUpiPaymentUseCase['reconcile']>>) => {
    if (ride.status === 'SETTLED')
      await actors.notifier?.rideUpdated(ride, 'ride.payment.confirmed').catch(() => {});
  };

  const driverQrSheetAction = (mode: 'create' | 'poll') =>
    asyncHandler(async (req, res) => {
      if (!qrPayment) {
        throw AppError.badRequest('UPI QR collection is not enabled.');
      }
      const { id } = rideIdParamSchema.parse(req.params);
      const driverId = req.auth ? await actors.resolveDriverId(req.auth.userId) : null;
      if (!driverId) {
        throw AppError.forbidden('Driver profile required.');
      }
      const result =
        mode === 'create'
          ? await qrPayment.createOrGet(id, driverId)
          : await qrPayment.poll(id, driverId);
      sendSuccess(req, res, {
        ride: await formatRide(result.ride, actors),
        qr: result.qr,
      });
    });

  const driverAction = (action: 'qr' | 'status') =>
    asyncHandler(async (req, res) => {
      const { id } = rideIdParamSchema.parse(req.params);
      const driverId = req.auth ? await actors.resolveDriverId(req.auth.userId) : null;
      const ride = await rideRepo.findById(id);
      if (!driverId || !ride || ride.driverId !== driverId)
        throw AppError.notFound('Ride not found.');
      const current = await payment.reconcile(id, ride.bookerRiderId);
      await notifyPaid(current);
      const state = await payment.paymentState(id);
      if (
        current.status === 'SETTLED' ||
        action === 'status' ||
        state.method === 'CASH' ||
        state.requiresReview
      ) {
        sendSuccess(req, res, state);
        return;
      }
      if (payment.live) {
        const session = await payment.session(id, ride.bookerRiderId);
        if (session.kind !== 'intent') throw AppError.badRequest('UPI QR is unavailable.');
        sendSuccess(req, res, {
          paid: false,
          imageDataUrl: session.imageDataUrl,
          expiresAt: session.expiresAt,
          amountPaise: session.amountPaise,
          testMode: false,
        });
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
      const state = await payment.paymentState(ride.id);
      if (state.method === 'CASH' || state.requiresReview) {
        throw AppError.conflict(
          state.requiresReview
            ? 'Payment needs support review. Please do not pay again.'
            : 'Cash selected. Pay your driver directly; this checkout is closed.',
        );
      }
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
    driverCreatePaymentQr: driverQrSheetAction('create'),
    driverPollPaymentQr: driverQrSheetAction('poll'),
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
