import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { saveRideTransition } from '../rideTransition.js';
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
  unitOfWork: UnitOfWorkPort;
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
      if (ride.status !== 'TRIP_STARTED')
        return { ride, farePaise, commissionPaise: 0, driverWallet: wallet };
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
        metadata: { ...input.metadata, farePaise, completedAt: now.toISOString() },
        createdAt: now,
      });
      return { ride: saved, farePaise, commissionPaise: 0, driverWallet: wallet };
    });
  }

  async confirmPayment(input: CompleteRideInput): Promise<CompleteRideResult> {
    return this.deps.unitOfWork.run(() => this.settle(input));
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
      if (input.outcome === 'RIDER_WINS') {
        const charged = await this.deps.walletRepo.findTransactionByIdempotencyKey(
          `commission_debit_${ride.id}`,
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
        if (charged) {
          const wallet = await this.deps.walletRepo.findById(charged.walletId);
          if (!wallet || wallet.driverId !== ride.driverId)
            throw AppError.conflict('WALLET_NOT_FOUND: Commission wallet is unavailable.');
          refundedCommissionPaise = charged.amountPaise;
          const balanceAfter = calculateNewBalance(
            wallet.balancePaise,
            refundedCommissionPaise,
            'CREDIT',
          );
          await this.deps.walletRepo.recordTransaction({
            id: newUuid(),
            walletId: wallet.id,
            driverId: wallet.driverId,
            type: 'CREDIT',
            amountPaise: refundedCommissionPaise,
            referenceType: 'DISPUTE_REFUND',
            referenceId: ride.id,
            idempotencyKey: `dispute_refund_${ride.id}`,
            balanceBeforePaise: wallet.balancePaise,
            balanceAfterPaise: balanceAfter,
            createdBy: input.adminId,
            note: input.reason,
            createdAt: now,
          });
          await this.deps.walletRepo.save({
            ...wallet,
            balancePaise: balanceAfter,
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
        metadata: { outcome: input.outcome, reason: input.reason, refundedCommissionPaise },
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
    const commissionPaise = Math.round((farePaise * commissionPercent) / 100);

    if (ride.status === 'SETTLED') {
      return { ride, farePaise, commissionPaise, driverWallet: wallet };
    }

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

    // Append the commission debit to the driver's prepaid ledger.
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
          farePaise,
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
