import type { RideAssignedDriverDto } from '@cabzone/contracts';
import type { RideEntity } from '../domain/index.js';

/** Public shape of a ride: never exposes the pickup OTP hash or attempt counters. */
export function toRideView(ride: RideEntity, assignedDriver: RideAssignedDriverDto | null = null) {
  const { riderId, name, phoneE164, pickupOtpExpiresAt } = ride.passenger;
  return {
    ...ride,
    passenger: { riderId, name, phoneE164, pickupOtpExpiresAt },
    assignedDriver,
  };
}

export type RideView = ReturnType<typeof toRideView>;
