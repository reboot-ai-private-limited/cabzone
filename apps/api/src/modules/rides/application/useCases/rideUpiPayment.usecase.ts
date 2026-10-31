import type {
  RidePaymentStateDto,
  RideStatus,
  RideUpiCheckoutDto,
  RideUpiIntentDto,
  RideUpiSessionDto,
} from '@cabzone/contracts';
import { z } from 'zod';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import type {
  RideEntity,
  RideEventRepositoryPort,
  RideRepositoryPort,
} from '../../domain/index.js';
import type { RidePaymentGateway } from '../../domain/ridePayment.port.js';
import { saveRideTransition } from '../rideTransition.js';
import {
  calculateNewBalance,
  type WalletEntity,
  type WalletRepositoryPort,
} from '../../../ledger/ledger.public.js';

const AWAITING_PAYMENT_STATUSES: readonly RideStatus[] = [
  'PAYMENT_PENDING',
  'PAYMENT_CASH_CLAIMED',
  'PAYMENT_UNPAID',
];

function isAwaitingPaymentStatus(status: RideStatus): boolean {
  return AWAITING_PAYMENT_STATUSES.includes(status);
}

export class RideUpiPaymentUseCase {
  get live() {
    return this.deps.gateway.live === true;
  }
  constructor(
    private readonly deps: {
      rideRepo: RideRepositoryPort;
      rideEventRepo: RideEventRepositoryPort;
      unitOfWork: UnitOfWorkPort;
      gateway: RidePaymentGateway;
      walletRepo: WalletRepositoryPort;
      closeQrCollectionForCash?: (rideId: string) => Promise<{ alreadyPaid: boolean }>;
    },
  ) {}

