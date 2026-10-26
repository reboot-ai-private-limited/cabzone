import { DEFAULT_CANCELLATION_FEE_PAISE } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { saveRideTransition } from '../rideTransition.js';
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
}

export interface CompleteRideDeps {
  prepareCashConfirmation?: (rideId: string, driverId: string) => Promise<void>;
  unitOfWork: UnitOfWorkPort;
  rideRepo: RideRepositoryPort;
  walletRepo: WalletRepositoryPort;
  rideEventRepo?: RideEventRepositoryPort;
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
}

export class CompleteRideUseCase {
  constructor(private readonly deps: CompleteRideDeps) {}

  async execute(input: CompleteRideInput): Promise<CompleteRideResult> {
    return this.deps.unitOfWork.run(async () => {
      const ride = await this.deps.rideRepo.findById(input.rideId);
      if (!ride) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
      if (ride.driverId !== input.driverId)
        throw AppError.forbidden(
          'UNAUTHORIZED_DRIVER: You are not the assigned driver for this ride.',
        );
      if (!['TRIP_STARTED', 'PAYMENT_PENDING', 'SETTLED'].includes(ride.status)) {
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
      if (ride.status !== 'SETTLED')
        throw AppError.badRequest(
          'INVALID_RIDE_STATE: Payment must be confirmed before a rider dispute.',
        );
      const now = new Date();
      const saved = await saveRideTransition(
        this.deps.rideRepo,
        { ...ride, status: 'PAYMENT_DISPUTED', updatedAt: now, version: ride.version + 1 },
        ride.version,
      );
      await this.deps.rideEventRepo!.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'PAYMENT_DISPUTED',
        actorType: 'RIDER',
        actorId: input.riderId,
        previousStatus: 'SETTLED',
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
      const prior = events.find((event) => event.eventType === 'PAYMENT_DISPUTE_RESOLVED');
      if (
        events.some((event) => ['UPI_ORDER_CREATED', 'UPI_QR_CREATED'].includes(event.eventType))
      ) {
        throw AppError.conflict(
          'Online UPI disputes require manual review in Razorpay; no automatic refund has been issued.',
        );
      }
      if (prior) {
        if (
          prior.metadata.outcome === input.outcome &&
          prior.metadata.reason === input.reason &&
          prior.actorId === input.adminId
        )
          return ride;
        throw AppError.conflict(
          'DISPUTE_ALREADY_RESOLVED: This dispute has a different resolution.',
        );
      }
      if (ride.status !== 'PAYMENT_DISPUTED')
        throw AppError.conflict('DISPUTE_STATE_CHANGED: Refresh this ride before resolving it.');
      const now = new Date();
      const saved = await saveRideTransition(
        this.deps.rideRepo,
        { ...ride, status: 'SETTLED', updatedAt: now, version: ride.version + 1 },
        ride.version,
      );
      let refundedCommissionPaise = 0;
      let refundedCollectedArrearsPaise = 0;
      if (input.outcome === 'RIDER_WINS') {
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
          refundedCollectedArrearsPaise,
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

    if (ride.status !== 'PAYMENT_PENDING' && ride.status !== 'SETTLED') {
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
    if (
      !paymentEvents?.some(
        (event) => event.eventType === 'PAYMENT_METHOD_CHANGED' && event.metadata.method === 'CASH',
      ) &&
      paymentEvents?.some((event) =>
        ['UPI_ORDER_CREATED', 'UPI_QR_CREATED'].includes(event.eventType),
      )
    ) {
      throw AppError.conflict(
        'This ride uses online UPI checkout. Payment must be verified by Cabzone.',
      );
    }

    // D-044 §4: Block cash settlement when rider unpaid arrears >= effective cancellationFeePaise.
    const cashBlockThresholdPaise =
      (ride.pricingSnapshot?.cancellationFeePaise ?? DEFAULT_CANCELLATION_FEE_PAISE) > 0
        ? (ride.pricingSnapshot?.cancellationFeePaise ?? DEFAULT_CANCELLATION_FEE_PAISE)
        : DEFAULT_CANCELLATION_FEE_PAISE;
    const riderWallet = await this.deps.walletRepo.findByRiderId(ride.bookerRiderId);
    const rideArrearsPaise = Math.max(0, ride.arrearsPaise ?? 0);
    const unpaidArrearsPaise = riderWallet
      ? getRiderUnpaidArrearsPaise(riderWallet)
      : rideArrearsPaise;
    if (unpaidArrearsPaise >= cashBlockThresholdPaise) {
      throw AppError.conflict(
        'RIDER_ARREARS_CASH_BLOCKED: Cash confirmation is blocked while cancellation fee arrears are due. Rider must complete payment via UPI.',
      );
    }
    const collectableArrearsPaise = Math.min(rideArrearsPaise, unpaidArrearsPaise);

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
        previousStatus: 'PAYMENT_PENDING',
        newStatus: 'SETTLED',
        metadata: {
          ...(input.metadata ?? {}),
          ...(paymentEvents?.some(
            (event) =>
              event.eventType === 'PAYMENT_METHOD_CHANGED' && event.metadata.method === 'CASH',
          )
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
        previousStatus: 'PAYMENT_PENDING',
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
