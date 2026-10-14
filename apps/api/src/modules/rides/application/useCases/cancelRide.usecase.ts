import type { CancellationReason, RideEventActor } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { saveRideTransition } from '../rideTransition.js';
import {
  calculateNewBalance,
  type WalletEntity,
  type WalletRepositoryPort,
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
}

export class CancelRideUseCase {
  constructor(private readonly deps: CancelRideDeps) {}

  async execute(input: CancelRideInput): Promise<CancelRideResult> {
    return this.deps.unitOfWork.run(() => this.cancel(input));
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
      const event = (await this.deps.rideEventRepo?.findByRideId(ride.id))?.find((entry) => entry.eventType === 'RIDE_CANCELLED');
      if (!event || event.actorType !== input.actorType || event.actorId !== input.actorId || event.metadata.reason !== input.reason) {
        throw AppError.conflict('CANCELLATION_REPLAY_MISMATCH: Cancellation belongs to a different request.');
      }
      const { totalFeePaise, driverCompensationPaise, platformFeePaise, isGracePeriod } = event.metadata;
      if (typeof totalFeePaise !== 'number' || typeof driverCompensationPaise !== 'number' || typeof platformFeePaise !== 'number' || typeof isGracePeriod !== 'boolean') {
        throw AppError.conflict('CANCELLATION_AUDIT_MISSING: Recorded cancellation fees are unavailable.');
      }
      return { ride, feeBreakdown: { totalFeePaise, driverCompensationPaise, platformFeePaise, isGracePeriod }, driverWallet: ride.driverId ? await this.deps.walletRepo.findByDriverId(ride.driverId) ?? undefined : undefined };
    }
    if (!canCancelRide(ride.status)) throw AppError.badRequest(`INVALID_RIDE_STATE: Cannot cancel ride in status ${ride.status}.`);

    const now = input.cancelledAt ?? new Date();

    // Daily rate-limiting for unassigned rider cancellations (max 5 per day)
    const isUnassigned =
      ride.status === 'REQUESTED' || ride.status === 'OFFERING' || !ride.driverId;
    if (input.actorType === 'RIDER' && isUnassigned) {
      // Indian business days stay stable when the server runs in UTC.
      const indiaTime = new Date(now.getTime() + 330 * 60_000);
      const startOfDay = new Date(Date.UTC(indiaTime.getUTCFullYear(), indiaTime.getUTCMonth(), indiaTime.getUTCDate()) - 330 * 60_000);

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

    let updatedWallet: WalletEntity | undefined;

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

    // Credit driver compensation to driver's prepaid wallet if applicable
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
          driverId: wallet.driverId,
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

        updatedWallet = await this.deps.walletRepo.save({
          ...wallet,
          balancePaise: balanceAfter,
          version: wallet.version + 1,
          updatedAt: now,
        });
      }
    }

    // Record immutable RideEvent
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
          cancelledAt: now.toISOString(),
        },
        createdAt: now,
      });
    }

    return {
      ride: savedRide,
      feeBreakdown,
      driverWallet: updatedWallet,
    };
  }
}
