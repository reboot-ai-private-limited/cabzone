import { createHash, randomInt } from 'node:crypto';
import { AppError } from '../../../../shared/errors/AppError.js';
import { isDriverEligibleForNewRides, type WalletRepositoryPort } from '../../../ledger/ledger.public.js';
import type { RideEntity, RideRepositoryPort } from '../../domain/index.js';

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
  rideRepo: RideRepositoryPort;
  walletRepo: WalletRepositoryPort;
  otpTtlMinutes?: number | undefined; // default 20 minutes
}

export class AcceptRideUseCase {
  private readonly otpTtlMinutes: number;

  constructor(private readonly deps: AcceptRideDeps) {
    this.otpTtlMinutes = deps.otpTtlMinutes ?? 20;
  }

  async execute(input: AcceptRideInput): Promise<AcceptRideResult> {
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

    if (ride.status !== 'OFFERING' && ride.status !== 'REQUESTED') {
      throw AppError.conflict(
        `RIDE_UNAVAILABLE: Ride is in ${ride.status} state and cannot be accepted.`,
      );
    }

    const agreedFarePaise = ride.proposedFarePaise ?? ride.suggestedFarePaise;

    // 2. Cryptographically secure 4-digit numeric pickup OTP (randomInt 1000..9999)
    const pickupOtp = String(randomInt(1000, 10000));
    const pickupOtpHash = createHash('sha256').update(pickupOtp).digest('hex');

    const now = new Date();
    const pickupOtpExpiresAt = new Date(now.getTime() + this.otpTtlMinutes * 60 * 1000);

    // 3. Atomic first-to-claim update
    const claimedRide = await this.deps.rideRepo.atomicClaimRide({
      rideId: input.rideId,
      driverId: input.driverId,
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

    return {
      ride: claimedRide,
      _riderPickupOtp: pickupOtp,
    };
  }
}
