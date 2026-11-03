import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { logger } from '../../../../shared/logging/logger.js';
import { saveRideTransition } from '../rideTransition.js';
import { COMPLETE_RADIUS_M, assertDriverWithin, type DriverLocationPort } from '../geofence.js';
import type { RefundVerifierPort, ProviderRefund } from '../../domain/refundVerifier.port.js';
import {
  calculateNewBalance,
  getRiderUnpaidArrearsPaise,
  type WalletEntity,
  type WalletRepositoryPort,
} from '../../../ledger/ledger.public.js';
import type {
  RideEntity,
  RideEventRepositoryPort,
  RideRepositoryPort,
} from '../../domain/index.js';

export interface CompleteRideInput {
  rideId: string;
  driverId: string;
  metadata?: Record<string, unknown>;
  completedAt?: Date;
  /** Driver confirmed the rider's early drop request; skips the 500 m drop-off check. */
  earlyDrop?: boolean;
}

export interface ClaimCashPaidInput {
  rideId: string;
  riderId: string;
}

export interface MarkRideUnpaidInput {
  rideId: string;
  driverId: string;
  reason?: string | null | undefined;
}

export interface CompleteRideDeps {
  refundVerifier?: RefundVerifierPort | undefined;
  prepareCashConfirmation?: (rideId: string, driverId: string) => Promise<void>;
  prepareNonUpiResolution?: (rideId: string) => Promise<RideEntity>;
  onRideCompleted?: (rideId: string) => Promise<void>;
  unitOfWork: UnitOfWorkPort;
  rideRepo: RideRepositoryPort;
  walletRepo: WalletRepositoryPort;
  rideEventRepo?: RideEventRepositoryPort;
  /** When set, the driver must be within 500 m of the drop to complete (unless early drop was approved). */
  driverLocation?: DriverLocationPort | undefined;
}

export interface CompleteRideResult {
  ride: RideEntity;
  farePaise: number;
  commissionPaise: number;
  arrearsCollectedPaise?: number;
  totalPayablePaise?: number;
  driverWallet: WalletEntity;
}

export interface PaymentDisputeInput {
  rideId: string;
  riderId: string;
  reason: string;
}

export interface ResolvePaymentDisputeInput {
  rideId: string;
  adminId: string;
  outcome: 'RIDER_WINS' | 'DRIVER_WINS';
  reason: string;
  refundReference?: string | null | undefined;
}

export class CompleteRideUseCase {
  constructor(private readonly deps: CompleteRideDeps) {}