  private async ownedRide(rideId: string, riderId: string): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(rideId);
    if (!ride) throw AppError.notFound('Ride not found.');
    if (ride.bookerRiderId !== riderId)
      throw AppError.forbidden('Only the booking customer can pay for this ride.');
    return ride;
  }

  private async order(rideId: string): Promise<string | null> {
    const events = await this.deps.rideEventRepo.findByRideId(rideId);
    const value = events.find((e) => e.eventType === 'UPI_ORDER_CREATED')?.metadata.orderId;
    return typeof value === 'string' ? value : null;
  }

  private fare(ride: RideEntity): number {
    const fare = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
    if (!Number.isSafeInteger(fare) || fare < 100)
      throw AppError.badRequest('The ride fare must be at least ₹1.');
    return fare;
  }

  private arrears(ride: RideEntity): number {
    const arrearsPaise = ride.arrearsPaise ?? 0;
    return Number.isSafeInteger(arrearsPaise) && arrearsPaise > 0 ? arrearsPaise : 0;
  }

  private payableAmount(ride: RideEntity): number {
    return this.fare(ride) + this.arrears(ride);
  }

  private async cashSelected(rideId: string): Promise<boolean> {
    const events = await this.deps.rideEventRepo.findByRideId(rideId);
    return (
      [...events].reverse().find((e) => e.eventType === 'PAYMENT_METHOD_CHANGED')?.metadata
        .method === 'CASH'
    );
  }

  private async cashCollected(rideId: string): Promise<boolean> {
    return (await this.deps.rideEventRepo.findByRideId(rideId)).some(
      (event) => event.eventType === 'PAYMENT_CONFIRMED' && event.metadata.method === 'CASH',
    );
  }

  async paymentState(rideId: string): Promise<RidePaymentStateDto> {
    const ride = await this.deps.rideRepo.findById(rideId);
    if (!ride) throw AppError.notFound('Ride not found.');
    const confirmed = (await this.deps.rideEventRepo.findByRideId(rideId)).find(
      (e) => e.eventType === 'PAYMENT_CONFIRMED',
    );
    return {
      paid: ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED',
      method:
        confirmed?.metadata.method === 'UPI'
          ? 'UPI'
          : confirmed?.metadata.method === 'CASH' ||
              ride.status === 'PAYMENT_CASH_CLAIMED' ||
              (await this.cashSelected(rideId))
            ? 'CASH'
            : 'UPI',
      testMode: !this.live,
      requiresReview: ride.status === 'PAYMENT_DISPUTED',
      ...(ride.status === 'PAYMENT_CASH_CLAIMED' ? { cashClaimedByRider: true } : {}),
      ...(ride.status === 'PAYMENT_UNPAID' ? { unpaidReportedByDriver: true } : {}),
    };
  }

  async switchToCash(
    rideId: string,
    actor: { role: 'RIDER' | 'DRIVER'; id: string },
  ): Promise<RidePaymentStateDto> {
    const ride = await this.deps.rideRepo.findById(rideId);
    if (!ride || (actor.role === 'DRIVER' ? ride.driverId : ride.bookerRiderId) !== actor.id)
      throw AppError.forbidden('You cannot change payment for this ride.');
    const canSwitchStatus =
      ride.status === 'PAYMENT_PENDING' ||
      ride.status === 'PAYMENT_CASH_CLAIMED' ||
      (actor.role === 'DRIVER' && ride.status === 'PAYMENT_UNPAID') ||
      ride.status === 'SETTLED';
    if (!canSwitchStatus)
      throw AppError.conflict('This ride is not awaiting payment.');
    const current = await this.reconcile(rideId, ride.bookerRiderId);
    if (current.status === 'SETTLED' || (await this.cashSelected(rideId)))
      return this.paymentState(rideId);
    const qrCollection = await this.deps.closeQrCollectionForCash?.(rideId);
    if (qrCollection?.alreadyPaid) return this.paymentState(rideId);
    const qr = await this.qrSession(rideId);
    if (qr) await this.deps.gateway.closeQrForCash(qr.qrId);
    const checked = await this.reconcile(rideId, ride.bookerRiderId);
    if (checked.status === 'SETTLED') return this.paymentState(rideId);
    await this.deps.unitOfWork.run(async () => {
      const fresh = await this.ownedRide(rideId, ride.bookerRiderId);
      if (fresh.status === 'SETTLED' || (await this.cashSelected(rideId))) return;
      const freshAllowed =
        fresh.status === 'PAYMENT_PENDING' ||
        fresh.status === 'PAYMENT_CASH_CLAIMED' ||
        (actor.role === 'DRIVER' && fresh.status === 'PAYMENT_UNPAID');
      if (!freshAllowed)
        throw AppError.conflict('Ride payment state changed.');
      if ((await this.qrSession(rideId))?.qrId !== qr?.qrId)
        throw AppError.conflict(
          'Payment options changed. Retry switching to cash so the new QR can be closed.',
        );
      await saveRideTransition(
        this.deps.rideRepo,
        { ...fresh, version: fresh.version + 1, updatedAt: new Date() },
        fresh.version,
      );
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId,
        eventType: 'PAYMENT_METHOD_CHANGED',
        actorType: actor.role,
        actorId: actor.id,
        previousStatus: fresh.status,
        newStatus: fresh.status,
        metadata: { method: 'CASH', previousMethod: 'UPI', onlineQrClosed: !!qr },
        createdAt: new Date(),
      });
    });
    return this.paymentState(rideId);
  }

  async prepareNonUpiResolution(rideId: string): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(rideId);
    if (!ride) throw AppError.notFound('Ride not found.');
    const current = await this.reconcile(rideId, ride.bookerRiderId);
    if (current.status === 'SETTLED' || current.status === 'PAYMENT_CONFIRMED') return current;
    const qrCollection = await this.deps.closeQrCollectionForCash?.(rideId);
    if (qrCollection?.alreadyPaid) {
      return (await this.deps.rideRepo.findById(rideId)) ?? current;
    }
    const qr = await this.qrSession(rideId);
    if (qr) await this.deps.gateway.closeQrForCash(qr.qrId);
    return this.reconcile(rideId, ride.bookerRiderId);
  }

  async prepareCashConfirmation(rideId: string, driverId: string): Promise<void> {
    const ride = await this.deps.rideRepo.findById(rideId);
    if (!ride || ride.driverId !== driverId)
      throw AppError.forbidden('Only the assigned driver can confirm cash.');
    if (ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED') return;
    const events = await this.deps.rideEventRepo.findByRideId(rideId);
    const hasOnlineAttempt = events.some((e) =>
      ['UPI_ORDER_CREATED', 'UPI_QR_CREATED'].includes(e.eventType),
    );
    const cashAlreadySelected = await this.cashSelected(rideId);
    if (!hasOnlineAttempt && !cashAlreadySelected) {
      await this.deps.closeQrCollectionForCash?.(rideId);
      return;
    }
    if (!cashAlreadySelected) {
      await this.switchToCash(rideId, { role: 'DRIVER', id: driverId });
      return;
    }
    await this.prepareNonUpiResolution(rideId);
  }

  async create(rideId: string, riderId: string): Promise<RideUpiCheckoutDto> {
    const ride = await this.ownedRide(rideId, riderId);
    if (await this.cashSelected(rideId))
      throw AppError.conflict('This ride now uses cash. Ask the driver to confirm receipt.');
    if (this.live) throw AppError.badRequest('Use the ride UPI session to pay.');
    if (await this.qrSession(rideId))
      throw AppError.conflict('This ride already uses live UPI payment. Contact support.');
    if (!isAwaitingPaymentStatus(ride.status))
      throw AppError.badRequest('This ride is not awaiting payment.');
    let orderId = await this.order(rideId);
    const farePaise = this.fare(ride);
    const arrearsPaise = this.arrears(ride);
    const amountPaise = farePaise + arrearsPaise;
    if (!orderId) {
      const created = await this.deps.gateway.createOrder(amountPaise, rideId);
      // Persist one checkout choice before exposing an order; unused concurrent orders cannot be paid from the app.
      orderId = await this.deps.unitOfWork.run(async () => {
        const current = await this.ownedRide(rideId, riderId);
        if (!isAwaitingPaymentStatus(current.status))
          throw AppError.conflict('Ride payment state changed. Refresh the ride.');
        if (await this.cashSelected(rideId)) throw AppError.conflict('This ride now uses cash.');
        const existing = await this.order(rideId);
        if (existing) return existing;
        await saveRideTransition(
          this.deps.rideRepo,
          { ...current, version: current.version + 1, updatedAt: new Date() },
          current.version,
        );
        await this.deps.rideEventRepo.save({
          id: newUuid(),
          rideId,
          eventType: 'UPI_ORDER_CREATED',
          actorType: 'RIDER',
          actorId: riderId,
          previousStatus: current.status,
          newStatus: current.status,
          metadata: {
            orderId: created,
            amountPaise,
            farePaise,
            arrearsPaise,
            provider: 'RAZORPAY',
            mode: 'test',
          },
          createdAt: new Date(),
        });
        return created;
      });
    }
    return {
      orderId,
      amountPaise,
      currency: 'INR',
      keyId: this.deps.gateway.keyId,
      testMode: true,
    };
  }

  private async qrSession(rideId: string): Promise<RideUpiIntentDto | null> {
    const event = (await this.deps.rideEventRepo.findByRideId(rideId)).find(
      (e) => e.eventType === 'UPI_QR_CREATED' && e.metadata.session != null,
    );
    if (!event) return null;
    return z
      .object({
        kind: z.literal('intent'),
        qrId: z.string().regex(/^qr_[a-zA-Z0-9]+$/),
        upiUrl: z.string().startsWith('upi://pay?'),
        imageDataUrl: z.string(),
        amountPaise: z.number().int().positive(),
        expiresAt: z.string().datetime(),
        testMode: z.literal(false),
      })
      .parse(event.metadata.session);
  }

  async session(rideId: string, riderId: string): Promise<RideUpiSessionDto> {
    if (!this.live) return { kind: 'checkout', checkout: await this.create(rideId, riderId) };
    const ride = await this.ownedRide(rideId, riderId);
    if (await this.cashSelected(rideId))
      throw AppError.conflict('This ride now uses cash. Ask the driver to confirm receipt.');
    if (!isAwaitingPaymentStatus(ride.status))
      throw AppError.badRequest('This ride is not awaiting payment.');
    if (await this.order(rideId))
      throw AppError.conflict(
        'This ride already uses test checkout. Finish it before switching payment mode.',
      );
    const amountPaise = this.payableAmount(ride);
    let session = await this.qrSession(rideId);
    if (!session) {
      const created = await this.deps.gateway.createQr(amountPaise, rideId);
      if (!created) throw AppError.badRequest('UPI QR payment is unavailable on the server.');
      session = await this.deps.unitOfWork.run(async () => {
        const current = await this.ownedRide(rideId, riderId);
        if (await this.cashSelected(rideId)) throw AppError.conflict('This ride now uses cash.');
        if (
          !isAwaitingPaymentStatus(current.status) ||
          this.payableAmount(current) !== created.amountPaise
        )
          throw AppError.conflict('Ride payment state changed.');
        const existing = await this.qrSession(rideId);
        if (existing) return existing;
        await saveRideTransition(
          this.deps.rideRepo,
          { ...current, version: current.version + 1, updatedAt: new Date() },
          current.version,
        );
        await this.deps.rideEventRepo.save({
          id: newUuid(),
          rideId,
          eventType: 'UPI_QR_CREATED',
          actorType: 'SYSTEM',
          actorId: null,
          previousStatus: current.status,
          newStatus: current.status,
          metadata: {
            session: created,
            qrId: created.qrId,
            farePaise: this.fare(current),
            arrearsPaise: this.arrears(current),
            mode: 'live',
          },
          createdAt: new Date(),
        });
        return created;
      });
    }
    if (session.amountPaise !== amountPaise)
      throw AppError.conflict('Ride fare differs from the payment session. Contact support.');
    // shortcut: retain expired QR for reconciliation; rotate only with provider-backed late-payment handling.
    if (Date.parse(session.expiresAt) <= Date.now())
      throw AppError.conflict(
        'Payment QR expired. Check payment status or contact support before paying again.',
      );
    return session;
  }

  async reconcileQrWebhook(rideId: string, qrId: string): Promise<RideEntity> {
    const session = await this.qrSession(rideId);
    if (!session || session.qrId !== qrId)
      throw AppError.badRequest('Payment QR does not match this ride.');
    const ride = await this.deps.rideRepo.findById(rideId);
    if (!ride) throw AppError.notFound('Ride not found.');
    return this.reconcile(rideId, ride.bookerRiderId);
  }

  async reconcile(
    rideId: string,
    riderId: string,
    proof?: { orderId: string; paymentId: string; signature: string },
  ): Promise<RideEntity> {
    const ride = await this.ownedRide(rideId, riderId);
    const qr = await this.qrSession(rideId);
    const orderId = await this.order(rideId);
    if (!orderId && !qr) return ride;
    if (!!qr !== this.live)
      throw AppError.conflict(
        'Ride payment mode differs from server configuration. Contact support.',
      );
    if (proof) {
      if (!orderId || proof.orderId !== orderId)
        throw AppError.badRequest('Payment order does not belong to this ride.');
      this.deps.gateway.verifySignature(orderId, proof.paymentId, proof.signature);
    }
    if (ride.status === 'SETTLED' && !(await this.cashCollected(rideId))) return ride;
    if (ride.status === 'PAYMENT_DISPUTED') return ride;
    if (!isAwaitingPaymentStatus(ride.status) && ride.status !== 'SETTLED')
      throw AppError.conflict('Ride is not awaiting payment.');
    const farePaise = this.fare(ride);
    const arrearsPaise = this.arrears(ride);
    const totalPayablePaise = farePaise + arrearsPaise;
    const paymentId = qr
      ? await this.deps.gateway.findQrPayment(qr.qrId, totalPayablePaise)
      : await this.deps.gateway.findCapturedPayment(orderId!, totalPayablePaise);
    if (!paymentId) return ride;
    if (proof && proof.paymentId !== paymentId)
      throw AppError.badRequest('Captured payment does not match checkout.');
    try {
      const result = await this.deps.unitOfWork.run(async () => {
        const current = await this.ownedRide(rideId, riderId);
        if (current.status === 'SETTLED') {
          if (!(await this.cashCollected(rideId))) return current;
          const now = new Date();
          const disputed = await saveRideTransition(
            this.deps.rideRepo,
            { ...current, status: 'PAYMENT_DISPUTED', version: current.version + 1, updatedAt: now },
            current.version,
          );
          await this.deps.rideEventRepo.save({
            id: newUuid(),
            rideId,
            eventType: 'PAYMENT_DISPUTED',
            actorType: 'SYSTEM',
            actorId: null,
            previousStatus: current.status,
            newStatus: 'PAYMENT_DISPUTED',
            metadata: {
              reason: 'UPI received after cash confirmation; refund review required',
              paymentId,
              orderId,
              qrId: qr?.qrId ?? null,
              farePaise,
              arrearsPaise,
              totalPayablePaise,
              mode: qr ? 'live' : 'test',
            },
            createdAt: now,
          });
          return disputed;
        }
        if (
          !isAwaitingPaymentStatus(current.status) ||
          this.fare(current) !== farePaise ||
          this.arrears(current) !== arrearsPaise ||
          !current.driverId
        )
          throw AppError.conflict('Ride payment state changed.');
        const commissionPercent = current.pricingSnapshot.commissionPercent;
        if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100)
          throw AppError.badRequest('Ride commission is invalid.');
        // D-044: Commission applies strictly to agreedFarePaise, never to arrearsPaise.
        const commissionPaise = Math.round((farePaise * commissionPercent) / 100);
        const driverWallet = await this.deps.walletRepo.findByDriverId(current.driverId);
        if (!driverWallet)
          throw AppError.conflict('Driver wallet is unavailable. Payment needs reconciliation.');
        const previousStatus = current.status;
        const now = new Date();
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
        const metadata = {
          provider: 'RAZORPAY',
          mode: qr ? 'live' : 'test',
          method: 'UPI',
          orderId,
          ...(qr ? { qrId: qr.qrId } : {}),
          paymentId,
          farePaise,
          arrearsPaise,
          totalPayablePaise,
          commissionPaise,
          driverId: current.driverId,
          driverPayablePaise: farePaise - commissionPaise,
          confirmedAt: now.toISOString(),
        };
        const earningsBefore = driverWallet.earningsBalancePaise ?? 0;
        const earningsAfter = earningsBefore + metadata.driverPayablePaise;
        await this.deps.walletRepo.save({
          ...driverWallet,
          earningsBalancePaise: earningsAfter,
          version: driverWallet.version + 1,
          updatedAt: now,
        });
        if (metadata.driverPayablePaise > 0) {
          await this.deps.walletRepo.recordTransaction({
            id: newUuid(),
            walletId: driverWallet.id,
            driverId: current.driverId,
            bucket: 'EARNINGS',
            type: 'CREDIT',
            amountPaise: metadata.driverPayablePaise,
            referenceType: 'ONLINE_RIDE_EARNINGS',
            referenceId: current.id,
            idempotencyKey: `ride-earnings:${current.id}`,
            balanceBeforePaise: earningsBefore,
            balanceAfterPaise: earningsAfter,
            createdBy: null,
            note: qr ? 'Online ride net earnings' : 'Test online ride net earnings',
            createdAt: now,
          });
        }
        if (arrearsPaise > 0) {
          const existingRiderWallet = await this.deps.walletRepo.findByRiderId(
            current.bookerRiderId,
          );
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
            arrearsPaise,
            'CREDIT',
          );
          await this.deps.walletRepo.recordTransaction({
            id: newUuid(),
            walletId: riderWalletBase.id,
            ownerType: 'RIDER',
            driverId: null,
            riderId: current.bookerRiderId,
            type: 'CREDIT',
            amountPaise: arrearsPaise,
            referenceType: 'ARREARS_PAYMENT',
            referenceId: current.id,
            idempotencyKey: `rider_arrears_paid_${current.id}`,
            balanceBeforePaise: riderBalanceBefore,
            balanceAfterPaise: riderBalanceAfter,
            createdBy: current.bookerRiderId,
            note: qr
              ? 'Cancellation fee arrears settled via online UPI QR'
              : 'Cancellation fee arrears settled via online UPI checkout',
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
        for (const eventType of ['PAYMENT_CONFIRMED', 'DRIVER_PAYOUT_PENDING', 'RIDE_SETTLED']) {
          await this.deps.rideEventRepo.save({
            id: newUuid(),
            rideId,
            eventType,
            actorType: 'SYSTEM',
            actorId: null,
            previousStatus,
            newStatus: 'SETTLED',
            metadata,
            createdAt: now,
          });
        }
        return settled;
      });
      if (result.status === 'SETTLED') {
        await this.deps.closeQrCollectionForCash?.(rideId).catch(() => undefined);
      }
      return result;
    } catch (error) {
      const isStateOrDuplicateConflict =
        (error instanceof AppError &&
          error.statusCode === 409 &&
          error.message.startsWith('RIDE_STATE_CHANGED:')) ||
        (error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code?: unknown }).code === 11000);
      if (isStateOrDuplicateConflict) {
        const afterRace = await this.ownedRide(rideId, riderId);
        if (afterRace.status === 'SETTLED' && !(await this.cashCollected(rideId))) {
          return afterRace;
        }
      }
      throw error;
    }
  }
}
