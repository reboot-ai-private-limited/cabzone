import type { CancellationReason, RideEventActor } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { saveRideTransition } from '../rideTransition.js';
import {
  calculateNewBalance,
  getRiderUnpaidArrearsPaise,
  type WalletEntity,
  type WalletRepositoryPort,
  type WalletTransactionEntity,
} from '../../../ledger/ledger.public.js';
import {
  calculateCancellationFee,
  canCancelRide,
  MAX_DAILY_UNASSIGNED_CANCELLATIONS,
  type CancellationFeeBreakdown,
  type RideEntity,
  type RideEventRepositoryPort,
  type RideRepositoryPort,
} from '../../domain/index.js';

export interface CancelRideInput {
  rideId: string;
  actorType: RideEventActor;
  actorId: string;
  reason: CancellationReason;
  cancelledAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface WaiveCancellationFeeInput {
  rideId: string;
  adminId: string;
  reason: string;
}

export interface WaiveCancellationFeeResult {
  ride: RideEntity;
  waivedPaise: number;
  riderWallet: WalletEntity;
  transaction: WalletTransactionEntity;
}

export interface CancelRideDeps {
  unitOfWork: UnitOfWorkPort;
  rideRepo: RideRepositoryPort;
  walletRepo: WalletRepositoryPort;
  rideEventRepo?: RideEventRepositoryPort;
}

export interface CancelRideResult {
  ride: RideEntity;
  feeBreakdown: CancellationFeeBreakdown;
  driverWallet?: WalletEntity | undefined;
  riderWallet?: WalletEntity | undefined;
}

export class CancelRideUseCase {
  constructor(private readonly deps: CancelRideDeps) {}

  async execute(input: CancelRideInput): Promise<CancelRideResult> {
    try {
      return await this.deps.unitOfWork.run(() => this.cancel(input));
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
        if (current?.status === 'CANCELLED') {
          return this.replayCancelled(current, input);
        }
      }
      throw error;
    }
  }