  async execute(input: CompleteRideInput): Promise<CompleteRideResult> {
    const result = await this.deps.unitOfWork.run(async () => {
      const ride = await this.deps.rideRepo.findById(input.rideId);
      if (!ride) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
      if (ride.driverId !== input.driverId)
        throw AppError.forbidden(
          'UNAUTHORIZED_DRIVER: You are not the assigned driver for this ride.',
        );
      if (
        ![
          'TRIP_STARTED',
          'PAYMENT_PENDING',
          'PAYMENT_CASH_CLAIMED',
          'PAYMENT_UNPAID',
          'SETTLED',
        ].includes(ride.status)
      ) {
        throw AppError.badRequest(`INVALID_RIDE_STATE: Cannot complete ride in ${ride.status}.`);
      }
      const wallet = await this.deps.walletRepo.findByDriverId(input.driverId);
      if (!wallet) throw AppError.notFound('WALLET_NOT_FOUND: Driver wallet was not found.');
      const farePaise = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
      const arrearsPaise = Math.max(0, ride.arrearsPaise ?? 0);
      if (ride.status !== 'TRIP_STARTED') {
        return {
          ride,
          farePaise,
          commissionPaise: 0,
          totalPayablePaise: farePaise + arrearsPaise,
          driverWallet: wallet,
        };
      }
      if (input.earlyDrop) {
        if (!ride.earlyDropRequestedAt) {
          throw AppError.badRequest('NO_EARLY_DROP_REQUEST: There is no pending early drop request.');
        }
      } else if (this.deps.driverLocation) {
        await assertDriverWithin(
          this.deps.driverLocation,
          input.driverId,
          ride.drop,
          COMPLETE_RADIUS_M,
          'DRIVER_TOO_FAR_FROM_DROP',
        );
      }
      const now = input.completedAt ?? new Date();
      const saved = await saveRideTransition(
        this.deps.rideRepo,
        {
          ...ride,
          status: 'PAYMENT_PENDING',
          completedAt: now,
          updatedAt: now,
          version: ride.version + 1,
        },
        ride.version,
      );
      await this.deps.rideEventRepo?.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'TRIP_COMPLETED',
        actorType: 'DRIVER',
        actorId: input.driverId,
        previousStatus: 'TRIP_STARTED',
        newStatus: 'PAYMENT_PENDING',
        metadata: {
          ...input.metadata,
          farePaise,
          arrearsPaise,
          totalPayablePaise: farePaise + arrearsPaise,
          completedAt: now.toISOString(),
        },
        createdAt: now,
      });
      return {
        ride: saved,
        farePaise,
        commissionPaise: 0,
        totalPayablePaise: farePaise + arrearsPaise,
        driverWallet: wallet,
      };
    });
    if (result.ride.status === 'PAYMENT_PENDING') {
      try {
        await this.deps.onRideCompleted?.(result.ride.id);
      } catch (error) {
        logger.warn(
          { rideId: result.ride.id, error: String(error) },
          'failed to end ride call after completion',
        );
      }
    }
    return result;
  }

  async confirmPayment(input: CompleteRideInput): Promise<CompleteRideResult> {
    await this.deps.prepareCashConfirmation?.(input.rideId, input.driverId);
    try {
      return await this.deps.unitOfWork.run(() => this.settle(input));
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
        const current = await this.deps.rideRepo.findById(input.rideId);
        if (current?.status === 'SETTLED') {
          return this.deps.unitOfWork.run(() => this.settle(input));
        }
      }
      throw error;
    }
  }

  async claimCashPaid(input: ClaimCashPaidInput): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    if (ride.bookerRiderId !== input.riderId && ride.passenger.riderId !== input.riderId) {
      throw AppError.forbidden('UNAUTHORIZED_RIDER: You cannot claim cash payment for this ride.');
    }
    if (
      ride.status === 'SETTLED' ||
      ride.status === 'PAYMENT_CONFIRMED' ||
      ride.status === 'PAYMENT_CASH_CLAIMED'
    ) {
      return ride;
    }
    if (ride.status !== 'PAYMENT_PENDING') {
      throw AppError.conflict(
        `INVALID_RIDE_STATE: Cash payment can only be claimed while payment is pending (current status: ${ride.status}).`,
      );
    }

    const existingClaims = await this.deps.rideRepo.count({
      riderId: ride.bookerRiderId,
      statuses: ['PAYMENT_CASH_CLAIMED'],
    });
    if (existingClaims >= 1) {
      throw AppError.conflict(
        'CASH_CLAIM_LIMIT_REACHED: Your previous cash payment is still awaiting driver confirmation.',
      );
    }

    if (this.deps.prepareNonUpiResolution) {
      const reconciled = await this.deps.prepareNonUpiResolution(ride.id);
      if (reconciled.status === 'SETTLED' || reconciled.status === 'PAYMENT_CONFIRMED') {
        return reconciled;
      }
    }

    return this.deps.unitOfWork.run(async () => {
      const current = await this.deps.rideRepo.findById(input.rideId);
      if (!current) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
      if (
        current.status === 'SETTLED' ||
        current.status === 'PAYMENT_CONFIRMED' ||
        current.status === 'PAYMENT_CASH_CLAIMED'
      ) {
        return current;
      }
      if (current.status !== 'PAYMENT_PENDING') {
        throw AppError.conflict('RIDE_STATE_CHANGED: Refresh the ride and try again.');
      }
      const concurrentClaims = await this.deps.rideRepo.count({
        riderId: current.bookerRiderId,
        statuses: ['PAYMENT_CASH_CLAIMED'],
      });
      if (concurrentClaims >= 1) {
        throw AppError.conflict(
          'CASH_CLAIM_LIMIT_REACHED: Your previous cash payment is still awaiting driver confirmation.',
        );
      }

      const now = new Date();
      const farePaise =
        current.agreedFarePaise ?? current.proposedFarePaise ?? current.suggestedFarePaise;
      const arrearsPaise = Math.max(0, current.arrearsPaise ?? 0);
      const saved = await saveRideTransition(
        this.deps.rideRepo,
        {
          ...current,
          status: 'PAYMENT_CASH_CLAIMED',
          updatedAt: now,
          version: current.version + 1,
        },
        current.version,
      );
      await this.deps.rideEventRepo?.save({
        id: newUuid(),
        rideId: current.id,
        eventType: 'PAYMENT_CASH_CLAIMED',
        actorType: 'RIDER',
        actorId: input.riderId,
        previousStatus: 'PAYMENT_PENDING',
        newStatus: 'PAYMENT_CASH_CLAIMED',
        metadata: {
          farePaise,
          arrearsPaise,
          totalPayablePaise: farePaise + arrearsPaise,
          claimedAt: now.toISOString(),
        },
        createdAt: now,
      });
      return saved;
    });
  }

  async markUnpaid(input: MarkRideUnpaidInput): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    if (ride.driverId !== input.driverId) {
      throw AppError.forbidden(
        'UNAUTHORIZED_DRIVER: You are not the assigned driver for this ride.',
      );
    }
    if (
      ride.status === 'SETTLED' ||
      ride.status === 'PAYMENT_CONFIRMED' ||
      ride.status === 'PAYMENT_UNPAID' ||
      ride.status === 'PAYMENT_DISPUTED'
    ) {
      return ride;
    }
    if (ride.status !== 'PAYMENT_PENDING' && ride.status !== 'PAYMENT_CASH_CLAIMED') {
      throw AppError.conflict(
        `INVALID_RIDE_STATE: Ride cannot be marked unpaid from ${ride.status}.`,
      );
    }

    if (this.deps.prepareNonUpiResolution) {
      const reconciled = await this.deps.prepareNonUpiResolution(ride.id);
      if (reconciled.status === 'SETTLED' || reconciled.status === 'PAYMENT_CONFIRMED') {
        return reconciled;
      }
    }

    return this.deps.unitOfWork.run(async () => {
      const current = await this.deps.rideRepo.findById(input.rideId);
      if (!current) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
      if (
        current.status === 'SETTLED' ||
        current.status === 'PAYMENT_CONFIRMED' ||
        current.status === 'PAYMENT_UNPAID' ||
        current.status === 'PAYMENT_DISPUTED'
      ) {
        return current;
      }
      if (current.status !== 'PAYMENT_PENDING' && current.status !== 'PAYMENT_CASH_CLAIMED') {
        throw AppError.conflict('RIDE_STATE_CHANGED: Refresh the ride and try again.');
      }

      const now = new Date();
      const farePaise =
        current.agreedFarePaise ?? current.proposedFarePaise ?? current.suggestedFarePaise;
      const arrearsPaise = Math.max(0, current.arrearsPaise ?? 0);
      const totalPayablePaise = farePaise + arrearsPaise;

      if (current.status === 'PAYMENT_CASH_CLAIMED') {
        const disputed = await saveRideTransition(
          this.deps.rideRepo,
          {
            ...current,
            status: 'PAYMENT_DISPUTED',
            disputedAt: now,
            updatedAt: now,
            version: current.version + 1,
          },
          current.version,
        );
        await this.deps.rideEventRepo?.save({
          id: newUuid(),
          rideId: current.id,
          eventType: 'PAYMENT_DISPUTED',
          actorType: 'DRIVER',
          actorId: input.driverId,
          previousStatus: 'PAYMENT_CASH_CLAIMED',
          newStatus: 'PAYMENT_DISPUTED',
          metadata: {
            reason:
              input.reason?.trim() || 'Driver reported cash not received after rider cash claim',
            farePaise,
            arrearsPaise,
            totalPayablePaise,
            unpaidAfterCashClaim: true,
          },
          createdAt: now,
        });
        return disputed;
      }

      const unpaid = await saveRideTransition(
        this.deps.rideRepo,
        {
          ...current,
          status: 'PAYMENT_UNPAID',
          updatedAt: now,
          version: current.version + 1,
        },
        current.version,
      );
      await this.deps.rideEventRepo?.save({
        id: newUuid(),
        rideId: current.id,
        eventType: 'PAYMENT_UNPAID',
        actorType: 'DRIVER',
        actorId: input.driverId,
        previousStatus: 'PAYMENT_PENDING',
        newStatus: 'PAYMENT_UNPAID',
        metadata: {
          reason: input.reason?.trim() || 'Driver reported passenger left without paying',
          farePaise,
          arrearsPaise,
          totalPayablePaise,
        },
        createdAt: now,
      });
      return unpaid;
    });
  }

  async disputePayment(input: PaymentDisputeInput): Promise<RideEntity> {
    return this.deps.unitOfWork.run(async () => {
      const ride = await this.deps.rideRepo.findById(input.rideId);
      if (!ride) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
      if (ride.bookerRiderId !== input.riderId && ride.passenger.riderId !== input.riderId) {
        throw AppError.forbidden('UNAUTHORIZED_RIDER: You cannot dispute this ride.');
      }
      const events = await this.deps.rideEventRepo?.findByRideId(ride.id);
      if (!events) throw AppError.internal('INTERNAL', 'Ride audit storage is unavailable.');
      const prior = events.find((event) => event.eventType === 'PAYMENT_DISPUTED');
      if (prior) {
        if (
          ride.status === 'PAYMENT_DISPUTED' &&
          prior.actorId === input.riderId &&
          prior.metadata.reason === input.reason
        )
          return ride;
        throw AppError.conflict('DISPUTE_ALREADY_FILED: This payment already has a dispute.');
      }
      if (ride.status !== 'SETTLED' && ride.status !== 'PAYMENT_UNPAID')
        throw AppError.badRequest(
          'INVALID_RIDE_STATE: Payment must be confirmed before a rider dispute.',
        );
      const previousStatus = ride.status;
      const now = new Date();
      const saved = await saveRideTransition(
        this.deps.rideRepo,
        {
          ...ride,
          status: 'PAYMENT_DISPUTED',
          disputedAt: now,
          updatedAt: now,
          version: ride.version + 1,
        },
        ride.version,
      );
      await this.deps.rideEventRepo!.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'PAYMENT_DISPUTED',
        actorType: 'RIDER',
        actorId: input.riderId,
        previousStatus,
        newStatus: 'PAYMENT_DISPUTED',
        metadata: { reason: input.reason },
        createdAt: now,
      });
      return saved;
    });
  }

  async resolveDispute(input: ResolvePaymentDisputeInput): Promise<RideEntity> {
    return this.deps.unitOfWork.run(async () => {
      const ride = await this.deps.rideRepo.findById(input.rideId);
      if (!ride) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
      const events = await this.deps.rideEventRepo?.findByRideId(ride.id);
      if (!events?.some((event) => event.eventType === 'PAYMENT_DISPUTED')) {
        throw AppError.badRequest('DISPUTE_NOT_FOUND: This ride has no payment dispute.');
      }

      const refundReference = input.refundReference?.trim() ? input.refundReference.trim() : null;
      const confirmedEvents = events.filter((event) => event.eventType === 'PAYMENT_CONFIRMED');
      const disputeEvents = events.filter((event) => event.eventType === 'PAYMENT_DISPUTED');
      const latestDispute = disputeEvents[disputeEvents.length - 1];
      const hasOnlineConfirmation = confirmedEvents.some(
        (event) => event.metadata?.method === 'UPI',
      );
      const hasCashConfirmation = confirmedEvents.some((event) => event.metadata?.method !== 'UPI');
      const isDuplicateUpiAfterCash =
        hasCashConfirmation && typeof latestDispute?.metadata?.paymentId === 'string';
      // A second UPI payment on a ride the first UPI payment already settled: refund only the
      // duplicate, and leave the driver's original earnings and commission alone.
      const isDuplicateUpiAfterUpi =
        !hasCashConfirmation &&
        hasOnlineConfirmation &&
        latestDispute?.metadata?.duplicate === true &&
        typeof latestDispute?.metadata?.paymentId === 'string';
      const isDuplicatePayment = isDuplicateUpiAfterCash || isDuplicateUpiAfterUpi;
      const requiresManualProviderRefund =
        (hasOnlineConfirmation || isDuplicateUpiAfterCash) && input.outcome === 'RIDER_WINS';

      const prior = events.find((event) => event.eventType === 'PAYMENT_DISPUTE_RESOLVED');
      if (prior) {
        const priorRefundRef =
          typeof prior.metadata?.refundReference === 'string'
            ? prior.metadata.refundReference
            : null;
        if (
          prior.metadata.outcome === input.outcome &&
          prior.metadata.reason === input.reason &&
          priorRefundRef === refundReference &&
          prior.actorId === input.adminId
        ) {
          return ride;
        }
        throw AppError.conflict(
          'DISPUTE_ALREADY_RESOLVED: This dispute has a different resolution.',
        );
      }

      if (requiresManualProviderRefund && !refundReference) {
        throw AppError.conflict(
          'MANUAL_REFUND_REFERENCE_REQUIRED: Online UPI disputes require a manual Razorpay refundReference before resolving in the rider’s favor.',
        );
      }

      if (ride.status !== 'PAYMENT_DISPUTED')
        throw AppError.conflict('DISPUTE_STATE_CHANGED: Refresh this ride before resolving it.');

      let verifiedRefund: ProviderRefund | null = null;
      if (requiresManualProviderRefund) {
        const confirmation = confirmedEvents.find((event) => event.metadata?.method === 'UPI');
        const paymentId = isDuplicatePayment
          ? latestDispute?.metadata?.paymentId
          : confirmation?.metadata?.paymentId;
        const amountPaise = isDuplicatePayment
          ? (latestDispute?.metadata?.totalPayablePaise ?? latestDispute?.metadata?.amountPaise)
          : (ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise) +
            Math.max(0, ride.arrearsPaise ?? 0);
        if (
          !this.deps.refundVerifier ||
          typeof paymentId !== 'string' ||
          !Number.isSafeInteger(amountPaise) ||
          (amountPaise as number) <= 0
        ) {
          throw AppError.conflict(
            'REFUND_VERIFICATION_REQUIRED: Provider payment and refund evidence are required.',
          );
        }
        verifiedRefund = await this.deps.refundVerifier.fetchRefund(refundReference!);
        if (
          verifiedRefund.id !== refundReference ||
          verifiedRefund.paymentId !== paymentId ||
          verifiedRefund.amountPaise !== amountPaise ||
          verifiedRefund.currency !== 'INR' ||
          verifiedRefund.status !== 'processed'
        ) {
          throw AppError.conflict(
            'REFUND_EVIDENCE_MISMATCH: A processed full refund for this payment is required.',
          );
        }
      }

      const now = new Date();
      const saved = await saveRideTransition(
        this.deps.rideRepo,
        {
          ...ride,
          status: 'SETTLED',
          disputeOutcome: input.outcome,
          disputeResolvedAt: now,
          updatedAt: now,
          version: ride.version + 1,
        },
        ride.version,
      );

      let refundedCommissionPaise = 0;
      let reversedOnlineEarningsPaise = 0;
      let refundedCollectedArrearsPaise = 0;

      if (input.outcome === 'RIDER_WINS') {
        if (hasOnlineConfirmation && !isDuplicateUpiAfterUpi) {
          const onlineCredit = await this.deps.walletRepo.findTransactionByIdempotencyKey(
            `ride-earnings:${ride.id}`,
          );
          if (onlineCredit && onlineCredit.amountPaise > 0) {
            const wallet = await this.deps.walletRepo.findById(onlineCredit.walletId);
            if (!wallet || wallet.driverId !== ride.driverId) {
              throw AppError.conflict(
                'WALLET_NOT_FOUND: Driver wallet is unavailable for online earnings reversal.',
              );
            }
            const totalToReverse = onlineCredit.amountPaise;
            const availableEarnings = Math.max(0, wallet.earningsBalancePaise ?? 0);
            const fromEarnings = Math.min(totalToReverse, availableEarnings);
            const shortfall = totalToReverse - fromEarnings;
            const nextEarnings = (wallet.earningsBalancePaise ?? 0) - fromEarnings;
            const nextCommissionBalance =
              shortfall > 0
                ? calculateNewBalance(wallet.balancePaise, shortfall, 'DEBIT')
                : wallet.balancePaise;

            if (fromEarnings > 0) {
              await this.deps.walletRepo.recordTransaction({
                id: newUuid(),
                walletId: wallet.id,
                driverId: wallet.driverId,
                bucket: 'EARNINGS',
                type: 'DEBIT',
                amountPaise: fromEarnings,
                referenceType: 'ONLINE_EARNINGS_REVERSAL',
                referenceId: ride.id,
                idempotencyKey: `dispute_online_reversal_${ride.id}:EARNINGS`,
                balanceBeforePaise: wallet.earningsBalancePaise ?? 0,
                balanceAfterPaise: nextEarnings,
                createdBy: input.adminId,
                note: `${input.reason} (refund ${refundReference})`,
                createdAt: now,
              });
            }

            if (shortfall > 0) {
              await this.deps.walletRepo.recordTransaction({
                id: newUuid(),
                walletId: wallet.id,
                driverId: wallet.driverId,
                bucket: 'COMMISSION',
                type: 'DEBIT',
                amountPaise: shortfall,
                referenceType: 'ONLINE_EARNINGS_REVERSAL',
                referenceId: ride.id,
                idempotencyKey: `dispute_online_reversal_${ride.id}:COMMISSION`,
                balanceBeforePaise: wallet.balancePaise,
                balanceAfterPaise: nextCommissionBalance,
                createdBy: input.adminId,
                note: `${input.reason} (post-cashout clawback, refund ${refundReference})`,
                createdAt: now,
              });
            }

            await this.deps.walletRepo.save({
              ...wallet,
              earningsBalancePaise: nextEarnings,
              balancePaise: nextCommissionBalance,
              version: wallet.version + 1,
              updatedAt: now,
            });
            reversedOnlineEarningsPaise = totalToReverse;
          }
          const paidArrears = await this.deps.walletRepo.findTransactionByIdempotencyKey(
            `rider_arrears_paid_${ride.id}`,
          );
          if (paidArrears && paidArrears.amountPaise > 0) {
            const riderWallet = await this.deps.walletRepo.findById(paidArrears.walletId);
            if (!riderWallet || riderWallet.riderId !== ride.bookerRiderId) {
              throw AppError.conflict('WALLET_NOT_FOUND: Rider arrears wallet is unavailable.');
            }
            refundedCollectedArrearsPaise = paidArrears.amountPaise;
            const balanceAfter = calculateNewBalance(
              riderWallet.balancePaise,
              refundedCollectedArrearsPaise,
              'DEBIT',
            );
            await this.deps.walletRepo.recordTransaction({
              id: newUuid(),
              walletId: riderWallet.id,
              ownerType: 'RIDER',
              driverId: null,
              riderId: ride.bookerRiderId,
              type: 'DEBIT',
              amountPaise: refundedCollectedArrearsPaise,
              referenceType: 'CANCELLATION_FEE_ARREARS',
              referenceId: ride.id,
              idempotencyKey: `dispute_arrears_reinstate_${ride.id}`,
              balanceBeforePaise: riderWallet.balancePaise,
              balanceAfterPaise: balanceAfter,
              createdBy: input.adminId,
              note: `${input.reason} (refund ${refundReference})`,
              createdAt: now,
            });
            await this.deps.walletRepo.save({
              ...riderWallet,
              balancePaise: balanceAfter,
              owedPaise: Math.max(0, -balanceAfter),
              version: riderWallet.version + 1,
              updatedAt: now,
            });
          }
        } else if (!isDuplicateUpiAfterCash && hasCashConfirmation) {
          const charged = await this.deps.walletRepo.findTransactionByIdempotencyKey(
            `commission_debit_${ride.id}`,
          );
          const collectedArrearsTx = await this.deps.walletRepo.findTransactionByIdempotencyKey(
            `driver_arrears_collect_${ride.id}`,
          );
          const expectedCommissionPaise = Math.round(
            ((ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise) *
              ride.pricingSnapshot.commissionPercent) /
              100,
          );
          if (!charged && expectedCommissionPaise > 0)
            throw AppError.conflict(
              'COMMISSION_ENTRY_MISSING: Reconcile this ride before refunding.',
            );
          if (charged || collectedArrearsTx) {
            const walletId = charged?.walletId ?? collectedArrearsTx!.walletId;
            const wallet = await this.deps.walletRepo.findById(walletId);
            if (!wallet || wallet.driverId !== ride.driverId)
              throw AppError.conflict('WALLET_NOT_FOUND: Commission wallet is unavailable.');
            let runningBalance = wallet.balancePaise;
            if (charged) {
              refundedCommissionPaise = charged.amountPaise;
              const afterCommissionRefund = calculateNewBalance(
                runningBalance,
                refundedCommissionPaise,
                'CREDIT',
              );
              await this.deps.walletRepo.recordTransaction({
                id: newUuid(),
                walletId: wallet.id,
                ownerType: 'DRIVER',
                driverId: wallet.driverId,
                riderId: null,
                type: 'CREDIT',
                amountPaise: refundedCommissionPaise,
                referenceType: 'DISPUTE_REFUND',
                referenceId: ride.id,
                idempotencyKey: `dispute_refund_${ride.id}`,
                balanceBeforePaise: runningBalance,
                balanceAfterPaise: afterCommissionRefund,
                createdBy: input.adminId,
                note: input.reason,
                createdAt: now,
              });
              runningBalance = afterCommissionRefund;
            }
            if (collectedArrearsTx) {
              refundedCollectedArrearsPaise = collectedArrearsTx.amountPaise;
              const afterArrearsRefund = calculateNewBalance(
                runningBalance,
                refundedCollectedArrearsPaise,
                'CREDIT',
              );
              await this.deps.walletRepo.recordTransaction({
                id: newUuid(),
                walletId: wallet.id,
                ownerType: 'DRIVER',
                driverId: wallet.driverId,
                riderId: null,
                type: 'CREDIT',
                amountPaise: refundedCollectedArrearsPaise,
                referenceType: 'DISPUTE_REFUND',
                referenceId: ride.id,
                idempotencyKey: `dispute_arrears_refund_${ride.id}`,
                balanceBeforePaise: runningBalance,
                balanceAfterPaise: afterArrearsRefund,
                createdBy: input.adminId,
                note: `${input.reason} (reverse collected rider arrears)`,
                createdAt: now,
              });
              runningBalance = afterArrearsRefund;

              const riderWallet = await this.deps.walletRepo.findByRiderId(ride.bookerRiderId);
              if (riderWallet) {
                const riderBefore = riderWallet.balancePaise;
                const riderAfter = calculateNewBalance(
                  riderBefore,
                  refundedCollectedArrearsPaise,
                  'DEBIT',
                );
                await this.deps.walletRepo.recordTransaction({
                  id: newUuid(),
                  walletId: riderWallet.id,
                  ownerType: 'RIDER',
                  driverId: null,
                  riderId: ride.bookerRiderId,
                  type: 'DEBIT',
                  amountPaise: refundedCollectedArrearsPaise,
                  referenceType: 'CANCELLATION_FEE_ARREARS',
                  referenceId: ride.id,
                  idempotencyKey: `dispute_arrears_reinstate_${ride.id}`,
                  balanceBeforePaise: riderBefore,
                  balanceAfterPaise: riderAfter,
                  createdBy: input.adminId,
                  note: `${input.reason} (reinstate unpaid arrears after cash dispute)`,
                  createdAt: now,
                });
                await this.deps.walletRepo.save({
                  ...riderWallet,
                  ownerType: 'RIDER',
                  riderId: ride.bookerRiderId,
                  balancePaise: riderAfter,
                  owedPaise: Math.max(0, -riderAfter),
                  version: riderWallet.version + 1,
                  updatedAt: now,
                });
              }
            }
            await this.deps.walletRepo.save({
              ...wallet,
              balancePaise: runningBalance,
              owedPaise: Math.max(0, -runningBalance),
              version: wallet.version + 1,
              updatedAt: now,
            });
          }
        }
      } else if (
        input.outcome === 'DRIVER_WINS' &&
        !hasOnlineConfirmation &&
        !hasCashConfirmation
      ) {
        const unpaidFarePaise =
          ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
        if (unpaidFarePaise > 0) {
          const existingRiderWallet = await this.deps.walletRepo.findByRiderId(ride.bookerRiderId);
          const riderWalletBase: WalletEntity = existingRiderWallet ?? {
            id: `rider:${ride.bookerRiderId}`,
            ownerType: 'RIDER',
            driverId: '',
            riderId: ride.bookerRiderId,
            balancePaise: 0,
            owedPaise: 0,
            status: 'ACTIVE',
            version: 0,
            createdAt: now,
            updatedAt: now,
          };
          const riderBefore = riderWalletBase.balancePaise;
          const riderAfter = calculateNewBalance(riderBefore, unpaidFarePaise, 'DEBIT');
          await this.deps.walletRepo.recordTransaction({
            id: newUuid(),
            walletId: riderWalletBase.id,
            ownerType: 'RIDER',
            driverId: null,
            riderId: ride.bookerRiderId,
            type: 'DEBIT',
            amountPaise: unpaidFarePaise,
            referenceType: 'CANCELLATION_FEE_ARREARS',
            referenceId: ride.id,
            idempotencyKey: `dispute_unpaid_fare_arrears_${ride.id}`,
            balanceBeforePaise: riderBefore,
            balanceAfterPaise: riderAfter,
            createdBy: input.adminId,
            note: `${input.reason} (unpaid trip fare added to rider dues)`,
            createdAt: now,
          });
          await this.deps.walletRepo.save({
            ...riderWalletBase,
            ownerType: 'RIDER',
            riderId: ride.bookerRiderId,
            balancePaise: riderAfter,
            owedPaise: Math.max(0, -riderAfter),
            version: riderWalletBase.version + 1,
            updatedAt: now,
          });
        }
      }

      await this.deps.rideEventRepo!.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'PAYMENT_DISPUTE_RESOLVED',
        actorType: 'ADMIN',
        actorId: input.adminId,
        previousStatus: 'PAYMENT_DISPUTED',
        newStatus: 'SETTLED',
        metadata: {
          outcome: input.outcome,
          reason: input.reason,
          refundedCommissionPaise,
          reversedOnlineEarningsPaise,
          refundedCollectedArrearsPaise,
          ...(refundReference ? { refundReference } : {}),
          ...(verifiedRefund ? { verifiedRefund, refundVerifiedAt: now.toISOString() } : {}),
          ...(isDuplicateUpiAfterCash ? { duplicateUpiAfterCash: true } : {}),
          ...(isDuplicatePayment ? { duplicatePayment: true } : {}),
        },
        createdAt: now,
      });
      return saved;
    });
  }

  private async settle(input: CompleteRideInput): Promise<CompleteRideResult> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }

    if (ride.driverId !== input.driverId) {
      throw AppError.forbidden(
        'UNAUTHORIZED_DRIVER: You are not the assigned driver for this ride.',
      );
    }

    if (
      ride.status !== 'PAYMENT_PENDING' &&
      ride.status !== 'PAYMENT_CASH_CLAIMED' &&
      ride.status !== 'PAYMENT_UNPAID' &&
      ride.status !== 'SETTLED'
    ) {
      throw AppError.badRequest(
        `INVALID_RIDE_STATE: Payment must be pending to confirm receipt (current status: ${ride.status}).`,
      );
    }

    const wallet = await this.deps.walletRepo.findByDriverId(input.driverId);
    if (!wallet) {
      throw AppError.notFound(
        'WALLET_NOT_FOUND: Driver wallet was not found for commission settlement.',
      );
    }

    const now = input.completedAt ?? new Date();
    const farePaise = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
    const commissionPercent = ride.pricingSnapshot?.commissionPercent ?? 8;
    // D-044: Commission applies strictly to agreedFarePaise, never to arrearsPaise.
    const commissionPaise = Math.round((farePaise * commissionPercent) / 100);

    if (ride.status === 'SETTLED') {
      const priorCollected = await this.deps.walletRepo.findTransactionByIdempotencyKey(
        `driver_arrears_collect_${ride.id}`,
      );
      const arrearsCollectedPaise = priorCollected?.amountPaise ?? 0;
      return {
        ride,
        farePaise,
        commissionPaise,
        arrearsCollectedPaise,
        totalPayablePaise: farePaise + arrearsCollectedPaise,
        driverWallet: wallet,
      };
    }

    const paymentEvents = await this.deps.rideEventRepo?.findByRideId(ride.id);
    const latestMethod = [...(paymentEvents ?? [])]
      .reverse()
      .find((event) => event.eventType === 'PAYMENT_METHOD_CHANGED')?.metadata.method;
    if (
      latestMethod !== 'CASH' &&
      ride.status !== 'PAYMENT_CASH_CLAIMED' &&
      paymentEvents?.some((event) =>
        ['UPI_ORDER_CREATED', 'UPI_QR_CREATED'].includes(event.eventType),
      )
    ) {
      throw AppError.conflict(
        'This ride uses online UPI checkout. Payment must be verified by Cabzone.',
      );
    }

    const riderWallet = await this.deps.walletRepo.findByRiderId(ride.bookerRiderId);
    const rideArrearsPaise = Math.max(0, ride.arrearsPaise ?? 0);
    const unpaidArrearsPaise = riderWallet
      ? getRiderUnpaidArrearsPaise(riderWallet)
      : rideArrearsPaise;
    const collectableArrearsPaise = Math.min(rideArrearsPaise, unpaidArrearsPaise);
    const previousStatus = ride.status;

    // Reserve the transition before posting money. A concurrent confirmation retries
    // the transaction, then reads SETTLED and returns without another posting.
    const savedRide = await saveRideTransition(
      this.deps.rideRepo,
      {
        ...ride,
        status: 'SETTLED',
        settledAt: now,
        version: ride.version + 1,
        updatedAt: now,
      },
      ride.version,
    );

    // 1. Append commission debit (and collected rider arrears debit if any) to collecting driver's prepaid ledger.
    let runningDriverBalance = wallet.balancePaise;
    if (commissionPaise > 0) {
      const afterCommission = calculateNewBalance(runningDriverBalance, commissionPaise, 'DEBIT');
      await this.deps.walletRepo.recordTransaction({
        id: newUuid(),
        walletId: wallet.id,
        ownerType: 'DRIVER',
        driverId: wallet.driverId,
        riderId: null,
        type: 'DEBIT',
        amountPaise: commissionPaise,
        referenceType: 'RIDE_COMMISSION',
        referenceId: ride.id,
        idempotencyKey: `commission_debit_${ride.id}`,
        balanceBeforePaise: runningDriverBalance,
        balanceAfterPaise: afterCommission,
        createdBy: input.driverId,
        createdAt: now,
      });
      runningDriverBalance = afterCommission;
    }

    if (collectableArrearsPaise > 0) {
      const afterArrearsDebit = calculateNewBalance(
        runningDriverBalance,
        collectableArrearsPaise,
        'DEBIT',
      );
      await this.deps.walletRepo.recordTransaction({
        id: newUuid(),
        walletId: wallet.id,
        ownerType: 'DRIVER',
        driverId: wallet.driverId,
        riderId: null,
        type: 'DEBIT',
        amountPaise: collectableArrearsPaise,
        referenceType: 'RIDER_ARREARS_COLLECTED',
        referenceId: ride.id,
        idempotencyKey: `driver_arrears_collect_${ride.id}`,
        balanceBeforePaise: runningDriverBalance,
        balanceAfterPaise: afterArrearsDebit,
        createdBy: input.driverId,
        note: 'Rider cancellation fee arrears collected in cash',
        createdAt: now,
      });
      runningDriverBalance = afterArrearsDebit;
    }

    // The Wallet Zero Invariant: active trip completes normally even if the debit puts
    // the driver at ₹0 or negative balance (the driver is simply blocked from subsequent rides).
    const updatedWallet = await this.deps.walletRepo.save({
      ...wallet,
      balancePaise: runningDriverBalance,
      owedPaise: Math.max(0, -runningDriverBalance),
      version: wallet.version + 1,
      updatedAt: now,
    });

    // 2. Settle rider arrears ledger once if collected in cash (D-044 §3).
    if (collectableArrearsPaise > 0) {
      const riderWalletBase: WalletEntity = riderWallet ?? {
        id: `rider:${ride.bookerRiderId}`,
        ownerType: 'RIDER',
        driverId: '',
        riderId: ride.bookerRiderId,
        balancePaise: -collectableArrearsPaise,
        owedPaise: collectableArrearsPaise,
        status: 'ACTIVE',
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
      const riderBalanceBefore = riderWalletBase.balancePaise;
      const riderBalanceAfter = calculateNewBalance(
        riderBalanceBefore,
        collectableArrearsPaise,
        'CREDIT',
      );
      await this.deps.walletRepo.recordTransaction({
        id: newUuid(),
        walletId: riderWalletBase.id,
        ownerType: 'RIDER',
        driverId: null,
        riderId: ride.bookerRiderId,
        type: 'CREDIT',
        amountPaise: collectableArrearsPaise,
        referenceType: 'ARREARS_PAYMENT',
        referenceId: ride.id,
        idempotencyKey: `rider_arrears_paid_${ride.id}`,
        balanceBeforePaise: riderBalanceBefore,
        balanceAfterPaise: riderBalanceAfter,
        createdBy: input.driverId,
        note: 'Cancellation fee arrears settled via direct cash collection',
        createdAt: now,
      });
      await this.deps.walletRepo.save({
        ...riderWalletBase,
        ownerType: 'RIDER',
        riderId: ride.bookerRiderId,
        balancePaise: riderBalanceAfter,
        owedPaise: Math.max(0, -riderBalanceAfter),
        version: riderWalletBase.version + 1,
        updatedAt: now,
      });
    }

    const totalPayablePaise = farePaise + collectableArrearsPaise;

    // Record immutable payment confirmation event
    if (this.deps.rideEventRepo) {
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'PAYMENT_CONFIRMED',
        actorType: 'DRIVER',
        actorId: input.driverId,
        previousStatus,
        newStatus: 'SETTLED',
        metadata: {
          ...(input.metadata ?? {}),
          ...(latestMethod === 'CASH' || previousStatus === 'PAYMENT_CASH_CLAIMED'
            ? { method: 'CASH' }
            : {}),
          farePaise,
          arrearsCollectedPaise: collectableArrearsPaise,
          totalPayablePaise,
          completedAt: ride.completedAt?.toISOString() ?? null,
          confirmedAt: now.toISOString(),
        },
        createdAt: now,
      });
    }

    // Record immutable RIDE_SETTLED event
    if (this.deps.rideEventRepo) {
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'RIDE_SETTLED',
        actorType: 'DRIVER',
        actorId: input.driverId,
        previousStatus,
        newStatus: 'SETTLED',
        metadata: {
          settledAt: now.toISOString(),
          farePaise,
          arrearsCollectedPaise: collectableArrearsPaise,
          totalPayablePaise,
          commissionPaise,
          commissionPercent,
          driverWalletId: wallet.id,
        },
        createdAt: now,
      });
    }

    return {
      ride: savedRide,
      farePaise,
      commissionPaise,
      arrearsCollectedPaise: collectableArrearsPaise,
      totalPayablePaise,
      driverWallet: updatedWallet,
    };
  }
}
