import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import {
  calculateNewBalance,
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
  rideRepo: RideRepositoryPort;
  walletRepo: WalletRepositoryPort;
  rideEventRepo?: RideEventRepositoryPort;
}

export interface CompleteRideResult {
  ride: RideEntity;
  farePaise: number;
  commissionPaise: number;
  driverWallet: WalletEntity;
}

export class CompleteRideUseCase {
  constructor(private readonly deps: CompleteRideDeps) {}

  async execute(input: CompleteRideInput): Promise<CompleteRideResult> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }

    if (ride.driverId !== input.driverId) {
      throw AppError.forbidden(
        'UNAUTHORIZED_DRIVER: You are not the assigned driver for this ride.',
      );
    }

    if (ride.status !== 'TRIP_STARTED') {
      throw AppError.badRequest(
        `INVALID_RIDE_STATE: Ride must be in TRIP_STARTED state to complete (current status: ${ride.status}).`,
      );
    }

    const wallet = await this.deps.walletRepo.findByDriverId(input.driverId);
    if (!wallet) {
      throw AppError.notFound(
        'WALLET_NOT_FOUND: Driver wallet was not found for commission settlement.',
      );
    }

    const now = input.completedAt ?? new Date();
    const farePaise =
      ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
    const commissionPercent = ride.pricingSnapshot?.commissionPercent ?? 8;
    const commissionPaise = Math.round((farePaise * commissionPercent) / 100);

    // Double-entry ledger debit: debited from prepaid driver wallet
    const balanceBefore = wallet.balancePaise;
    const balanceAfter = calculateNewBalance(balanceBefore, commissionPaise, 'DEBIT');

    if (commissionPaise > 0) {
      await this.deps.walletRepo.recordTransaction({
        id: newUuid(),
        walletId: wallet.id,
        driverId: wallet.driverId,
        type: 'DEBIT',
        amountPaise: commissionPaise,
        referenceType: 'RIDE_COMMISSION',
        referenceId: ride.id,
        idempotencyKey: `commission_debit_${ride.id}`,
        balanceBeforePaise: balanceBefore,
        balanceAfterPaise: balanceAfter,
        createdBy: input.driverId,
        createdAt: now,
      });
    }

    // The Wallet Zero Invariant: active trip completes normally even if the debit puts
    // the driver at ₹0 or negative balance (the driver is simply blocked from subsequent rides).
    const updatedWallet = await this.deps.walletRepo.save({
      ...wallet,
      balancePaise: balanceAfter,
      version: wallet.version + 1,
      updatedAt: now,
    });

    // Record immutable TRIP_COMPLETED event
    if (this.deps.rideEventRepo) {
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'TRIP_COMPLETED',
        actorType: 'DRIVER',
        actorId: input.driverId,
        previousStatus: 'TRIP_STARTED',
        newStatus: 'TRIP_COMPLETED',
        metadata: {
          farePaise,
          completedAt: now.toISOString(),
          ...(input.metadata ?? {}),
        },
        createdAt: now,
      });
    }

    // Transition ride to SETTLED with direct cash / personal UPI model
    const settledRide: RideEntity = {
      ...ride,
      status: 'SETTLED',
      completedAt: now,
      settledAt: now,
      version: ride.version + 1,
      updatedAt: now,
    };

    const savedRide = await this.deps.rideRepo.save(settledRide);

    // Record immutable RIDE_SETTLED event
    if (this.deps.rideEventRepo) {
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: 'RIDE_SETTLED',
        actorType: 'SYSTEM',
        actorId: null,
        previousStatus: 'TRIP_COMPLETED',
        newStatus: 'SETTLED',
        metadata: {
          settledAt: now.toISOString(),
          farePaise,
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
      driverWallet: updatedWallet,
    };
  }
}