  async waiveCancellationFee(
    input: WaiveCancellationFeeInput,
  ): Promise<WaiveCancellationFeeResult> {
    const trimmedReason = input.reason.trim();
    if (trimmedReason.length < 5) {
      throw AppError.badRequest(
        'INVALID_WAIVER_REASON: Waiver reason must be at least 5 characters.',
      );
    }
    const normalizedInput = { ...input, reason: trimmedReason };
    try {
      return await this.deps.unitOfWork.run(() => this.waive(normalizedInput));
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 11000
      ) {
        const replay = await this.tryReplayWaiver(normalizedInput);
        if (replay) return replay;
      }
      throw error;
    }
  }

  private async replayCancelled(
    ride: RideEntity,
    input: CancelRideInput,
  ): Promise<CancelRideResult> {
    const event = (await this.deps.rideEventRepo?.findByRideId(ride.id))?.find(
      (entry) => entry.eventType === 'RIDE_CANCELLED',
    );
    if (
      !event ||
      event.actorType !== input.actorType ||
      event.actorId !== input.actorId ||
      event.metadata.reason !== input.reason
    ) {
      throw AppError.conflict(
        'CANCELLATION_REPLAY_MISMATCH: Cancellation belongs to a different request.',
      );
    }
    const { totalFeePaise, driverCompensationPaise, platformFeePaise, isGracePeriod } =
      event.metadata;
    if (
      typeof totalFeePaise !== 'number' ||
      typeof driverCompensationPaise !== 'number' ||
      typeof platformFeePaise !== 'number' ||
      typeof isGracePeriod !== 'boolean'
    ) {
      throw AppError.conflict(
        'CANCELLATION_AUDIT_MISSING: Recorded cancellation fees are unavailable.',
      );
    }
    return {
      ride,
      feeBreakdown: {
        totalFeePaise,
        driverCompensationPaise,
        platformFeePaise,
        isGracePeriod,
      },
      driverWallet: ride.driverId
        ? ((await this.deps.walletRepo.findByDriverId(ride.driverId)) ?? undefined)
        : undefined,
      riderWallet:
        totalFeePaise > 0
          ? ((await this.deps.walletRepo.findByRiderId(ride.bookerRiderId)) ?? undefined)
          : undefined,
    };
  }

  private async cancel(input: CancelRideInput): Promise<CancelRideResult> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }

    // Authorization checks
    if (input.actorType === 'RIDER') {
      if (
        ride.bookerRiderId !== input.actorId &&
        ride.passenger.riderId !== input.actorId
      ) {
        throw AppError.forbidden(
          'UNAUTHORIZED_RIDER: You are not authorized to cancel this ride.',
        );
      }
    } else if (input.actorType === 'DRIVER') {
      if (ride.driverId !== input.actorId) {
        throw AppError.forbidden(
          'UNAUTHORIZED_DRIVER: You are not the assigned driver for this ride.',
        );
      }
    }

    if (ride.status === 'CANCELLED') {
      return this.replayCancelled(ride, input);
    }
    if (!canCancelRide(ride.status)) {
      throw AppError.badRequest(`INVALID_RIDE_STATE: Cannot cancel ride in status ${ride.status}.`);
    }

    const now = input.cancelledAt ?? new Date();

    // Daily rate-limiting for unassigned rider cancellations (max 5 per day)
    const isUnassigned =
      ride.status === 'REQUESTED' || ride.status === 'OFFERING' || !ride.driverId;
    if (input.actorType === 'RIDER' && isUnassigned) {
      // Indian business days stay stable when the server runs in UTC.
      const indiaTime = new Date(now.getTime() + 330 * 60_000);
      const startOfDay = new Date(
        Date.UTC(indiaTime.getUTCFullYear(), indiaTime.getUTCMonth(), indiaTime.getUTCDate()) -
          330 * 60_000,
      );

      const unassignedCount =
        await this.deps.rideRepo.countDailyRiderUnassignedCancellations(
          input.actorId,
          startOfDay,
        );

      if (unassignedCount >= MAX_DAILY_UNASSIGNED_CANCELLATIONS) {
        throw AppError.forbidden(
          `RIDER_CANCELLATION_LIMIT_EXCEEDED: Rider has reached the maximum of ${MAX_DAILY_UNASSIGNED_CANCELLATIONS} daily unassigned cancellations.`,
        );
      }
    }

    // Calculate fee breakdown and enforce wait time for RIDER_NO_SHOW
    const feeBreakdown = calculateCancellationFee({
      ride,
      actorType: input.actorType,
      reason: input.reason,
      now,
    });

    let updatedDriverWallet: WalletEntity | undefined;
    let updatedRiderWallet: WalletEntity | undefined;

    const savedRide = await saveRideTransition(
      this.deps.rideRepo,
      {
        ...ride,
        status: 'CANCELLED',
        cancellationReason: input.reason,
        cancelledAt: now,
        version: ride.version + 1,
        updatedAt: now,
      },
      ride.version,
    );

    // 1. Record immutable rider cancellation/no-show fee arrears debit (D-044)
    if (feeBreakdown.totalFeePaise > 0) {
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
      const riderBalanceBefore = riderWalletBase.balancePaise;
      const riderBalanceAfter = calculateNewBalance(
        riderBalanceBefore,
        feeBreakdown.totalFeePaise,
        'DEBIT',
      );

      await this.deps.walletRepo.recordTransaction({
        id: newUuid(),
        walletId: riderWalletBase.id,
        ownerType: 'RIDER',
        driverId: null,
        riderId: ride.bookerRiderId,
        type: 'DEBIT',
        amountPaise: feeBreakdown.totalFeePaise,
        referenceType: 'CANCELLATION_FEE_ARREARS',
        referenceId: ride.id,
        idempotencyKey: `cancel_arrears_${ride.id}`,
        balanceBeforePaise: riderBalanceBefore,
        balanceAfterPaise: riderBalanceAfter,
        createdBy: input.actorId,
        note: `Cancellation fee arrears (${input.reason})`,
        createdAt: now,
      });

      updatedRiderWallet = await this.deps.walletRepo.save({
        ...riderWalletBase,
        ownerType: 'RIDER',
        riderId: ride.bookerRiderId,
        balancePaise: riderBalanceAfter,
        owedPaise: Math.max(0, -riderBalanceAfter),
        version: riderWalletBase.version + 1,
        updatedAt: now,
      });
    }

    // 2. Credit driver compensation to driver's prepaid wallet if applicable
    if (feeBreakdown.driverCompensationPaise > 0 && ride.driverId) {
      const wallet = await this.deps.walletRepo.findByDriverId(ride.driverId);
      if (wallet) {
        const balanceBefore = wallet.balancePaise;
        const balanceAfter = calculateNewBalance(
          balanceBefore,
          feeBreakdown.driverCompensationPaise,
          'CREDIT',
        );

        await this.deps.walletRepo.recordTransaction({
          id: newUuid(),
          walletId: wallet.id,
          ownerType: 'DRIVER',
          driverId: wallet.driverId,
          riderId: null,
          type: 'CREDIT',
          amountPaise: feeBreakdown.driverCompensationPaise,
          referenceType: 'CANCELLATION_COMPENSATION',
          referenceId: ride.id,
          idempotencyKey: `cancel_comp_${ride.id}`,
          balanceBeforePaise: balanceBefore,
          balanceAfterPaise: balanceAfter,
          createdBy: input.actorId,
          createdAt: now,
        });

        updatedDriverWallet = await this.deps.walletRepo.save({
          ...wallet,
          balancePaise: balanceAfter,
          owedPaise: Math.max(0, -balanceAfter),
          version: wallet.version + 1,
          updatedAt: now,
        });
      }
    }

    // 3. Record immutable RideEvent
    if (this.deps.rideEventRepo) {
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'RIDE_CANCELLED',
        actorType: input.actorType,
        actorId: input.actorId,
        previousStatus: ride.status,
        newStatus: 'CANCELLED',
        metadata: {
          ...(input.metadata ?? {}),
          reason: input.reason,
          totalFeePaise: feeBreakdown.totalFeePaise,
          driverCompensationPaise: feeBreakdown.driverCompensationPaise,
          platformFeePaise: feeBreakdown.platformFeePaise,
          isGracePeriod: feeBreakdown.isGracePeriod,
          riderArrearsBalancePaise: getRiderUnpaidArrearsPaise(updatedRiderWallet),
          cancelledAt: now.toISOString(),
        },
        createdAt: now,
      });
    }

    return {
      ride: savedRide,
      feeBreakdown,
      driverWallet: updatedDriverWallet,
      riderWallet: updatedRiderWallet,
    };
  }

  private async tryReplayWaiver(
    input: WaiveCancellationFeeInput,
  ): Promise<WaiveCancellationFeeResult | null> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) return null;
    const existingWaiverTx = await this.deps.walletRepo.findTransactionByIdempotencyKey(
      `cancel_arrears_waive_${ride.id}`,
    );
    if (!existingWaiverTx) return null;
    if (
      existingWaiverTx.createdBy !== input.adminId ||
      existingWaiverTx.note !== input.reason
    ) {
      throw AppError.conflict(
        'CANCELLATION_FEE_ALREADY_WAIVED: Cancellation fee for this ride has already been waived.',
      );
    }
    const riderWallet =
      (await this.deps.walletRepo.findById(existingWaiverTx.walletId)) ??
      (await this.deps.walletRepo.findByRiderId(ride.bookerRiderId));
    if (!riderWallet) {
      throw AppError.conflict('WALLET_NOT_FOUND: Rider arrears wallet is unavailable.');
    }
    return {
      ride,
      waivedPaise: existingWaiverTx.amountPaise,
      riderWallet,
      transaction: existingWaiverTx,
    };
  }

  private async waive(input: WaiveCancellationFeeInput): Promise<WaiveCancellationFeeResult> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }
    if (ride.status !== 'CANCELLED') {
      throw AppError.badRequest(
        `INVALID_RIDE_STATE: Only cancelled rides can have cancellation fees waived (current status: ${ride.status}).`,
      );
    }

    const arrearsTx = await this.deps.walletRepo.findTransactionByIdempotencyKey(
      `cancel_arrears_${ride.id}`,
    );
    if (!arrearsTx || arrearsTx.amountPaise <= 0) {
      throw AppError.badRequest(
        'NO_CANCELLATION_FEE_CHARGED: No rider cancellation fee arrears was recorded for this ride.',
      );
    }

    const replay = await this.tryReplayWaiver(input);
    if (replay) return replay;

    const riderWallet =
      (await this.deps.walletRepo.findById(arrearsTx.walletId)) ??
      (await this.deps.walletRepo.findByRiderId(ride.bookerRiderId));
    if (!riderWallet) {
      throw AppError.conflict('WALLET_NOT_FOUND: Rider arrears wallet is unavailable.');
    }

    const now = new Date();
    const balanceBefore = riderWallet.balancePaise;
    const balanceAfter = calculateNewBalance(balanceBefore, arrearsTx.amountPaise, 'CREDIT');

    const waiverTx = await this.deps.walletRepo.recordTransaction({
      id: newUuid(),
      walletId: riderWallet.id,
      ownerType: 'RIDER',
      driverId: null,
      riderId: ride.bookerRiderId,
      type: 'CREDIT',
      amountPaise: arrearsTx.amountPaise,
      referenceType: 'RIDER_REFUND',
      referenceId: ride.id,
      idempotencyKey: `cancel_arrears_waive_${ride.id}`,
      balanceBeforePaise: balanceBefore,
      balanceAfterPaise: balanceAfter,
      createdBy: input.adminId,
      note: input.reason,
      createdAt: now,
    });

    const updatedRiderWallet = await this.deps.walletRepo.save({
      ...riderWallet,
      ownerType: 'RIDER',
      riderId: ride.bookerRiderId,
      balancePaise: balanceAfter,
      owedPaise: Math.max(0, -balanceAfter),
      version: riderWallet.version + 1,
      updatedAt: now,
    });

    if (this.deps.rideEventRepo) {
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'CANCELLATION_FEE_WAIVED',
        actorType: 'ADMIN',
        actorId: input.adminId,
        previousStatus: 'CANCELLED',
        newStatus: 'CANCELLED',
        metadata: {
          waivedPaise: arrearsTx.amountPaise,
          reason: input.reason,
          refundTransactionId: waiverTx.id,
          riderBalanceAfterPaise: balanceAfter,
        },
        createdAt: now,
      });
    }

    return {
      ride,
      waivedPaise: arrearsTx.amountPaise,
      riderWallet: updatedRiderWallet,
      transaction: waiverTx,
    };
  }
}
