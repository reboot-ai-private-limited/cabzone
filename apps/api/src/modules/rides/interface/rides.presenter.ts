import type { RideEntity } from '../domain/index.js';

/** Public shape of a ride: never exposes the pickup OTP hash or attempt counters. */
export function toRideView(ride: RideEntity) {
  const { riderId, name, phoneE164, pickupOtpExpiresAt } = ride.passenger;
  return { ...ride, passenger: { riderId, name, phoneE164, pickupOtpExpiresAt } };
}

export type RideView = ReturnType<typeof toRideView>;
