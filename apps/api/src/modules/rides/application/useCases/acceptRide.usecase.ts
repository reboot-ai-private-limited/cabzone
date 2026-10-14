import { createHash, randomInt } from 'node:crypto';
import { AppError } from '../../../../shared/errors/AppError.js';
import { isDriverEligibleForNewRides, type WalletRepositoryPort } from '../../../ledger/ledger.public.js';
import { derivePickupOtp, type RideEntity, type RideRepositoryPort } from '../../domain/index.js';
import type { RideEventRepositoryPort } from '../../domain/index.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { newUuid } from '../../../../shared/ids.js';

export interface AcceptRideInput {
  rideId: string;
  driverId: string;
}

export interface AcceptRideResult {
  ride: RideEntity;
  /**
   * Internal/Rider-facing pickup OTP (NOT returned to driver in production HTTP response).
   */
  _riderPickupOtp?: string | undefined;
}

export interface AcceptRideDeps {
  unitOfWork: UnitOfWorkPort;
  rideEventRepo: RideEventRepositoryPort;
  rideRepo: RideRepositoryPort;
  walletRepo: WalletRepositoryPort;
  requireDriverEligibility: (driverId: string, ride: RideEntity) => Promise<string>;
  otpTtlMinutes?: number | undefined; // default 20 minutes
  /** When set, the pickup OTP is derived from it so the rider can re-fetch it; otherwise random. */
  otpSecret?: string | undefined;
}

export class AcceptRideUseCase {
  private readonly otpTtlMinutes: number;

  constructor(private readonly deps: AcceptRideDeps) {
    this.otpTtlMinutes = deps.otpTtlMinutes ?? 20;
  }

  async execute(input: AcceptRideInput): Promise<AcceptRideResult> {
    return this.deps.unitOfWork.run(() => this.accept(input));
  }

  private async accept(input: AcceptRideInput): Promise<AcceptRideResult> {
    // 1. Authoritative wallet check (Decision D-008 & D-036)
    const wallet = await this.deps.walletRepo.findByDriverId(input.driverId);
    if (!wallet || !isDriverEligibleForNewRides(wallet)) {
      throw AppError.forbidden(
        'DRIVER_WALLET_ZERO_BALANCE: Strictly positive wallet balance is required to accept new ride requests.',
      );
    }

    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }

    if (ride.status === 'DRIVER_ASSIGNED' || ride.driverId) {
      throw AppError.conflict(
        'RIDE_ALREADY_ASSIGNED: RIDE_UNAVAILABLE: Ride is in DRIVER_ASSIGNED state and cannot be accepted.',
      );
    }

    if (ride.status !== 'OFFERING' && ride.status !== 'REQUESTED') {
      throw AppError.conflict(
        `RIDE_UNAVAILABLE: Ride is in ${ride.status} state and cannot be accepted.`,
      );
    }

    if (ride.offeringExpiresAt && new Date() > ride.offeringExpiresAt) {
      throw AppError.conflict('OFFER_EXPIRED: The offer window for this ride has closed.');
    }

    const vehicleId = await this.deps.requireDriverEligibility(input.driverId, ride);

    const agreedFarePaise = ride.proposedFarePaise ?? ride.suggestedFarePaise;

    const now = new Date();
    const pickupOtpExpiresAt = new Date(now.getTime() + this.otpTtlMinutes * 60 * 1000);

    // 2. 4-digit pickup OTP: derived when a secret is configured, else cryptographically random.
    const pickupOtp = this.deps.otpSecret
      ? derivePickupOtp(this.deps.otpSecret, ride.id, pickupOtpExpiresAt)
      : String(randomInt(1000, 10000));
    const pickupOtpHash = createHash('sha256').update(pickupOtp).digest('hex');

    // 3. Atomic first-to-claim update
    const claimedRide = await this.deps.rideRepo.atomicClaimRide({
      rideId: input.rideId,
      driverId: input.driverId,
      vehicleId,
      agreedFarePaise,
      pickupOtpHash,
      pickupOtpExpiresAt,
      assignedAt: now,
    });

    if (!claimedRide) {
      throw AppError.conflict(
        'RIDE_ALREADY_ASSIGNED: Another driver has already accepted this ride.',
      );
    }

    await this.deps.rideEventRepo.save({
      id: newUuid(), rideId: ride.id, eventType: 'DRIVER_ASSIGNED', actorType: 'DRIVER', actorId: input.driverId,
      previousStatus: ride.status, newStatus: claimedRide.status, metadata: { vehicleId }, createdAt: now,
    });

    return {
      ride: claimedRide,
      _riderPickupOtp: pickupOtp,
    };
  }
}
