import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { RideEntity, RideRepositoryPort, RideEventRepositoryPort } from '../../domain/index.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import { newUuid } from '../../../../shared/ids.js';
import { saveRideTransition } from '../rideTransition.js';

export interface StartRideInput {
  rideId: string;
  driverId: string;
  otp: string;
}

export interface StartRideDeps {
  unitOfWork: UnitOfWorkPort;
  rideEventRepo: RideEventRepositoryPort;
  rideRepo: RideRepositoryPort;
}

export class StartRideUseCase {
  constructor(private readonly deps: StartRideDeps) {}

  async execute(input: StartRideInput): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }

    // 1. Strict driver authorization check
    if (ride.driverId !== input.driverId) {
      throw AppError.forbidden('UNAUTHORIZED_DRIVER: You are not the assigned driver for this ride.');
    }

    // 2. Strict lifecycle sequence: Only DRIVER_ARRIVED can start trip
    if (ride.status !== 'DRIVER_ARRIVED') {
      throw AppError.badRequest(
        `INVALID_RIDE_STATE: Driver must be marked as ARRIVED at curb before starting trip (current status: ${ride.status}).`,
      );
    }

    if (!ride.passenger.pickupOtpHash) {
      throw AppError.internal('INTERNAL', 'MISSING_OTP: Ride does not have a pickup OTP configured.');
    }

    const now = new Date();

    // 3. OTP Expiry check
    if (ride.passenger.pickupOtpExpiresAt && now > ride.passenger.pickupOtpExpiresAt) {
      throw AppError.badRequest('PICKUP_OTP_EXPIRED: The pickup OTP has expired.');
    }

    const maxAttempts = ride.passenger.maxOtpAttempts ?? 3;
    const currentAttempts = ride.passenger.otpAttempts ?? 0;

    // 4. Attempt lockout check
    if (currentAttempts >= maxAttempts) {
      throw AppError.forbidden('OTP_LOCKOUT: Maximum OTP verification attempts exceeded.');
    }

    // 5. Constant-time verification using timingSafeEqual
    const cleanOtp = input.otp.trim();
    const candidateHash = createHash('sha256').update(cleanOtp).digest('hex');

    const candidateBuffer = Buffer.from(candidateHash, 'hex');
    const storedBuffer = Buffer.from(ride.passenger.pickupOtpHash, 'hex');

    const isMatch =
      candidateBuffer.length === storedBuffer.length &&
      timingSafeEqual(candidateBuffer, storedBuffer);

    if (!isMatch) {
      const newAttempts = currentAttempts + 1;
      await saveRideTransition(
        this.deps.rideRepo,
        {
          ...ride,
          passenger: { ...ride.passenger, otpAttempts: newAttempts },
          version: ride.version + 1,
        },
        ride.version,
      );

      if (newAttempts >= maxAttempts) {
        throw AppError.forbidden(
          `OTP_LOCKOUT: Maximum OTP verification attempts (${maxAttempts}) exceeded.`,
        );
      }
      throw AppError.badRequest('INVALID_PICKUP_OTP: The 4-digit pickup OTP is incorrect.');
    }

    const updatedRide: RideEntity = {
      ...ride,
      status: 'TRIP_STARTED',
      startedAt: now,
      updatedAt: now,
      version: ride.version + 1,
    };

    return this.deps.unitOfWork.run(async () => {
      const saved = await saveRideTransition(this.deps.rideRepo, updatedRide, ride.version);
      await this.deps.rideEventRepo.save({
        id: newUuid(), rideId: ride.id, eventType: 'TRIP_STARTED', actorType: 'DRIVER', actorId: input.driverId,
        previousStatus: ride.status, newStatus: saved.status, metadata: {}, createdAt: now,
      });
      return saved;
    });
  }
}
