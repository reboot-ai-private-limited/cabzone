import { createHash } from 'node:crypto';
import type {
  QrPaymentClientState,
  RidePaymentQrLineDto,
  RidePaymentQrViewDto,
  RideStatus,
  RideUpiIntentDto,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import { logger } from '../../../../shared/logging/logger.js';
import { emitOperationalAlert } from '../../../../shared/monitoring/alerting.js';
import { collectableArrearsPaise } from '../collectableArrears.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { saveRideTransition } from '../rideTransition.js';
import {
  calculateNewBalance,
  type PaymentEntity,
  type PaymentRepositoryPort,
  type WalletEntity,
  type WalletRepositoryPort,
} from '../../../ledger/ledger.public.js';
import type {
  RideEntity,
  RideEventRepositoryPort,
  RideRepositoryPort,
} from '../../domain/index.js';
import type { QrPaymentGatewayPort } from '../../domain/qrPaymentGateway.port.js';

const QR_EXPIRY_SECONDS = 15 * 60; // 15 minutes in unix seconds
const POLL_GATEWAY_MIN_INTERVAL_MS = 3_000; // Rate-limit gateway polls to once per ~3s per payment
const SCRUBBED_WEBHOOK_KEYS = new Set(['contact', 'vpa', 'email', 'customer_details']);
const DRIVER_QR_ELIGIBLE_STATUSES: readonly RideStatus[] = [
  'PAYMENT_PENDING',
  'PAYMENT_CASH_CLAIMED',
];
const QR_CAPTURE_ELIGIBLE_STATUSES: readonly RideStatus[] = [
  'PAYMENT_PENDING',
  'PAYMENT_CASH_CLAIMED',
  'PAYMENT_UNPAID',
];

function scrubWebhookPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubWebhookPayload);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SCRUBBED_WEBHOOK_KEYS.has(k)) continue;
      out[k] = scrubWebhookPayload(v);
    }
    return out;
  }
  return value;
}

export interface RideQrPaymentResult {
  ride: RideEntity;
  qr: RidePaymentQrViewDto;
}

type QrActor = { role: 'DRIVER'; id: string } | { role: 'RIDER' };

export class RideQrPaymentUseCase {
  private readonly inFlightCreates = new Map<string, Promise<PaymentEntity>>();
  private readonly inFlightCaptureEffects = new Map<string, Promise<RideEntity>>();

  constructor(
    private readonly deps: {
      rideRepo: RideRepositoryPort;
      rideEventRepo: RideEventRepositoryPort;
      paymentRepo: PaymentRepositoryPort;
      walletRepo: WalletRepositoryPort;
      unitOfWork: UnitOfWorkPort;
      gateway: QrPaymentGatewayPort;
      clock?: () => Date;
      /** Closes the rider-side (legacy) QR at the provider once a driver QR settles the ride. */
      closeLegacyQrSession?: (rideId: string) => Promise<void>;
      onRideSettled?: (
        ride: RideEntity,
        event: 'ride.payment.confirmed' | 'ride.payment.disputed',
      ) => Promise<void>;
    },
  ) {}

  private now(): Date {
    return this.deps.clock ? this.deps.clock() : new Date();
  }

  private async computeRideBreakdown(ride: RideEntity): Promise<{
    farePaise: number;
    arrearsPaise: number;
    amountPaise: number;
    lines: RidePaymentQrLineDto[];
  }> {
    const farePaise = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
    if (!Number.isSafeInteger(farePaise) || farePaise < 100) {
      throw AppError.badRequest('Ride fare must be at least ₹1 (100 paise).');
    }
    const arrearsPaise = collectableArrearsPaise(
      ride,
      await this.deps.walletRepo.findByRiderId(ride.bookerRiderId),
    );
    const amountPaise = farePaise + arrearsPaise;
    if (!Number.isSafeInteger(amountPaise)) {
      throw AppError.badRequest('Ride payment amount is invalid.');
    }
    const lines: RidePaymentQrLineDto[] = [{ label: 'Trip fare', amountPaise: farePaise }];
    if (arrearsPaise > 0) {
      lines.push({ label: 'Prior cancellation fee', amountPaise: arrearsPaise });
    }
    return { farePaise, arrearsPaise, amountPaise, lines };
  }

