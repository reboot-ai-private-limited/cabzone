import type { RideAssignedDriverDto } from '@cabzone/contracts';
import type { RideEntity } from '../domain/index.js';

/** Public shape of a ride: never exposes the pickup OTP hash, attempt counters, or idempotency keys. */
export function toRideView(ride: RideEntity, assignedDriver: RideAssignedDriverDto | null = null) {
  const { idempotencyKey: _idempotencyKey, ...publicRide } = ride;
  void _idempotencyKey;
  const { riderId, name, phoneE164, pickupOtpExpiresAt } = ride.passenger;
  return {
    ...publicRide,
    passenger: { riderId, name, phoneE164, pickupOtpExpiresAt },
    assignedDriver,
  };
}

export type RideView = ReturnType<typeof toRideView>;
