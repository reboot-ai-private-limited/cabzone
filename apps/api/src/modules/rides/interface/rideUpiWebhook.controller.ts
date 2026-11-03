import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { getRawBody } from '../../../shared/http/rawBody.js';
import type { RideQrPaymentUseCase } from '../application/useCases/rideQrPayment.usecase.js';
import type { RideUpiPaymentUseCase } from '../application/useCases/rideUpiPayment.usecase.js';
import type { RideHttpContext } from './rides.controller.js';

export function makeRideUpiWebhook(
  payment: RideUpiPaymentUseCase,
  actors: RideHttpContext,
  secret?: string,
  qrPayment?: RideQrPaymentUseCase,
) {
  return asyncHandler(async (req, res) => {
    const raw = getRawBody(req);
    const signature = req.get('x-razorpay-signature') ?? '';
    if (!secret || !raw || !/^[a-f0-9]{64}$/.test(signature)) {
      throw AppError.forbidden('Invalid payment notification.');
    }
    const expected = createHmac('sha256', secret).update(raw).digest();
    const supplied = Buffer.from(signature, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
      throw AppError.forbidden('Invalid payment notification.');
    }

    let event: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON object');
      }
      event = parsed as Record<string, unknown>;
    } catch {
      throw AppError.badRequest('Malformed payment notification payload.');
    }

    const eventType = typeof event.event === 'string' ? event.event : 'unknown';
    const razorpayEventId = req.get('x-razorpay-event-id')?.trim() || undefined;

    if (qrPayment && razorpayEventId && (await qrPayment.hasWebhookEvent(razorpayEventId))) {
      res.sendStatus(200);
      return;
    }

    // Record only successful processing so a transient failure remains retryable.
    const acknowledge = async () => {
      await qrPayment?.registerWebhookEvent({
        eventId: razorpayEventId,
        eventType,
        rawBody: raw,
        payload: event,
      });
      res.sendStatus(200);
    };

    if (eventType === 'qr_code.closed') {
      const qrEntity = (
        event.payload as
          { qr_code?: { entity?: { id?: unknown; close_reason?: unknown } } } | undefined
      )?.qr_code?.entity;
      const qrId = typeof qrEntity?.id === 'string' ? qrEntity.id : null;
      const closeReason = typeof qrEntity?.close_reason === 'string' ? qrEntity.close_reason : null;
      if (qrPayment && qrId) {
        await qrPayment.handleWebhookClosed({ gatewayRef: qrId, closeReason });
      }
      await acknowledge();
      return;
    }

    if (eventType !== 'qr_code.credited') {
      // Always acknowledge authentic unhandled events with 200 so Razorpay does not redeliver them.
      await acknowledge();
      return;
    }

    const payloadObj = event.payload as
      | {
          qr_code?: {
            entity?: {
              id?: unknown;
              payments_amount_received?: unknown;
              notes?: Record<string, unknown>;
            };
          };
          payment?: {
            entity?: {
              id?: unknown;
              amount?: unknown;
            };
          };
        }
      | undefined;

    const qrEntity = payloadObj?.qr_code?.entity;
    const paymentEntity = payloadObj?.payment?.entity;
    const qrId = typeof qrEntity?.id === 'string' ? qrEntity.id : null;

    if (qrPayment && qrId) {
      const existingPayment = await qrPayment.findPaymentByGatewayRef(qrId);
      if (existingPayment) {
        const providerPaymentId =
          typeof paymentEntity?.id === 'string' ? paymentEntity.id : `pay_qr_${qrId}`;
        const creditedAmountPaise =
          typeof paymentEntity?.amount === 'number'
            ? paymentEntity.amount
            : typeof qrEntity?.payments_amount_received === 'number'
              ? qrEntity.payments_amount_received
              : undefined;
        const credited = await qrPayment.handleWebhookCredited({
          gatewayRef: qrId,
          providerPaymentId,
          creditedAmountPaise,
        });
        // A credit that did not settle the ride must be retried, not acknowledged. A wrong-amount
        // credit is the exception: retrying cannot fix it, so it is alerted for refund review.
        if (!credited.captured && !credited.mismatch) {
          throw AppError.conflict('Payment verification is pending. Retry this notification.');
        }
        await acknowledge();
        return;
      }
    }

    // Legacy fallback for RideUpiPaymentUseCase intent sessions
    const qr = z
      .object({
        id: z.string().regex(/^qr_[a-zA-Z0-9_]+$/),
        notes: z.object({ rideId: z.string().uuid() }),
      })
      .parse(qrEntity);
    const ride = await payment.reconcileQrWebhook(qr.notes.rideId, qr.id);
    if (ride.status === 'PAYMENT_DISPUTED') {
      await actors.notifier?.rideUpdated(ride, 'ride.payment.disputed').catch(() => {});
      await acknowledge();
      return;
    }
    if (ride.status !== 'SETTLED') {
      throw AppError.conflict('Payment verification is pending. Retry this notification.');
    }
    await actors.notifier?.rideUpdated(ride, 'ride.payment.confirmed').catch(() => {});
    await acknowledge();
  });
}