  private extractLines(
    payment: PaymentEntity | null,
    fallbackLines: RidePaymentQrLineDto[],
  ): RidePaymentQrLineDto[] {
    const raw = payment?.metadata?.lines;
    if (Array.isArray(raw) && raw.length > 0) {
      const valid = raw.filter(
        (item): item is RidePaymentQrLineDto =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as { label?: unknown }).label === 'string' &&
          typeof (item as { amountPaise?: unknown }).amountPaise === 'number',
      );
      if (valid.length > 0) return valid;
    }
    return fallbackLines;
  }

  mapToClientState(payment: PaymentEntity | null, now: Date): QrPaymentClientState {
    if (!payment) return 'NONE';
    if (payment.status === 'CAPTURED' || payment.status === 'CONFIRMED') return 'PAID';
    if (payment.status === 'FAILED') return 'EXPIRED';
    if (payment.status === 'PENDING' || payment.status === 'CREATED') {
      if (payment.qr && payment.qr.expiresAt.getTime() <= now.getTime()) {
        return 'EXPIRED';
      }
      return 'PENDING';
    }
    return 'EXPIRED';
  }

  private toQrView(
    payment: PaymentEntity | null,
    fallbackAmountPaise: number,
    fallbackLines: RidePaymentQrLineDto[],
    now: Date,
    overrideState?: QrPaymentClientState,
  ): RidePaymentQrViewDto {
    const state = overrideState ?? this.mapToClientState(payment, now);
    const amountPaise = payment?.amountPaise ?? fallbackAmountPaise;
    const lines = this.extractLines(payment, fallbackLines);
    const showQrMedia = state === 'PENDING' && payment?.qr != null;
    return {
      state,
      upiUri: showQrMedia ? (payment?.qr?.upiUri ?? null) : null,
      imageUrl: showQrMedia ? (payment?.qr?.imageUrl ?? null) : null,
      expiresAt: payment?.qr?.expiresAt ? payment.qr.expiresAt.toISOString() : null,
      amountPaise,
      lines,
    };
  }

  private async requireAssignedDriverRide(rideId: string, driverId: string): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(rideId);
    if (!ride || ride.driverId !== driverId) {
      throw AppError.notFound('Ride not found.');
    }
    return ride;
  }

  private async cashCollected(rideId: string): Promise<boolean> {
    const events = await this.deps.rideEventRepo.findByRideId(rideId);
    return events.some(
      (event) => event.eventType === 'PAYMENT_CONFIRMED' && event.metadata.method === 'CASH',
    );
  }

  private async cashSelected(rideId: string): Promise<boolean> {
    const events = await this.deps.rideEventRepo.findByRideId(rideId);
    const latest = [...events].reverse().find((e) => e.eventType === 'PAYMENT_METHOD_CHANGED');
    return latest?.metadata.method === 'CASH';
  }

  private async clearCashSelectionForQr(ride: RideEntity, driverId: string): Promise<RideEntity> {
    if (!(await this.cashSelected(ride.id))) return ride;
    return this.deps.unitOfWork.run(async () => {
      const fresh = await this.deps.rideRepo.findById(ride.id);
      if (!fresh || !DRIVER_QR_ELIGIBLE_STATUSES.includes(fresh.status)) return fresh ?? ride;
      if (!(await this.cashSelected(ride.id))) return fresh;
      const now = this.now();
      const updated = await saveRideTransition(
        this.deps.rideRepo,
        { ...fresh, version: fresh.version + 1, updatedAt: now },
        fresh.version,
      );
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'PAYMENT_METHOD_CHANGED',
        actorType: 'DRIVER',
        actorId: driverId,
        previousStatus: fresh.status,
        newStatus: fresh.status,
        metadata: { method: 'UPI', previousMethod: 'CASH' },
        createdAt: now,
      });
      return updated;
    });
  }

  /**
   * POST /api/v1/rides/:id/payment-qr
   * Creates or returns an existing live single-use UPI QR for the assigned driver.
   */
  async createOrGet(rideId: string, driverId: string): Promise<RideQrPaymentResult> {
    const ride = await this.requireAssignedDriverRide(rideId, driverId);
    const { payment: _payment, ...result } = await this.createOrGetForRide(ride, {
      role: 'DRIVER',
      id: driverId,
    });
    void _payment;
    return result;
  }

  /**
   * The rider's live UPI session. It uses the same QR rows as the driver's "Show QR", so a ride
   * never has two live QRs that could both be paid.
   */
  async liveSessionForRider(rideId: string, riderId: string): Promise<RideUpiIntentDto> {
    const ride = await this.deps.rideRepo.findById(rideId);
    if (!ride) throw AppError.notFound('Ride not found.');
    if (ride.bookerRiderId !== riderId) {
      throw AppError.forbidden('Only the booking customer can pay for this ride.');
    }
    const { qr, payment } = await this.createOrGetForRide(ride, { role: 'RIDER' });
    if (qr.state !== 'PENDING' || !payment?.gatewayRef || !qr.upiUri || !qr.expiresAt) {
      throw AppError.badRequest('UPI QR payment is unavailable on the server.');
    }
    return {
      kind: 'intent',
      qrId: payment.gatewayRef,
      upiUrl: qr.upiUri,
      imageDataUrl: qr.imageUrl ?? '',
      amountPaise: qr.amountPaise,
      expiresAt: qr.expiresAt,
      testMode: false,
    };
  }

  /** Checks this ride's QR with the provider on behalf of the rider; never throws. */
  async refreshForRider(rideId: string): Promise<void> {
    try {
      const ride = await this.deps.rideRepo.findById(rideId);
      if (ride) await this.pollRide(ride);
    } catch (error) {
      logger.warn({ rideId, err: String(error) }, 'rider qr status refresh failed');
    }
  }

  private async createOrGetForRide(
    initial: RideEntity,
    actor: QrActor,
  ): Promise<RideQrPaymentResult & { payment: PaymentEntity | null }> {
    let ride = initial;
    const rideId = ride.id;
    const breakdown = await this.computeRideBreakdown(ride);
    const now = this.now();

    const existingRows = await this.deps.paymentRepo.listQrByRideId(rideId);
    const capturedRow = existingRows.find(
      (row) => row.status === 'CAPTURED' || row.status === 'CONFIRMED',
    );
    if (capturedRow) {
      await this.awaitInFlightCaptureEffect(capturedRow.id);
      const latestRide = (await this.deps.rideRepo.findById(rideId)) ?? ride;
      return {
        ride: latestRide,
        qr: this.toQrView(capturedRow, breakdown.amountPaise, breakdown.lines, now, 'PAID'),
        payment: capturedRow,
      };
    }

    if (ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED') {
      const cashWasCollected = await this.cashCollected(rideId);
      return {
        ride,
        qr: this.toQrView(
          null,
          breakdown.amountPaise,
          breakdown.lines,
          now,
          cashWasCollected ? 'NONE' : 'PAID',
        ),
        payment: null,
      };
    }

    if (!DRIVER_QR_ELIGIBLE_STATUSES.includes(ride.status)) {
      throw AppError.conflict('This ride is not awaiting payment.');
    }

    if (actor.role === 'DRIVER') {
      // If driver previously toggled cash and now taps "Collect payment" / "Generate new QR", switch back to UPI.
      ride = await this.clearCashSelectionForQr(ride, actor.id);
    } else if (await this.cashSelected(rideId)) {
      throw AppError.conflict('This ride now uses cash. Ask the driver to confirm receipt.');
    }

    // Inspect existing open rows: reuse live matching PENDING QR; close stale/expired/mismatched ones.
    for (const row of existingRows) {
      if (row.status === 'PENDING') {
        const isUnexpired = row.qr != null && row.qr.expiresAt.getTime() > now.getTime();
        if (isUnexpired && row.amountPaise === breakdown.amountPaise) {
          return {
            ride,
            qr: this.toQrView(row, breakdown.amountPaise, breakdown.lines, now),
            payment: row,
          };
        }
        // Before closing a stale/expired QR, check if customer already paid it in time.
        if (row.gatewayRef) {
          const credit = await this.deps.gateway.fetchQrCredit(row.gatewayRef);
          if (credit) {
            const captureResult = await this.tryCaptureAndSettle(
              row,
              credit.providerPaymentId,
              credit.amountPaise,
            );
            if (captureResult.captured && captureResult.payment) {
              const settledRide = (await this.deps.rideRepo.findById(rideId)) ?? ride;
              return {
                ride: settledRide,
                qr: this.toQrView(
                  captureResult.payment,
                  breakdown.amountPaise,
                  breakdown.lines,
                  this.now(),
                  'PAID',
                ),
                payment: captureResult.payment,
              };
            }
          }
          await this.deps.gateway.closeQrCode(row.gatewayRef);
        }
        await this.deps.paymentRepo.markFailedIfOpen(row.id, this.now());
      } else if (row.status === 'CREATED') {
        // Another concurrent request is currently creating this exact attempt if idempotencyKey matches below;
        // if it belongs to a different amount, mark stale CREATED failed.
        if (row.amountPaise !== breakdown.amountPaise) {
          await this.deps.paymentRepo.markFailedIfOpen(row.id, this.now());
        }
      }
    }

    const refreshedRows = await this.deps.paymentRepo.listQrByRideId(rideId);
    const failedForAmount = refreshedRows.filter(
      (r) => r.amountPaise === breakdown.amountPaise && r.status === 'FAILED',
    ).length;
    const attempt = failedForAmount + 1;
    const idempotencyKey = `qr-${rideId}-${breakdown.amountPaise}-${attempt}`;

    const payment = await this.insertAndCreateGatewayQr({
      ride,
      breakdown,
      attempt,
      idempotencyKey,
    });

    const latestRide = (await this.deps.rideRepo.findById(rideId)) ?? ride;
    return {
      ride: latestRide,
      qr: this.toQrView(payment, breakdown.amountPaise, breakdown.lines, this.now()),
      payment,
    };
  }

  private async insertAndCreateGatewayQr(input: {
    ride: RideEntity;
    breakdown: {
      farePaise: number;
      arrearsPaise: number;
      amountPaise: number;
      lines: RidePaymentQrLineDto[];
    };
    attempt: number;
    idempotencyKey: string;
  }): Promise<PaymentEntity> {
    const { ride, breakdown, attempt, idempotencyKey } = input;

    const existingPromise = this.inFlightCreates.get(idempotencyKey);
    if (existingPromise) {
      return existingPromise;
    }

    const createdAt = this.now();
    const draft: PaymentEntity = {
      id: newUuid(),
      rideId: ride.id,
      payerRiderId: ride.bookerRiderId,
      method: 'UPI',
      channel: 'QR',
      amountPaise: breakdown.amountPaise,
      attempt,
      idempotencyKey,
      status: 'CREATED',
      provider: this.deps.gateway.provider,
      gatewayRef: null,
      providerPaymentId: null,
      qr: null,
      metadata: {
        farePaise: breakdown.farePaise,
        arrearsPaise: breakdown.arrearsPaise,
        amountPaise: breakdown.amountPaise,
        lines: breakdown.lines,
      },
      lastPolledAt: null,
      confirmedAt: null,
      createdAt,
      updatedAt: createdAt,
    };

    // WRITE THE ROW FIRST under unique idempotencyKey, THEN call Razorpay.
    const { payment: persistedRow, inserted } = await this.deps.paymentRepo.insertCreated(draft);
    if (!inserted) {
      const inFlight = this.inFlightCreates.get(idempotencyKey);
      if (inFlight) return inFlight;
      if (persistedRow.status !== 'CREATED') {
        return persistedRow;
      }
      return this.waitForCreatedRowResolution(idempotencyKey, persistedRow);
    }

    const work = (async (): Promise<PaymentEntity> => {
      try {
        const closeByUnixSeconds = Math.floor(this.now().getTime() / 1000) + QR_EXPIRY_SECONDS;
        const createdQr = await this.deps.gateway.createQrCode({
          amountPaise: breakdown.amountPaise,
          rideId: ride.id,
          name: 'Cabzone Ride',
          description: `Cabzone ride ${ride.id.slice(-8)}`,
          closeByUnixSeconds,
        });
        const pendingAt = this.now();
        const pendingRow = await this.deps.paymentRepo.markPendingWithQr(persistedRow.id, {
          provider: this.deps.gateway.provider,
          gatewayRef: createdQr.gatewayRef,
          qr: {
            upiUri: createdQr.upiUri,
            imageUrl: createdQr.imageUrl,
            expiresAt: createdQr.expiresAt,
          },
          now: pendingAt,
        });
        if (!pendingRow) {
          const latest = await this.deps.paymentRepo.findById(persistedRow.id);
          if (latest) return latest;
          throw AppError.internal('INTERNAL', 'Payment row disappeared after QR creation.');
        }

        await this.deps.rideEventRepo.save({
          id: newUuid(),
          rideId: ride.id,
          eventType: 'UPI_QR_CREATED',
          actorType: 'DRIVER',
          actorId: ride.driverId,
          previousStatus: ride.status,
          newStatus: ride.status,
          metadata: {
            qrId: createdQr.gatewayRef,
            paymentId: pendingRow.id,
            farePaise: breakdown.farePaise,
            arrearsPaise: breakdown.arrearsPaise,
            amountPaise: breakdown.amountPaise,
            attempt,
            channel: 'QR',
            mode: this.deps.gateway.provider === 'MOCK' ? 'test' : 'live',
          },
          createdAt: pendingAt,
        });

        return pendingRow;
      } catch (err) {
        // Move CREATED -> FAILED and rethrow so the next retry starts clean on attempt + 1.
        await this.deps.paymentRepo.markFailedIfOpen(persistedRow.id, this.now());
        throw err;
      } finally {
        this.inFlightCreates.delete(idempotencyKey);
      }
    })();

    this.inFlightCreates.set(idempotencyKey, work);
    return work;
  }

  private async waitForCreatedRowResolution(
    idempotencyKey: string,
    fallback: PaymentEntity,
  ): Promise<PaymentEntity> {
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const row = await this.deps.paymentRepo.findByIdempotencyKey(idempotencyKey);
      if (row && row.status !== 'CREATED') return row;
    }
    return (await this.deps.paymentRepo.findByIdempotencyKey(idempotencyKey)) ?? fallback;
  }

  /**
   * GET /api/v1/rides/:id/payment-qr
   * Polls payment status for the assigned driver, checking the gateway at most once every ~3s per payment.
   */
  async poll(rideId: string, driverId: string): Promise<RideQrPaymentResult> {
    const ride = await this.requireAssignedDriverRide(rideId, driverId);
    return this.pollRide(ride);
  }

  private async pollRide(ride: RideEntity): Promise<RideQrPaymentResult> {
    const rideId = ride.id;
    const breakdown = await this.computeRideBreakdown(ride);
    const rows = await this.deps.paymentRepo.listQrByRideId(rideId);

    // Keep earlier expired attempts recoverable after a replacement QR was issued.
    for (const row of rows.slice(1)) {
      if (row.status !== 'FAILED' || !row.gatewayRef) continue;
      if (
        !(await this.deps.paymentRepo.claimGatewayPoll(
          row.id,
          this.now(),
          POLL_GATEWAY_MIN_INTERVAL_MS,
        ))
      )
        continue;
      const credit = await this.deps.gateway.fetchQrCredit(row.gatewayRef);
      if (credit) {
        const result = await this.tryCaptureAndSettle(
          row,
          credit.providerPaymentId,
          credit.amountPaise,
        );
        if (result.captured && result.payment) {
          return {
            ride: (await this.deps.rideRepo.findById(rideId)) ?? ride,
            qr: this.toQrView(result.payment, breakdown.amountPaise, breakdown.lines, this.now()),
          };
        }
      }
    }

    const capturedRow = rows.find((row) => row.status === 'CAPTURED' || row.status === 'CONFIRMED');
    if (capturedRow) {
      await this.awaitInFlightCaptureEffect(capturedRow.id);
      const settledRide = (await this.deps.rideRepo.findById(rideId)) ?? ride;
      return {
        ride: settledRide,
        qr: this.toQrView(capturedRow, breakdown.amountPaise, breakdown.lines, this.now(), 'PAID'),
      };
    }

    const latest = rows[0] ?? null;
    if (!latest) {
      const settledViaOtherUpi =
        (ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED') &&
        !(await this.cashCollected(rideId));
      return {
        ride,
        qr: this.toQrView(
          null,
          breakdown.amountPaise,
          breakdown.lines,
          this.now(),
          settledViaOtherUpi ? 'PAID' : 'NONE',
        ),
      };
    }

    let currentRow: PaymentEntity = latest;
    const checkTime = this.now();
    if (['PENDING', 'FAILED'].includes(currentRow.status) && currentRow.gatewayRef) {
      const canPollGateway = await this.deps.paymentRepo.claimGatewayPoll(
        currentRow.id,
        checkTime,
        POLL_GATEWAY_MIN_INTERVAL_MS,
      );

      if (canPollGateway) {
        const credit = await this.deps.gateway.fetchQrCredit(currentRow.gatewayRef);
        if (credit) {
          const result = await this.tryCaptureAndSettle(
            currentRow,
            credit.providerPaymentId,
            credit.amountPaise,
          );
          if (result.payment) currentRow = result.payment;
        }
      }

      if (
        currentRow.status === 'PENDING' &&
        currentRow.gatewayRef &&
        currentRow.qr != null &&
        this.now().getTime() >= currentRow.qr.expiresAt.getTime()
      ) {
        await this.deps.gateway.closeQrCode(currentRow.gatewayRef);
        const failed = await this.deps.paymentRepo.markFailedIfOpen(currentRow.id, this.now());
        if (failed) currentRow = failed;
      }
    }

    await this.awaitInFlightCaptureEffect(currentRow.id);
    const updatedRide = (await this.deps.rideRepo.findById(rideId)) ?? ride;
    if (
      (updatedRide.status === 'SETTLED' || updatedRide.status === 'PAYMENT_CONFIRMED') &&
      currentRow.status !== 'CAPTURED' &&
      currentRow.status !== 'CONFIRMED'
    ) {
      if (currentRow.status === 'PENDING') {
        if (currentRow.gatewayRef) {
          await this.deps.gateway.closeQrCode(currentRow.gatewayRef).catch(() => {});
        }
        await this.deps.paymentRepo.markFailedIfOpen(currentRow.id, this.now());
      }
      const settledViaOtherUpi = !(await this.cashCollected(rideId));
      return {
        ride: updatedRide,
        qr: this.toQrView(
          null,
          breakdown.amountPaise,
          breakdown.lines,
          this.now(),
          settledViaOtherUpi ? 'PAID' : 'NONE',
        ),
      };
    }
    return {
      ride: updatedRide,
      qr: this.toQrView(currentRow, breakdown.amountPaise, breakdown.lines, this.now()),
    };
  }

  /**
   * Closes any active PENDING QR for this ride before switching to or confirming cash.
   * If the QR was already paid at the provider, captures and settles it instead!
   */
  async closeForCash(rideId: string): Promise<{ alreadyPaid: boolean }> {
    const rows = await this.deps.paymentRepo.listQrByRideId(rideId);
    for (const row of rows) {
      if (row.status === 'CAPTURED' || row.status === 'CONFIRMED') {
        await this.awaitInFlightCaptureEffect(row.id);
        return { alreadyPaid: true };
      }
      if (row.status === 'PENDING' && row.gatewayRef) {
        const credit = await this.deps.gateway.fetchQrCredit(row.gatewayRef);
        if (credit) {
          const result = await this.tryCaptureAndSettle(
            row,
            credit.providerPaymentId,
            credit.amountPaise,
          );
          if (result.captured) {
            return { alreadyPaid: true };
          }
        }
        await this.deps.gateway.closeQrCode(row.gatewayRef);
        await this.deps.paymentRepo.markFailedIfOpen(row.id, this.now());
      }
    }
    return { alreadyPaid: false };
  }

  /**
   * Deduplicates authentic webhook deliveries by `x-razorpay-event-id`.
   * Scrubs payer contact/VPA/email PII from persisted payload while hashing rawBody.
   * Returns `false` if this event ID was already processed.
   */
  async registerWebhookEvent(input: {
    eventId: string | undefined;
    eventType: string;
    rawBody: string;
    payload: Record<string, unknown>;
    paymentId?: string | null;
  }): Promise<boolean> {
    if (!input.eventId) return true;
    const payloadHash = createHash('sha256').update(input.rawBody).digest('hex');
    const sanitizedPayload = scrubWebhookPayload(input.payload) as Record<string, unknown>;
    const now = this.now();
    return this.deps.paymentRepo.recordWebhookEvent({
      id: newUuid(),
      paymentId: input.paymentId ?? null,
      provider: 'RAZORPAY',
      providerEventId: input.eventId,
      eventType: input.eventType,
      payloadHash,
      payload: sanitizedPayload,
      processedAt: now,
      createdAt: now,
    });
  }

  async hasWebhookEvent(eventId: string): Promise<boolean> {
    return this.deps.paymentRepo.hasWebhookEvent('RAZORPAY', eventId);
  }

  async findPaymentByGatewayRef(gatewayRef: string): Promise<PaymentEntity | null> {
    return this.deps.paymentRepo.findByGatewayRef(gatewayRef);
  }

  /**
   * Handles `qr_code.credited` webhook event using the shared `captureIfPending` CAS.
   */
  async handleWebhookCredited(input: {
    gatewayRef: string;
    providerPaymentId: string;
    /** Omit when the notification carried no amount: the provider is then asked directly. */
    creditedAmountPaise?: number | undefined;
  }): Promise<{
    handled: boolean;
    captured: boolean;
    /** A credit arrived for the wrong amount. Retrying cannot fix it; it is alerted for review. */
    mismatch: boolean;
    ride: RideEntity | null;
  }> {
    const payment = await this.deps.paymentRepo.findByGatewayRef(input.gatewayRef);
    if (!payment) {
      return { handled: false, captured: false, mismatch: false, ride: null };
    }
    let providerPaymentId = input.providerPaymentId;
    let creditedAmountPaise = input.creditedAmountPaise;
    if (typeof creditedAmountPaise !== 'number' || !Number.isSafeInteger(creditedAmountPaise)) {
      // Never guess an amount: read the authoritative credit from the provider.
      const credit = await this.deps.gateway.fetchQrCredit(input.gatewayRef);
      if (!credit) {
        const ride = await this.deps.rideRepo.findById(payment.rideId);
        return { handled: true, captured: false, mismatch: false, ride };
      }
      providerPaymentId = credit.providerPaymentId;
      creditedAmountPaise = credit.amountPaise;
    }
    const result = await this.tryCaptureAndSettle(payment, providerPaymentId, creditedAmountPaise);
    const ride = await this.deps.rideRepo.findById(payment.rideId);
    return { handled: true, captured: result.captured, mismatch: result.mismatch, ride };
  }

  /**
   * Handles `qr_code.closed` webhook event.
   * Ignores `close_reason === 'paid'` because single-use QRs auto-close on payment!
   */
  async handleWebhookClosed(input: {
    gatewayRef: string;
    closeReason: string | null | undefined;
  }): Promise<{ handled: boolean }> {
    if (input.closeReason === 'paid') {
      return { handled: true };
    }
    const payment = await this.deps.paymentRepo.findByGatewayRef(input.gatewayRef);
    if (!payment) {
      return { handled: false };
    }
    await this.deps.paymentRepo.markFailedIfOpen(payment.id, this.now());
    return { handled: true };
  }

  private async awaitInFlightCaptureEffect(paymentId: string): Promise<void> {
    const inFlight = this.inFlightCaptureEffects.get(paymentId);
    if (inFlight) {
      await inFlight.catch(() => undefined);
    }
  }

  /**
   * Single compare-and-swap capture path shared by BOTH webhook and polling.
   * Verifies exact amount, transitions PENDING | FAILED -> CAPTURED atomically,
   * and runs ride/wallet/notification side effects strictly for the single CAS winner (`justCaptured`).
   */
  private async tryCaptureAndSettle(
    payment: PaymentEntity,
    providerPaymentId: string,
    creditedAmountPaise: number,
  ): Promise<{
    payment: PaymentEntity | null;
    captured: boolean;
    justCaptured: boolean;
    mismatch: boolean;
  }> {
    if (creditedAmountPaise !== payment.amountPaise) {
      logger.error(
        {
          paymentId: payment.id,
          rideId: payment.rideId,
          gatewayRef: payment.gatewayRef,
          providerPaymentId,
          expectedAmountPaise: payment.amountPaise,
          creditedAmountPaise,
        },
        'qr payment credited amount mismatch; refusing to mark ride paid',
      );
      void emitOperationalAlert({
        category: 'PAYMENT_RECONCILIATION',
        severity: 'critical',
        dedupeKey: `PAYMENT_RECONCILIATION:amount-mismatch:${payment.id}`,
        summary: 'UPI QR credited an amount that does not match the ride; review for refund.',
        metadata: {
          paymentId: payment.id,
          rideId: payment.rideId,
          providerPaymentId,
          expectedAmountPaise: payment.amountPaise,
          creditedAmountPaise,
        },
      });
      return { payment, captured: false, justCaptured: false, mismatch: true };
    }

    const result = await this.deps.unitOfWork.run(async () => {
      const { payment: afterCas, justCaptured } = await this.deps.paymentRepo.captureIfPending(
        payment.id,
        providerPaymentId,
        this.now(),
      );

      if (!afterCas) {
        return { payment: null, captured: false, justCaptured: false, mismatch: false };
      }

      if (justCaptured) {
        const effectPromise = this.runOnceOnlyCaptureSideEffects(afterCas).finally(() => {
          this.inFlightCaptureEffects.delete(afterCas.id);
        });
        this.inFlightCaptureEffects.set(afterCas.id, effectPromise);
        await effectPromise;
      } else {
        await this.awaitInFlightCaptureEffect(afterCas.id);
      }

      return {
        payment: afterCas,
        captured: afterCas.status === 'CAPTURED' || afterCas.status === 'CONFIRMED',
        justCaptured,
        mismatch: false,
      };
    });

    if (result.justCaptured) {
      // Single-use QRs close themselves when paid, but the rider's own QR for this ride must not
      // stay payable once this one has settled the ride.
      await this.deps.closeLegacyQrSession?.(payment.rideId).catch(() => undefined);
    }
    if (result.justCaptured && this.deps.onRideSettled) {
      const settledRide = await this.deps.rideRepo.findById(payment.rideId);
      if (settledRide) {
        await this.deps
          .onRideSettled(
            settledRide,
            settledRide.status === 'PAYMENT_DISPUTED'
              ? 'ride.payment.disputed'
              : 'ride.payment.confirmed',
          )
          .catch(() => {});
      }
    }
    return result;
  }

  private async runOnceOnlyCaptureSideEffects(payment: PaymentEntity): Promise<RideEntity> {
    const current = await this.deps.rideRepo.findById(payment.rideId);
    if (!current) {
      throw AppError.notFound('Ride not found during QR capture settlement.');
    }
    if (current.status === 'PAYMENT_DISPUTED') {
      return current;
    }

    const farePaise = payment.metadata.farePaise;
    const arrearsPaise = payment.metadata.arrearsPaise;
    if (
      typeof farePaise !== 'number' ||
      !Number.isSafeInteger(farePaise) ||
      farePaise < 100 ||
      typeof arrearsPaise !== 'number' ||
      !Number.isSafeInteger(arrearsPaise) ||
      arrearsPaise < 0 ||
      farePaise + arrearsPaise !== payment.amountPaise
    ) {
      throw AppError.conflict('Payment breakdown needs reconciliation.');
    }
    const breakdown = { farePaise, arrearsPaise };
    const now = this.now();

    if (current.status === 'SETTLED') {
      // This payment was captured just now, so the ride was already settled by something else:
      // cash, or another UPI payment. Either way the rider has paid twice.
      const afterCash = await this.cashCollected(current.id);
      const disputed = await saveRideTransition(
        this.deps.rideRepo,
        {
          ...current,
          status: 'PAYMENT_DISPUTED',
          disputedAt: now,
          version: current.version + 1,
          updatedAt: now,
        },
        current.version,
      );
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: current.id,
        eventType: 'PAYMENT_DISPUTED',
        actorType: 'SYSTEM',
        actorId: null,
        previousStatus: current.status,
        newStatus: 'PAYMENT_DISPUTED',
        metadata: {
          reason: afterCash
            ? 'UPI QR payment received after cash confirmation; refund review required'
            : 'Duplicate UPI payment received after the ride was settled; refund review required',
          duplicate: true,
          duplicateOf: afterCash ? 'CASH' : 'UPI',
          paymentId: payment.providerPaymentId,
          qrPaymentRecordId: payment.id,
          qrId: payment.gatewayRef,
          farePaise: breakdown.farePaise,
          arrearsPaise: breakdown.arrearsPaise,
          totalPayablePaise: payment.amountPaise,
          mode: payment.provider === 'MOCK' ? 'test' : 'live',
        },
        createdAt: now,
      });
      return disputed;
    }

    if (!QR_CAPTURE_ELIGIBLE_STATUSES.includes(current.status) || !current.driverId) {
      throw AppError.conflict('Ride is not awaiting payment.');
    }
    const previousStatus = current.status;

    const commissionPercent = current.pricingSnapshot.commissionPercent;
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      throw AppError.badRequest('Ride commission is invalid.');
    }
    const commissionPaise = Math.round((breakdown.farePaise * commissionPercent) / 100);
    const driverPayablePaise = breakdown.farePaise - commissionPaise;

    const driverWallet = await this.deps.walletRepo.findByDriverId(current.driverId);
    if (!driverWallet) {
      throw AppError.conflict('Driver wallet is unavailable. Payment needs reconciliation.');
    }

    const settled = await saveRideTransition(
      this.deps.rideRepo,
      {
        ...current,
        status: 'SETTLED',
        settledAt: now,
        updatedAt: now,
        version: current.version + 1,
      },
      current.version,
    );

    const earningsBefore = driverWallet.earningsBalancePaise ?? 0;
    const earningsAfter = earningsBefore + driverPayablePaise;
    await this.deps.walletRepo.save({
      ...driverWallet,
      earningsBalancePaise: earningsAfter,
      version: driverWallet.version + 1,
      updatedAt: now,
    });

    if (driverPayablePaise > 0) {
      await this.deps.walletRepo.recordTransaction({
        id: newUuid(),
        walletId: driverWallet.id,
        driverId: current.driverId,
        bucket: 'EARNINGS',
        type: 'CREDIT',
        amountPaise: driverPayablePaise,
        referenceType: 'ONLINE_RIDE_EARNINGS',
        referenceId: current.id,
        idempotencyKey: `ride-earnings:${current.id}`,
        balanceBeforePaise: earningsBefore,
        balanceAfterPaise: earningsAfter,
        createdBy: null,
        note:
          payment.provider === 'MOCK'
            ? 'Test online ride net earnings (UPI QR)'
            : 'Online ride net earnings (UPI QR)',
        createdAt: now,
      });
    }

    // The fee may have been waived since the QR was issued. Credit only what is still owed, and
    // flag the difference: the rider paid it and needs a refund review.
    const riderWalletNow = await this.deps.walletRepo.findByRiderId(current.bookerRiderId);
    const creditableArrearsPaise = collectableArrearsPaise(
      { arrearsPaise: breakdown.arrearsPaise },
      riderWalletNow,
    );
    const arrearsOverpaidPaise = breakdown.arrearsPaise - creditableArrearsPaise;
    if (arrearsOverpaidPaise > 0) {
      void emitOperationalAlert({
        category: 'PAYMENT_RECONCILIATION',
        severity: 'warning',
        dedupeKey: `PAYMENT_RECONCILIATION:arrears-overpaid:${current.id}`,
        summary: 'A rider paid a cancellation fee that was waived while the QR was open.',
        metadata: { rideId: current.id, arrearsOverpaidPaise },
      });
    }

    if (creditableArrearsPaise > 0) {
      const existingRiderWallet = riderWalletNow;
      const riderWalletBase: WalletEntity = existingRiderWallet ?? {
        id: `rider:${current.bookerRiderId}`,
        ownerType: 'RIDER',
        driverId: '',
        riderId: current.bookerRiderId,
        balancePaise: 0,
        owedPaise: 0,
        status: 'ACTIVE',
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
      const riderBalanceBefore = riderWalletBase.balancePaise;
      const riderBalanceAfter = calculateNewBalance(
        riderBalanceBefore,
        creditableArrearsPaise,
        'CREDIT',
      );
      await this.deps.walletRepo.recordTransaction({
        id: newUuid(),
        walletId: riderWalletBase.id,
        ownerType: 'RIDER',
        driverId: null,
        riderId: current.bookerRiderId,
        type: 'CREDIT',
        amountPaise: creditableArrearsPaise,
        referenceType: 'ARREARS_PAYMENT',
        referenceId: current.id,
        idempotencyKey: `rider_arrears_paid_${current.id}`,
        balanceBeforePaise: riderBalanceBefore,
        balanceAfterPaise: riderBalanceAfter,
        createdBy: current.bookerRiderId,
        note: 'Cancellation fee arrears settled via online UPI QR',
        createdAt: now,
      });
      await this.deps.walletRepo.save({
        ...riderWalletBase,
        ownerType: 'RIDER',
        riderId: current.bookerRiderId,
        balancePaise: riderBalanceAfter,
        owedPaise: Math.max(0, -riderBalanceAfter),
        version: riderWalletBase.version + 1,
        updatedAt: now,
      });
    }

    const eventMetadata = {
      provider: payment.provider ?? 'RAZORPAY',
      mode: payment.provider === 'MOCK' ? 'test' : 'live',
      method: 'UPI',
      channel: 'QR',
      qrId: payment.gatewayRef,
      paymentId: payment.providerPaymentId,
      qrPaymentRecordId: payment.id,
      farePaise: breakdown.farePaise,
      arrearsPaise: breakdown.arrearsPaise,
      totalPayablePaise: payment.amountPaise,
      commissionPaise,
      driverId: current.driverId,
      driverPayablePaise,
      ...(arrearsOverpaidPaise > 0 ? { arrearsOverpaidPaise } : {}),
      confirmedAt: now.toISOString(),
    };

    for (const eventType of ['PAYMENT_CONFIRMED', 'DRIVER_PAYOUT_PENDING', 'RIDE_SETTLED']) {
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: current.id,
        eventType,
        actorType: 'SYSTEM',
        actorId: null,
        previousStatus,
        newStatus: 'SETTLED',
        metadata: eventMetadata,
        createdAt: now,
      });
    }

    return settled;
  }
}
